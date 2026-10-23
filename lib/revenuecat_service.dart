import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';

/// Centralizes RevenueCat setup and subscription operations for Garden of Words.
///
/// For a release build, pass the production platform keys with:
/// `--dart-define=REVENUECAT_IOS_API_KEY=appl_...`
/// and `--dart-define=REVENUECAT_ANDROID_API_KEY=goog_...`.
class RevenueCatService {
  RevenueCatService._();

  @visibleForTesting
  RevenueCatService.forTesting() : _configured = true;

  static final RevenueCatService instance = RevenueCatService._();

  static const String entitlementId = String.fromEnvironment(
    'REVENUECAT_ENTITLEMENT_ID',
    defaultValue: 'Garden of Words Pro',
  );
  static const Set<String> entitlementAliases = {
    'gardenofwordspro',
    'gardenofwordspremium',
    'premium',
    'pro',
  };
  static const Map<String, int> hintPackAmounts = {
    'hints10': 10,
    'hints25': 25,
    'hints50': 50,
  };
  static const Map<String, Set<String>> hintPackProductIds = {
    // These must match the Product IDs configured in App Store Connect.
    'hints10': {'10hint'},
    'hints25': {'25hints'},
    'hints50': {'50hints'},
  };
  static const Map<String, String> hintPackStoreProductIds = {
    'hints10': '10hint',
    'hints25': '25hints',
    'hints50': '50hints',
  };
  static const String _legacyApiKey = String.fromEnvironment(
    'REVENUECAT_API_KEY',
    defaultValue: '',
  );
  static const String _iosApiKey = String.fromEnvironment(
    'REVENUECAT_IOS_API_KEY',
    defaultValue: 'appl_TwZzaGZfrNEPGfEzKViMpApKPPf',
  );
  static const String _androidApiKey = String.fromEnvironment(
    'REVENUECAT_ANDROID_API_KEY',
    defaultValue: _legacyApiKey,
  );

  Future<void>? _configurationFuture;
  bool _configured = false;

  CustomerInfo? _customerInfo;
  Offerings? _offerings;
  List<StoreProduct> _hintProducts = const <StoreProduct>[];

  /// Set by the WebView host so premium changes can immediately update the
  /// game UI and remove any already-visible ad banner.
  void Function(CustomerInfo info)? onCustomerInfoChanged;

  CustomerInfo? get customerInfo => _customerInfo;
  Offerings? get offerings => _offerings;
  bool get isSupportedPlatform => Platform.isAndroid || Platform.isIOS;

  String get _apiKey => Platform.isIOS ? _iosApiKey : _androidApiKey;

  Future<void> configure() async {
    if (_configured) return;

    final inFlight = _configurationFuture;
    if (inFlight != null) {
      await inFlight;
      return;
    }

    final future = _configure();
    _configurationFuture = future;
    try {
      await future;
    } finally {
      if (!_configured) _configurationFuture = null;
    }
  }

  Future<void> _configure() async {
    if (!isSupportedPlatform) return;
    if (_apiKey.isEmpty) {
      throw StateError(
        'Missing the production RevenueCat API key for ${Platform.operatingSystem}. '
        'Pass it with --dart-define=REVENUECAT_${Platform.operatingSystem.toUpperCase()}_API_KEY=...',
      );
    }

    try {
      if (await Purchases.isConfigured) {
        _configured = true;
      } else {
        await Purchases.setLogLevel(
          kDebugMode ? LogLevel.debug : LogLevel.info,
        );
        await Purchases.configure(PurchasesConfiguration(_apiKey));
        _configured = true;
      }

      Purchases.addCustomerInfoUpdateListener(_handleCustomerInfoUpdate);
      // The SDK is ready now. Refresh entitlements in the background so a
      // slow network cannot hold the WebView's branded loading screen open.
      unawaited(_refreshCustomerInfoInBackground());
    } catch (error, stackTrace) {
      debugPrint('RevenueCat configuration failed: $error');
      debugPrintStack(stackTrace: stackTrace);
      rethrow;
    }
  }

