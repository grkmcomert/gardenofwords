const fs = require('fs');
const path = require('path');

/**
 * Metro treats .html files as binary assets. The game needs the document as a
 * string so its local media can be rewritten to file:// URIs before it enters
 * react-native-webview. Keep this transform scoped to the game document.
 */
module.exports = function inlineHtmlImport({ types: t }) {
  return {
    name: 'inline-game-html-import',
    visitor: {
      ImportDeclaration(importPath, state) {
        const source = importPath.node.source.value;
        if (!source.replace(/\\/g, '/').endsWith('/assets/game/index.html')) {
          return;
        }

        const defaultSpecifier = importPath.node.specifiers.find((specifier) =>
          t.isImportDefaultSpecifier(specifier),
        );
        if (!defaultSpecifier) return;

        const filename = state.file?.opts?.filename;
        if (!filename) {
          throw importPath.buildCodeFrameError(
            'The game HTML import requires a source filename.',
          );
        }

        const htmlPath = path.resolve(path.dirname(filename), source);
        const html = fs.readFileSync(htmlPath, 'utf8');
        importPath.replaceWith(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(defaultSpecifier.local.name),
              t.stringLiteral(html),
            ),
          ]),
        );
      },
    },
  };
};
