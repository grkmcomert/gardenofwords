import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kelimeler_bahcesi_webview/generated/game_document.g.dart';

import '../tooling/build_shorebird_game.dart' as generator;

void main() {
  test('generated game matches editable sources', () {
    generator.main(['--check']);
    expect(exitCode, 0, reason: 'Regenerate the game before building a patch.');
  });

  test(
    'game includes executable local word lists and all existing bridges',
    () {
      final html = decodeGameDocument();
      final words = File('assets/game/fixed-word-lists.js')
          .readAsStringSync()
          .replaceAll(RegExp('</script', caseSensitive: false), r'<\/script');
      expect(html, startsWith('<!doctype html>'));
      expect(html, contains(words));
      expect(html, isNot(contains('src="fixed-word-lists.js"')));
      for (final bridge in [
        'FlutterAdMob',
        'FlutterRevenueCat',
        'FlutterTheme',
        'FlutterPrivacy',
        'FlutterGameReady',
        'FlutterAudio',
      ]) {
        expect(html, contains(bridge));
      }
      expect(html, contains('localStorage'));
      expect(html, isNot(contains('sb_api_')));
    },
  );

  test('Shorebird assets exclude editable HTML and JavaScript', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('    - shorebird.yaml'));
    expect(pubspec, contains('    - assets/game/shorebird_bootstrap.html'));
    expect(pubspec, isNot(contains('    - assets/game/\n')));
    expect(pubspec, isNot(contains('    - assets/game/index.html')));
    expect(pubspec, isNot(contains('    - assets/game/fixed-word-lists.js')));
  });
}