  Future<void> _refreshCustomerInfoInBackground() async {
    try {
      await refreshCustomerInfo();
    } catch (error) {
      // Configuration is still valid when the first network refresh fails;
      // later SDK calls can retry using RevenueCat's cache/network handling.
      debugPrint('RevenueCat initial customer info refresh failed: $error');
    }
  }

  Future<CustomerInfo> refreshCustomerInfo({bool forceRefresh = false}) async {
    await _ensureConfigured();
    if (forceRefresh) await Purchases.invalidateCustomerInfoCache();
    final info = await Purchases.getCustomerInfo();
    _handleCustomerInfoUpdate(info);
    return _customerInfo!;
  }

  bool hasProEntitlement([CustomerInfo? info]) {
    final currentInfo = info ?? _customerInfo;
    final activeIds = currentInfo?.entitlements.active.keys ?? const <String>[];
    final configuredId = _normaliseEntitlementId(entitlementId);
    return activeIds.any((id) {
      final normalizedId = _normaliseEntitlementId(id);
      return normalizedId == configuredId ||
          entitlementAliases.contains(normalizedId);
    });
  }

  /// RevenueCat can return the purchase before its entitlement appears in
  /// CustomerInfo, especially in StoreKit Sandbox. Re-read a few times so the
  /// WebView receives the actual Premium state instead of a stale false.
  Future<CustomerInfo> refreshCustomerInfoAfterTransaction(
    CustomerInfo initial, {
    bool expectPremium = true,
  }) async {
    _handleCustomerInfoUpdate(initial);
    if (!expectPremium || hasProEntitlement()) return _customerInfo!;

    var latest = initial;
    for (var attempt = 0; attempt < 4; attempt++) {
      await Future<void>.delayed(Duration(milliseconds: 400 * (1 << attempt)));
      try {
        latest = await refreshCustomerInfo(forceRefresh: true);
        if (hasProEntitlement(latest)) return latest;
      } catch (error) {
        debugPrint(
          'RevenueCat transaction refresh ${attempt + 1} failed: $error',
        );
      }
    }
    return _customerInfo ?? latest;
  }

  Future<Offerings> getOfferings() async {
    await _ensureConfigured();
    final result = await Purchases.getOfferings();
    _offerings = result;
    try {
      _hintProducts = await Purchases.getProducts(
        hintPackStoreProductIds.values.toList(),
        productCategory: ProductCategory.nonSubscription,
      );
    } catch (error) {
      debugPrint('RevenueCat hint products unavailable: $error');
      _hintProducts = const <StoreProduct>[];
    }
    return result;
  }

  Future<PurchaseResult> purchasePlan(String plan) async {
    await _ensureConfigured();

    final hintProductId = hintPackStoreProductIds[plan];
    if (hintProductId != null) {
      final products = await Purchases.getProducts(<String>[
        hintProductId,
      ], productCategory: ProductCategory.nonSubscription);
      final product = products.cast<StoreProduct?>().firstWhere(
        (item) => item?.identifier.toLowerCase() == hintProductId,
        orElse: () => null,
      );
      if (product == null) {
        throw StateError(
          'The hint product "$hintProductId" is not available in the store.',
        );
      }
      final result = await Purchases.purchase(
        PurchaseParams.storeProduct(product),
      );
      _handleCustomerInfoUpdate(result.customerInfo);
      return result;
    }

    final currentOffering = (await getOfferings()).current;

    if (currentOffering == null) {
      throw StateError(
        'No current RevenueCat offering is configured. '
        'Create and mark an offering as current in the RevenueCat dashboard.',
      );
    }

    final package = _packageForPlan(currentOffering, plan);

    if (package == null) {
      throw StateError(
        'The current offering does not contain the "$plan" package.',
      );
    }

    final result = await Purchases.purchase(PurchaseParams.package(package));
    _handleCustomerInfoUpdate(result.customerInfo);
    return result;
  }

  int? hintAmountForPlan(String plan) => hintPackAmounts[plan];

