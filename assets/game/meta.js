/* Garden of Words: garden systems that bring players back.
 * - Gardener level: XP from found words, finished beds, quests and chests. Existing players get
 *   the XP their past progress is worth on first launch. Each level-up gives hints and a
 *   full-screen celebration.
 * - Day streak (grows once per day when a bed is completed) with milestone hint bonuses;
 *   Premium forgives one missed day.
 * - 7-day gift calendar on the home screen, doubled by a rewarded ad (Premium: automatic).
 * - Petals: a soft currency earned per found word, per bed (by blooms) and from quests.
 * - Daily quests: three per day, picked from a pool by date; all three give a hint bonus.
 * - Greenhouse: plant seeds with petals, harvest hints/petals when they bloom (real time).
 *   A rewarded ad grows a pot instantly; Premium gets a fourth pot and free instant growth.
 *   Flutter schedules a local notification for the next bloom.
 * - Gardens: a flower opens every 5 new beds; blooming all 50 beds of a chapter opens a chest
 *   with a celebration.
 *
 * Shares the main game script's globals (progress, saveProgress, syncHintBalance, updateHintUI,
 * AdMobBridge, isPremiumUser, currentLanguage, achievementToastLayer, shownScreenId,
 * isBedCompleted, bedStars, openMarketModal, updateChapterBanners, updateHome, TOTAL_LEVELS).
 * State lives in its own storage key so the cloud-synced progress object is never reshaped.
 */
