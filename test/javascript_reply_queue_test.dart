import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:kelimeler_bahcesi_webview/javascript_reply_queue.dart';

void main() {
  test(
    'payment success and cancellation survive a StoreKit inactive phase',
    () async {
      var active = false;
      final delivered = <String>[];
      final queue = JavaScriptReplyQueue(
        canSend: () => active,
        send: (script) async {
          delivered.add(script);
          return true;
        },
      );
      queue.add('premium success');
      queue.add('purchase cancelled');
      await queue.flush();
      expect(delivered, isEmpty);
      active = true;
      await queue.flush();
      await queue.flush();
      expect(delivered, ['premium success', 'purchase cancelled']);
      queue.clear();
    },
  );

  test(
    'pause during delivery preserves later hint reply without duplication',
    () async {
      var active = true;
      final delivery = Completer<bool>();
      final delivered = <String>[];
      final queue = JavaScriptReplyQueue(
        canSend: () => active,
        send: (script) async {
          delivered.add(script);
          if (script == 'premium') return delivery.future;
          return true;
        },
      );
      queue.add('premium');
      queue.add('hints');
      active = false;
      delivery.complete(true);
      await queue.flush();
      expect(delivered, ['premium']);
      active = true;
      await queue.flush();
      expect(delivered, ['premium', 'hints']);
      queue.clear();
    },
  );

  test(
    'failed WebView evaluation is retained and disposal clears it',
    () async {
      var succeeds = false;
      var deliveries = 0;
      final queue = JavaScriptReplyQueue(
        canSend: () => true,
        send: (_) async {
          if (succeeds) deliveries++;
          return succeeds;
        },
      );
      queue.add('hints');
      await queue.flush();
      succeeds = true;
      await queue.flush();
      expect(deliveries, 1);
      queue.clear();
      await queue.flush();
      expect(deliveries, 1);
    },
  );
}
