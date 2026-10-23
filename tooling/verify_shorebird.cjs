// Run with Node.js. Validates CI YAML, generated JS and the file-origin loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const yaml = require('js-yaml');

async function main() {
  const config = yaml.load(fs.readFileSync('codemagic.yaml', 'utf8'));
  const workflows = Object.values(config.workflows);
  assert.equal(workflows.length, 2);
  const outputDir = path.resolve('build/shorebird-validation');
  fs.mkdirSync(outputDir, { recursive: true });
  const bash = process.env.BASH_BINARY || (process.platform === 'win32'
    ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
  for (const [workflowIndex, workflow] of workflows.entries()) {
    assert(workflow.environment.vars.SHOREBIRD_TOKEN);
    for (const [index, step] of workflow.scripts.entries()) {
      assert.deepEqual(Object.keys(step).sort(), ['name', 'script']);
      const filename = path.join(outputDir, `step-${workflowIndex}-${index}.sh`);
      fs.writeFileSync(filename, step.script);
      const checked = spawnSync(bash, ['-n', filename], { encoding: 'utf8' });
      assert.equal(checked.status, 0, checked.stderr);
    }
  }
  assert(!config.workflows['kelimeler-bahcesi-ios-patch'].publishing);
  const generated = fs.readFileSync('lib/generated/game_document.g.dart', 'utf8');
  const encoded = [...generated.matchAll(/^\s*'([A-Za-z0-9+/=]+)'$/gm)]
    .map(match => match[1]).join('');
  const html = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
  let count = 0;
  for (const script of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type\s*=\s*["']application\/json["']/i.test(script[1])) continue;
    new vm.Script(script[2]);
    count++;
  }
  console.log(`YAML parsed; ${workflows.length} workflows and ${count} game scripts validated.`);

  const browserBinary = process.env.CHROME_BINARY ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = fs.mkdtempSync(path.join(outputDir, 'browser-'));
  const browser = spawn(browserBinary, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) await pause(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (!pending.has(data.id)) return;
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    await send('Page.addScriptToEvaluateOnNewDocument', { source:
      'window.FlutterGameContent={postMessage(){window.__requested=true;}};' });
    const gameUrl = name => pathToFileURL(path.resolve(`assets/game/${name}`)).href;
    await send('Page.navigate', { url: gameUrl('index.html') });
    for (let n = 0; n < 100; n++) {
      if (await evaluate('document.readyState === "complete"')) break;
      await pause(100);
    }
    await evaluate('localStorage.setItem("shorebird-origin-test", "preserved")');
    await send('Page.navigate', { url: gameUrl('shorebird_bootstrap.html') });
    for (let n = 0; n < 100; n++) {
      if (await evaluate('window.__requested === true')) break;
      await pause(100);
    }
    assert.equal(await evaluate('window.__requested'), true);
    await evaluate(`document.open();document.write(${JSON.stringify(html)});document.close();`);
    for (let n = 0; n < 100; n++) {
      if (await evaluate('document.documentElement.classList.contains("app-ready")')) break;
      await pause(100);
    }
    assert.equal(await evaluate('document.documentElement.classList.contains("app-ready")'), true);
    assert.equal(await evaluate('localStorage.getItem("shorebird-origin-test")'), 'preserved');
    assert.equal(await evaluate('location.href'), gameUrl('shorebird_bootstrap.html'));
    assert.equal(await evaluate('new URL("images/garden-of-words-logo.png",document.baseURI).href'),
      gameUrl('images/garden-of-words-logo.png'));
    assert.equal(await evaluate(`document.querySelectorAll('script[src="fixed-word-lists.js"]').length`), 0);
    console.log('Browser: game boots offline, localStorage survives, relative media paths are preserved.');
    await evaluate(`
      window.FlutterRevenueCat = { postMessage(raw) {
        const message = JSON.parse(raw);
        window.__revenueCatResolve(message.id, {});
      } };
      setPremiumOverrideEnabled(false);
      window.__nativeRevenueCatState = {isPro: false, isResolved: true};
      setFirebaseManualPremium(true);
    `);
    assert.equal(await evaluate('isPremiumUser()'), true);
    assert.equal(await evaluate('applyGameTheme("garden")'), true);
    assert.equal(await evaluate('document.body.dataset.gameTheme'), 'garden');
    assert.equal(await evaluate('document.querySelectorAll(".game-theme-card.is-locked").length'), 0);
    await evaluate('setFirebaseManualPremium(false)');
    assert.equal(await evaluate('isPremiumUser()'), false);
    assert.equal(await evaluate('document.body.dataset.gameTheme'), 'moonlit');
    assert.equal(await evaluate('applyGameTheme("garden")'), false);
    await evaluate('window.__setNativeRevenueCatState({isPro: true, isResolved: true}); setFirebaseManualPremium(false)');
    assert.equal(await evaluate('isPremiumUser()'), true);
    assert.equal(await evaluate('applyGameTheme("garden")'), true);
    console.log('Browser: manual Premium unlocks themes; revocation restores locks and preserves purchased Premium.');
  } finally {
    if (socket) socket.close();
    browser.kill();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
