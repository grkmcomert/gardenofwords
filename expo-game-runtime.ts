import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import GAME_HTML_SOURCE from './assets/game/index.html';

type FixedWords = Record<string, string[][]>;
type GameGlobal = typeof globalThis & {
  GARDEN_OF_WORDS_FIXED_WORDS?: FixedWords;
};

// The fixed bank is the authoritative game data. Loading it into the Expo
// bundle lets the WebView receive the exact same data without changing a word
// or depending on a second JS file that the local WebView cannot resolve.
require('./assets/game/fixed-word-lists.js');

const fixedWords = (globalThis as GameGlobal).GARDEN_OF_WORDS_FIXED_WORDS;
if (!fixedWords) {
  throw new Error('Garden of Words fixed word bank did not load for Expo.');
}

const GAME_ASSET_MODULES: Record<string, number> = {
  'images/garden-of-words-logo.png': require('./assets/game/images/garden-of-words-logo.png'),
  'images/themes/moonlit.webp': require('./assets/game/images/themes/moonlit.webp'),
  'images/themes/garden.webp': require('./assets/game/images/themes/garden.webp'),
  'images/themes/autumn.webp': require('./assets/game/images/themes/autumn.webp'),
  'images/themes/seaside.webp': require('./assets/game/images/themes/seaside.webp'),
  'images/themes/rose-cottage.webp': require('./assets/game/images/themes/rose-cottage.webp'),
  'images/themes/forest-mist.webp': require('./assets/game/images/themes/forest-mist.webp'),
  'images/themes/lavender.webp': require('./assets/game/images/themes/lavender.webp'),
  'images/themes/winter-hearth.webp': require('./assets/game/images/themes/winter-hearth.webp'),
  'images/themes/dawn-garden.png': require('./assets/game/images/themes/dawn-garden.png'),
  'images/themes/rainy-greenhouse.png': require('./assets/game/images/themes/rainy-greenhouse.png'),
  'images/themes/meadowlight.png': require('./assets/game/images/themes/meadowlight.png'),
  'images/themes/orchard-walk.png': require('./assets/game/images/themes/orchard-walk.png'),
  'images/themes/tropical-grove.png': require('./assets/game/images/themes/tropical-grove.png'),
  'images/themes/sunset-terrace.png': require('./assets/game/images/themes/sunset-terrace.png'),
  'images/themes/desert-bloom.png': require('./assets/game/images/themes/desert-bloom.png'),
  'images/themes/misty-lake.png': require('./assets/game/images/themes/misty-lake.png'),
  'audio/universfield-bubble-pop-02-293341.wav': require('./assets/game/audio/universfield-bubble-pop-02-293341.wav'),
  'audio/universfield-bubble-popping-229138.wav': require('./assets/game/audio/universfield-bubble-popping-229138.wav'),
  'audio/universfield-bubble-pop-07-487896.wav': require('./assets/game/audio/universfield-bubble-pop-07-487896.wav'),
  'audio/floraphonic-marimba-win-d-1-209681.wav': require('./assets/game/audio/floraphonic-marimba-win-d-1-209681.wav'),
  'audio/floraphonic-violin-win-1-175616.wav': require('./assets/game/audio/floraphonic-violin-win-1-175616.wav'),
  'audio/floraphonic-marimba-win-b-2-209675.wav': require('./assets/game/audio/floraphonic-marimba-win-b-2-209675.wav'),
  'audio/midnight-club.mp3': require('./assets/game/audio/midnight-club.mp3'),
  'audio/cocktail-bar.mp3': require('./assets/game/audio/cocktail-bar.mp3'),
  'audio/restaurant.mp3': require('./assets/game/audio/restaurant.mp3'),
  'audio/chill-vlog-beats.mp3': require('./assets/game/audio/chill-vlog-beats.mp3'),
  'audio/echoes-of-lumen-lofi-hiphop-rainy-day-coffee-589277.mp3': require('./assets/game/audio/echoes-of-lumen-lofi-hiphop-rainy-day-coffee-589277.mp3'),
  'audio/alex-morgan-lofi-sunny-cafe-568156.mp3': require('./assets/game/audio/alex-morgan-lofi-sunny-cafe-568156.mp3'),
  'audio/alex-morgan-lofi-study-rainy-night-568166.mp3': require('./assets/game/audio/alex-morgan-lofi-study-rainy-night-568166.mp3'),
  'audio/alex-morgan-lofi-hip-hop-rhythm-rainy-night-560050.mp3': require('./assets/game/audio/alex-morgan-lofi-hip-hop-rhythm-rainy-night-560050.mp3'),
};

