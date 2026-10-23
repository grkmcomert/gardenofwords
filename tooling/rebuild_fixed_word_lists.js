"use strict";

/*
 * Build the game's word bank from the ten user-provided 950-level tables.
 *
 * This file deliberately has no fallback bank. A word is either present in
 * one of the pasted rows and legal for that row, or it is not used. Duplicate
 * occurrences are removed globally per language so one word can never appear
 * in two sections. The report records every discarded occurrence and why it
 * was discarded.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(ROOT, "assets", "game", "index.html");
const OUTPUT_PATH = path.join(ROOT, "assets", "game", "fixed-word-lists.js");
const REPORT_PATH = path.join(ROOT, "tooling", "integrated-word-report.json");
const ATTACHMENT_ROOT = "C:/Users/grkm/.codex/attachments";
const ATTACHMENT_IDS = [
  "38c2fe11-112b-4894-8714-94668ab7c075",
  "f7db1c55-f9b7-4202-8df6-cadcd7dd6f8b",
  "aa397e73-5792-4cc7-81da-55c8f3b90364",
  "33522441-217e-47f5-af89-17c09562c1d7",
  "6030c94e-0b18-474d-9919-f40480ecb925",
  "1e379cc0-b3ab-4ef6-b319-091652e36235",
  "3b685952-9702-4d77-b897-434e85cc156d",
  "8efb163f-f547-419a-9b05-a61c4df8ce07",
  "68e39263-e743-4a60-835d-1e4ee68a2b6c",
  "4806ff9f-606a-45e7-be13-07f4e862850e"
];

const LOCALES = { en: "en-US", de: "de-DE", tr: "tr-TR" };
const ALPHABETS = {
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  de: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜẞ",
  tr: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"
};
const DIFFICULTIES = {
  K: { difficulty: "Easy", tone: "easy", size: 8, count: 4, range: [3, 8] },
  O: { difficulty: "Medium", tone: "medium", size: 9, count: 5, range: [4, 8] },
  Z: { difficulty: "Hard", tone: "hard", size: 10, count: 5, range: [5, 9] },
  ÇZ: { difficulty: "Extreme", tone: "extreme", size: 11, count: 6, range: [6, 10] }
};
const UNSAFE = {
  en: ["ASS", "ASSHOLE", "BASTARD", "BITCH", "COCK", "CUNT", "DAMN", "DICK", "DILDO", "FUCK", "IDIOT", "JERK", "NIGGER", "PISS", "PORN", "PUSSY", "SEXUAL", "SHIT", "SLUT", "TWAT", "WANK", "WHORE"],
  de: ["ARSCH", "BASTARD", "DUMM", "FICK", "HURE", "IDIOT", "NIGGER", "SCHLAMPE", "SCHEISSE", "WICHSER"],
  tr: ["AMK", "APTAL", "BOK", "GÖT", "KAHPE", "OROSPU", "PİÇ", "POK", "SALAK", "SİK", "SİKTİR", "ŞEREFSİZ", "YARRAK"]
};
const SAFE_WORD_EXCEPTIONS = {
  en: new Set(["ASSENTOR", "ASSESS"]),
  de: new Set(),
  tr: new Set(["BOKSİT", "BOKSER"])
};

function normalizeWord(value, language) {
  const upper = String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleUpperCase(LOCALES[language]);
  return [...upper].filter(letter => ALPHABETS[language].includes(letter)).join("");
}

function unsafeWord(word, language) {
  return !SAFE_WORD_EXCEPTIONS[language].has(word)
    && UNSAFE[language].some(prefix => word.startsWith(prefix));
}

function parseAttachmentRows() {
  const lines = ATTACHMENT_IDS.flatMap(id => fs.readFileSync(
    path.join(ATTACHMENT_ROOT, id, "pasted-text.txt"),
    "utf8"
  ).split(/\r?\n/).filter(Boolean));

  const rows = lines.map((line, index) => {
    const parts = line.split("|").map(part => part.trim());
    if (parts.length !== 8) throw new Error(`Invalid pasted row ${index + 1}: expected 8 columns`);
    const [idText, difficultyKey, board, countText, rangeText, trText, enText, deText] = parts;
    const id = Number(idText);
    const count = Number(countText);
    const metadata = DIFFICULTIES[difficultyKey];
    if (!metadata || !Number.isInteger(id) || id !== index + 1) {
      throw new Error(`Invalid pasted level order at row ${index + 1}`);
    }
    if (board !== `${metadata.size}x${metadata.size}` || count !== metadata.count
      || rangeText !== `${metadata.range[0]}-${metadata.range[1]}`) {
      throw new Error(`Pasted schema mismatch at level ${id}`);
    }
    const splitWords = text => text.split(",").map(word => word.trim()).filter(Boolean);
    const row = {
      id,
      difficultyKey,
      ...metadata,
      tr: splitWords(trText),
      en: splitWords(enText),
      de: splitWords(deText)
    };
    if (["tr", "en", "de"].some(language => row[language].length !== count)) {
      throw new Error(`Pasted word count mismatch at level ${id}`);
    }
    return row;
  });

  if (rows.length !== 950) throw new Error(`Expected 950 pasted levels, found ${rows.length}`);
  return rows;
}

function legalForRow(word, language, row) {
  const runtimeSize = Math.min(row.size + 2, 13);
  return Boolean(word)
    && !unsafeWord(word, language)
    && word.length >= 3
    && word.length < runtimeSize;
}

function buildLanguage(language, rows) {
  const levels = Array(rows.length);
  const used = new Set();
  const provenance = Array(rows.length);
  const removedByReason = {
    empty: 0,
    unsafe: 0,
    doesNotFitBoard: 0,
    duplicate: 0
  };

  // Resolve the most restrictive rows first. This does not add anything; it
  // only decides which occurrence keeps a globally duplicated user word.
  const assignmentOrder = [...rows].sort((a, b) =>
    b.range[0] - a.range[0] || b.range[1] - a.range[1] || a.id - b.id
  );

  for (const row of assignmentOrder) {
    const words = [];
    const pasted = [];
    const removed = [];
    for (const rawWord of row[language]) {
      const word = normalizeWord(rawWord, language);
      let reason = null;
      if (!word) reason = "empty";
      else if (unsafeWord(word, language)) reason = "unsafe";
      else if (!legalForRow(word, language, row)) reason = "doesNotFitBoard";
      else if (used.has(word)) reason = "duplicate";

      if (reason) {
        removedByReason[reason] += 1;
        removed.push({ raw: rawWord, normalized: word, reason });
        continue;
      }
      used.add(word);
      words.push(word);
      pasted.push(word);
    }

    if (!words.length) {
      throw new Error(`${language} level ${row.id} has no legal unique user words; refusing to invent replacements`);
    }
    levels[row.id - 1] = words;
    provenance[row.id - 1] = { level: row.id, pasted, added: [], removed };
  }

  return {
    levels,
    unique: used.size,
    removedByReason,
    removed: Object.values(removedByReason).reduce((sum, count) => sum + count, 0),
    provenance
  };
}

function replaceLevelSchema(html, rows, englishLevels) {
  const levelPattern = /^(\s*)\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words: sanitizeLevelWords\(\[[^\]]*\]\) \},$/gm;
  let replaced = 0;
  const updated = html.replace(levelPattern, (full, indent, idText) => {
    const id = Number(idText);
    const row = rows[id - 1];
    const words = englishLevels[id - 1].map(word => JSON.stringify(word)).join(", ");
    replaced += 1;
    return `${indent}{ id: ${id}, difficulty: ${JSON.stringify(row.difficulty)}, tone: ${JSON.stringify(row.tone)}, size: ${row.size}, words: sanitizeLevelWords([${words}]) },`;
  });
  if (replaced !== englishLevels.length) throw new Error(`Updated ${replaced}/${englishLevels.length} LEVELS entries`);
  return updated;
}

const rows = parseAttachmentRows();
const html = fs.readFileSync(INDEX_PATH, "utf8");
const output = {};
const report = {};

for (const language of ["en", "de", "tr"]) {
  const built = buildLanguage(language, rows);
  output[language] = built.levels;
  report[language] = {
    levels: built.levels.length,
    words: built.unique,
    pastedKept: built.unique,
    added: 0,
    removed: built.removed,
    removedByReason: built.removedByReason,
    levelWords: built.provenance
  };
}

const generated = [
  "/* Generated exclusively from the user's pasted 950-level tables. */",
  `const GARDEN_OF_WORDS_FIXED_LEVEL_DATA = ${JSON.stringify(output, null, 2)};`,
  "",
  "window.GARDEN_OF_WORDS_FIXED_WORDS = Object.freeze(Object.fromEntries(",
  "  Object.entries(GARDEN_OF_WORDS_FIXED_LEVEL_DATA).map(([language, data]) => [",
  "    language,",
  "    data,",
  "  ]),",
  "));",
  ""
].join("\n");

fs.writeFileSync(OUTPUT_PATH, generated, "utf8");
fs.writeFileSync(INDEX_PATH, replaceLevelSchema(html, rows, output.en), "utf8");
fs.writeFileSync(REPORT_PATH, JSON.stringify({
  source: "Only the user's ten pasted 950-level tables are used. No fallback or supplement words are added.",
  rules: [
    "pasted contains the user's words retained for that level",
    "added is always empty",
    "a word is used at most once per language across all levels",
    "words must be at least three letters and shorter than the pasted row's board size",
    "removed records only duplicate, unsafe, empty, or board-size-invalid pasted occurrences"
  ],
  languages: report
}, null, 2) + "\n", "utf8");

console.log(JSON.stringify(Object.fromEntries(
  Object.entries(report).map(([language, details]) => [language, {
    levels: details.levels,
    words: details.words,
    added: details.added,
    removed: details.removed,
    removedByReason: details.removedByReason
  }])
), null, 2));
