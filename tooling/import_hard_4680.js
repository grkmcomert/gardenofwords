const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.resolve(
  process.argv[2] || 'C:/Users/grkm/Downloads/zor_4680_kelime_TR_DE_KARAKTER_KONTROLLU.json',
);
const FIXED_PATH = path.join(ROOT, 'assets', 'game', 'fixed-word-lists.js');
const INDEX_PATH = path.join(ROOT, 'assets', 'game', 'index.html');
const REPORT_PATH = path.join(ROOT, 'tooling', 'hard-4680-import-report.json');
const MARKER = 'USER_HARD_4680_WORDS';
const WORD_COUNT_PER_LANGUAGE = 1560;
const WORDS_PER_LEVEL = 5;
const HARD_LEVEL_COUNT = WORD_COUNT_PER_LANGUAGE / WORDS_PER_LEVEL;
const SHUFFLE_SEEDS = { tr: 0x4D595452, en: 0x4D59454E, de: 0x4D594445 };

const LANGUAGE_CONFIG = {
  tr: {
    sourceKey: 'turkce',
    locale: 'tr-TR',
    alphabet: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ',
  },
  en: {
    sourceKey: 'ingilizce',
    locale: 'en-US',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  },
  de: {
    sourceKey: 'almanca',
    locale: 'de-DE',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ',
  },
};

const UNSAFE = {
  tr: ['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK'],
  en: ['ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'CUNT', 'DAMN', 'DICK', 'FUCK', 'IDIOT', 'JERK', 'PISS', 'SHIT', 'SLUT', 'TWAT', 'WANK', 'WHORE'],
  de: ['ARSCH', 'BASTARD', 'DUMM', 'FICK', 'HURE', 'IDIOT', 'SCHLAMPE', 'SCHEISSE', 'WICHSER'],
};

// Exact lexical exceptions for legitimate technical words that begin with a
// blocked substring; they are not insults and must remain playable.
const SAFE_WORD_EXCEPTIONS = {
  tr: new Set(['BOKSİT']),
  en: new Set(['ASSENTOR', 'ASSESS']),
  de: new Set(),
};

// Turkish source spellings corrected only where the game's alphabet cannot
// represent the supplied form. Every replacement is reported below.
const REPLACEMENTS = {
  570: { turkce: 'CİHANİ' },
  574: { turkce: 'DEHAİ' },
  881: { turkce: 'KUVARS' },
  899: { turkce: 'ABADİ' },
  967: { turkce: 'AŞİKAR' },
  985: { turkce: 'BESTEKAR' },
  1014: { turkce: 'DİVANİ' },
  1027: { turkce: 'GÜZERGAH' },
  1148: { turkce: 'AHKAM' },
  1194: { turkce: 'CENGAVER' },
  1197: { turkce: 'DAİMİ' },
  1204: { turkce: 'DERGAH' },
  1206: { turkce: 'DEVRİALEM' },
  1220: { turkce: 'ERKAN' },
  1245: { turkce: 'HAREKAT' },
  1278: { turkce: 'KANAATKAR' },
  1359: { turkce: 'DESTANİ' },
  1444: { turkce: 'ABANOZİ' },
  1497: { turkce: 'EFKAR' },
  1511: { turkce: 'İSTİHZAİ' },
  1512: { turkce: 'İTİKADİ' },
  1535: { turkce: 'ZIMNİ' },
};

function normalizeWord(value, config) {
  return String(value).trim().normalize('NFC').toLocaleUpperCase(config.locale);
}

function unsafeWord(word, language) {
  return !SAFE_WORD_EXCEPTIONS[language].has(word)
    && UNSAFE[language].some(prefix => word.startsWith(prefix));
}

function readHardLevelIds() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const pattern = /^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm;
  return [...html.matchAll(pattern)]
    .filter(match => match[3] === 'hard')
    .map(match => Number(match[1]));
}

function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Expected an object with turkce, ingilizce, and almanca arrays');
  }
  for (const config of Object.values(LANGUAGE_CONFIG)) {
    if (!Array.isArray(source[config.sourceKey]) || source[config.sourceKey].length !== WORD_COUNT_PER_LANGUAGE) {
      throw new Error(`${config.sourceKey} must contain exactly ${WORD_COUNT_PER_LANGUAGE} words`);
    }
  }

  const words = { tr: [], en: [], de: [] };
  const replacementReport = [];
  for (const [language, config] of Object.entries(LANGUAGE_CONFIG)) {
    source[config.sourceKey].forEach((rawValue, index) => {
      const rowNumber = index + 1;
      if (typeof rawValue !== 'string') throw new Error(`Row ${rowNumber} ${language} is not a string`);
      const replacement = REPLACEMENTS[rowNumber]?.[config.sourceKey];
      const sourceValue = replacement || rawValue;
      if (replacement) replacementReport.push({ row: rowNumber, language, from: rawValue, to: replacement });
      const word = normalizeWord(sourceValue, config);
      const lettersOnly = [...word].every(letter => config.alphabet.includes(letter));
      if (word.length < 5 || word.length > 9 || !lettersOnly || unsafeWord(word, language)) {
        throw new Error(`Row ${rowNumber} ${language} is invalid after fixes: ${sourceValue}`);
      }
      words[language].push(word);
    });
  }

  return { words, replacementReport };
}

