const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('assets/game/index.html', 'utf8');
const context = {};
vm.runInNewContext(fs.readFileSync('assets/game/fixed-word-lists.js', 'utf8'), context);
const fixed = context.GARDEN_OF_WORDS_FIXED_WORDS;
const levels = [...html.matchAll(/^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm)]
  .map(match => ({ id: Number(match[1]), tone: match[3], size: Number(match[4]), count: match[3] === 'easy' ? 4 : match[3] === 'medium' ? 5 : match[3] === 'hard' ? 5 : 6 }));
const ranges = { easy: [3, 8], medium: [4, 8], hard: [5, 9], extreme: [6, 10] };
const config = {
  tr: { alphabet: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ', locale: 'tr-TR' },
  en: { alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', locale: 'en-US' },
  de: { alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ', locale: 'de-DE' },
};
const unsafe = {
  tr: ['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK'],
  en: ['ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'CUNT', 'DAMN', 'DICK', 'FUCK', 'IDIOT', 'JERK', 'PISS', 'SHIT', 'SLUT', 'TWAT', 'WANK', 'WHORE'],
  de: ['ARSCH', 'BASTARD', 'DUMM', 'FICK', 'HURE', 'IDIOT', 'SCHLAMPE', 'SCHEISSE', 'WICHSER'],
};
const safeExceptions = { tr: new Set(['BOKSİT', 'BOKSER']), en: new Set(['ASSENTOR', 'ASSESS', 'ASSET']), de: new Set() };
const errors = [];
for (const language of ['tr', 'en', 'de']) {
  for (const level of levels) {
    const list = fixed?.[language]?.[level.id - 1];
    const [minimum, maximum] = ranges[level.tone];
    const effectiveMaximum = Math.min(maximum, Math.min(level.size + 2, 13) - 1);
    if (!Array.isArray(list) || list.length !== level.count) {
      errors.push(`${language} level ${level.id}: count ${list?.length}/${level.count}`);
      continue;
    }
    const seen = new Set();
    for (const word of list) {
      if (word.length < minimum || word.length > effectiveMaximum) errors.push(`${language} level ${level.id}: length ${word}`);
      if (word !== word.toLocaleUpperCase(config[language].locale)
        || [...word].some(letter => !config[language].alphabet.includes(letter))) {
        errors.push(`${language} level ${level.id}: alphabet ${word}`);
      }
      if (seen.has(word) || (!safeExceptions[language].has(word)
        && unsafe[language].some(prefix => word.startsWith(prefix)))) {
        errors.push(`${language} level ${level.id}: duplicate/unsafe ${word}`);
      }
      seen.add(word);
    }
  }
}
const byTone = Object.fromEntries(Object.keys(ranges).map(tone => [tone, errors.filter(error => error.includes(`level `) && levels.find(level => error.includes(`level ${level.id}:`))?.tone === tone).length]));
const report = { levels: levels.length, errors: errors.slice(0, 200), errorCount: errors.length, errorsByTone: byTone };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