  Future<CustomerInfo> restorePurchases() async {
    await _ensureConfigured();
    final info = await Purchases.restorePurchases();
    return refreshCustomerInfoAfterTransaction(info);
  }

  Future<PaywallResult> presentPaywall() async {
    await _ensureConfigured();
    return RevenueCatUI.presentPaywall();
  }

  Future<PaywallResult> presentPaywallIfNeeded() async {
    await _ensureConfigured();
    return RevenueCatUI.presentPaywallIfNeeded(entitlementId);
  }

  Future<void> presentCustomerCenter() async {
    await _ensureConfigured();
    await RevenueCatUI.presentCustomerCenter(
      onRestoreCompleted: _handleCustomerInfoUpdate,
      onRestoreFailed: (error) {
        debugPrint('RevenueCat Customer Center restore failed: $error');
      },
    );
  }

  Future<void> logIn(String appUserId) async {
    await _ensureConfigured();
    final result = await Purchases.logIn(appUserId);
    _handleCustomerInfoUpdate(result.customerInfo);
  }

  Future<void> logOut() async {
    await _ensureConfigured();
    final info = await Purchases.logOut();
    _handleCustomerInfoUpdate(info);
  }

  Map<String, dynamic> customerInfoPayload([CustomerInfo? info]) {
    final currentInfo = info ?? _customerInfo;
    return {
      'isPro': hasProEntitlement(currentInfo),
      'isResolved': currentInfo != null,
      'entitlementId': entitlementId,
      'activeEntitlements':
          currentInfo?.entitlements.active.keys.toList() ?? <String>[],
      'appUserId': currentInfo?.originalAppUserId,
      'managementUrl': currentInfo?.managementURL,
    };
  }

  Map<String, dynamic> offeringsPayload([Offerings? value]) {
    final currentOffering = (value ?? _offerings)?.current;
    if (currentOffering == null) {
      return {
        'offeringId': null,
        'plans': <Map<String, dynamic>>[],
        'hintPackages': _hintProducts
            .map((product) {
              final plan = _hintPlanForProductId(product.identifier);
              return plan == null ? null : _storeProductPayload(plan, product);
            })
            .whereType<Map<String, dynamic>>()
            .toList(),
      };
    }

    final plans = <Map<String, dynamic>>[];
    for (final entry in <String, Package?>{
      'lifetime': currentOffering.lifetime,
      'weekly': currentOffering.weekly,
      'yearly': currentOffering.annual,
      'monthly': currentOffering.monthly,
    }.entries) {
      final package = entry.value;
      if (package == null) continue;
      plans.add(_packagePayload(entry.key, package));
    }

    final hintPackagesByPlan = <String, Map<String, dynamic>>{};
    for (final package in currentOffering.availablePackages) {
      final hintPlan = _hintPlanForPackage(package);
      if (hintPlan == null) continue;
      hintPackagesByPlan[hintPlan] = _packagePayload(hintPlan, package)
        ..['amount'] = hintPackAmounts[hintPlan];
    }
    for (final product in _hintProducts) {
      final hintPlan = _hintPlanForProductId(product.identifier);
      if (hintPlan == null || hintPackagesByPlan.containsKey(hintPlan)) {
        continue;
      }
      hintPackagesByPlan[hintPlan] = _storeProductPayload(hintPlan, product);
    }

    return {
      'offeringId': currentOffering.identifier,
      'plans': plans,
      'hintPackages': hintPackagesByPlan.values.toList(),
    };
  }

  void dispose() {
    if (_configured) {
      Purchases.removeCustomerInfoUpdateListener(_handleCustomerInfoUpdate);
    }
  }

  Future<void> _ensureConfigured() async {
    if (!isSupportedPlatform) {
      throw UnsupportedError(
        'RevenueCat purchases are only available on Android and iOS in this app.',
      );
    }
    await configure();
    if (!_configured) {
      throw StateError('RevenueCat is not configured.');
    }
  }

