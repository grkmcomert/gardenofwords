import 'package:flutter_test/flutter_test.dart';
import 'package:kelimeler_bahcesi_webview/ad_load_backoff.dart';

void main() {
  test('concurrent and repeated requests respect escalating cooldown', () {
    var now = DateTime(2026);
    final backoff = AdLoadBackoff(now: () => now);
    for (final seconds in [30, 60, 120, 240, 300, 300]) {
      expect(backoff.tryStart(), isTrue);
      expect(backoff.tryStart(), isFalse);
      backoff.failed();
      now = now.add(Duration(seconds: seconds - 1));
      for (var tap = 0; tap < 10; tap++) {
        expect(backoff.tryStart(), isFalse);
      }
      now = now.add(const Duration(seconds: 1));
    }
    expect(backoff.tryStart(), isTrue);
    backoff.succeeded();
    expect(backoff.tryStart(), isTrue);
    backoff.failed();
    now = now.add(const Duration(seconds: 30));
    expect(backoff.tryStart(), isTrue);
  });
}
