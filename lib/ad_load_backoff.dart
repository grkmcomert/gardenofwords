/// Shared by every caller for one ad unit, including preload and show requests.
class AdLoadBackoff {
  AdLoadBackoff({DateTime Function()? now}) : _now = now ?? DateTime.now;

  final DateTime Function() _now;
  DateTime? _retryAt;
  int _failures = 0;
  bool _loading = false;

  /// [force] is for a show the player is waiting on: it skips the cooldown
  /// (still never two loads at once). Callers bound how often they force.
  bool tryStart({bool force = false}) {
    if (_loading ||
        (!force && _retryAt != null && _now().isBefore(_retryAt!))) {
      return false;
    }
    _loading = true;
    return true;
  }

  /// Time left before an unforced load may start again.
  Duration get retryIn {
    final at = _retryAt;
    if (at == null) return Duration.zero;
    final left = at.difference(_now());
    return left.isNegative ? Duration.zero : left;
  }

  void succeeded() {
    _loading = false;
    _failures = 0;
    _retryAt = null;
  }

  void failed() {
    _loading = false;
    // 30, 60, 120, 240, then 300 seconds. Tapping repeatedly cannot shorten it.
    final seconds = (30 * (1 << _failures.clamp(0, 4))).clamp(30, 300);
    _failures++;
    _retryAt = _now().add(Duration(seconds: seconds));
  }
}
