const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const replacement = `const resolveAssetSource = (source: any) => {
  if (!source) return null;
  if (typeof source === 'number') {
    return Image.resolveAssetSource ? Image.resolveAssetSource(source) : source;
  }
  return source;
};`;

for (const platform of ['android', 'ios']) {
  const filePath = path.join(
    root,
    'node_modules',
    'react-native-webview',
    'src',
    `WebView.${platform}.tsx`,
  );

  if (!fs.existsSync(filePath)) {
    console.log(`react-native-webview ${platform} source not present; skipping.`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const marker = 'const { resolveAssetSource } = Image;';
  if (content.includes(marker)) {
    fs.writeFileSync(filePath, content.replace(marker, replacement));
    console.log(`Patched react-native-webview ${platform} asset resolver.`);
  } else if (content.includes('const resolveAssetSource = (source: any)')) {
    console.log(`react-native-webview ${platform} asset resolver already patched.`);
  } else {
    console.log(`react-native-webview ${platform} source has changed; skipping.`);
  }
}
