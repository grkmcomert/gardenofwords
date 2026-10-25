/* Garden of Words: retention loop.
 * - Day streak: grows once per day when at least one bed is completed.
 * - 7-day gift calendar: a daily hint gift on the home screen, doubled by a rewarded ad
 *   (Premium gets the double automatically). Missing a day restarts the calendar.
 * - Streak milestones (3/7/14/30 days) award bonus hints; Premium keeps the streak through one missed day.
 * - After a bed: optional rewarded ad for +1 hint, plus a streak line in the completion modal.
 * - Tells Flutter the streak so it can schedule local reminders and ask for an App Store review.
 *
 * Shares the main game script's globals (progress, saveProgress, syncHintBalance, updateHintUI,
 * AdMobBridge, isPremiumUser, currentLanguage, achievementToastLayer). Kept in its own storage key
 * so the cloud-synced progress object is never reshaped.
 */
(function () {
  "use strict";

  const KEY = "kelimeler-bahcesi-retention-v1";
  const GIFTS = [1, 1, 2, 1, 2, 2, 4];
  const MILESTONES = { 3: 1, 7: 2, 14: 3, 30: 5, 60: 5, 100: 10 };
  const REVIEW_AFTER_BEDS = 5;

  const COPY = {
    en: {
      streakChip: "{n}-day streak", streakChipZero: "Start a streak today",
      streakToday: "🔥 {n}-day streak! See you tomorrow.", streakSaved: "🔥 Premium kept your streak alive: {n} days!",
      giftTitle: "Daily Garden Gift", giftSubtitle: "Come back every day: the 7th day holds the biggest gift.",
      giftDay: "Day {n}", giftClaim: "Claim +{n} hints", giftDouble: "Watch a video, get +{n}",
      giftPremiumDouble: "Premium doubles it: +{n}", giftClaimed: "+{n} hints added to your basket 🌿",
      giftAdFail: "No video right now. Your gift is still waiting.", later: "Later",
      milestoneTitle: "{n}-day streak!", milestoneDesc: "Bonus: +{h} hints",
      bonusHint: "Watch a video, +1 hint", bonusHintDone: "+1 hint 🌿", bonusHintFail: "No video right now",
      giftLabel: "Gift"
    },
    de: {
      streakChip: "{n}-Tage-Serie", streakChipZero: "Starte heute eine Serie",
      streakToday: "🔥 {n}-Tage-Serie! Bis morgen.", streakSaved: "🔥 Premium hat deine Serie gerettet: {n} Tage!",
      giftTitle: "Tägliches Gartengeschenk", giftSubtitle: "Komm jeden Tag wieder: Am 7. Tag wartet das größte Geschenk.",
      giftDay: "Tag {n}", giftClaim: "+{n} Tipps abholen", giftDouble: "Video ansehen, +{n} erhalten",
      giftPremiumDouble: "Premium verdoppelt: +{n}", giftClaimed: "+{n} Tipps in deinem Korb 🌿",
      giftAdFail: "Gerade kein Video. Dein Geschenk wartet weiter.", later: "Später",
      milestoneTitle: "{n}-Tage-Serie!", milestoneDesc: "Bonus: +{h} Tipps",
      bonusHint: "Video ansehen, +1 Tipp", bonusHintDone: "+1 Tipp 🌿", bonusHintFail: "Gerade kein Video",
      giftLabel: "Geschenk"
    },
    tr: {
      streakChip: "{n} günlük seri", streakChipZero: "Bugün bir seri başlat",
      streakToday: "🔥 {n} günlük seri! Yarın görüşürüz.", streakSaved: "🔥 Premium serini korudu: {n} gün!",
      giftTitle: "Günlük Bahçe Hediyesi", giftSubtitle: "Her gün uğra: en büyük hediye 7. günde seni bekliyor.",
      giftDay: "{n}. gün", giftClaim: "+{n} ipucu al", giftDouble: "Video izle, +{n} al",
      giftPremiumDouble: "Premium ikiye katlar: +{n}", giftClaimed: "+{n} ipucu sepetine eklendi 🌿",
      giftAdFail: "Şu an video yok. Hediyen seni bekliyor.", later: "Sonra",
      milestoneTitle: "{n} günlük seri!", milestoneDesc: "Bonus: +{h} ipucu",
      bonusHint: "Video izle, +1 ipucu", bonusHintDone: "+1 ipucu 🌿", bonusHintFail: "Şu an video yok",
      giftLabel: "Hediye"
    }
  };

  function tr(key, vars) {
    const lang = (typeof currentLanguage === "string" && COPY[currentLanguage]) ? currentLanguage : "en";
    let s = COPY[lang][key] || COPY.en[key] || key;
    Object.keys(vars || {}).forEach(k => { s = s.replace("{" + k + "}", String(vars[k])); });
    return s;
  }

  const dayKey = (d) => new Intl.DateTimeFormat("en-CA").format(d || new Date());
  function daysBetween(a, b) {
    if (!a || !b) return Infinity;
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object") return Object.assign(defaults(), s);
    } catch (_) {}
    return defaults();
  }
  function defaults() {
    return { streak: 0, best: 0, lastPlayDay: "", giftDay: 0, lastGiftDay: "", lastGiftAt: 0, milestones: {}, beds: 0, reviewAsked: false };
  }
  let state = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} };

  const premium = () => {
    try { return Boolean((typeof isPremiumUser === "function" && isPremiumUser()) || progress.adsBypassEnabled); } catch (_) { return false; }
  };

  /** Streak as it should be shown today (expired streaks read as 0). */
  function liveStreak() {
    const gap = daysBetween(state.lastPlayDay, dayKey());
    if (gap <= 1) return state.streak;
    if (gap === 2 && premium()) return state.streak; // Premium: one missed day is forgiven
    return 0;
  }

  function addHints(n) {
    try {
      progress.hints = (progress.hints || 0) + n;
      saveProgress();
      syncHintBalance();
      updateHintUI();
    } catch (error) { console.warn("Retention hint grant failed:", error); }
  }

  function toast(icon, label, title, desc) {
    const layer = typeof achievementToastLayer !== "undefined" ? achievementToastLayer : null;
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "hint-reward-toast";
    el.innerHTML = `<div class="hint-reward-toast-icon">${icon}</div><div class="hint-reward-toast-text">
      <span class="hint-reward-toast-label"></span><strong class="hint-reward-toast-title"></strong>
      <span class="hint-reward-toast-desc"></span></div>`;
    el.querySelector(".hint-reward-toast-label").textContent = label;
    el.querySelector(".hint-reward-toast-title").textContent = title;
    el.querySelector(".hint-reward-toast-desc").textContent = desc;
    layer.appendChild(el);
    window.setTimeout(() => el.remove(), 3200);
  }

  function tellFlutter(extra) {
    try {
      window.FlutterRetention?.postMessage(JSON.stringify(Object.assign({
        type: "state",
        streak: liveStreak(),
        playedToday: state.lastPlayDay === dayKey(),
        lang: typeof currentLanguage === "string" ? currentLanguage : "en"
      }, extra || {})));
    } catch (_) {}
  }

  /* ---------- Styles (match the cream journal cards and modals) ---------- */
  const style = document.createElement("style");
  style.textContent = `
    .gow-streak-chip { display:inline-flex; align-items:center; gap:6px; margin:6px auto 0; padding:6px 13px; border-radius:999px;
      background:rgba(255,248,232,.92); color:#5A3412; font-weight:800; font-size:13px; letter-spacing:.01em;
      border:1px solid rgba(214,146,58,.45); box-shadow:0 6px 16px rgba(63,46,20,.16); cursor:pointer; }
    .gow-streak-chip.cold { color:#6B5A49; border-color:rgba(43,59,40,.16); }
    .gow-streak-chip .gow-gift-dot { margin-left:4px; padding:1px 8px; border-radius:999px; background:linear-gradient(90deg,#E3A33E,#D9766B); color:#2B1A08; font-size:11px; }
    .gow-gift-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:14px 0 6px; }
    .gow-gift-cell { position:relative; padding:9px 4px 8px; border-radius:16px; text-align:center; background:rgba(255,255,255,.55);
      border:1.5px solid rgba(43,59,40,.12); color:var(--ink-soft, #5d5a4c); font-size:12px; font-weight:700; }
    .gow-gift-cell b { display:block; font-size:20px; margin:2px 0; }
    .gow-gift-cell.done { opacity:.55; }
    .gow-gift-cell.done::after { content:"✓"; position:absolute; top:4px; right:8px; color:#3F7A3B; font-weight:900; }
    .gow-gift-cell.today { background:linear-gradient(160deg,#FFF3D6,#FBE2C4); border-color:#E3A33E; color:#5A3412; transform:scale(1.05);
      box-shadow:0 8px 18px rgba(214,146,58,.28); }
    .gow-gift-cell.big { grid-column:span 2; }
    .gow-gift-status { min-height:20px; margin:6px 0 0; font-size:13px; color:var(--ink-soft, #5d5a4c); }
    .gow-streak-line { display:block; margin-top:8px; font-weight:800; color:#B5571C; }
    .gow-bonus-hint { margin-top:10px; width:100%; }
  `;
  document.head.appendChild(style);

  /* ---------- Daily gift modal ---------- */
  const backdrop = document.createElement("div");
  backdrop.id = "gowGiftBackdrop";
  backdrop.className = "modal-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.innerHTML = `<div class="modal">
      <div class="celebration" aria-hidden="true"><span style="font-size:30px;line-height:1">🎁</span></div>
      <h2 id="gowGiftTitle"></h2>
      <p id="gowGiftSubtitle"></p>
      <div id="gowGiftGrid" class="gow-gift-grid"></div>
      <p id="gowGiftStatus" class="gow-gift-status" role="status"></p>
      <div class="modal-actions" style="flex-direction:column;gap:8px">
        <button id="gowGiftDouble" class="primary-button" type="button"></button>
        <button id="gowGiftClaim" class="ghost-button" type="button"></button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const $ = (id) => document.getElementById(id);

  /** Calendar day (1-7) the next claim lands on; restarts after a missed day. */
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

  let giftBusy = false;
  function openGift() {
    if (!giftAvailable()) return;
    const day = nextGiftDay();
    const base = GIFTS[day - 1];
    $("gowGiftTitle").textContent = tr("giftTitle");
    $("gowGiftSubtitle").textContent = tr("giftSubtitle");
    $("gowGiftStatus").textContent = "";
    $("gowGiftGrid").innerHTML = GIFTS.map((n, i) => {
      const d = i + 1;
      const cls = d < day ? "done" : (d === day ? "today" : "");
      return `<div class="gow-gift-cell ${cls} ${d === 7 ? "big" : ""}">${tr("giftDay", { n: d })}<b>${d === 7 ? "🎁" : "🌿"}</b>+${n}</div>`;
    }).join("");
    const isPremium = premium();
    $("gowGiftDouble").textContent = isPremium ? tr("giftPremiumDouble", { n: base * 2 }) : tr("giftDouble", { n: base * 2 });
    $("gowGiftClaim").textContent = isPremium ? tr("later") : tr("giftClaim", { n: base });
    $("gowGiftClaim").hidden = isPremium;
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
  }
  function closeGift() {
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
    updateChip();
  }
  function claimGift(multiplier) {
    if (!giftAvailable()) { closeGift(); return; }
    const day = nextGiftDay();
    const amount = GIFTS[day - 1] * multiplier;
    state.giftDay = day;
    state.lastGiftDay = dayKey();
    state.lastGiftAt = Date.now();
    save();
    addHints(amount);
    $("gowGiftStatus").textContent = tr("giftClaimed", { n: amount });
    window.setTimeout(closeGift, 900);
  }
  $("gowGiftClaim").addEventListener("click", () => { if (!giftBusy) claimGift(1); });
  $("gowGiftDouble").addEventListener("click", () => {
    if (giftBusy) return;
    if (premium()) { claimGift(2); return; }
    giftBusy = true;
    $("gowGiftDouble").disabled = true;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      giftBusy = false;
      $("gowGiftDouble").disabled = false;
      if (ok) claimGift(2); else $("gowGiftStatus").textContent = tr("giftAdFail");
    };
    const timeout = window.setTimeout(() => done(false), 60000);
    try {
      AdMobBridge.showRewarded(() => { window.clearTimeout(timeout); done(true); }, () => { window.clearTimeout(timeout); done(false); });
    } catch (_) { window.clearTimeout(timeout); done(false); }
  });
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop && !giftBusy) closeGift(); });

  // Android back / iOS swipe-back closes the gift before anything else.
  const previousSwipeBack = window.__nativeSwipeBack;
  window.__nativeSwipeBack = function () {
    if (backdrop.classList.contains("open")) { if (!giftBusy) closeGift(); return true; }
    return typeof previousSwipeBack === "function" ? previousSwipeBack() : false;
  };

  /* ---------- Home streak chip ---------- */
  let chip = null;
  function updateChip() {
    const pill = document.getElementById("playerPill");
    if (!pill) return;
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button";
      chip.className = "gow-streak-chip";
      chip.addEventListener("click", () => { if (giftAvailable()) openGift(); });
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;justify-content:center;width:100%";
      wrap.appendChild(chip);
      pill.insertAdjacentElement("afterend", wrap);
    }
    const n = liveStreak();
    chip.classList.toggle("cold", n === 0);
    chip.innerHTML = "";
    chip.append(n > 0 ? `🔥 ${tr("streakChip", { n })}` : `🌱 ${tr("streakChipZero")}`);
    if (giftAvailable()) {
      const dot = document.createElement("span");
      dot.className = "gow-gift-dot";
      dot.textContent = `🎁 ${tr("giftLabel")}`;
      chip.appendChild(dot);
    }
  }

  // Show the gift once the home screen is idle (never on top of another modal, e.g. the first-run nickname).
  let giftScheduled = false;
  function scheduleGift(attempt) {
    if (!giftAvailable() || giftScheduled) return;
    giftScheduled = true;
    window.setTimeout(() => {
      giftScheduled = false;
      const busy = document.querySelector(".modal-backdrop.open");
      const onHome = typeof shownScreenId === "undefined" || shownScreenId === "homeScreen";
      if (busy || !onHome) { if ((attempt || 0) < 60) scheduleGift((attempt || 0) + 1); return; }
      openGift();
    }, attempt ? 2000 : 900);
  }

  /* ---------- Bed completion ---------- */
  function onBedComplete(info) {
    const today = dayKey();
    const gap = daysBetween(state.lastPlayDay, today);
    let line = "";
    if (state.lastPlayDay !== today) {
      const saved = gap === 2 && premium() && state.streak > 0;
      state.streak = (gap === 1 || saved) ? state.streak + 1 : 1;
      state.best = Math.max(state.best, state.streak);
      state.lastPlayDay = today;
      line = saved ? tr("streakSaved", { n: state.streak }) : tr("streakToday", { n: state.streak });
      const bonus = MILESTONES[state.streak];
      if (bonus && !state.milestones[state.streak]) {
        state.milestones[state.streak] = Date.now();
        addHints(bonus);
        window.setTimeout(() => toast("🔥", tr("milestoneTitle", { n: state.streak }), `+${bonus}`, tr("milestoneDesc", { h: bonus })), 1600);
      }
    }
    if (info && info.wasNewCompletion) state.beds += 1;
    save();

    const text = document.getElementById("modalText");
    if (text && line) {
      const span = document.createElement("span");
      span.className = "gow-streak-line";
      span.textContent = line;
      text.appendChild(span);
    }
    attachBonusHintButton();
    updateChip();
    const askReview = !state.reviewAsked && state.beds >= REVIEW_AFTER_BEDS;
    if (askReview) { state.reviewAsked = true; save(); }
    tellFlutter(askReview ? { review: true } : null);
  }

  // Optional rewarded ad on the completion card: +1 hint (free players only).
  function attachBonusHintButton() {
    const modal = document.querySelector("#modalBackdrop .modal");
    if (!modal) return;
    let btn = document.getElementById("gowBonusHint");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "gowBonusHint";
      btn.type = "button";
      btn.className = "ghost-button gow-bonus-hint";
      modal.appendChild(btn);
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btn.disabled = true;
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          if (ok) { addHints(1); btn.textContent = tr("bonusHintDone"); }
          else { btn.textContent = tr("bonusHintFail"); btn.disabled = false; }
        };
        const timeout = window.setTimeout(() => done(false), 60000);
        try {
          AdMobBridge.showRewarded(() => { window.clearTimeout(timeout); done(true); }, () => { window.clearTimeout(timeout); done(false); });
        } catch (_) { window.clearTimeout(timeout); done(false); }
      });
    }
    btn.hidden = premium();
    btn.disabled = false;
    btn.innerHTML = "";
    btn.append(`🎬 ${tr("bonusHint")}`);
  }

  function onHome() {
    updateChip();
    scheduleGift(0);
  }

  window.Retention = { onBedComplete, onHome, openGift, state: () => Object.assign({}, state, { live: liveStreak() }) };

  // The main script already rendered home before this file ran.
  onHome();
  tellFlutter();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onHome();
    else tellFlutter();
  });
})();
