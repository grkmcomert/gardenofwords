"use strict";

const fs = require("fs");
const vm = require("vm");

const indexHtml = fs.readFileSync("assets/game/index.html", "utf8");
const fixedContext = {};
vm.runInNewContext(fs.readFileSync("assets/game/fixed-word-lists.js", "utf8"), fixedContext);
const fixed = fixedContext.GARDEN_OF_WORDS_FIXED_WORDS;
const levelPattern = /^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words: sanitizeLevelWords\(\[(.*?)\]\) \},$/gm;
const levels = [...indexHtml.matchAll(levelPattern)].map(match => ({
  id: Number(match[1]),
  tone: match[3],
  size: Number(match[4]),
  count: (match[5].match(/"[^"]+"/g) || []).length
}));
const ranges = { easy: [3, 8], medium: [4, 8], hard: [5, 9], extreme: [6, 10] };
const alphabets = {
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  de: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ",
  tr: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"
};
const locales = { en: "en-US", de: "de-DE", tr: "tr-TR" };
const unsafe = {
  en: ["ASS", "ASSHOLE", "BASTARD", "BITCH", "CUNT", "DAMN", "DICK", "FUCK", "IDIOT", "JERK", "PISS", "SHIT", "SLUT", "TWAT", "WANK", "WHORE"],
  de: ["ARSCH", "BASTARD", "DUMM", "FICK", "HURE", "IDIOT", "SCHLAMPE", "SCHEISSE", "WICHSER"],
  tr: ["AMK", "APTAL", "BOK", "GÖT", "KAHPE", "OROSPU", "PİÇ", "POK", "SALAK", "SİK", "SİKTİR", "ŞEREFSİZ", "YARRAK"]
};
const safeWordExceptions = {
  en: new Set(["ASSENTOR", "ASSESS", "ASSET"]),
  de: new Set(),
  tr: new Set(["BOKSİT", "BOKSER"])
};

if (levels.length !== 950) throw new Error(`Expected 950 levels, found ${levels.length}`);
const report = { levels: levels.length, languages: {} };
for (const language of ["en", "de", "tr"]) {
  const data = fixed?.[language];
  if (!Array.isArray(data) || data.length !== levels.length) throw new Error(`${language}: invalid level bank`);
  const allSeen = new Set();
  let words = 0;
  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const list = data[index];
    const [minimum, maximum] = ranges[level.tone];
    const effectiveSize = Math.min(level.size + 2, 13);
    const seen = new Set();
    if (!Array.isArray(list) || list.length !== level.count) {
      throw new Error(`${language} level ${level.id}: count ${list?.length}/${level.count}`);
    }
    for (const word of list) {
      const normalized = word.toLocaleUpperCase(locales[language]);
      if (normalized !== word || [...word].some(letter => !alphabets[language].includes(letter))) {
        throw new Error(`${language} level ${level.id}: invalid alphabet ${word}`);
      }
      if (word.length < minimum || word.length > Math.min(maximum, effectiveSize - 1)) {
        throw new Error(`${language} level ${level.id}: invalid length ${word}`);
      }
      if (seen.has(word) || (!safeWordExceptions[language].has(word)
        && unsafe[language].some(prefix => word.startsWith(prefix)))) {
        throw new Error(`${language} level ${level.id}: repeated or unsafe word ${word}`);
      }
      seen.add(word);
      allSeen.add(word);
      words += 1;
    }
  }
  report.languages[language] = { levels: data.length, words, unique: allSeen.size };
}
console.log(JSON.stringify(report, null, 2));
