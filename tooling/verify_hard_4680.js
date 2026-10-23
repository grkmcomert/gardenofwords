const fs = require('fs');
const vm = require('vm');

const sourcePath = process.argv[2] || 'C:/Users/grkm/Downloads/zor_4680_kelime_TR_DE_KARAKTER_KONTROLLU.json';
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const html = fs.readFileSync('assets/game/index.html', 'utf8');
const context = {};
context.window = context;
vm.runInNewContext(fs.readFileSync('assets/game/fixed-word-lists.js', 'utf8'), context);
const fixed = context.window.GARDEN_OF_WORDS_FIXED_WORDS;
const levels = [...html.matchAll(/^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm)]
  .map(match => ({ id: Number(match[1]), tone: match[3], size: Number(match[4]) }));
const hardIds = levels.filter(level => level.tone === 'hard').map(level => level.id);
const config = {
  tr: { sourceKey: 'turkce', alphabet: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ', locale: 'tr-TR' },
  en: { sourceKey: 'ingilizce', alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', locale: 'en-US' },
  de: { sourceKey: 'almanca', alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ', locale: 'de-DE' },
};
const unsafe = {
  tr: ['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK'],
  en: ['ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'CUNT', 'DAMN', 'DICK', 'FUCK', 'IDIOT', 'JERK', 'PISS', 'SHIT', 'SLUT', 'TWAT', 'WANK', 'WHORE'],
  de: ['ARSCH', 'BASTARD', 'DUMM', 'FICK', 'HURE', 'IDIOT', 'SCHLAMPE', 'SCHEISSE', 'WICHSER'],
};
const safeExceptions = { tr: new Set(['BOKSİT']), en: new Set(['ASSENTOR', 'ASSESS']), de: new Set() };
const replacements = {
  570: { turkce: 'CİHANİ' }, 574: { turkce: 'DEHAİ' }, 881: { turkce: 'KUVARS' }, 899: { turkce: 'ABADİ' },
  967: { turkce: 'AŞİKAR' }, 985: { turkce: 'BESTEKAR' }, 1014: { turkce: 'DİVANİ' }, 1027: { turkce: 'GÜZERGAH' },
  1148: { turkce: 'AHKAM' }, 1194: { turkce: 'CENGAVER' }, 1197: { turkce: 'DAİMİ' }, 1204: { turkce: 'DERGAH' },
  1206: { turkce: 'DEVRİALEM' }, 1220: { turkce: 'ERKAN' }, 1245: { turkce: 'HAREKAT' }, 1278: { turkce: 'KANAATKAR' },
  1359: { turkce: 'DESTANİ' }, 1444: { turkce: 'ABANOZİ' }, 1497: { turkce: 'EFKAR' }, 1511: { turkce: 'İSTİHZAİ' },
  1512: { turkce: 'İTİKADİ' }, 1535: { turkce: 'ZIMNİ' },
};
const seeds = { tr: 0x4D595452, en: 0x4D59454E, de: 0x4D594445 };

function normalize(value, locale) {
  return String(value).trim().normalize('NFC').toLocaleUpperCase(locale);
}

function shuffle(values, seed) {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function mix(values, language) {
  const remaining = shuffle(values, seeds[language]);
  const result = [];
  while (remaining.length) {
    const group = [];
    for (let slot = 0; slot < 5; slot += 1) {
      const index = remaining.findIndex(word => !group.includes(word));
      if (index < 0) throw new Error(`${language}: duplicate-free grouping failed`);
      group.push(remaining.splice(index, 1)[0]);
    }
    result.push(...group);
  }
  return result;
}

const expected = {};
for (const [language, languageConfig] of Object.entries(config)) {
  const values = source[languageConfig.sourceKey].map((raw, index) => {
    const replacement = replacements[index + 1]?.[languageConfig.sourceKey];
    return normalize(replacement || raw, languageConfig.locale);
  });
  expected[language] = mix(values, language);
}

const errors = [];
if (levels.length !== 950) errors.push(`level count ${levels.length}/950`);
if (hardIds.length !== 312) errors.push(`Hard level count ${hardIds.length}/312`);
for (const [language, languageConfig] of Object.entries(config)) {
  if (!Array.isArray(fixed[language]) || fixed[language].length !== 950) {
    errors.push(`${language}: fixed bank shape invalid`);
    continue;
  }
  for (let hardIndex = 0; hardIndex < hardIds.length; hardIndex += 1) {
    const levelId = hardIds[hardIndex];
    const actual = fixed[language][levelId - 1];
    const wanted = expected[language].slice(hardIndex * 5, hardIndex * 5 + 5);
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      errors.push(`${language} Hard level ${levelId}: mixed source mismatch`);
    }
    if (!Array.isArray(actual) || actual.length !== 5) {
      errors.push(`${language} Hard level ${levelId}: count ${actual?.length}/5`);
      continue;
    }
    const seen = new Set();
    for (const word of actual) {
      if (word.length < 5 || word.length > 9) errors.push(`${language} Hard level ${levelId}: invalid length ${word}`);
      if (word !== word.toLocaleUpperCase(languageConfig.locale)
        || [...word].some(letter => !languageConfig.alphabet.includes(letter))) {
        errors.push(`${language} Hard level ${levelId}: invalid alphabet ${word}`);
      }
      if (seen.has(word) || (!safeExceptions[language].has(word)
        && unsafe[language].some(prefix => word.startsWith(prefix)))) {
        errors.push(`${language} Hard level ${levelId}: repeated or unsafe word ${word}`);
      }
      seen.add(word);
    }
  }
}

const report = {
  totalLevels: levels.length,
  hardLevels: hardIds.length,
  wordsPerHardLevel: 5,
  wordsPerLanguage: 1560,
  mixedOnlyWithinHard: true,
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