const NATIVE_LOGO_MODULE = require('./assets/images/garden-of-words-logo-rabbit.png');

type AssetManifest = Record<string, string>;

function contentHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function localFile(root: Directory, relativePath: string): File {
  return new File(root, ...relativePath.split('/'));
}

async function loadAsset(moduleId: number): Promise<Asset> {
  const asset = Asset.fromModule(moduleId);
  try {
    await asset.downloadAsync();
  } catch {
    // The URI remains a usable Expo Go/asset-server fallback below.
  }
  return asset;
}

async function materializeAsset(
  root: Directory,
  relativePath: string,
  moduleId: number,
  manifest: AssetManifest,
): Promise<string> {
  const asset = await loadAsset(moduleId);
  const sourceUri = asset.localUri ?? asset.uri;
  const target = localFile(root, relativePath);
  target.parentDirectory.create({ intermediates: true, idempotent: true });
  const cacheKey = `${asset.hash ?? ''}|${asset.uri}`;
  let targetReady = target.exists && manifest[relativePath] === cacheKey;

  if (!targetReady && asset.localUri) {
    try {
      if (target.exists) target.delete();
      new File(asset.localUri).copy(target);
      targetReady = target.exists;
    } catch {
      // Keep the Expo asset URI as a fallback if the native copy is unavailable.
    }
  }

  manifest[relativePath] = cacheKey;
  return targetReady ? target.uri : sourceUri;
}

export async function buildExpoGameDocument(): Promise<{
  htmlUri: string;
  logoUri: string;
  baseUrl: string;
}> {
  const gameDirectory = new Directory(Paths.cache, 'kelimeler-bahcesi-expo');
  gameDirectory.create({ intermediates: true, idempotent: true });
  const manifestFile = new File(gameDirectory, '.asset-manifest.json');
  let manifest: AssetManifest = {};
  if (manifestFile.exists) {
    try {
      manifest = JSON.parse(manifestFile.textSync()) as AssetManifest;
    } catch {
      manifest = {};
    }
  }

  const entries = Object.entries(GAME_ASSET_MODULES);
  const resolvedEntries = await Promise.all(
    entries.map(async ([pathName, moduleId]) => [
      pathName,
      await materializeAsset(gameDirectory, pathName, moduleId, manifest),
    ] as const),
  );

  const logoUri = await materializeAsset(
    gameDirectory,
    'images/garden-of-words-logo-rabbit.png',
    NATIVE_LOGO_MODULE,
    manifest,
  );

  let html = GAME_HTML_SOURCE.replace(
    /<script\s+src=["']fixed-word-lists\.js["']><\/script>/i,
    `<script>window.GARDEN_OF_WORDS_FIXED_WORDS = Object.freeze(${JSON.stringify(fixedWords)});</script>`,
  );

  for (const [pathName, uri] of resolvedEntries) {
    html = html.split(pathName).join(uri);
  }

  manifestFile.create({ intermediates: true, overwrite: true });
  manifestFile.write(JSON.stringify(manifest));

  // A fixed file:// URL can keep the previous document alive in WKWebView or
  // Android WebView even after the cache file is overwritten. A content-based
  // filename makes every changed HTML bundle a new WebView document.
  const htmlFile = new File(gameDirectory, `index-${contentHash(html)}.html`);
  htmlFile.create({ intermediates: true, overwrite: true });
  htmlFile.write(html);

  return {
    htmlUri: htmlFile.uri,
    logoUri,
    baseUrl: gameDirectory.uri,
  };
}
