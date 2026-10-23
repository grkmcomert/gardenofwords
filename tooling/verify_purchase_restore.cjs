// Regression checks use the real game functions; no store or Firebase writes.
// Run: node tooling/verify_purchase_restore.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const html = fs.readFileSync('assets/game/index.html', 'utf8');
function sourceBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `Missing source: ${start}`);
  return html.slice(from, to);
}

async function verifyCloudBalance() {
  let dirty = false;
  let remoteHints = 7;
  let saved = 0;
  let reads = 0;
  let onRead = () => {};
  const sandbox = vm.createContext({
    progress: { hints: 1 }, hintBalanceRevision: 0, hintRestoreInProgress: false,
    hasLocalHintsDirtyMarker: () => dirty,
    getRemoteClient: async () => ({}),
    findExistingUserProfile: async () => {
      reads++;
      await onRead();
      return { data: () => ({ hints: remoteHints }) };
    },
    persistProgressLocally: () => {},
    performSyncCurrentUser: async () => {
      remoteHints = sandbox.progress.hints;
      saved++;
      dirty = false;
      return { hints: remoteHints };
    },
  });
  vm.runInContext(sourceBetween('      let profileWriteQueue =', '      async function performSyncCurrentUser('), sandbox);
  const restore = () => vm.runInContext('restoreHintBalance()', sandbox);
  assert.equal((await restore()).restored, true);
  assert.equal(sandbox.progress.hints, 7);
  await restore();
  assert.equal(sandbox.progress.hints, 7, 'restore must not add the purchased pack again');
  remoteHints = 0;
  await restore();
  assert.equal(sandbox.progress.hints, 0, 'a fully spent pack stays at zero');
  dirty = true;
  sandbox.progress.hints = 3;
  remoteHints = 10;
  const previousReads = reads;
  await restore();
  assert.equal(reads, previousReads, 'unsynced local spending must not be replaced by a server read');
  assert.equal(remoteHints, 3);
  assert.equal(saved, 1);
  onRead = () => {
    dirty = true;
    sandbox.hintBalanceRevision++;
    sandbox.progress.hints = 2;
  };
  await restore();
  assert.equal(sandbox.progress.hints, 2, 'spending during a restore wins over the stale response');
  assert.equal(remoteHints, 2);
  dirty = false;
  onRead = () => { throw new Error('offline'); };
  await assert.rejects(restore(), /offline/);
  assert.equal(sandbox.progress.hints, 2);

  // Exercise the actual profile writer with two delayed server commits.
  const pendingCommits = [];
  const writes = [];
  const profile = { id: 'Player', ref: { path: 'users/Player' }, data: () => ({ name: 'Player', createdAt: 1 }) };
  Object.assign(sandbox, {
    console, profileMutationGeneration: 0, remoteStateHydrated: true,
    getRemoteClient: async () => ({ user: { uid: 'player' }, db: {
      collection: () => ({}),
      runTransaction: async callback => {
        await callback({ get: async () => profile, set: (_, payload) => writes.push({ ...payload }) });
        await new Promise(resolve => pendingCommits.push(resolve));
      },
    } }),
    sanitizeNickname: value => value || '', getNickname: () => 'Player', getAvatar: () => 'flower',
    findExistingUserProfiles: async () => [profile], hasRemoteAccountMarker: () => true,
    currentUserPayload: () => ({ name: 'Player', avatar: 'flower', hints: sandbox.progress.hints }),
    profileCleanupPayload: () => ({}),
    readableDocId: name => name, watchPremiumProfile: () => {},
    isRevenueCatPurchaseResolved: () => false,
    readableRef: async () => ({ id: 'Player', path: 'users/Player', set: async payload => {
      writes.push({ ...payload });
      await new Promise(resolve => pendingCommits.push(resolve));
    } }),
    setRemoteAccountMarker: () => {}, setLocalHintsDirtyMarker: value => { dirty = value; },
    queueProgressBackup: () => {},
  });
  vm.runInContext(sourceBetween('      async function performSyncCurrentUser(', '      function normaliseUser('), sandbox);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  sandbox.progress.hints = 10;
  dirty = true;
  const first = vm.runInContext('syncCurrentUser()', sandbox);
  await tick();
  sandbox.progress.hints = 8;
  sandbox.hintBalanceRevision++;
  const second = vm.runInContext('syncCurrentUser()', sandbox);
  await tick();
  assert.equal(writes.length, 1, 'profile writes must be serialized');
  pendingCommits.shift()();
  await first;
  assert.equal(dirty, true, 'an old commit must not clear a newer local change');
  await tick();
  assert.equal(writes[1].hints, 8);
  pendingCommits.shift()();
  await second;
  assert.equal(dirty, false);
  console.log('Cloud balance: remaining/zero balances, repeated restore, offline spending and delayed writes passed.');
}

