const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('assets/game/index.html', 'utf8');
const context = {};
vm.runInNewContext(fs.readFileSync('assets/game/fixed-word-lists.js', 'utf8'), context);
const fixed = context.GARDEN_OF_WORDS_FIXED_WORDS;
const levels = [...html.matchAll(/^\s*\{ id: (\d+), difficulty: "([^"]+)", tone: "([^"]+)", size: (\d+), words:/gm)]
  .map(match => ({ id: Number(match[1]), size: Number(match[4]), count: match[3] === 'easy' ? 4 : match[3] === 'medium' ? 5 : match[3] === 'hard' ? 5 : 6 }));
const unsafeWords = {
  en: new Set(['ASS', 'ASSHOLE', 'BASTARD', 'BITCH', 'COCK', 'CUNT', 'DAMN', 'DICK', 'DILDO', 'FUCK', 'FUCKIN', 'FUCKING', 'IDIOT', 'JERK', 'NIGGER', 'PISS', 'PORN', 'PUSSY', 'SEXUAL', 'SHIT', 'SLUT', 'SUCKS', 'TWAT', 'WANK', 'WHORE']),
  de: new Set(['ARSCH', 'BASTARD', 'DUMM', 'FICK', 'FICKEN', 'HURE', 'HURENSOHN', 'IDIOT', 'NIGGER', 'SCHLAMPE', 'SCHEISSE', 'WICHSER']),
  tr: new Set(['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK']),
};
const unsafePrefixes = {
  en: ['FUCK', 'PISS', 'SHIT', 'BULLSHIT', 'BASTARD', 'IDIOT', 'JERK', 'SUCK', 'WHORE', 'BITCH', 'CUNT', 'SLUT', 'TWAT', 'WANK', 'DICK'],
  de: ['FUCK', 'GEFICK', 'ARSCH', 'BASTARD', 'VERARSCH', 'VERPISS', 'SCHEISS', 'FICK', 'HURE', 'IDIOT', 'DUMM', 'SCHLAMP', 'WICHS'],
  tr: ['AMK', 'APTAL', 'BOK', 'GÖT', 'KAHPE', 'OROSPU', 'PİÇ', 'POK', 'SALAK', 'SİK', 'SİKTİR', 'ŞEREFSİZ', 'YARRAK'],
};
const safeFixedWords = { en: new Set(), de: new Set(), tr: new Set(['BOKSER', 'BOKSÖR', 'BOKSİT']) };
const errors = [];
for (const language of ['en', 'de', 'tr']) {
  for (const level of levels) {
    for (const word of fixed[language][level.id - 1]) {
      const unsafe = !safeFixedWords[language].has(word)
        && (unsafeWords[language].has(word) || unsafePrefixes[language].some(prefix => word.startsWith(prefix)));
      if (unsafe) errors.push(`${language} level ${level.id}: ${word}`);
    }
  }
}
console.log(JSON.stringify({ runtimeUnsafeMatches: errors.length, samples: errors.slice(0, 20) }, null, 2));
if (errors.length) process.exitCode = 1;
