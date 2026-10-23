import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kelimeler_bahcesi_webview/revenuecat_service.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

class _TestService extends RevenueCatService {
  _TestService() : super.forTesting();

  @override
  bool get isSupportedPlatform => true;
}

Map<String, dynamic> infoJson({bool premium = false, int second = 0}) => {
  'entitlements': {
    'all': {},
    'active': {
      if (premium)
        'Garden of Words Pro': {
          'identifier': 'Garden of Words Pro',
          'isActive': true,
          'willRenew': true,
          'latestPurchaseDate': '2026-09-05T12:00:00Z',
          'originalPurchaseDate': '2026-09-05T12:00:00Z',
          'productIdentifier': 'monthly',
          'isSandbox': true,
        },
    },
  },
  'allPurchaseDates': {},
  'activeSubscriptions': [],
  'allPurchasedProductIdentifiers': [],
  'nonSubscriptionTransactions': [],
  'firstSeen': '2026-09-05T12:00:00Z',
  'originalAppUserId': 'test-customer',
  'allExpirationDates': {},
  'requestDate': '2026-09-05T12:00:${second.toString().padLeft(2, '0')}Z',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('purchases_flutter');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test(
    'first purchase invalidates stale cache before entitlement retry',
    () async {
      final calls = <String>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        if (call.method == 'getCustomerInfo') {
          return infoJson(premium: true, second: 1);
        }
        return null;
      });
      final service = _TestService();
      final confirmed = await service.refreshCustomerInfoAfterTransaction(
        CustomerInfo.fromJson(infoJson()),
      );
      expect(service.hasProEntitlement(confirmed), isTrue);
      expect(calls, ['invalidateCustomerInfoCache', 'getCustomerInfo']);
    },
  );

  test(
    'late pre-purchase snapshot cannot revoke a confirmed Premium',
    () async {
      final service = _TestService();
      await service.refreshCustomerInfoAfterTransaction(
        CustomerInfo.fromJson(infoJson(premium: true, second: 2)),
      );
      final stale = await service.refreshCustomerInfoAfterTransaction(
        CustomerInfo.fromJson(infoJson()),
        expectPremium: false,
      );
      expect(service.hasProEntitlement(stale), isTrue);
      final expired = await service.refreshCustomerInfoAfterTransaction(
        CustomerInfo.fromJson(infoJson(second: 3)),
        expectPremium: false,
      );
      expect(service.hasProEntitlement(expired), isFalse);
    },
  );

  test(
    'hint transactions do not grant Premium or poll for an entitlement',
    () async {
      messenger.setMockMethodCallHandler(
        channel,
        (call) async => fail('Unexpected ${call.method}'),
      );
      final service = _TestService();
      final info = await service.refreshCustomerInfoAfterTransaction(
        CustomerInfo.fromJson(infoJson()),
        expectPremium: false,
      );
      expect(service.customerInfoPayload(info)['isPro'], false);
    },
  );

  test(
    'restore uses the restored customer and refreshes its stale cache',
    () async {
      final calls = <String>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        if (call.method == 'restorePurchases') return infoJson();
        if (call.method == 'getCustomerInfo') {
          return infoJson(premium: true, second: 4);
        }
        return null;
      });
      final service = _TestService();
      expect(service.hasProEntitlement(await service.restorePurchases()), true);
      expect(calls, [
        'restorePurchases',
        'invalidateCustomerInfoCache',
        'getCustomerInfo',
      ]);
    },
  );
}