async function verifyBrowser() {
  const outputDir = path.resolve('build/purchase-validation');
  fs.mkdirSync(outputDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(outputDir, 'browser-'));
  const browser = spawn(process.env.CHROME_BINARY || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) await pause(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (!pending.has(data.id)) return;
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const until = async expression => {
      for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await pause(50); }
      throw new Error(`Timed out: ${expression}`);
    };
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(path.resolve('assets/game/index.html')).href });
    await until('document.documentElement?.classList.contains("app-ready")');
    await evaluate(`
      currentLanguage = 'tr';
      window.__qaCalls = [];
      window.FlutterRevenueCat = { postMessage(raw) { window.__qaCalls.push(JSON.parse(raw)); } };
      showPremiumWelcomeToast = () => { window.__qaWelcomes = (window.__qaWelcomes || 0) + 1; };
      localStorage.setItem(PREMIUM_HINT_DATE_KEY, new Intl.DateTimeFormat('en-CA').format(new Date()));
      window.__setNativeRevenueCatState({ isPro: false, isResolved: true });
      progress.hints = 1;
      progress.creditedHintTransactions = [];
      persistProgressLocally();
      void (window.__qaPurchase = purchaseMarketPlan('monthly'));
    `);
    assert.equal(await evaluate('purchaseOperationBusy'), true);
    assert.equal(await evaluate('document.getElementById("marketRestoreButton").disabled'), true);
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { result: 'purchased', isPro: true, isResolved: true }); window.__qaPurchase;`);
    assert.equal(await evaluate('isPremiumUser()'), true);
    assert.equal(await evaluate('window.__qaWelcomes'), 1);
    assert.equal(await evaluate('purchaseOperationBusy'), false);

    // A successful store payment with a delayed entitlement never charges twice.
    await evaluate(`window.__setNativeRevenueCatState({ isPro: false, isResolved: true }); void(window.__qaPurchase = purchaseHintMorePlan('monthly'));`);
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { result: 'purchased', isPro: false, isResolved: true }); window.__qaPurchase;`);
    assert.equal(await evaluate('hasPendingPremiumPurchase()'), true);
    assert.match(await evaluate('hintMoreStatus.textContent'), /Ödeme alındı/);
    const paidCalls = await evaluate('__qaCalls.filter(call => call.action === "purchase").length');
    await evaluate(`void(window.__qaPurchase = purchaseMarketPlan('monthly'));`);
    assert.equal(await evaluate('__qaCalls.at(-1).action'), 'getCustomerInfo');
    assert.equal(await evaluate('__qaCalls.at(-1).params.forceRefresh'), true);
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { isPro: true, isResolved: true }); window.__qaPurchase;`);
    assert.equal(await evaluate('__qaCalls.filter(call => call.action === "purchase").length'), paidCalls);
    assert.equal(await evaluate('hasPendingPremiumPurchase()'), false);

    // Both restore buttons work for hints even without Premium, including zero.
    await evaluate(`
      window.__qaRemoteHints = 7;
      Leaderboard.restoreHintBalance = async () => {
        progress.hints = window.__qaRemoteHints; persistProgressLocally(); return { restored: true };
      };
      window.__setNativeRevenueCatState({ isPro: false, isResolved: true });
    `);
    for (const [button, status, balance] of [
      ['marketRestoreButton', 'marketStatus', 7],
      ['hintMoreRestoreButton', 'hintMoreStatus', 7],
      ['marketRestoreButton', 'marketStatus', 0],
    ]) {
      await evaluate(`window.__qaRemoteHints = ${balance}; document.getElementById('${button}').click();`);
      assert.equal(await evaluate('__qaCalls.at(-1).action'), 'restorePurchases');
      await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { isPro: false, isResolved: true });`);
      await until('!purchaseOperationBusy');
      assert.equal(await evaluate('progress.hints'), balance);
      assert.equal(await evaluate(`document.getElementById('${status}').classList.contains('error')`), false);
      assert.match(await evaluate(`document.getElementById('${status}').textContent`), new RegExp(`Kalan ipucu: ${balance}`));
    }

    // An early native entitlement callback must not overwrite saved hints
    // with the initial balance plus the daily reward.
    await evaluate(`
      localStorage.removeItem(PREMIUM_HINT_DATE_KEY);
      localStorage.removeItem(PREMIUM_HINT_TIMESTAMP_KEY);
      progress.hints = 1; persistProgressLocally();
      window.__qaRemoteHints = 7;
      document.getElementById('marketRestoreButton').click();
      window.__setNativeRevenueCatState({ isPro: true, isResolved: true });
    `);
    assert.equal(await evaluate('progress.hints'), 7, 'daily reward must wait for restore completion');
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { isPro: true, isResolved: true });`);
    await until('!purchaseOperationBusy');
    assert.equal(await evaluate('progress.hints'), 9);

    // Replayed native replies / repeated transactions credit only once.
    await evaluate(`void(window.__qaPurchase = purchaseHintPack('hints10', setMarketPlansLoading, setMarketStatus));`);
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { result: 'purchased', isPro: true, isResolved: true, hintAmount: 10, transactionId: 'hint-transaction-1' }); window.__qaPurchase;`);
    assert.equal(await evaluate('progress.hints'), 19);
    await evaluate(`void(window.__qaPurchase = purchaseHintPack('hints10', setMarketPlansLoading, setMarketStatus));`);
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { result: 'purchased', isPro: true, isResolved: true, hintAmount: 10, transactionId: 'hint-transaction-1' }); window.__qaPurchase;`);
    assert.equal(await evaluate('progress.hints'), 19);
    await evaluate(`void(window.__qaPurchase = purchaseHintPack('hints10', setMarketPlansLoading, setMarketStatus));`);
    await evaluate(`__revenueCatReject(__qaCalls.at(-1).id, 'Purchase cancelled'); window.__qaPurchase;`);
    assert.equal(await evaluate('progress.hints'), 19);
    assert.equal(await evaluate('purchaseOperationBusy'), false);
    assert.match(await evaluate('marketStatus.textContent'), /iptal/i);

    // Store and hint restoration report partial success independently.
    await evaluate(`window.__qaRemoteHints = 6; document.getElementById('marketRestoreButton').click();`);
    await evaluate(`__revenueCatReject(__qaCalls.at(-1).id, 'Store unavailable');`);
    await until('!purchaseOperationBusy');
    assert.equal(await evaluate('progress.hints'), 6);
    assert.match(await evaluate('marketStatus.textContent'), /Premium kontrol edilemedi/);
    await evaluate(`Leaderboard.restoreHintBalance = async () => { throw new Error('offline'); }; document.getElementById('hintMoreRestoreButton').click();`);
    await evaluate(`__revenueCatResolve(__qaCalls.at(-1).id, { isPro: true, isResolved: true });`);
    await until('!purchaseOperationBusy');
    assert.equal(await evaluate('progress.hints'), 6);
    assert.match(await evaluate('hintMoreStatus.textContent'), /Premium geri yüklendi/);
    console.log('Browser: first Premium, delayed confirmation, both restore buttons, daily reward race and hint deduplication passed.');
  } finally {
    if (socket) socket.close();
    browser.kill();
  }
}

(async () => { await verifyCloudBalance(); await verifyBrowser(); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
