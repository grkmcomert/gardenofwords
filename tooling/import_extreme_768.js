const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.resolve(
  process.argv[2] || 'C:/Users/grkm/Downloads/cok_zor_2304_kelime_768_TR_EN_DE_KONTROLLU_V2.json',
);
const FIXED_PATH = path.join(ROOT, 'assets', 'game', 'fixed-word-lists.js');
const INDEX_PATH = path.join(ROOT, 'assets', 'game', 'index.html');
const REPORT_PATH = path.join(ROOT, 'tooling', 'extreme-768-import-report.json');
const MARKER = 'USER_EXTREME_768_WORD_ROWS';
const ROW_COUNT = 768;
const WORDS_PER_LEVEL = 6;
const SOURCE_LEVEL_COUNT = ROW_COUNT / WORDS_PER_LEVEL;

const LANGUAGE_CONFIG = {
  turkish: {
    sourceKey: 'turkce',
    code: 'tr',
    locale: 'tr-TR',
    alphabet: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ',
  },
  english: {
    sourceKey: 'english',
    code: 'en',
    locale: 'en-US',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  },
  german: {
    sourceKey: 'deutsch',
    code: 'de',
    locale: 'de-DE',
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ',
  },
};

const UNSAFE = {
  tr: ['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK'],
  en: ['ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'CUNT', 'DAMN', 'DICK', 'FUCK', 'IDIOT', 'JERK', 'PISS', 'SHIT', 'SLUT', 'TWAT', 'WANK', 'WHORE'],
  de: ['ARSCH', 'BASTARD', 'DUMM', 'FICK', 'HURE', 'IDIOT', 'SCHLAMPE', 'SCHEISSE', 'WICHSER'],
};

// These are spelling corrections required by the game's Turkish alphabet.
const REPLACEMENTS = {
  549: { turkish: 'KSENOLİT' },
  570: { english: 'POLYMERIC' },
  632: { turkish: 'KSEROFİT' },
};

function normalizeWord(value, config) {
  return String(value).toLocaleUpperCase(config.locale);
}

function isUnsafe(word, language) {
  return UNSAFE[language].some(prefix => word.startsWith(prefix));
}

function readExtremeLevelIds() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const pattern = /^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm;
  return [...html.matchAll(pattern)]
    .filter(match => match[3] === 'extreme')
    .map(match => Number(match[1]));
}

function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Expected an object with turkce, english, and deutsch arrays');
  }

  const sourceLengths = Object.values(LANGUAGE_CONFIG).map(config => source[config.sourceKey]?.length);
  if (sourceLengths.some(length => length !== ROW_COUNT) || new Set(sourceLengths).size !== 1) {
    throw new Error(`Expected ${ROW_COUNT} aligned words per language, found ${JSON.stringify(sourceLengths)}`);
  }

  const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
    turkish: source.turkce[index],
    english: source.english[index],
    german: source.deutsch[index],
  }));
  const replacementReport = [];
  const normalizedByLanguage = { turkish: [], english: [], german: [] };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    for (const language of Object.keys(LANGUAGE_CONFIG)) {
      if (typeof row[language] !== 'string') throw new Error(`Row ${rowNumber} missing ${language}`);
    }

    for (const [language, replacement] of Object.entries(REPLACEMENTS[rowNumber] || {})) {
      const oldValue = row[language];
      row[language] = replacement;
      replacementReport.push({ row: rowNumber, language, from: oldValue, to: replacement });
    }

    for (const [language, config] of Object.entries(LANGUAGE_CONFIG)) {
      const word = normalizeWord(row[language], config);
      const lettersOnly = [...word].every(letter => config.alphabet.includes(letter));
      if (word.length < 6 || word.length > 10 || !lettersOnly || isUnsafe(word, config.code)) {
        throw new Error(`Row ${rowNumber} ${language} is invalid after fixes: ${row[language]}`);
      }
      row[language] = word;
      normalizedByLanguage[language].push(word);
    }
  });

  for (let start = 0; start < ROW_COUNT; start += WORDS_PER_LEVEL) {
    for (const [language, values] of Object.entries(normalizedByLanguage)) {
      const group = values.slice(start, start + WORDS_PER_LEVEL);
      if (new Set(group).size !== group.length) {
        throw new Error(`${language} duplicate inside Extreme group ${start / WORDS_PER_LEVEL + 1}: ${JSON.stringify(group)}`);
      }
    }
  }

  return { rows, replacementReport };
}

