const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.resolve(process.argv[2] || "C:/Users/grkm/Downloads/kelimeler_804_final.json");
const FIXED_PATH = path.join(ROOT, "assets", "game", "fixed-word-lists.js");
const INDEX_PATH = path.join(ROOT, "assets", "game", "index.html");
const REPORT_PATH = path.join(ROOT, "tooling", "easy-804-import-report.json");
const MARKER = "USER_EASY_804_WORD_ROWS";

const LANGUAGE_CONFIG = {
  turkish: { key: "tr", locale: "tr-TR", alphabet: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ" },
  english: { key: "en", locale: "en-US", alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  german: { key: "de", locale: "de-DE", alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ" }
};

const UNSAFE = {
  turkish: ["AMK", "APTAL", "BOK", "GÖT", "KAHPE", "OROSPU", "PİÇ", "POK", "SALAK", "SİK", "SİKTİR", "ŞEREFSİZ", "YARRAK"],
  english: ["ASS", "ASSHOLE", "BASTARD", "BITCH", "COCK", "CUNT", "DAMN", "DICK", "DILDO", "FUCK", "IDIOT", "JERK", "NIGGER", "PISS", "PORN", "PUSSY", "SEXUAL", "SHIT", "SLUT", "TWAT", "WANK", "WHORE"],
  german: ["ARSCH", "BASTARD", "DUMM", "FICK", "FICKEN", "HURE", "HURENSOHN", "IDIOT", "NIGGER", "SCHLAMPE", "SCHEISSE", "WICHSER"]
};

// Only explicit data-quality fixes are listed here. The original source is
// never silently rewritten: every old/new value is emitted in the report.
const REPLACEMENTS = {
  159: { turkish: "Kuzu", english: "Lamb", german: "Lamm" },
  457: { english: "Rider", german: "Fahrgast" },
  505: { german: "Zipper" },
  510: { german: "Cotton" },
  528: { german: "Aroma" },
  531: { english: "Outline", german: "Umriss" },
  541: { german: "Wohlsein" },
  542: { german: "Leiden" },
  553: { german: "Katarrh" },
  561: { german: "Antidot" },
  565: { german: "Eingriff" },
  574: { turkish: "Bunalım", english: "Sadness", german: "Trübsal" },
  583: { german: "Schminke" },
  585: { german: "Rouge" },
  592: { german: "Robe" },
  593: { german: "Slipper" },
  601: { german: "Glove" },
  602: { turkish: "Kravat" },
  609: { german: "Fußring" },
  630: { english: "Band", german: "Band" },
  636: { english: "Offstage" },
  640: { german: "Akteur" },
  641: { german: "Aktrice" },
  646: { german: "Subtitel" },
  648: { turkish: "Yapımcı", german: "Macher" },
  649: { german: "Leiter" },
  661: { german: "Headline" },
  663: { english: "Talk", german: "Gespräch" },
  668: { turkish: "Toplantı", english: "Meeting", german: "Tagung" },
  671: { turkish: "Forum", english: "Forum", german: "Tagung" },
  673: { german: "Protest" },
  674: { english: "Tradeoff", german: "Konsens" },
  676: { english: "Solo" },
  677: { english: "Speech" },
  680: { english: "Section" },
  682: { german: "Wendung" },
  683: { german: "Sage" },
  688: { english: "Wisdom", german: "Weisheit" },
  691: { english: "Artistic" },
  692: { turkish: "Öte", english: "Beyond", german: "Jenseits" },
  693: { german: "Wesen" },
  694: { turkish: "Bilgi", english: "Know", german: "Wissen" },
  696: { turkish: "Safsata", german: "Irrtum" },
  697: { english: "Logic", german: "Logik" },
  699: { english: "Theory", german: "These" },
  702: { english: "Tenet" },
  705: { german: "Formel" },
  710: { english: "Slope", german: "Steigung" },
  711: { turkish: "İşlev" },
  716: { english: "Chance", german: "Chance" },
  717: { turkish: "Veri", english: "Data", german: "Daten" },
  721: { turkish: "Güç", english: "Power", german: "Potenz" },
  724: { english: "Rest" },
  726: { english: "Delta", german: "Abstand" },
  728: { english: "Border", german: "Umfang" },
  729: { german: "Diameter" },
  738: { turkish: "Emek" },
  745: { turkish: "Mıknatıs" },
  746: { german: "Abwehr" },
  749: { english: "Rate" },
  751: { english: "Change", german: "Wandel" },
  759: { english: "Air", german: "Luft" },
  761: { english: "Land", german: "Erdteil" },
  767: { german: "Jahr" },
  787: { german: "Gelenk" },
  796: { turkish: "Çaba" }
};

function normalizeWord(value, config) {
  return String(value || "").trim().normalize("NFC").toLocaleUpperCase(config.locale);
}

function isUnsafe(word, language) {
  return UNSAFE[language].some(prefix => word.startsWith(prefix));
}

function readEasyLevelIds() {
  const html = fs.readFileSync(INDEX_PATH, "utf8");
  const pattern = /^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm;
  return [...html.matchAll(pattern)]
    .filter(match => match[3] === "easy")
    .map(match => Number(match[1]));
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 804) {
    throw new Error(`Expected exactly 804 rows, found ${rows?.length}`);
  }

  const normalizedByLanguage = { turkish: [], english: [], german: [] };
  const replacementReport = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row || typeof row !== "object") throw new Error(`Row ${rowNumber} is not an object`);
    for (const language of Object.keys(LANGUAGE_CONFIG)) {
      if (typeof row[language] !== "string") throw new Error(`Row ${rowNumber} missing ${language}`);
    }
    const changes = REPLACEMENTS[rowNumber] || {};
    for (const [language, replacement] of Object.entries(changes)) {
      const oldValue = row[language];
      row[language] = replacement;
      replacementReport.push({ row: rowNumber, language, from: oldValue, to: replacement });
    }
    for (const [language, config] of Object.entries(LANGUAGE_CONFIG)) {
      const word = normalizeWord(row[language], config);
      const lettersOnly = [...word].every(letter => config.alphabet.includes(letter));
      if (word.length < 3 || word.length > 8 || !lettersOnly || isUnsafe(word, language)) {
        throw new Error(`Row ${rowNumber} ${language} is still invalid after fixes: ${row[language]}`);
      }
      row[language] = word;
      normalizedByLanguage[language].push(word);
    }
  });

  for (let start = 0; start < rows.length; start += 4) {
    for (const [language, values] of Object.entries(normalizedByLanguage)) {
      const group = values.slice(start, start + 4);
      if (new Set(group).size !== group.length) {
        throw new Error(`${language} duplicate inside Easy group ${start / 4 + 1}: ${JSON.stringify(group)}`);
      }
    }
  }

  return { rows, replacementReport };
}

