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

  test('a show the player waits on may skip the cooldown, never overlap', () {
    var now = DateTime(2026);
    final backoff = AdLoadBackoff(now: () => now);
    expect(backoff.tryStart(), isTrue);
    backoff.failed();
    expect(backoff.retryIn, const Duration(seconds: 30));
    expect(backoff.tryStart(), isFalse);
    expect(backoff.tryStart(force: true), isTrue);
    expect(backoff.tryStart(force: true), isFalse);
    backoff.failed();
    now = now.add(const Duration(seconds: 70));
    expect(backoff.retryIn, Duration.zero);
    expect(backoff.tryStart(), isTrue);
  });
}