(function () {
  "use strict";

  const KEY = "kelimeler-bahcesi-retention-v1";
  const GIFTS = [1, 1, 2, 1, 2, 2, 4];
  const MILESTONES = { 3: 1, 7: 2, 14: 3, 30: 5, 60: 5, 100: 10 };
  const REVIEW_AFTER_BEDS = 5;
  const CHAPTER_EMOJI = ["🌱", "🍀", "🌷", "🌿", "🌻", "🌹", "🍄", "🍒", "💜", "🌵", "🍁", "🐸", "🎋", "🌺", "🌲", "🌸", "🌙", "🌳", "👑"];
  const CHAPTER_BEDS = 50;
  const CHEST_HINTS = 5;
  const CHEST_PETALS = 100;
  const FLOWER_PETALS = 10;
  const QUEST_BONUS_HINTS = 2;
  const PETALS_PER_HINT = 60;
  const XP = { word: 2, bed: 10, star: 5, newBed: 10, quest: 15, chest: 60 };
  const XP_VERSION = 1;
  const SEEDS = [
    { id: "daisy", emoji: "🌼", cost: 10, minutes: 20, petals: 20, hints: 0 },
    { id: "tulip", emoji: "🌷", cost: 35, minutes: 120, petals: 10, hints: 1 },
    { id: "sunflower", emoji: "🌻", cost: 70, minutes: 360, petals: 25, hints: 2 },
    { id: "rose", emoji: "🌹", cost: 140, minutes: 720, petals: 50, hints: 4 }
  ];
  // [target, petal reward]. "fast" and "combo" targets are thresholds, the rest are counts.
  const QUEST_POOL = [
    { type: "words", icon: "🔤", tiers: [[20, 15], [30, 20], [45, 30]] },
    { type: "beds", icon: "🌼", tiers: [[2, 15], [3, 25], [4, 35]] },
    { type: "noHint", icon: "🧠", tiers: [[1, 20]] },
    { type: "threeStar", icon: "⭐", tiers: [[1, 20], [2, 35]] },
    { type: "combo", icon: "🔥", tiers: [[3, 15], [4, 25]] },
    { type: "fast", icon: "⏱️", tiers: [[90, 20], [60, 30]] },
    { type: "newBed", icon: "🌱", tiers: [[1, 15], [2, 25]] }
  ];

  const COPY = {
    en: {
      greeting: "Welcome,", level: "Level {n}", xpText: "{a} / {b} XP", signTagline: "A cozy word garden", music: "Lo-fi garden radio",
      levelUp: "Level up", levelUpTitle: "You reached level {n}!", continue: "Continue",
      levelTitle: "Gardener level", levelIntro: "Earn XP by finding words, finishing beds and completing quests.",
      levelNext: "{n} XP to level {l}", levelRewards: "Every level: +1 hint\nEvery 5th level: +3 hints and +50 🌸",
      xpEarned: "Experience", mapSub: "{n} beds open", leaderboardSub: "Best times", marketSub: "Hints & Premium",
      themesSub: "Change the scenery", helpSub: "Privacy & contact", questsSub: "{n}/3 done", questsSubAll: "All done ✓",
      ghSubReady: "Ready to harvest!", ghSubEmpty: "Plant a seed", ghSubGrowing: "Blooms in {t}",
      streakSub: "{n} days in a row", streakSubZero: "Start today", achievementsSub: "{n} badges",
      streakLabel: "Daily streak", questsLabel: "Quests", greenhouseLabel: "Greenhouse",
      streakToday: "{n}-day streak! See you tomorrow.", streakSaved: "Premium kept your streak alive: {n} days!",
      streakTitle: "Daily streak", streakDays: "days in a row", streakBest: "Best: {n}", streakHint: "Finish one bed a day to keep your streak growing.",
      streakNext: "Next bonus at {n} days: +{h} hints", openGift: "🎁 Open today's gift",
      giftTitle: "Daily Garden Gift", giftSubtitle: "Come back every day: the 7th day holds the biggest gift.",
      giftDay: "Day {n}", giftClaim: "Claim +{n} hints", giftDouble: "Watch a video, get +{n}",
      giftPremiumDouble: "Premium doubles it: +{n}", giftClaimed: "+{n} hints added to your basket 🌿",
      giftAdFail: "No video right now. Your gift is still waiting.",
      milestoneTitle: "{n}-day streak!", milestoneDesc: "Bonus: +{h} hints",
      bonusHint: "🎬 Watch a video, +1 hint", bonusHintDone: "+1 hint 🌿", bonusHintFail: "No video right now",
      questsTitle: "Daily Quests", questsSubtitle: "Fresh quests every day. Finish all three for a bonus.",
      claim: "Claim", claimed: "Done", bonusTitle: "Finish all 3 quests", bonusReward: "Bonus: +{n} hints", bonusClaim: "Claim",
      questsReset: "New quests in {t}", questDoneToast: "Quest complete", questDoneDesc: "Claim it on the home screen",
      q_words: "Find {n} words", q_beds: "Complete {n} beds", q_noHint: "Finish a bed without hints", q_threeStar: "Earn 3 blooms on {n} bed(s)",
      q_combo: "Reach a ×{n} combo", q_fast: "Finish a bed in under {n}s", q_newBed: "Bloom {n} new bed(s)",
      ghTitle: "Greenhouse", ghSubtitle: "Plant seeds with petals and come back when they bloom.",
      harvest: "Harvest", growNow: "▶ Grow now", growNowFree: "⚡ Grow now", emptyPot: "Empty pot", premiumPot: "Premium",
      seedsTitle: "Seeds", seedInfo: "{time} · gives {reward}", notEnough: "Not enough petals", potsFull: "All pots are busy",
      exchangeTitle: "Trade petals", exchangeDesc: "{n} 🌸 → 1 hint", trade: "Trade", harvested: "+{reward} harvested!", traded: "+1 hint 🌿",
      seed_daisy: "Daisy", seed_tulip: "Tulip", seed_sunflower: "Sunflower", seed_rose: "Rose",
      rewardPetals: "Petals earned", rewardQuest: "Quest done: {q}",
      gardenComplete: "Garden complete!", nextGarden: "Next garden: {name}", awesome: "Wonderful!", flowerBloomed: "A new flower bloomed in your garden",
      chestTitle: "Chapter chest", chestLocked: "Bloom all {n} beds of this chapter to open the chest.",
      chestReward: "+{h} hints · +{p} 🌸", chestOpen: "Open chest", chestClaimed: "Already opened. Well done!", chestProgress: "{done} / {total} beds bloomed",
      close: "Close", hours: "{h}h {m}m", minutes: "{m}m", seconds: "{s}s",
      chapters: ["Seed Bed", "Clover Path", "Tulip Row", "Fern Hollow", "Sunflower Field", "Rose Arbor", "Mushroom Glade", "Cherry Orchard", "Lavender Lane", "Cactus Garden", "Maple Grove", "Lily Pond", "Bamboo Walk", "Hibiscus Bay", "Pine Ridge", "Blossom Hill", "Moonflower Court", "Evergreen Vale", "Wildwood Crown"]
    },
    de: {
      greeting: "Willkommen,", level: "Level {n}", xpText: "{a} / {b} EP", signTagline: "Ein gemütlicher Wortgarten", music: "Lo-Fi-Gartenradio",
      levelUp: "Level-Aufstieg", levelUpTitle: "Du hast Level {n} erreicht!", continue: "Weiter",
      levelTitle: "Gärtnerlevel", levelIntro: "Sammle EP, indem du Wörter findest, Beete abschließt und Aufgaben erledigst.",
      levelNext: "{n} EP bis Level {l}", levelRewards: "Jedes Level: +1 Tipp\nJedes 5. Level: +3 Tipps und +50 🌸",
      xpEarned: "Erfahrung", mapSub: "{n} Beete offen", leaderboardSub: "Bestzeiten", marketSub: "Tipps & Premium",
      themesSub: "Szenerie wechseln", helpSub: "Datenschutz & Kontakt", questsSub: "{n}/3 erledigt", questsSubAll: "Alles erledigt ✓",
      ghSubReady: "Erntebereit!", ghSubEmpty: "Pflanze einen Samen", ghSubGrowing: "Blüht in {t}",
      streakSub: "{n} Tage in Folge", streakSubZero: "Heute starten", achievementsSub: "{n} Abzeichen",
      streakLabel: "Tägliche Serie", questsLabel: "Aufgaben", greenhouseLabel: "Gewächshaus",
      streakToday: "{n}-Tage-Serie! Bis morgen.", streakSaved: "Premium hat deine Serie gerettet: {n} Tage!",
      streakTitle: "Tägliche Serie", streakDays: "Tage in Folge", streakBest: "Rekord: {n}", streakHint: "Schließe jeden Tag ein Beet ab, damit deine Serie wächst.",
      streakNext: "Nächster Bonus bei {n} Tagen: +{h} Tipps", openGift: "🎁 Heutiges Geschenk öffnen",
      giftTitle: "Tägliches Gartengeschenk", giftSubtitle: "Komm jeden Tag wieder: Am 7. Tag wartet das größte Geschenk.",
      giftDay: "Tag {n}", giftClaim: "+{n} Tipps abholen", giftDouble: "Video ansehen, +{n} erhalten",
      giftPremiumDouble: "Premium verdoppelt: +{n}", giftClaimed: "+{n} Tipps in deinem Korb 🌿",
      giftAdFail: "Gerade kein Video. Dein Geschenk wartet weiter.",
      milestoneTitle: "{n}-Tage-Serie!", milestoneDesc: "Bonus: +{h} Tipps",
      bonusHint: "🎬 Video ansehen, +1 Tipp", bonusHintDone: "+1 Tipp 🌿", bonusHintFail: "Gerade kein Video",
      questsTitle: "Tägliche Aufgaben", questsSubtitle: "Jeden Tag neue Aufgaben. Schaffe alle drei für einen Bonus.",
      claim: "Abholen", claimed: "Erledigt", bonusTitle: "Alle 3 Aufgaben schaffen", bonusReward: "Bonus: +{n} Tipps", bonusClaim: "Abholen",
      questsReset: "Neue Aufgaben in {t}", questDoneToast: "Aufgabe geschafft", questDoneDesc: "Hol sie dir auf dem Startbildschirm ab",
      q_words: "Finde {n} Wörter", q_beds: "Schließe {n} Beete ab", q_noHint: "Schließe ein Beet ohne Tipps ab", q_threeStar: "Hole 3 Blüten in {n} Beet(en)",
      q_combo: "Erreiche eine ×{n}-Kombo", q_fast: "Schließe ein Beet in unter {n} s ab", q_newBed: "Lass {n} neue(s) Beet(e) erblühen",
      ghTitle: "Gewächshaus", ghSubtitle: "Pflanze Samen mit Blütenblättern und komm wieder, wenn sie blühen.",
      harvest: "Ernten", growNow: "▶ Sofort wachsen", growNowFree: "⚡ Sofort wachsen", emptyPot: "Leerer Topf", premiumPot: "Premium",
      seedsTitle: "Samen", seedInfo: "{time} · bringt {reward}", notEnough: "Nicht genug Blütenblätter", potsFull: "Alle Töpfe sind belegt",
      exchangeTitle: "Blütenblätter tauschen", exchangeDesc: "{n} 🌸 → 1 Tipp", trade: "Tauschen", harvested: "+{reward} geerntet!", traded: "+1 Tipp 🌿",
      seed_daisy: "Gänseblümchen", seed_tulip: "Tulpe", seed_sunflower: "Sonnenblume", seed_rose: "Rose",
      rewardPetals: "Blütenblätter verdient", rewardQuest: "Aufgabe erledigt: {q}",
      gardenComplete: "Garten vollendet!", nextGarden: "Nächster Garten: {name}", awesome: "Wunderbar!", flowerBloomed: "Eine neue Blume blüht in deinem Garten",
      chestTitle: "Kapiteltruhe", chestLocked: "Lass alle {n} Beete dieses Kapitels erblühen, um die Truhe zu öffnen.",
      chestReward: "+{h} Tipps · +{p} 🌸", chestOpen: "Truhe öffnen", chestClaimed: "Schon geöffnet. Gut gemacht!", chestProgress: "{done} / {total} Beete erblüht",
      close: "Schließen", hours: "{h} Std. {m} Min.", minutes: "{m} Min.", seconds: "{s} s",
      chapters: ["Saatbeet", "Kleepfad", "Tulpenreihe", "Farnmulde", "Sonnenblumenfeld", "Rosenlaube", "Pilzlichtung", "Kirschgarten", "Lavendelweg", "Kakteengarten", "Ahornhain", "Seerosenteich", "Bambusweg", "Hibiskusbucht", "Kiefernkamm", "Blütenhügel", "Mondblumenhof", "Immergrünes Tal", "Wildwaldkrone"]
    },
    tr: {
      greeting: "Hoş geldin,", level: "Seviye {n}", xpText: "{a} / {b} XP", signTagline: "Kelimelerle büyüyen bahçe", music: "Lo-fi bahçe radyosu",
      levelUp: "Seviye atladın", levelUpTitle: "{n}. seviyeye ulaştın!", continue: "Devam et",
      levelTitle: "Bahçıvan seviyesi", levelIntro: "Kelime bularak, bölüm bitirerek ve görev tamamlayarak XP kazan.",
      levelNext: "{l}. seviyeye {n} XP", levelRewards: "Her seviye: +1 ipucu\nHer 5. seviye: +3 ipucu ve +50 🌸",
      xpEarned: "Deneyim", mapSub: "{n} bölüm açık", leaderboardSub: "En iyi süreler", marketSub: "İpucu ve Premium",
      themesSub: "Manzarayı değiştir", helpSub: "Gizlilik ve iletişim", questsSub: "{n}/3 tamam", questsSubAll: "Hepsi tamam ✓",
      ghSubReady: "Toplamaya hazır!", ghSubEmpty: "Bir tohum ek", ghSubGrowing: "{t} sonra açar",
      streakSub: "{n} gün üst üste", streakSubZero: "Bugün başla", achievementsSub: "{n} rozet",
      streakLabel: "Günlük seri", questsLabel: "Görevler", greenhouseLabel: "Sera",
      streakToday: "{n} günlük seri! Yarın görüşürüz.", streakSaved: "Premium serini korudu: {n} gün!",
      streakTitle: "Günlük seri", streakDays: "gün üst üste", streakBest: "En iyi: {n}", streakHint: "Serini büyütmek için her gün bir bölüm bitir.",
      streakNext: "Sonraki bonus {n}. günde: +{h} ipucu", openGift: "🎁 Bugünün hediyesini aç",
      giftTitle: "Günlük Bahçe Hediyesi", giftSubtitle: "Her gün uğra: en büyük hediye 7. günde seni bekliyor.",
      giftDay: "{n}. gün", giftClaim: "+{n} ipucu al", giftDouble: "Video izle, +{n} al",
      giftPremiumDouble: "Premium ikiye katlar: +{n}", giftClaimed: "+{n} ipucu sepetine eklendi 🌿",
      giftAdFail: "Şu an video yok. Hediyen seni bekliyor.",
      milestoneTitle: "{n} günlük seri!", milestoneDesc: "Bonus: +{h} ipucu",
      bonusHint: "🎬 Video izle, +1 ipucu", bonusHintDone: "+1 ipucu 🌿", bonusHintFail: "Şu an video yok",
      questsTitle: "Günlük Görevler", questsSubtitle: "Her gün yeni görevler. Üçünü de bitir, bonusu kap.",
      claim: "Al", claimed: "Tamam", bonusTitle: "3 görevin hepsini bitir", bonusReward: "Bonus: +{n} ipucu", bonusClaim: "Al",
      questsReset: "Yeni görevler {t} sonra", questDoneToast: "Görev tamam", questDoneDesc: "Ödülünü ana ekrandan al",
      q_words: "{n} kelime bul", q_beds: "{n} bölüm bitir", q_noHint: "Bir bölümü ipucusuz bitir", q_threeStar: "{n} bölümde 3 çiçek topla",
      q_combo: "×{n} kombo yap", q_fast: "Bir bölümü {n} saniyenin altında bitir", q_newBed: "{n} yeni bölüm aç",
      ghTitle: "Sera", ghSubtitle: "Yapraklarla tohum ek, çiçek açınca gelip topla.",
      harvest: "Topla", growNow: "▶ Hemen büyüt", growNowFree: "⚡ Hemen büyüt", emptyPot: "Boş saksı", premiumPot: "Premium",
      seedsTitle: "Tohumlar", seedInfo: "{time} · {reward} verir", notEnough: "Yeterli yaprak yok", potsFull: "Tüm saksılar dolu",
      exchangeTitle: "Yaprak takası", exchangeDesc: "{n} 🌸 → 1 ipucu", trade: "Takas", harvested: "+{reward} toplandı!", traded: "+1 ipucu 🌿",
      seed_daisy: "Papatya", seed_tulip: "Lale", seed_sunflower: "Ayçiçeği", seed_rose: "Gül",
      rewardPetals: "Kazanılan yaprak", rewardQuest: "Görev tamam: {q}",
      gardenComplete: "Bahçe tamamlandı!", nextGarden: "Sıradaki bahçe: {name}", awesome: "Harika!", flowerBloomed: "Bahçende yeni bir çiçek açtı",
      chestTitle: "Bahçe sandığı", chestLocked: "Sandığı açmak için bu bahçedeki {n} bölümün hepsini bitir.",
      chestReward: "+{h} ipucu · +{p} 🌸", chestOpen: "Sandığı aç", chestClaimed: "Zaten açıldı. Harikasın!", chestProgress: "{done} / {total} bölüm bitti",
      close: "Kapat", hours: "{h} sa {m} dk", minutes: "{m} dk", seconds: "{s} sn",
      chapters: ["Tohum Yatağı", "Yonca Yolu", "Lale Sırası", "Eğrelti Koyağı", "Ayçiçeği Tarlası", "Gül Çardağı", "Mantar Açıklığı", "Kiraz Bahçesi", "Lavanta Yolu", "Kaktüs Bahçesi", "Akçaağaç Korusu", "Nilüfer Göleti", "Bambu Yolu", "Ebegümeci Koyu", "Çam Sırtı", "Çiçek Tepesi", "Ay Çiçeği Avlusu", "Hep Yeşil Vadi", "Yaban Ormanı Tacı"]
    }
  };

  const lang = () => (typeof currentLanguage === "string" && COPY[currentLanguage]) ? currentLanguage : "en";
  function L(key, vars) {
    let s = COPY[lang()][key] ?? COPY.en[key] ?? key;
    if (typeof s !== "string") return s;
    Object.keys(vars || {}).forEach(k => { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  }
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const esc = (text) => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const dayKey = (d) => new Intl.DateTimeFormat("en-CA").format(d || new Date());
  function daysBetween(a, b) {
    if (!a || !b) return Infinity;
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }
  function msUntilMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  }
  function formatDuration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    if (total >= 3600) return L("hours", { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60) });
    if (total >= 60) return L("minutes", { m: Math.ceil(total / 60) });
    return L("seconds", { s: total });
  }

  function defaults() {
    return {
      streak: 0, best: 0, lastPlayDay: "", playDays: [], giftDay: 0, lastGiftDay: "", lastGiftAt: 0, milestones: {}, beds: 0, reviewAsked: false,
      petals: 0, petalsEarned: 0, questDay: "", quests: [], questBonus: false, pots: [null, null, null, null], chests: {},
      xp: 0, xpVersion: 0
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object") return Object.assign(defaults(), s);
    } catch (_) {}
    return defaults();
  }
  const state = load();
  if (!Array.isArray(state.pots)) state.pots = [];
  while (state.pots.length < 4) state.pots.push(null);
  if (!Array.isArray(state.playDays)) state.playDays = [];
  if (!state.chests || typeof state.chests !== "object") state.chests = {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };

  const premium = () => {
    try { return Boolean((typeof isPremiumUser === "function" && isPremiumUser()) || progress.adsBypassEnabled); } catch (_) { return false; }
  };
  function showRewarded(onDone) {
    let settled = false;
    let timeout = 0;
    const done = (ok) => { if (settled) return; settled = true; window.clearTimeout(timeout); onDone(ok); };
    timeout = window.setTimeout(() => done(false), 60000);
    try { AdMobBridge.showRewarded(() => done(true), () => done(false)); } catch (_) { done(false); }
  }

  /* ---------- Level & XP ---------- */

  const xpToNext = (level) => 40 + level * 20;
  function levelInfo(xp) {
    let level = 1;
    let rest = Math.max(0, Math.floor(xp));
    while (rest >= xpToNext(level)) { rest -= xpToNext(level); level += 1; }
    return { level, into: rest, need: xpToNext(level) };
  }
  // XP an existing save has already earned, so long-time players do not start at level 1.
  function historicXp() {
    try {
      const beds = Object.keys(progress.completedBeds || {});
      let xp = beds.length * (XP.bed + XP.newBed);
      beds.forEach(id => { xp += (typeof bedStars === "function" ? bedStars(Number(id)) : 1) * XP.star; });
      xp += (Number(progress.stats?.wordsFoundTotal) || 0) * XP.word;
      return xp;
    } catch (_) { return 0; }
  }
  if (state.xpVersion !== XP_VERSION) {
    state.xp = Math.max(state.xp || 0, historicXp());
    state.xpVersion = XP_VERSION;
    save();
  }
  function addXp(n) {
    if (!n) return;
    const before = levelInfo(state.xp).level;
    state.xp += n;
    save();
    const after = levelInfo(state.xp).level;
    for (let level = before + 1; level <= after; level += 1) {
      const hints = level % 5 === 0 ? 3 : 1;
      const petals = level % 5 === 0 ? 50 : 0;
      addHints(hints);
      if (petals) addPetals(petals);
      queueCelebration(() => showLevelUp(level, hints, petals));
    }
    renderHud();
  }

  /* ---------- Celebrations (level-ups, garden chests) run one at a time ---------- */

  const celebrations = [];
  let celebrating = false;
  function queueCelebration(fn) { celebrations.push(fn); }
  function playCelebrations() {
    if (celebrating || !celebrations.length) return;
    celebrating = true;
    celebrations.shift()(() => { celebrating = false; window.setTimeout(playCelebrations, 250); });
  }
  let levelUpEl = null;
  function showLevelUp(level, hints, petals, done) {
    if (!levelUpEl) {
      levelUpEl = document.createElement("div");
      levelUpEl.className = "levelup";
      levelUpEl.setAttribute("role", "dialog");
      levelUpEl.setAttribute("aria-modal", "true");
      document.body.appendChild(levelUpEl);
    }
    levelUpEl.innerHTML = `
      <div class="levelup-inner">
        <span class="levelup-rays" aria-hidden="true"></span>
        <p class="levelup-kicker">${esc(L("levelUp"))}</p>
        <div class="levelup-badge"><small>${esc(L("level", { n: "" }).trim())}</small><b>${level - 1}</b></div>
        <h2 class="levelup-title">${esc(L("levelUpTitle", { n: level }))}</h2>
        <div class="levelup-rewards"><span>+${hints} 💡</span>${petals ? `<span>+${petals} 🌸</span>` : ""}</div>
        <button class="primary-button" type="button">${esc(L("continue"))}</button>
      </div>`;
    void levelUpEl.offsetWidth;
    levelUpEl.classList.add("open");
    const number = levelUpEl.querySelector(".levelup-badge b");
    window.setTimeout(() => {
      number.textContent = String(level);
      number.animate?.([{ transform: "scale(1.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.2,1.6,.4,1)" });
      confetti(levelUpEl.querySelector(".levelup-inner"), "levelup-confetti", 28);
      try { SoundFX.levelComplete(); } catch (_) {}
    }, 650);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      levelUpEl.classList.remove("open");
      window.setTimeout(done, 300);
    };
    levelUpEl.querySelector(".primary-button").addEventListener("click", close);
  }

  /* ---------- Rewards ---------- */

  function bump(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
  function addHints(n) {
    if (!n) return;
    try {
      progress.hints = (progress.hints || 0) + n;
      saveProgress();
      syncHintBalance();
      updateHintUI();
    } catch (error) { console.warn("Garden hint grant failed:", error); }
    bump("hudHints");
  }
  function addPetals(n) {
    if (!n) return;
    state.petals = Math.max(0, state.petals + n);
    if (n > 0) state.petalsEarned += n;
    save();
    renderHud();
    if (n > 0) bump("hudPetals");
  }
  function rewardText(hints, petals) {
    const parts = [];
    if (hints) parts.push(`${hints} 💡`);
    if (petals) parts.push(`${petals} 🌸`);
    return parts.join(" + ");
  }

  function toast(icon, label, title, desc) {
    const layer = typeof achievementToastLayer !== "undefined" ? achievementToastLayer : null;
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "hint-reward-toast";
    el.innerHTML = `<div class="hint-reward-toast-icon"></div><div class="hint-reward-toast-text">
      <span class="hint-reward-toast-label"></span><strong class="hint-reward-toast-title"></strong>
      <span class="hint-reward-toast-desc"></span></div>`;
    el.querySelector(".hint-reward-toast-icon").textContent = icon;
    el.querySelector(".hint-reward-toast-label").textContent = label;
    el.querySelector(".hint-reward-toast-title").textContent = title;
    el.querySelector(".hint-reward-toast-desc").textContent = desc;
    layer.appendChild(el);
    window.setTimeout(() => el.remove(), 3200);
  }

  function confetti(stage, className, count) {
    if (!stage) return;
    const pieces = ["🌸", "🌼", "💡", "🌷", "✨", "🍃", "🌻"];
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement("i");
      piece.className = className;
      piece.setAttribute("aria-hidden", "true");
      piece.textContent = pieces[i % pieces.length];
      const angle = (Math.PI * 2 * i) / count + Math.random() * .3;
      const distance = 90 + Math.random() * 110;
      piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      piece.style.setProperty("--dy", `${Math.sin(angle) * distance - 40}px`);
      piece.style.setProperty("--rot", `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.animationDelay = `${Math.random() * .12}s`;
      stage.appendChild(piece);
      window.setTimeout(() => piece.remove(), 1800);
    }
  }

  /* ---------- HUD ---------- */

  function renderHud() {
    setText("hudPetalsValue", String(state.petals));
    setText("hudGreeting", L("greeting"));
    const info = levelInfo(state.xp);
    setText("levelLabel", L("level", { n: info.level }));
    setText("levelXpText", L("xpText", { a: info.into, b: info.need }));
    const fill = $("levelFill");
    if (fill) fill.style.width = `${Math.max(3, (info.into / info.need) * 100)}%`;
  }

  /* ---------- Streak ---------- */

  function liveStreak() {
    const gap = daysBetween(state.lastPlayDay, dayKey());
    if (gap <= 1) return state.streak;
    if (gap === 2 && premium()) return state.streak; // Premium: one missed day is forgiven
    return 0;
  }

  /* ---------- Quests ---------- */

  function seededRandom(seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i += 1) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => {
      h += 0x6D2B79F5;
      let x = h;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ensureQuests() {
    const today = dayKey();
    if (state.questDay === today && Array.isArray(state.quests) && state.quests.length === 3) return;
    const random = seededRandom(`gow-${today}`);
    const pool = QUEST_POOL.slice();
    const picked = [];
    while (picked.length < 3 && pool.length) {
      const def = pool.splice(Math.floor(random() * pool.length), 1)[0];
      const tier = def.tiers[Math.floor(random() * def.tiers.length)];
      picked.push({ type: def.type, target: tier[0], reward: tier[1], progress: 0, claimed: false });
    }
    state.questDay = today;
    state.quests = picked;
    state.questBonus = false;
    save();
  }
  const questIcon = (type) => (QUEST_POOL.find(q => q.type === type) || {}).icon || "🌿";
  const isThreshold = (q) => q.type === "fast" || q.type === "combo";
  const questGoal = (q) => isThreshold(q) ? 1 : q.target;
  const questDone = (q) => q.progress >= questGoal(q);
  const questText = (q) => L(`q_${q.type}`, { n: q.target });
  function questTarget(type) {
    ensureQuests();
    return (state.quests.find(q => q.type === type) || {}).target || Infinity;
  }
  function bumpQuest(type, amount) {
    ensureQuests();
    let completed = null;
    state.quests.forEach(q => {
      if (q.type !== type || q.claimed || questDone(q)) return;
      q.progress = Math.min(questGoal(q), q.progress + amount);
      if (questDone(q)) completed = q;
    });
    save();
    if (completed) toast(questIcon(completed.type), L("questDoneToast"), questText(completed), L("questDoneDesc"));
    return completed;
  }
  function claimableQuests() {
    ensureQuests();
    let n = state.quests.filter(q => questDone(q) && !q.claimed).length;
    if (!state.questBonus && state.quests.every(q => q.claimed)) n += 1;
    return n;
  }

  /* ---------- Greenhouse ---------- */

  const seedById = (id) => SEEDS.find(s => s.id === id) || SEEDS[0];
  const potCount = () => premium() ? 4 : 3;
  const potReady = (pot) => Boolean(pot) && Date.now() >= pot.readyAt;
  function nextBloomAt() {
    let at = 0;
    state.pots.slice(0, potCount()).forEach(pot => {
      if (pot && pot.readyAt > Date.now() && (!at || pot.readyAt < at)) at = pot.readyAt;
    });
    return at;
  }

  /* ---------- Modals ---------- */

  const modals = {};
  let busy = false;
  function makeModal(id) {
    const backdrop = document.createElement("div");
    backdrop.id = id;
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.innerHTML = `<div class="modal meta-modal"></div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop && !busy) closeModal(id); });
    modals[id] = { backdrop, modal: backdrop.firstElementChild, render: null, timer: 0, onClose: null };
    return modals[id];
  }
  function openModal(id, render, onClose) {
    const m = modals[id] || makeModal(id);
    m.render = render;
    m.onClose = onClose || null;
    render(m.modal, false);
    m.backdrop.classList.add("open");
    m.backdrop.setAttribute("aria-hidden", "false");
    window.clearInterval(m.timer);
    m.timer = window.setInterval(() => { if (m.backdrop.classList.contains("open") && !busy) m.render(m.modal, true); }, 1000);
  }
  function closeModal(id) {
    const m = modals[id];
    if (!m) return;
    window.clearInterval(m.timer);
    m.backdrop.classList.remove("open");
    m.backdrop.setAttribute("aria-hidden", "true");
    renderTiles();
    const onClose = m.onClose;
    m.onClose = null;
    if (onClose) onClose();
  }
  function rerender(id) { const m = modals[id]; if (m && m.backdrop.classList.contains("open")) m.render(m.modal, false); }
  const openIds = () => Object.keys(modals).filter(id => modals[id].backdrop.classList.contains("open"));
  const onAct = (root, act, fn) => root.querySelector(`[data-act="${act}"]`)?.addEventListener("click", fn);

  // Android back / iOS swipe-back closes these first.
  const previousSwipeBack = window.__nativeSwipeBack;
  window.__nativeSwipeBack = function () {
    if (levelUpEl && levelUpEl.classList.contains("open")) { levelUpEl.querySelector(".primary-button")?.click(); return true; }
    const open = openIds();
    if (open.length) { if (!busy) closeModal(open[open.length - 1]); return true; }
    return typeof previousSwipeBack === "function" ? previousSwipeBack() : false;
  };

  /* Gift */
  function nextGiftDay() {
    const gap = daysBetween(state.lastGiftDay, dayKey());
    if (gap === 1 && state.giftDay < 7) return state.giftDay + 1;
    return 1;
  }
  function giftAvailable() {
    if (state.lastGiftDay === dayKey()) return false;
    if (state.lastGiftAt && Date.now() < state.lastGiftAt) return false; // clock moved backwards
    return true;
  }
  let giftStatus = "";
  function renderGift(modal, tick) {
    if (tick) return;
    const available = giftAvailable();
    const day = available ? nextGiftDay() : state.giftDay;
    const base = GIFTS[day - 1] || 1;
    const isPremium = premium();
    modal.innerHTML = `
      <div class="celebration" aria-hidden="true">🎁</div>
      <h2>${esc(L("giftTitle"))}</h2>
      <p>${esc(L("giftSubtitle"))}</p>
      <div class="gift-grid">${GIFTS.map((n, i) => {
        const d = i + 1;
        const cls = available ? (d < day ? "done" : d === day ? "today" : "") : (d <= day ? "done" : "");
        return `<div class="gift-cell ${cls} ${d === 7 ? "big" : ""}">${esc(L("giftDay", { n: d }))}<b>${d === 7 ? "🎁" : "🌿"}</b>+${n}</div>`;
      }).join("")}</div>
      <p class="meta-status" role="status">${esc(giftStatus)}</p>
      <div class="modal-actions">
        ${available
          ? `<button class="primary-button" type="button" data-act="double">${esc(isPremium ? L("giftPremiumDouble", { n: base * 2 }) : L("giftDouble", { n: base * 2 }))}</button>
             ${isPremium ? "" : `<button class="ghost-button" type="button" data-act="claim">${esc(L("giftClaim", { n: base }))}</button>`}`
          : `<button class="primary-button" type="button" data-act="close">${esc(L("close"))}</button>`}
      </div>`;
    onAct(modal, "claim", () => { if (!busy) claimGift(1); });
    onAct(modal, "close", () => closeModal("gowGiftBackdrop"));
    onAct(modal, "double", (e) => {
      if (busy) return;
      if (premium()) { claimGift(2); return; }
      busy = true;
      e.currentTarget.disabled = true;
      showRewarded((ok) => {
        busy = false;
        if (ok) claimGift(2);
        else { giftStatus = L("giftAdFail"); rerender("gowGiftBackdrop"); }
      });
    });
  }
  function openGift() {
    if (!giftAvailable()) return;
    giftStatus = "";
    openModal("gowGiftBackdrop", renderGift);
  }
  function claimGift(multiplier) {
    if (!giftAvailable()) { closeModal("gowGiftBackdrop"); return; }
    const day = nextGiftDay();
    const amount = GIFTS[day - 1] * multiplier;
    state.giftDay = day;
    state.lastGiftDay = dayKey();
    state.lastGiftAt = Date.now();
    save();
    addHints(amount);
    giftStatus = L("giftClaimed", { n: amount });
    rerender("gowGiftBackdrop");
    window.setTimeout(() => closeModal("gowGiftBackdrop"), 1100);
  }

  /* Streak */
  function renderStreak(modal, tick) {
    if (tick) return;
    const n = liveStreak();
    const locale = { en: "en-US", de: "de-DE", tr: "tr-TR" }[lang()];
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const played = state.playDays.includes(dayKey(d));
      days.push(`<span class="${played ? "on" : ""} ${i === 0 ? "today" : ""}"><i>${played ? "🔥" : ""}</i>${esc(weekday.format(d))}</span>`);
    }
    const nextMilestone = Object.keys(MILESTONES).map(Number).find(m => m > n);
    modal.innerHTML = `
      <div class="celebration" aria-hidden="true">🔥</div>
      <h2>${esc(L("streakTitle"))}</h2>
      <div class="streak-hero"><b>${n}</b><span><strong>${esc(L("streakDays"))}</strong>${esc(L("streakBest", { n: Math.max(state.best, n) }))}</span></div>
      <div class="streak-week">${days.join("")}</div>
      <p class="milestone-line">${esc(L("streakHint"))}${nextMilestone ? `<br>${esc(L("streakNext", { n: nextMilestone, h: MILESTONES[nextMilestone] }))}` : ""}</p>
      <div class="modal-actions">
        ${giftAvailable() ? `<button class="primary-button" type="button" data-act="gift">${esc(L("openGift"))}</button>` : ""}
        <button class="ghost-button" type="button" data-act="close">${esc(L("close"))}</button>
      </div>`;
    onAct(modal, "close", () => closeModal("gowStreakBackdrop"));
    onAct(modal, "gift", () => { closeModal("gowStreakBackdrop"); openGift(); });
  }

  /* Quests */
  function renderQuests(modal, tick) {
    ensureQuests();
    if (tick) {
      const reset = modal.querySelector(".quest-reset");
      if (reset) reset.textContent = L("questsReset", { t: formatDuration(msUntilMidnight()) });
      return;
    }
    const allClaimed = state.quests.every(q => q.claimed);
    const bonusReady = allClaimed && !state.questBonus;
    modal.innerHTML = `
      <div class="celebration" aria-hidden="true">🎯</div>
      <h2>${esc(L("questsTitle"))}</h2>
      <p>${esc(L("questsSubtitle"))}</p>
      <div class="quest-list">${state.quests.map((q, i) => {
        const goal = questGoal(q);
        const done = questDone(q);
        const ready = done && !q.claimed;
        return `<div class="quest-row ${done ? "is-done" : ""} ${q.claimed ? "is-claimed" : ""}">
          <span class="quest-icon" aria-hidden="true">${questIcon(q.type)}</span>
          <span class="quest-text"><strong>${esc(questText(q))}</strong>
            <span class="quest-bar"><i style="width:${(q.progress / goal) * 100}%"></i></span>
            <span class="quest-meta"><span>${q.progress} / ${goal}</span><span>+${q.reward} 🌸 · +${XP.quest} XP</span></span></span>
          <button class="quest-claim ${ready ? "is-ready" : ""}" type="button" data-quest="${i}" ${ready ? "" : "disabled"}>${esc(q.claimed ? L("claimed") : L("claim"))}</button>
        </div>`;
      }).join("")}</div>
      <div class="quest-bonus">
        <span aria-hidden="true">🎁</span>
        <span class="quest-bonus-text"><strong>${esc(L("bonusTitle"))}</strong><small>${esc(L("bonusReward", { n: QUEST_BONUS_HINTS }))}</small></span>
        <button class="quest-claim ${bonusReady ? "is-ready" : ""}" type="button" data-act="bonus" ${bonusReady ? "" : "disabled"}>${esc(state.questBonus ? L("claimed") : L("bonusClaim"))}</button>
      </div>
      <p class="quest-reset">${esc(L("questsReset", { t: formatDuration(msUntilMidnight()) }))}</p>
      <div class="modal-actions"><button class="primary-button" type="button" data-act="close">${esc(L("close"))}</button></div>`;
    modal.querySelectorAll("[data-quest]").forEach(btn => btn.addEventListener("click", () => {
      const q = state.quests[Number(btn.dataset.quest)];
      if (!q || q.claimed || !questDone(q)) return;
      q.claimed = true;
      save();
      addPetals(q.reward);
      addXp(XP.quest);
      rerender("gowQuestsBackdrop");
    }));
    onAct(modal, "bonus", () => {
      if (state.questBonus || !state.quests.every(q => q.claimed)) return;
      state.questBonus = true;
      save();
      addHints(QUEST_BONUS_HINTS);
      toast("🎁", L("questsTitle"), `+${QUEST_BONUS_HINTS} 💡`, L("bonusTitle"));
      rerender("gowQuestsBackdrop");
    });
    onAct(modal, "close", () => closeModal("gowQuestsBackdrop"));
  }

  /* Greenhouse */
  let ghStatus = "";
  const growPct = (pot, now) => Math.min(100, ((now - pot.plantedAt) / Math.max(1, pot.readyAt - pot.plantedAt)) * 100);
  function renderGreenhouse(modal, tick) {
    const now = Date.now();
    if (tick) {
      // Only refresh timers; a full re-render every second would swallow taps.
      let changed = false;
      modal.querySelectorAll("[data-pot]").forEach(el => {
        const pot = state.pots[Number(el.dataset.pot)];
        if (!pot) return;
        if (potReady(pot) !== el.classList.contains("is-ready")) { changed = true; return; }
        if (potReady(pot)) return;
        el.querySelector(".pot-timer").textContent = formatDuration(pot.readyAt - now);
        el.querySelector(".pot-progress i").style.width = `${growPct(pot, now)}%`;
      });
      if (changed) renderGreenhouse(modal, false);
      return;
    }
    const pots = state.pots.map((pot, i) => {
      if (i >= potCount()) {
        return `<div class="pot is-locked"><span class="pot-lock-badge">${esc(L("premiumPot"))}</span><span class="pot-plant"><span>🔒</span></span><span class="pot-name">${esc(L("emptyPot"))}</span><button class="pot-action" type="button" data-act="premium">✦ ${esc(L("premiumPot"))}</button></div>`;
      }
      if (!pot) return `<div class="pot is-empty"><span class="pot-plant"><span>🌱</span></span><span class="pot-name">${esc(L("emptyPot"))}</span></div>`;
      const seed = seedById(pot.seed);
      const name = esc(L(`seed_${seed.id}`));
      if (potReady(pot)) {
        return `<div class="pot is-ready" data-pot="${i}"><span class="pot-plant"><span>${seed.emoji}</span></span><span class="pot-name">${name}</span><span class="pot-timer">${esc(rewardText(seed.hints, seed.petals))}</span><button class="pot-action is-primary" type="button" data-harvest="${i}">${esc(L("harvest"))}</button></div>`;
      }
      return `<div class="pot is-growing" data-pot="${i}"><span class="pot-plant"><span>🌱</span></span><span class="pot-name">${name}</span><span class="pot-timer">${esc(formatDuration(pot.readyAt - now))}</span><span class="pot-progress"><i style="width:${growPct(pot, now)}%"></i></span>${pot.sped ? "" : `<button class="pot-action" type="button" data-grow="${i}">${esc(premium() ? L("growNowFree") : L("growNow"))}</button>`}</div>`;
    }).join("");
    modal.innerHTML = `
      <div class="celebration" aria-hidden="true">🌻</div>
      <h2>${esc(L("ghTitle"))}</h2>
      <p>${esc(L("ghSubtitle"))}</p>
      <div class="pot-grid">${pots}</div>
      <p class="meta-section-title">${esc(L("seedsTitle"))} · ${state.petals} 🌸</p>
      <div class="seed-list">${SEEDS.map(seed => `
        <div class="seed-row"><span aria-hidden="true">${seed.emoji}</span>
          <span class="seed-text"><strong>${esc(L(`seed_${seed.id}`))}</strong><small>${esc(L("seedInfo", { time: formatDuration(seed.minutes * 60000), reward: rewardText(seed.hints, seed.petals) }))}</small></span>
          <button class="seed-buy ${state.petals >= seed.cost ? "can-afford" : ""}" type="button" data-seed="${seed.id}">${seed.cost} 🌸</button></div>`).join("")}
      </div>
      <div class="exchange-row"><span aria-hidden="true">💡</span>
        <span class="seed-text"><strong>${esc(L("exchangeTitle"))}</strong><small>${esc(L("exchangeDesc", { n: PETALS_PER_HINT }))}</small></span>
        <button class="seed-buy ${state.petals >= PETALS_PER_HINT ? "can-afford" : ""}" type="button" data-act="trade">${esc(L("trade"))}</button></div>
      <p class="meta-status" role="status">${esc(ghStatus)}</p>
      <div class="modal-actions"><button class="primary-button" type="button" data-act="close">${esc(L("close"))}</button></div>`;
    const redraw = () => renderGreenhouse(modal, false);
    onAct(modal, "close", () => closeModal("gowGreenhouseBackdrop"));
    onAct(modal, "premium", () => {
      closeModal("gowGreenhouseBackdrop");
      try { openMarketModal(); } catch (_) {}
    });
    onAct(modal, "trade", () => {
      if (state.petals < PETALS_PER_HINT) { ghStatus = L("notEnough"); redraw(); return; }
      addPetals(-PETALS_PER_HINT);
      addHints(1);
      ghStatus = L("traded");
      redraw();
    });
    modal.querySelectorAll("[data-seed]").forEach(btn => btn.addEventListener("click", () => {
      const seed = seedById(btn.dataset.seed);
      const slot = state.pots.slice(0, potCount()).findIndex(p => !p);
      if (slot < 0) ghStatus = L("potsFull");
      else if (state.petals < seed.cost) ghStatus = L("notEnough");
      else {
        state.pots[slot] = { seed: seed.id, plantedAt: Date.now(), readyAt: Date.now() + seed.minutes * 60000, sped: false };
        addPetals(-seed.cost);
        ghStatus = "";
        tellFlutter();
      }
      redraw();
    }));
    modal.querySelectorAll("[data-harvest]").forEach(btn => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.harvest);
      const pot = state.pots[i];
      if (!potReady(pot)) return;
      const seed = seedById(pot.seed);
      state.pots[i] = null;
      save();
      addHints(seed.hints);
      addPetals(seed.petals);
      ghStatus = L("harvested", { reward: rewardText(seed.hints, seed.petals) });
      tellFlutter();
      redraw();
    }));
    modal.querySelectorAll("[data-grow]").forEach(btn => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.grow);
      const grow = () => {
        const pot = state.pots[i];
        if (!pot) return;
        pot.readyAt = Date.now();
        pot.sped = true;
        save();
        tellFlutter();
        redraw();
      };
      if (premium()) { grow(); return; }
      if (busy) return;
      busy = true;
      btn.disabled = true;
      showRewarded((ok) => {
        busy = false;
        if (ok) grow();
        else { ghStatus = L("bonusHintFail"); redraw(); }
      });
    }));
  }

  /* Level */
  function renderLevel(modal, tick) {
    if (tick) return;
    const info = levelInfo(state.xp);
    modal.innerHTML = `
      <div class="celebration" aria-hidden="true">🌿</div>
      <h2>${esc(L("levelTitle"))}</h2>
      <p>${esc(L("levelIntro"))}</p>
      <div class="streak-hero"><b>${info.level}</b><span><strong>${esc(L("level", { n: info.level }))}</strong>${esc(L("levelNext", { n: info.need - info.into, l: info.level + 1 }))}</span></div>
      <div class="quest-list"><div class="quest-row" style="grid-template-columns:44px minmax(0,1fr)">
        <span class="quest-icon" aria-hidden="true">⭐</span>
        <span class="quest-text"><strong>${esc(L("xpText", { a: info.into, b: info.need }))}</strong>
          <span class="quest-bar"><i style="width:${(info.into / info.need) * 100}%"></i></span></span>
      </div></div>
      <p class="milestone-line" style="white-space:pre-line">${esc(L("levelRewards"))}</p>
      <div class="modal-actions"><button class="primary-button" type="button" data-act="close">${esc(L("close"))}</button></div>`;
    onAct(modal, "close", () => closeModal("gowLevelBackdrop"));
  }

  /* Garden chest */
  let chestChapter = 0;
  let chestJustOpened = false;
  function chapterProgress(index) {
    const last = typeof TOTAL_LEVELS === "number" ? TOTAL_LEVELS : 950;
    const start = index * CHAPTER_BEDS + 1;
    const end = Math.min(last, start + CHAPTER_BEDS - 1);
    let done = 0;
    for (let id = start; id <= end; id += 1) if (isBedCompleted(id)) done += 1;
    return { done, total: end - start + 1 };
  }
  function renderChest(modal, tick) {
    if (tick) return;
    const { done, total } = chapterProgress(chestChapter);
    const claimed = Boolean(state.chests[chestChapter]);
    const ready = done === total && !claimed;
    const name = L("chapters")[chestChapter] || "";
    const nextName = L("chapters")[chestChapter + 1];
    modal.classList.toggle("garden-complete", ready || chestJustOpened);
    if (ready || chestJustOpened) {
      // The big moment: a whole garden bloomed. Tap the chest to burst it open.
      modal.innerHTML = `
        <div class="gc-glow" aria-hidden="true"></div>
        <p class="gc-kicker">${esc(name)}</p>
        <h2 class="gc-title">${esc(L("gardenComplete"))}</h2>
        <div class="gc-stage">
          <span class="gc-rays" aria-hidden="true"></span>
          <button class="gc-chest ${chestJustOpened ? "is-open" : ""}" type="button" data-open="1" aria-label="${esc(L("chestOpen"))}">${chestJustOpened ? CHAPTER_EMOJI[chestChapter] || "🌸" : "🎁"}</button>
        </div>
        <div class="gc-rewards ${chestJustOpened ? "is-shown" : ""}">
          <span class="gc-reward"><b>+${CHEST_HINTS}</b> 💡</span>
          <span class="gc-reward"><b>+${CHEST_PETALS}</b> 🌸</span>
          <span class="gc-reward"><b>+${XP.chest}</b> XP</span>
        </div>
        ${nextName && chestJustOpened ? `<p class="gc-next">${esc(L("nextGarden", { name: nextName }))}</p>` : ""}
        <div class="modal-actions">
          ${chestJustOpened
            ? `<button class="primary-button" type="button" data-act="close">${esc(L("awesome"))}</button>`
            : `<button class="primary-button" type="button" data-open="1">🎁 ${esc(L("chestOpen"))}</button>`}
        </div>`;
      onAct(modal, "close", () => { chestJustOpened = false; closeModal("gowChestBackdrop"); });
      modal.querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => {
        if (state.chests[chestChapter] || chapterProgress(chestChapter).done !== total) return;
        state.chests[chestChapter] = Date.now();
        save();
        modal.querySelector(".gc-chest").classList.add("is-bursting");
        window.setTimeout(() => {
          chestJustOpened = true;
          addHints(CHEST_HINTS);
          addPetals(CHEST_PETALS);
          try { updateChapterBanners(); } catch (_) {}
          renderChest(modal, false);
          confetti(modal.querySelector(".gc-stage"), "gc-confetti", 22);
          try { SoundFX.levelComplete(); } catch (_) {}
          addXp(XP.chest);
        }, 650);
      }));
      return;
    }
    modal.innerHTML = `
      <div class="celebration" aria-hidden="true">${claimed ? "✨" : "🎁"}</div>
      <h2>${esc(L("chestTitle"))}</h2>
      <p><b>${esc(name)}</b><br>${esc(claimed ? L("chestClaimed") : L("chestLocked", { n: total }))}</p>
      <div class="quest-list"><div class="quest-row" style="grid-template-columns:44px minmax(0,1fr)">
        <span class="quest-icon" aria-hidden="true">${CHAPTER_EMOJI[chestChapter] || "🌱"}</span>
        <span class="quest-text"><strong>${esc(L("chestReward", { h: CHEST_HINTS, p: CHEST_PETALS }))}</strong>
          <span class="quest-bar"><i style="width:${(done / total) * 100}%"></i></span>
          <span class="quest-meta"><span>${esc(L("chestProgress", { done, total }))}</span></span></span>
      </div></div>
      <div class="modal-actions"><button class="ghost-button" type="button" data-act="close">${esc(L("close"))}</button></div>`;
    onAct(modal, "close", () => closeModal("gowChestBackdrop"));
  }
  function openChest(index, onClose) {
    if (!Number.isInteger(index) || index < 0) { if (onClose) onClose(); return; }
    chestChapter = index;
    chestJustOpened = false;
    openModal("gowChestBackdrop", renderChest, onClose);
  }

  /* ---------- Home cards ---------- */

  function renderTiles() {
    const streak = liveStreak();
    if ($("tileStreak")) {
      setText("tileStreakLabel", L("streakLabel"));
      setText("tileStreakValue", streak > 0 ? L("streakSub", { n: streak }) : L("streakSubZero"));
      $("tileStreak").classList.toggle("is-hot", streak > 0);
      $("tileStreakBadge").hidden = !giftAvailable();
    }
    if ($("tileQuests")) {
      ensureQuests();
      const claimable = claimableQuests();
      const done = state.quests.filter(questDone).length;
      setText("tileQuestsLabel", L("questsLabel"));
      setText("tileQuestsValue", done === 3 && state.questBonus ? L("questsSubAll") : L("questsSub", { n: done }));
      $("tileQuestsBadge").hidden = claimable === 0;
      $("tileQuestsBadge").textContent = String(claimable);
      $("tileQuests").classList.toggle("is-ready", claimable > 0);
    }
    if ($("tileGreenhouse")) {
      const pots = state.pots.slice(0, potCount());
      const ready = pots.filter(potReady).length;
      const growing = pots.filter(p => p && !potReady(p));
      let value = L("ghSubEmpty");
      if (ready) value = L("ghSubReady");
      else if (growing.length) value = L("ghSubGrowing", { t: formatDuration(Math.min(...growing.map(p => p.readyAt)) - Date.now()) });
      setText("tileGreenhouseLabel", L("greenhouseLabel"));
      setText("tileGreenhouseValue", value);
      $("tileGreenhouseBadge").hidden = ready === 0;
      $("tileGreenhouseBadge").textContent = String(ready);
      $("tileGreenhouse").classList.toggle("is-ready", ready > 0);
    }
    try { setText("cardMapSub", L("mapSub", { n: progress.unlocked })); } catch (_) {}
    setText("cardLeaderboardSub", L("leaderboardSub"));
    setText("cardMarketSub", L("marketSub"));
    setText("cardThemesSub", L("themesSub"));
    setText("cardHelpSub", L("helpSub"));
    setText("signTagline", L("signTagline"));
    setText("musicSubtitle", L("music"));
    try {
      const badges = Object.keys(progress.achievements || {}).length;
      setText("achievementsHomeBadge", L("achievementsSub", { n: `${badges}/${ACHIEVEMENTS.length}` }));
    } catch (_) {}
    renderHud();
  }

  function openGreenhouse() {
    ghStatus = "";
    openModal("gowGreenhouseBackdrop", renderGreenhouse);
  }
  function bindHome() {
    $("tileStreak")?.addEventListener("click", () => openModal("gowStreakBackdrop", renderStreak));
    $("tileQuests")?.addEventListener("click", () => openModal("gowQuestsBackdrop", renderQuests));
    $("tileGreenhouse")?.addEventListener("click", openGreenhouse);
    $("hudPetals")?.addEventListener("click", openGreenhouse);
    $("hudHints")?.addEventListener("click", () => { try { openMarketModal(); } catch (_) {} });
    $("playerPill")?.addEventListener("click", (e) => {
      if (e.target.closest(".player-pill-edit")) return;
      openModal("gowLevelBackdrop", renderLevel);
    });
  }

  function tellFlutter(extra) {
    try {
      window.FlutterRetention?.postMessage(JSON.stringify(Object.assign({
        type: "state",
        streak: liveStreak(),
        playedToday: state.lastPlayDay === dayKey(),
        lang: lang(),
        bloomAt: nextBloomAt()
      }, extra || {})));
    } catch (_) {}
  }

  // Show the gift once the home screen is idle (never on top of another modal, e.g. the first-run nickname).
  let giftScheduled = false;
  function scheduleGift(attempt) {
    if (!giftAvailable() || giftScheduled) return;
    giftScheduled = true;
    window.setTimeout(() => {
      giftScheduled = false;
      const isBusy = document.querySelector(".modal-backdrop.open") || celebrating;
      const onHome = typeof shownScreenId === "undefined" || shownScreenId === "homeScreen";
      if (isBusy || !onHome) { if ((attempt || 0) < 60) scheduleGift((attempt || 0) + 1); return; }
      openGift();
    }, attempt ? 2000 : 900);
  }

  /* ---------- Game events ---------- */

  let bedWordPetals = 0;
  let bedWordXp = 0;
  function onWordFound(info) {
    bedWordPetals += 1;
    bedWordXp += XP.word;
    addPetals(1);
    addXp(XP.word); // level-ups found mid-bed wait in the queue until the bed is done
    bumpQuest("words", 1);
    if (info && info.combo >= questTarget("combo")) bumpQuest("combo", 1);
  }
  function onHintUsed() {}

  function onBedComplete(info) {
    info = info || {};
    const today = dayKey();
    const gap = daysBetween(state.lastPlayDay, today);
    let streakLine = "";
    if (state.lastPlayDay !== today) {
      const saved = gap === 2 && premium() && state.streak > 0;
      state.streak = (gap === 1 || saved) ? state.streak + 1 : 1;
      state.best = Math.max(state.best, state.streak);
      state.lastPlayDay = today;
      streakLine = saved ? L("streakSaved", { n: state.streak }) : L("streakToday", { n: state.streak });
      const bonus = MILESTONES[state.streak];
      if (bonus && !state.milestones[state.streak]) {
        state.milestones[state.streak] = Date.now();
        addHints(bonus);
        window.setTimeout(() => toast("🔥", L("milestoneTitle", { n: state.streak }), `+${bonus} 💡`, L("milestoneDesc", { h: bonus })), 1600);
      }
    }
    if (!state.playDays.includes(today)) state.playDays = state.playDays.concat(today).slice(-30);
    if (info.wasNewCompletion) state.beds += 1;
    save();

    const finished = [];
    const track = (q) => { if (q) finished.push(q); };
    track(bumpQuest("beds", 1));
    if (info.wasNewCompletion) track(bumpQuest("newBed", 1));
    if (info.hintsUsed === 0) track(bumpQuest("noHint", 1));
    if (info.stars === 3) track(bumpQuest("threeStar", 1));
    if (Number.isFinite(info.seconds) && info.seconds < questTarget("fast")) track(bumpQuest("fast", 1));

    // Garden growth: a flower opens every 5 new beds, the chest when all 50 are done.
    let flowerBloomed = false;
    let gardenDone = -1;
    if (info.wasNewCompletion && Number.isInteger(info.levelId)) {
      const chapter = Math.floor((info.levelId - 1) / CHAPTER_BEDS);
      const { done, total } = chapterProgress(chapter);
      if (done === total && !state.chests[chapter]) gardenDone = chapter;
      else if (done % 5 === 0) flowerBloomed = true;
    }

    const bedPetals = (info.stars || 1) * 2 + (info.wasNewCompletion ? 3 : 0) + (flowerBloomed ? FLOWER_PETALS : 0);
    addPetals(bedPetals);
    const bedXp = XP.bed + (info.stars || 1) * XP.star + (info.wasNewCompletion ? XP.newBed : 0);
    addXp(bedXp);
    const earnedPetals = bedPetals + bedWordPetals;
    const earnedXp = bedXp + bedWordXp;
    bedWordPetals = 0;
    bedWordXp = 0;

    const panel = $("completeRewards");
    if (panel) {
      const info2 = levelInfo(state.xp);
      const rows = [];
      if (streakLine) rows.push(`<div class="reward-row streak"><span class="reward-icon">🔥</span><span class="reward-text">${esc(streakLine)}</span></div>`);
      rows.push(`<div class="reward-row xp"><span class="reward-icon">⭐</span><span class="reward-text">${esc(L("level", { n: info2.level }))}<span class="reward-bar"><i style="width:${(info2.into / info2.need) * 100}%"></i></span></span><b>+${earnedXp} XP</b></div>`);
      if (flowerBloomed) rows.push(`<div class="reward-row flower"><span class="reward-icon">🌷</span><span class="reward-text">${esc(L("flowerBloomed"))}</span><b>+${FLOWER_PETALS} 🌸</b></div>`);
      rows.push(`<div class="reward-row petals"><span class="reward-icon">🌸</span><span class="reward-text">${esc(L("rewardPetals"))}</span><b>+${earnedPetals}</b></div>`);
      finished.forEach(q => rows.push(`<div class="reward-row"><span class="reward-icon">${questIcon(q.type)}</span><span class="reward-text">${esc(L("rewardQuest", { q: questText(q) }))}</span><b>+${q.reward} 🌸</b></div>`));
      panel.innerHTML = rows.join("");
      if (!premium()) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ghost-button bonus-hint-button";
        btn.textContent = L("bonusHint");
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          btn.disabled = true;
          showRewarded((ok) => {
            if (ok) { addHints(1); btn.textContent = L("bonusHintDone"); }
            else { btn.textContent = L("bonusHintFail"); btn.disabled = false; }
          });
        });
        panel.appendChild(btn);
      }
    }
    if (gardenDone >= 0) queueCelebration((done) => openChest(gardenDone, done));
    // Let the bed card land first, then level-ups and the garden chest take over.
    window.setTimeout(playCelebrations, 1300);
    renderTiles();
    const askReview = !state.reviewAsked && state.beds >= REVIEW_AFTER_BEDS;
    if (askReview) { state.reviewAsked = true; save(); }
    tellFlutter(askReview ? { review: true } : null);
  }

  function onHome() {
    renderTiles();
    playCelebrations();
    scheduleGift(0);
  }
  function onLanguage() {
    renderTiles();
    openIds().forEach(rerender);
  }

  window.Meta = {
    onBedComplete, onWordFound, onHintUsed, onHome, onLanguage, openGift, openChest,
    chestClaimed: (index) => Boolean(state.chests[index]),
    chapterInfo: (index) => ({ name: L("chapters")[index] || null, emoji: CHAPTER_EMOJI[index] || "🌱" }),
    level: () => levelInfo(state.xp),
    flushCelebrations: playCelebrations,
    state: () => Object.assign({}, state, { live: liveStreak() })
  };

  bindHome();
  // The main script rendered home before this file ran; redraw the parts that come from here.
  try { updateHome(); } catch (_) { onHome(); }
  window.setInterval(() => { if (typeof shownScreenId === "undefined" || shownScreenId === "homeScreen") renderTiles(); }, 30000);
  tellFlutter();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onHome();
    else tellFlutter();
  });
})();
