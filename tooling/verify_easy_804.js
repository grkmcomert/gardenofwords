const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("assets/game/index.html", "utf8");
const context = {};
context.window = context;
vm.runInNewContext(fs.readFileSync("assets/game/fixed-word-lists.js", "utf8"), context);
const fixed = context.window.GARDEN_OF_WORDS_FIXED_WORDS;
const levelPattern = /^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm;
const levels = [...html.matchAll(levelPattern)].map(match => ({
  id: Number(match[1]),
  tone: match[3],
  size: Number(match[4])
}));
const easyLevels = levels.filter(level => level.tone === "easy");
const config = {
  tr: { alphabet: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ" },
  en: { alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  de: { alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ" }
};
const unsafe = {
  tr: ["AMK", "APTAL", "BOK", "GÖT", "KAHPE", "OROSPU", "PİÇ", "POK", "SALAK", "SİK", "SİKTİR", "ŞEREFSİZ", "YARRAK"],
  en: ["ASS", "ASSHOLE", "BASTARD", "BITCH", "COCK", "CUNT", "DAMN", "DICK", "DILDO", "FUCK", "IDIOT", "JERK", "NIGGER", "PISS", "PORN", "PUSSY", "SEXUAL", "SHIT", "SLUT", "TWAT", "WANK", "WHORE"],
  de: ["ARSCH", "BASTARD", "DUMM", "FICK", "FICKEN", "HURE", "HURENSOHN", "IDIOT", "NIGGER", "SCHLAMPE", "SCHEISSE", "WICHSER"]
};
const errors = [];
const report = { easyLevels: easyLevels.length, wordsPerLevel: 4, languages: {} };

for (const [language, languageConfig] of Object.entries(config)) {
  const allWords = [];
  for (const level of easyLevels) {
    const list = fixed[language]?.[level.id - 1];
    if (!Array.isArray(list) || list.length !== 4) {
      errors.push(`${language} level ${level.id}: expected 4 words`);
      continue;
    }
    const seen = new Set();
    for (const word of list) {
      const valid = word.length >= 3
        && word.length <= 8
        && [...word].every(letter => languageConfig.alphabet.includes(letter))
        && !unsafe[language].some(prefix => word.startsWith(prefix));
      if (!valid) errors.push(`${language} level ${level.id}: invalid ${word}`);
      if (seen.has(word)) errors.push(`${language} level ${level.id}: duplicate ${word}`);
      seen.add(word);
      allWords.push(word);
    }
  }
  report.languages[language] = {
    levels: easyLevels.length,
    words: allWords.length,
    uniqueWithinLanguage: new Set(allWords).size
  };
}

report.errors = errors;
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