function readCurrentFixedBank() {
  const context = {};
  context.window = context;
  vm.runInNewContext(fs.readFileSync(FIXED_PATH, "utf8"), context, { filename: FIXED_PATH });
  const bank = context.window.GARDEN_OF_WORDS_FIXED_WORDS;
  if (!bank || !bank.en || !bank.de || !bank.tr) throw new Error("Current fixed bank is incomplete");
  return bank;
}

function buildOverrideBlock(rows, easyLevelIds) {
  const compactRows = rows.map(row => [row.turkish, row.english, row.german]);
  return [
    "",
    "// User-approved 804-word Easy import. Rows are grouped four per Easy level.",
    `const ${MARKER} = ${JSON.stringify(compactRows)};`,
    `const USER_EASY_804_LEVEL_IDS = ${JSON.stringify(easyLevelIds)};`,
    `if (${MARKER}.length !== 804 || USER_EASY_804_LEVEL_IDS.length !== 201) {`,
    "  throw new Error(\"Easy 804 import shape mismatch\");",
    "}",
    `USER_EASY_804_LEVEL_IDS.forEach((levelId, easyIndex) => {`,
    `  const rows = ${MARKER}.slice(easyIndex * 4, easyIndex * 4 + 4);`,
    "  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.tr[levelId - 1] = rows.map(row => row[0]);",
    "  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.en[levelId - 1] = rows.map(row => row[1]);",
    "  GARDEN_OF_WORDS_FIXED_LEVEL_DATA.de[levelId - 1] = rows.map(row => row[2]);",
    "});",
    ""
  ].join("\n");
}

function main() {
  const sourceRows = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  const { rows, replacementReport } = validateRows(sourceRows);
  const easyLevelIds = readEasyLevelIds();
  if (easyLevelIds.length !== 201) throw new Error(`Expected 201 Easy levels, found ${easyLevelIds.length}`);

  const bank = readCurrentFixedBank();
  for (const language of ["tr", "en", "de"]) {
    if (!Array.isArray(bank[language]) || bank[language].length !== 950) {
      throw new Error(`${language} fixed bank is not 950 levels`);
    }
  }
  const overrideBlock = buildOverrideBlock(rows, easyLevelIds);
  const source = fs.readFileSync(FIXED_PATH, "utf8");
  if (source.includes(MARKER)) throw new Error("Easy 804 import already exists");
  const marker = "window.GARDEN_OF_WORDS_FIXED_WORDS = Object.freeze(GARDEN_OF_WORDS_FIXED_LEVEL_DATA);";
  if (!source.includes(marker)) throw new Error("Fixed bank export marker not found");
  fs.writeFileSync(FIXED_PATH, source.replace(marker, `${overrideBlock}${marker}`), "utf8");

  const report = {
    source: INPUT_PATH,
    inputRows: rows.length,
    easyLevels: easyLevelIds.length,
    wordsPerEasyLevel: 4,
    maxWordLength: 8,
    unsafeMatchesAfterFixes: 0,
    replacementCount: replacementReport.length,
    replacements: replacementReport
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ imported: true, rows: rows.length, easyLevels: easyLevelIds.length, replacements: replacementReport.length, report: REPORT_PATH }, null, 2));
}

main();
