// Offline regression checks against the real game functions; no Firebase writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('assets/game/index.html', 'utf8');
function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, start);
  return html.slice(from, to);
}

async function main() {
  const storage = new Map();
  const listeners = new Map();
  const nativeStates = [];
  let profileListener;
  let unsubscribeCount = 0;
  const window = {
    __nativeRevenueCatState: { isPro: false, isResolved: true },
    GardenOfWordsRevenueCat: { setFirebasePremium: async value => nativeStates.push(value) },
    addEventListener: (event, listener) => listeners.set(event, listener),
    dispatchEvent: event => listeners.get(event.type)?.(),
    setTimeout: () => 1, clearTimeout: () => {},
  };
  const sandbox = vm.createContext({
    console, window, CustomEvent: class { constructor(type) { this.type = type; } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    isPremiumOverrideEnabled: () => false,
    progress: { hints: 0, unlocked: 12, lastSelected: 11, completedBeds: { 10: true }, bestTimes: { 10: 25 } },
    hintRestoreInProgress: false, saveProgress: () => {}, syncHintBalance: () => {},
    PREMIUM_HINT_DATE_KEY: 'date', PREMIUM_HINT_TIMESTAMP_KEY: 'timestamp',
  });
  vm.runInContext(between('    function isRevenueCatPurchaseResolved()', '    function loadGameTheme()'), sandbox);
  vm.runInContext(between('    function isPremiumUser()', '    const TRANSLATIONS'), sandbox);
  vm.runInContext(between('    function applyPremiumDailyHint()', '    function updateHintUI()'), sandbox);
  vm.runInContext(between('      let premiumProfileUnsubscribe', '      function warmRemoteClient()'), sandbox);
  const run = code => vm.runInContext(code, sandbox);
  const client = uid => ({ user: { uid }, db: { collection: name => {
    assert.equal(name, 'users');
    return { where: (field, op, value) => {
      assert.deepEqual([field, op, value], ['uid', '==', uid]);
      return { onSnapshot: (_, callback) => {
        profileListener = callback;
        return () => unsubscribeCount++;
      } };
    } };
  } } });
  sandbox.client = client('one');
  run('watchPremiumProfile(client); watchPremiumProfile(client)');
  assert.equal(unsubscribeCount, 0, 'reuse one listener per account');
  const emit = (data, metadata = {}) => profileListener({
    metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
    docs: data ? [{ data: () => data }] : [],
  });
  emit({ manualPremium: true }, { fromCache: true });
  assert.equal(run('isPremiumUser()'), false, 'cache must not grant manual Premium');
  emit({ manualPremium: true }, { hasPendingWrites: true });
  assert.equal(run('isPremiumUser()'), false, 'unconfirmed writes must not grant Premium');
  emit({ manualPremium: true });
  assert.equal(run('isPremiumUser()'), true);
  assert.equal(nativeStates.at(-1), true, 'native ads receive manual Premium');
  run('applyPremiumDailyHint(); applyPremiumDailyHint()');
  assert.equal(sandbox.progress.hints, 2, 'manual Premium receives the same daily allowance once');
  emit({ manualPremium: false });
  assert.equal(run('isPremiumUser()'), false);
  assert.equal(nativeStates.at(-1), false);
  window.__nativeRevenueCatState.isPro = true;
  emit({ manualPremium: false });
  assert.equal(run('isPremiumUser()'), true, 'revoking manual Premium preserves a purchase');
  run('applyPremiumDailyHint()');
  assert.equal(sandbox.progress.hints, 2, 'switching entitlement sources cannot double the daily reward');
  window.__nativeRevenueCatState.isPro = false;
  emit({ purchasePremium: true, isPremium: true });
  assert.equal(run('isPremiumUser()'), false, 'Firestore purchase summaries never grant store entitlements');
  emit({ manualPremium: true });
  emit(null);
  assert.equal(run('isPremiumUser()'), false, 'deleted profiles revoke manual Premium');
  sandbox.client = client('two');
  run('watchPremiumProfile(client)');
  assert.equal(unsubscribeCount, 1, 'account changes dispose the old listener');

  // Read the current grant inside the transaction, not from a stale profile query.
  let currentData = { uid: 'two', name: 'OldName', manualPremium: true, createdAt: 1 };
  const profileRef = { path: 'users/OldName', id: 'OldName' };
  const oldProfile = { id: 'OldName', ref: profileRef, data: () => ({ ...currentData, manualPremium: false }) };
  Object.assign(sandbox, {
    profileMutationGeneration: 0, remoteStateHydrated: true, hintBalanceRevision: 0,
    getRemoteClient: async () => ({ user: { uid: 'two' }, db: {
      collection: () => ({}), runTransaction: async callback => callback({
        get: async ref => { assert.equal(ref, profileRef); return { data: () => currentData }; },
        set: (ref, payload) => { assert.equal(ref, profileRef); currentData = { ...currentData, ...payload }; },
      }),
    } }),
    sanitizeNickname: value => value || '', getNickname: () => 'OldName', getAvatar: () => 'flower',
    findExistingUserProfiles: async () => [oldProfile], hasRemoteAccountMarker: () => true,
    currentUserPayload: (_, overrides) => ({ name: overrides.name || 'OldName', avatar: 'flower' }),
    profileCleanupPayload: () => ({}), readableDocId: name => name,
    setRemoteAccountMarker: () => {}, setLocalHintsDirtyMarker: () => {},
  });
  vm.runInContext(between('      async function performSyncCurrentUser(', '      function normaliseUser('), sandbox);
  run('watchPremiumProfile = () => {}');
  await run('performSyncCurrentUser({name: "NewName", skipNameAvailability: true})');
  assert.equal(currentData.name, 'NewName');
  assert.equal(currentData.manualPremium, true, 'rename/heartbeat must preserve a concurrent admin grant');
  assert.equal(currentData.isPremium, true);
  currentData.manualPremium = false;
  await run('performSyncCurrentUser({name: "NewName", skipNameAvailability: true})');
  assert.equal(currentData.isPremium, false);
  window.__nativeRevenueCatState.isPro = true;
  await run('performSyncCurrentUser({name: "NewName", skipNameAvailability: true})');
  assert.equal(currentData.purchasePremium, true);
  assert.equal(currentData.isPremium, true);

  Object.assign(sandbox, {
    setNickname: () => {}, setAvatar: () => {}, AVATARS: [],
    normaliseLanguageCode: () => null,
  });
  vm.runInContext(between('      function applyRemoteUserProfile(', '      async function deleteRemoteAccountData('), sandbox);
  run('applyRemoteUserProfile({unlockedLevels: 1, completedLevels: 0, hints: 4}, false)');
  assert.equal(sandbox.progress.unlocked, 12, 'profile summaries cannot reset local level progress');
  assert.equal(sandbox.progress.bestTimes[10], 25);
  assert.equal(sandbox.progress.hints, 4);
  assert(!html.includes('user_progress'), 'game must never access the removed collection');
  console.log('Firebase Premium: grant/revoke, purchase parity, daily hints, native bridge, rename races and local progress passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