function seededShuffle(values, seed) {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function mixIntoLevels(values, language) {
  const remaining = seededShuffle(values, SHUFFLE_SEEDS[language]);
  const mixed = [];
  while (remaining.length) {
    const group = [];
    for (let slot = 0; slot < WORDS_PER_LEVEL; slot += 1) {
      const candidateIndex = remaining.findIndex(word => !group.includes(word));
      if (candidateIndex < 0) throw new Error(`${language}: could not make a duplicate-free Hard group`);
      group.push(remaining.splice(candidateIndex, 1)[0]);
    }
    mixed.push(...group);
  }
  return mixed;
}

function readCurrentFixedBank() {
  const context = {};
  context.window = context;
  vm.runInNewContext(fs.readFileSync(FIXED_PATH, 'utf8'), context, { filename: FIXED_PATH });
  const bank = context.window.GARDEN_OF_WORDS_FIXED_WORDS;
  if (!bank || !bank.en || !bank.de || !bank.tr) throw new Error('Current fixed bank is incomplete');
  return bank;
}

function buildOverrideBlock(mixedWords, hardLevelIds) {
  return [
    '',
    '// User-approved 4680-word Hard import. Each language is mixed only within Hard levels.',
    `const ${MARKER} = ${JSON.stringify(mixedWords)};`,
    `const USER_HARD_4680_LEVEL_IDS = ${JSON.stringify(hardLevelIds)};`,
    `if (${MARKER}.tr.length !== ${WORD_COUNT_PER_LANGUAGE} || ${MARKER}.en.length !== ${WORD_COUNT_PER_LANGUAGE} || ${MARKER}.de.length !== ${WORD_COUNT_PER_LANGUAGE} || USER_HARD_4680_LEVEL_IDS.length !== ${HARD_LEVEL_COUNT}) {`,
    '  throw new Error("Hard 4680 import shape mismatch");',
    '}',
    'USER_HARD_4680_LEVEL_IDS.forEach((levelId, hardIndex) => {',
    `  const start = hardIndex * ${WORDS_PER_LEVEL};`,
    `  const end = start + ${WORDS_PER_LEVEL};`,
    `  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.tr[levelId - 1] = ${MARKER}.tr.slice(start, end);`,
    `  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.en[levelId - 1] = ${MARKER}.en.slice(start, end);`,
    `  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.de[levelId - 1] = ${MARKER}.de.slice(start, end);`,
    '});',
    '',
  ].join('\n');
}

function countSafePrefixMatches(words) {
  return Object.fromEntries(Object.keys(LANGUAGE_CONFIG).map(language => [
    language,
    words[language].filter(word => SAFE_WORD_EXCEPTIONS[language].has(word)),
  ]));
}

function main() {
  const source = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const { words, replacementReport } = validateSource(source);
  const hardLevelIds = readHardLevelIds();
  if (hardLevelIds.length !== HARD_LEVEL_COUNT) {
    throw new Error(`Expected ${HARD_LEVEL_COUNT} Hard levels, found ${hardLevelIds.length}`);
  }
  const mixedWords = Object.fromEntries(Object.keys(words).map(language => [
    language,
    mixIntoLevels(words[language], language),
  ]));
  const bank = readCurrentFixedBank();
  for (const language of ['tr', 'en', 'de']) {
    if (!Array.isArray(bank[language]) || bank[language].length !== 950) {
      throw new Error(`${language} fixed bank is not 950 levels`);
    }
  }
  const sourceText = fs.readFileSync(FIXED_PATH, 'utf8');
  if (sourceText.includes(MARKER)) throw new Error('Hard 4680 import already exists');
  const exportMarker = 'window.GARDEN_OF_WORDS_FIXED_WORDS = Object.freeze(GARDEN_OF_WORDS_FIXED_LEVEL_DATA);';
  if (!sourceText.includes(exportMarker)) throw new Error('Fixed bank export marker not found');

  const overrideBlock = buildOverrideBlock(mixedWords, hardLevelIds);
  fs.writeFileSync(FIXED_PATH, sourceText.replace(exportMarker, `${overrideBlock}${exportMarker}`), 'utf8');

  const report = {
    source: INPUT_PATH,
    totalWords: WORD_COUNT_PER_LANGUAGE * 3,
    wordsPerLanguage: WORD_COUNT_PER_LANGUAGE,
    importedHardLevels: hardLevelIds.length,
    wordsPerHardLevel: WORDS_PER_LEVEL,
    minWordLength: 5,
    maxWordLength: 9,
    shuffleSeeds: SHUFFLE_SEEDS,
    replacementCount: replacementReport.length,
    replacements: replacementReport,
    safeTechnicalWordsAllowedByExactMatch: countSafePrefixMatches(words),
    crossDifficultyMixing: false,
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    imported: true,
    wordsPerLanguage: WORD_COUNT_PER_LANGUAGE,
    importedHardLevels: hardLevelIds.length,
    mixedOnlyWithinHard: true,
    replacements: replacementReport.length,
    report: REPORT_PATH,
  }, null, 2));
}

main();