function readCurrentFixedBank() {
  const context = {};
  context.window = context;
  vm.runInNewContext(fs.readFileSync(FIXED_PATH, 'utf8'), context, { filename: FIXED_PATH });
  const bank = context.window.GARDEN_OF_WORDS_FIXED_WORDS;
  if (!bank || !bank.en || !bank.de || !bank.tr) throw new Error('Current fixed bank is incomplete');
  return bank;
}

function buildOverrideBlock(rows, extremeLevelIds) {
  const compactRows = rows.map(row => [row.turkish, row.english, row.german]);
  return [
    '',
    '// User-approved 768-word Extreme import. Rows are grouped six per Extreme level.',
    `const ${MARKER} = ${JSON.stringify(compactRows)};`,
    `const USER_EXTREME_768_LEVEL_IDS = ${JSON.stringify(extremeLevelIds)};`,
    `if (${MARKER}.length !== ${ROW_COUNT} || USER_EXTREME_768_LEVEL_IDS.length !== ${SOURCE_LEVEL_COUNT}) {`,
    '  throw new Error("Extreme 768 import shape mismatch");',
    '}',
    'USER_EXTREME_768_LEVEL_IDS.forEach((levelId, extremeIndex) => {',
    `  const rows = ${MARKER}.slice(extremeIndex * ${WORDS_PER_LEVEL}, extremeIndex * ${WORDS_PER_LEVEL} + ${WORDS_PER_LEVEL});`,
    '  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.tr[levelId - 1] = rows.map(row => row[0]);',
    '  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.en[levelId - 1] = rows.map(row => row[1]);',
    '  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.de[levelId - 1] = rows.map(row => row[2]);',
    '});',
    '',
  ].join('\n');
}

function main() {
  const source = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const { rows, replacementReport } = validateSource(source);
  const allExtremeLevelIds = readExtremeLevelIds();
  if (allExtremeLevelIds.length < SOURCE_LEVEL_COUNT) {
    throw new Error(`Expected at least ${SOURCE_LEVEL_COUNT} Extreme levels, found ${allExtremeLevelIds.length}`);
  }
  const importedExtremeLevelIds = allExtremeLevelIds.slice(0, SOURCE_LEVEL_COUNT);
  const preservedExtremeLevelIds = allExtremeLevelIds.slice(SOURCE_LEVEL_COUNT);

  const bank = readCurrentFixedBank();
  for (const language of ['tr', 'en', 'de']) {
    if (!Array.isArray(bank[language]) || bank[language].length !== 950) {
      throw new Error(`${language} fixed bank is not 950 levels`);
    }
  }

  const sourceText = fs.readFileSync(FIXED_PATH, 'utf8');
  if (sourceText.includes(MARKER)) throw new Error('Extreme 768 import already exists');
  const exportMarker = 'window.GARDEN_OF_WORDS_FIXED_WORDS = Object.freeze(GARDEN_OF_WORDS_FIXED_LEVEL_DATA);';
  if (!sourceText.includes(exportMarker)) throw new Error('Fixed bank export marker not found');

  const overrideBlock = buildOverrideBlock(rows, importedExtremeLevelIds);
  fs.writeFileSync(FIXED_PATH, sourceText.replace(exportMarker, `${overrideBlock}${exportMarker}`), 'utf8');

  const report = {
    source: INPUT_PATH,
    inputWordsPerLanguage: ROW_COUNT,
    importedExtremeLevels: importedExtremeLevelIds.length,
    wordsPerExtremeLevel: WORDS_PER_LEVEL,
    minWordLength: 6,
    maxWordLength: 10,
    unsafeMatchesAfterFixes: 0,
    replacementCount: replacementReport.length,
    replacements: replacementReport,
    preservedExistingExtremeLevelIds: preservedExtremeLevelIds,
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    imported: true,
    wordsPerLanguage: ROW_COUNT,
    importedExtremeLevels: importedExtremeLevelIds.length,
    preservedExistingExtremeLevels: preservedExtremeLevelIds.length,
    replacements: replacementReport.length,
    report: REPORT_PATH,
  }, null, 2));
}

main();
