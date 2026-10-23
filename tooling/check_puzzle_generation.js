// Run with: node tooling/check_puzzle_generation.js
// Exercise the shipped generators and validator, without native/network mocks
// changing their behaviour. Fixed seeds make a failed layout reproducible.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const gameDirectory = path.resolve(__dirname, '../assets/game');
const html = fs.readFileSync(path.join(gameDirectory, 'index.html'), 'utf8');
function section(from, to) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start + from.length);
  assert(start >= 0 && end > start, `Missing runtime section: ${from}`);
  return html.slice(start, end);
}
const constantNames = [
  'SUPPORTED_LANGUAGES', 'LANGUAGE_LOCALES', 'PUZZLE_FORMAT_VERSION',
  'BOARD_SIZE_BONUS', 'MAX_BOARD_SIZE',
];
const constants = constantNames.map(name => {
  const match = html.match(new RegExp(`    const ${name} = [^\\n]+;`));
  assert(match, `Missing runtime constant: ${name}`);
  return match[0];
}).join('\n');
const source = [
  constants,
  'let currentLanguage = "en";',
  section('    const ACCIDENTAL_WORD_DATA =', '    /* ---------- Achievements'),
  section('    function effectiveLevelSize(', '    function displayDifficulty('),
  section('    function sameWordSet(', '    // ---- Self-audit tool'),
  section('    function buildFillerLetters(', '    function clearBoardLoadRetry('),
].join('\n');

function runtime(seed) {
  let state = seed >>> 0;
  const seededMath = Object.create(Math);
  seededMath.random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const context = vm.createContext({
    Math: seededMath,
    navigator: { userAgent: 'iPad', hardwareConcurrency: 4 },
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(gameDirectory, 'fixed-word-lists.js'), 'utf8'), context);
  vm.runInContext(source, context);
  return context;
}

const contract = runtime(42);
// Three-letter accidents must have a positive score, even without a longer
// dictionary word on the board. This formerly disagreed with validation.
const accidentalGrid = [['C', 'A', 'T'], ['Q', 'X', 'Z'], ['J', 'Q', 'X']];
assert(contract.findAccidentalWords(accidentalGrid, 3, []).length > 0);
assert(contract.scoreAccidentalWords(accidentalGrid, 3, []) > 0);

// Legitimate fragments are allowed; a duplicate elsewhere is rejected, in
// both directions. An empty square must break a word during partial filling.
const cat = { word: 'CAT', row: 0, col: 0, dr: 0, dc: 1 };
const ctx = contract.createAccidentalScoreContext(['CAT'], [cat], 'en');
assert.equal(contract.hasAccidentalWordAt([['C', 'A', 'T'], ['', '', ''], ['', '', '']], 3, 0, 1, ctx), false);
assert.equal(contract.hasAccidentalWordAt([['C', '', 'T'], ['', '', ''], ['', '', '']], 3, 0, 0, ctx), false);
for (const row of [['C', 'A', 'T'], ['T', 'A', 'C']]) {
  const duplicate = [['C', 'A', 'T'], ['', '', ''], row];
  assert.equal(contract.hasAccidentalWordAt(duplicate, 3, 2, 1, ctx), true);
  assert.equal(contract.fillGridWithFillerLetters(duplicate, 3, ['Q', 'X', 'Z'], ctx), null);
}
const river = { word: 'RIVER', row: 0, col: 0, dr: 0, dc: 1 };
const riverGrid = [['R', 'I', 'V', 'E', 'R'], ...Array.from({ length: 4 }, () => Array(5).fill(''))];
const riverCtx = contract.createAccidentalScoreContext(['RIVER'], [river], 'en');
assert.equal(contract.hasAccidentalWordAt(riverGrid, 5, 0, 2, riverCtx), false);

let total = 0;
for (const seed of [42, 20260904]) {
  const context = runtime(seed);
  const levels = vm.runInContext('LEVELS', context);
  assert.equal(levels.length, 950);
  for (const language of ['en', 'tr', 'de']) {
    context.applyFixedLevelWords(language);
    for (const generator of ['generatePuzzleFast', 'generatePuzzle']) {
      const timings = [];
      const check = level => {
        const start = performance.now();
        let puzzle;
        try {
          puzzle = context[generator](level, language);
        } catch (error) {
          throw new Error(`${language} bed ${level.id}, ${generator}, seed ${seed}: ${error.message}`);
        }
        timings.push(performance.now() - start);
        assert(context.validatePuzzleForLevel(puzzle, level, language),
          `Invalid puzzle: ${language} bed ${level.id}, ${generator}, seed ${seed}`);
        total += 1;
        return puzzle;
      };
      levels.forEach(check);
      // The review's first-bed failure gets repeated new layouts as well as
      // the all-level sweep. Returning one cached board must not pass.
      const layouts = new Set();
      for (let repeat = 0; repeat < 50; repeat += 1) {
        layouts.add(JSON.stringify(check(levels[0]).grid));
      }
      assert(layouts.size > 1, 'Starting a bed must produce fresh layouts');
      timings.sort((a, b) => a - b);
      console.log(JSON.stringify({
        seed, language, generator, passed: timings.length,
        p95Ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
        maxMs: Math.round(timings[timings.length - 1]),
      }));
    }
  }
}
console.log(`PASS: ${total} valid puzzles; accidental-word and fresh-layout checks passed.`);
