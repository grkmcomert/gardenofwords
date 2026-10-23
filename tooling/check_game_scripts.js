const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('assets/game/index.html', 'utf8');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/type\s*=\s*["']application\/json["']/i.test(match[1]));
const errors = [];
scripts.forEach((match, index) => {
  try {
    new vm.Script(match[2], { filename: `assets/game/index.html:inline-script-${index + 1}` });
  } catch (error) {
    errors.push({ script: index + 1, message: error.message });
  }
});
const report = { scriptsChecked: scripts.length, errors };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