  void _handleCustomerInfoUpdate(CustomerInfo info) {
    final previous = _customerInfo;
    if (previous != null &&
        previous.originalAppUserId == info.originalAppUserId) {
      final previousDate = DateTime.tryParse(previous.requestDate);
      final incomingDate = DateTime.tryParse(info.requestDate);
      if (previousDate != null &&
          incomingDate != null &&
          incomingDate.isBefore(previousDate)) {
        return;
      }
    }
    _customerInfo = info;
    onCustomerInfoChanged?.call(info);
  }

  static String _normaliseEntitlementId(String value) =>
      value.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '');

  Package? _packageForPlan(Offering offering, String plan) {
    switch (plan) {
      case 'lifetime':
        return offering.lifetime;
      case 'weekly':
        return offering.weekly;
      case 'yearly':
        return offering.annual;
      case 'monthly':
        return offering.monthly;
      case 'hints10':
      case 'hints25':
      case 'hints50':
        for (final package in offering.availablePackages) {
          if (_hintPlanForPackage(package) == plan) return package;
        }
        break;
    }

    throw ArgumentError.value(
      plan,
      'plan',
      'Unknown or unavailable Garden of Words plan',
    );
  }

  String? _hintPlanForPackage(Package package) {
    final productId = package.storeProduct.identifier.toLowerCase();
    final packageId = package.identifier.toLowerCase();
    final productPlan = _hintPlanForProductId(productId);
    if (productPlan != null) return productPlan;
    for (final entry in hintPackProductIds.entries) {
      if (entry.value.contains(packageId) || packageId == entry.key) {
        return entry.key;
      }
    }
    // Fallback: the exact string list above only covers a handful of naming
    // guesses. If the store's actual product/package identifiers use a
    // different convention (e.g. "hint_pack_10", "gow.hints.10x"), the
    // hardcoded match above silently misses it and the price never renders
    // in the Market. Instead, pull out the digit run and match it directly
    // against the known hint amounts (10/25/50) - this is what the id is
    // almost certainly encoding regardless of the surrounding text.
    // Guard against misclassifying a subscription package as a hint pack if
    // its id happens to contain a stray digit (e.g. a $rc_ prefixed custom
    // identifier) - skip the fallback entirely for obvious subscription ids.
    const subscriptionKeywords = [
      'week',
      'month',
      'year',
      'annual',
      'lifetime',
      'premium',
      'pro',
      'subscri',
      r'$rc_',
    ];
    final looksLikeSubscription = subscriptionKeywords.any(
      (word) => packageId.contains(word) || productId.contains(word),
    );
    if (looksLikeSubscription) return null;
    final digitMatch =
        RegExp(r'(\d+)').firstMatch(packageId) ??
        RegExp(r'(\d+)').firstMatch(productId);
    final amount = digitMatch != null
        ? int.tryParse(digitMatch.group(1)!)
        : null;
    if (amount != null) {
      for (final entry in hintPackAmounts.entries) {
        if (entry.value == amount) return entry.key;
      }
    }
    return null;
  }

  String? _hintPlanForProductId(String value) {
    final productId = value.toLowerCase();
    for (final entry in hintPackProductIds.entries) {
      final productMatches = entry.value.any(
        (id) => productId == id || productId.endsWith('.$id'),
      );
      if (productMatches) return entry.key;
    }
    return null;
  }

  Map<String, dynamic> _storeProductPayload(String plan, StoreProduct product) {
    return {
      'plan': plan,
      'packageId': null,
      'productId': product.identifier,
      'title': product.title,
      'description': product.description,
      'price': product.priceString,
      'subscriptionPeriod': product.subscriptionPeriod,
      'amount': hintPackAmounts[plan],
    };
  }

  Map<String, dynamic> _packagePayload(String plan, Package package) {
    return {
      'plan': plan,
      'packageId': package.identifier,
      'productId': package.storeProduct.identifier,
      'title': package.storeProduct.title,
      'description': package.storeProduct.description,
      'price': package.storeProduct.priceString,
      'subscriptionPeriod': package.storeProduct.subscriptionPeriod,
    };
  }
}
