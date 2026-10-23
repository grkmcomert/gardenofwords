import 'dart:async';
import 'dart:collection';

/// Purchase/ad replies must survive an inactive WebView (e.g. a StoreKit sheet).
/// Unlike animation updates, dropping one leaves a JavaScript promise pending.
class JavaScriptReplyQueue {
  JavaScriptReplyQueue({required this.canSend, required this.send});

  final bool Function() canSend;
  final Future<bool> Function(String) send;
  final _pending = Queue<String>();
  Future<void>? _flushing;
  Timer? _retryTimer;
  int _retryCount = 0;

  void add(String script) {
    _pending.add(script);
    _retryCount = 0;
    unawaited(flush());
  }

  Future<void> flush() {
    if (_flushing != null) return _flushing!;
    final future = _flush();
    _flushing = future;
    return future.whenComplete(() {
      _flushing = null;
      if (_pending.isNotEmpty && canSend() && _retryCount < 3) {
        _retryTimer?.cancel();
        _retryTimer = Timer(const Duration(milliseconds: 250), () {
          _retryCount++;
          unawaited(flush());
        });
      }
    });
  }

  Future<void> _flush() async {
    while (_pending.isNotEmpty && canSend()) {
      final script = _pending.first;
      if (!await send(script)) return;
      if (_pending.isNotEmpty && identical(_pending.first, script)) {
        _pending.removeFirst();
      }
    }
  }

  void clear() {
    _pending.clear();
    _retryTimer?.cancel();
  }
}
