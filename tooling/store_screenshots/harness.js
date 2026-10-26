/* Screenshot harness for the game page (loaded after meta.js by make.sh).
   First load seeds a demo save from the query and reloads. Then it opens the
   requested view synchronously, because headless Chrome captures before
   timers or animation frames run: home, levels, game, gamedone, quests,
   greenhouse, streak, market, settings, nick. Animations jump to their end. */
(function () {
  const p = new URLSearchParams(location.search);
  const dayKey = (ms) => new Intl.DateTimeFormat("en-CA").format(new Date(ms));
  if (!localStorage.getItem("gow-seeded")) {
    localStorage.clear();
    localStorage.setItem("gow-seeded", "1");
    localStorage.setItem("kelimeler-bahcesi-nickname-v1", p.get("name") || "Lily");
    localStorage.setItem("kelimeler-bahcesi-avatar-v1", "🌻");
    if (p.get("lang")) localStorage.setItem("kelimeler-bahcesi-language-v1", p.get("lang"));
    const done = {}, best = {};
    const n = Number(p.get("done") || 23);
    for (let i = 1; i <= n; i += 1) { done[i] = Date.now(); best[i] = 20 + (i % 5) * 15; }
    localStorage.setItem("kelimeler-bahcesi-progress-v1", JSON.stringify({
      unlocked: n + 1, lastSelected: n + 1, completed: n, completedBeds: done, bestTimes: best, hints: Number(p.get("hints") || 7)
    }));
    localStorage.setItem("kelimeler-bahcesi-retention-v1", JSON.stringify({
      streak: Number(p.get("streak") || 4), best: 6, lastPlayDay: dayKey(Date.now() - 864e5), lastGiftDay: dayKey(Date.now()), giftDay: 3,
      perlGreetDay: p.get("greet") ? "" : dayKey(Date.now()), perlBravo: 1, reviewAsked: true, beds: n,
      petals: Number(p.get("petals") || 132), petalsEarned: 310, playDays: [],
      xp: Number(p.get("xp") || 0), xpVersion: p.get("xp") ? 1 : 0,
      pots: [{ seed: "tulip", plantedAt: Date.now() - 3e6, readyAt: Date.now() + 4e6 }, { seed: "daisy", plantedAt: Date.now() - 2e6, readyAt: Date.now() - 1 }, null, null]
    }));
    location.reload();
    return;
  }

  const still = document.createElement("style");
  still.textContent = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}";
  document.head.appendChild(still);
  const view = p.get("view") || "home";
  try {
    document.querySelectorAll(".modal-backdrop.open").forEach(b => b.classList.remove("open"));
    if (view === "levels") {
      openLevels();
      refreshLevelCards();
      scrollMapToCurrent();
    }
    if (view === "game" || view === "gamedone") {
      const level = levelById(Number(p.get("bed") || 24));
      const generated = generatePuzzleFast(level, currentLanguage);
      const found = view === "gamedone" ? generated.words.length - 1 : Number(p.get("found") || 3);
      progress.currentGame = {
        levelId: level.id, version: PUZZLE_FORMAT_VERSION, language: currentLanguage, puzzle: generated,
        secondsElapsed: Number(p.get("seconds") || 47), hintsUsed: 0, foundWords: generated.words.slice(0, found)
      };
      restoreSavedGameState();
      fitGameScreen();
      if (p.get("nudge")) window.Meta.showPerlNudge();
      if (view === "gamedone") {
        const last = puzzle.placements.find(pl => !foundWords.has(pl.word));
        currentSelection = Array.from({ length: last.word.length }, (_, i) => ({ row: last.row + last.dr * i, col: last.col + last.dc * i }));
        completeSelection();
        finishLevel();
        window.Meta.flushCelebrations();
        const badge = document.querySelector(".levelup-badge b");
        if (badge) badge.textContent = String(window.Meta.level().level);
      }
    }
    if (view === "leaderboard") {
      // Demo rows for the global XP board (the real one needs Firebase).
      const me = sanitizeNickname(getNickname());
      const rows = (p.get("rows") || "Mia:🌷:4820:14:21,Jonas:🦔:4365:13:9,ME:🌻:3910:12:6,Elif:🦋:3540:12:15,Noah:🍄:3105:11:4,Zeynep:🌸:2760:10:12,Emma:🐝:2410:9:3,Kerem:🌵:2075:9:7")
        .split(",").map(r => r.split(":")).map(([name, avatar, xp, level, streak]) => ({
          id: name, uid: name, name: name === "ME" ? me : name, avatar, xp: Number(xp), level: Number(level), streak: Number(streak), isYou: name === "ME"
        }));
      Leaderboard.getXpTop = async () => ({ remote: true, entries: rows, me: null });
      openLeaderboardModal();
    }
    if (view === "themes") document.getElementById("homeThemesButton").click();
    if (p.get("clean")) {
      document.querySelectorAll(".levelup, .perl-cheer, .perl-peek").forEach(el => el.remove());
      still.textContent += ".levelup,.perl-cheer,.perl-peek{display:none!important}";
    }
    if (view === "quests") document.getElementById("tileQuests").click();
    if (view === "greenhouse") document.getElementById("tileGreenhouse").click();
    if (view === "streak") document.getElementById("tileStreak").click();
    if (view === "market") openMarketModal();
    if (view === "settings") openSettingsModal();
    if (view === "nick") openNicknameModal();
    if (view === "nudge") window.Meta.showPerlNudge();
    if (view === "streak0") document.getElementById("tileStreak").click();
    if (view === "nohint") openHintMoreModal();
    if (shownScreenId === "homeScreen") { window.Meta.wakePerl(); if (p.get("greet")) window.Meta.onHome(); if (p.get("say")) document.getElementById("homePerl").click(); fitHomeScreen(); }
  } catch (e) {
    document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;top:0;left:0;z-index:99;background:#fff;color:red;font-size:10px">${e.stack || e}</pre>`);
  }
})();
