const fs = require('fs');
const vm = require('vm');

const sourcePath = process.argv[2] || 'C:/Users/grkm/Downloads/cok_zor_2304_kelime_768_TR_EN_DE_KONTROLLU_V2.json';
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const html = fs.readFileSync('assets/game/index.html', 'utf8');
const context = {};
context.window = context;
vm.runInNewContext(fs.readFileSync('assets/game/fixed-word-lists.js', 'utf8'), context);
const fixed = context.window.GARDEN_OF_WORDS_FIXED_WORDS;

const levels = [...html.matchAll(/^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm)]
  .map(match => ({ id: Number(match[1]), tone: match[3], size: Number(match[4]) }));
const extremeIds = levels.filter(level => level.tone === 'extreme').map(level => level.id);
const rows = Array.from({ length: 768 }, (_, index) => [
  index === 548 ? 'KSENOLİT' : index === 631 ? 'KSEROFİT' : source.turkce[index],
  index === 569 ? 'POLYMERIC' : source.english[index],
  source.deutsch[index],
]);
const languages = [
  { code: 'tr', sourceIndex: 0, alphabet: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ', locale: 'tr-TR' },
  { code: 'en', sourceIndex: 1, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', locale: 'en-US' },
  { code: 'de', sourceIndex: 2, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ', locale: 'de-DE' },
];
const unsafe = {
  tr: ['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK'],
  en: ['ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'CUNT', 'DAMN', 'DICK', 'FUCK', 'IDIOT', 'JERK', 'PISS', 'SHIT', 'SLUT', 'TWAT', 'WANK', 'WHORE'],
  de: ['ARSCH', 'BASTARD', 'DUMM', 'FICK', 'HURE', 'IDIOT', 'SCHLAMPE', 'SCHEISSE', 'WICHSER'],
};

const errors = [];
if (levels.length !== 950) errors.push(`level count ${levels.length}/950`);
if (extremeIds.length !== 131) errors.push(`Extreme level count ${extremeIds.length}/131`);
if (Object.values(source).some(words => !Array.isArray(words) || words.length !== 768)) {
  errors.push('source does not contain 768 aligned words per language');
}

for (let extremeIndex = 0; extremeIndex < Math.min(128, extremeIds.length); extremeIndex += 1) {
  const levelId = extremeIds[extremeIndex];
  for (const language of languages) {
    const expected = rows
      .slice(extremeIndex * 6, extremeIndex * 6 + 6)
      .map(row => row[language.sourceIndex].toLocaleUpperCase(language.locale));
    const actual = fixed[language.code]?.[levelId - 1];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`${language.code} level ${levelId}: imported words do not match source`);
    }
    if (!Array.isArray(actual) || actual.length !== 6) {
      errors.push(`${language.code} level ${levelId}: count ${actual?.length}/6`);
      continue;
    }
    const seen = new Set();
    for (const word of actual) {
      if (word.length < 6 || word.length > 10) errors.push(`${language.code} level ${levelId}: invalid length ${word}`);
      if (word !== word.toLocaleUpperCase(language.locale) || [...word].some(letter => !language.alphabet.includes(letter))) {
        errors.push(`${language.code} level ${levelId}: invalid alphabet ${word}`);
      }
      if (seen.has(word) || unsafe[language.code].some(prefix => word.startsWith(prefix))) {
        errors.push(`${language.code} level ${levelId}: repeated or unsafe word ${word}`);
      }
      seen.add(word);
    }
  }
}

for (const levelId of extremeIds.slice(128)) {
  for (const language of languages) {
    const actual = fixed[language.code]?.[levelId - 1];
    if (!Array.isArray(actual) || actual.length !== 6) {
      errors.push(`${language.code} preserved level ${levelId}: count ${actual?.length}/6`);
      continue;
    }
    const seen = new Set();
    for (const word of actual) {
      if (word.length < 6 || word.length > 10) errors.push(`${language.code} preserved level ${levelId}: invalid length ${word}`);
      if (word !== word.toLocaleUpperCase(language.locale) || [...word].some(letter => !language.alphabet.includes(letter))) {
        errors.push(`${language.code} preserved level ${levelId}: invalid alphabet ${word}`);
      }
      if (seen.has(word) || unsafe[language.code].some(prefix => word.startsWith(prefix))) {
        errors.push(`${language.code} preserved level ${levelId}: repeated or unsafe word ${word}`);
      }
      seen.add(word);
    }
  }
}

const report = {
  totalLevels: levels.length,
  extremeLevels: extremeIds.length,
  importedExtremeLevels: Math.min(128, extremeIds.length),
  preservedExistingExtremeLevelIds: extremeIds.slice(128),
  wordsPerImportedExtremeLevel: 6,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
