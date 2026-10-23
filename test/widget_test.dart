// Basic smoke test for the Kelimeler Bahçesi WebView wrapper.
//
// This verifies the app shell builds without requiring the platform WebView,
// which cannot run inside the plain flutter_test widget environment.
// ignore_for_file: use_super_parameters

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/widgets.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

import 'package:kelimeler_bahcesi_webview/main.dart';

class _FakeWebViewPlatform extends WebViewPlatform {
  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) => _FakeNavigationDelegate(params);

  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) => _FakeWebViewController(params);

  @override
  PlatformWebViewWidget createPlatformWebViewWidget(
    PlatformWebViewWidgetCreationParams params,
  ) => _FakeWebViewWidget(params);
}

class _FakeNavigationDelegate extends PlatformNavigationDelegate {
  _FakeNavigationDelegate(PlatformNavigationDelegateCreationParams params)
    : super.implementation(params);

  @override
  Future<void> setOnNavigationRequest(
    NavigationRequestCallback callback,
  ) async {}

  @override
  Future<void> setOnPageFinished(PageEventCallback callback) async {}

  @override
  Future<void> setOnProgress(ProgressCallback callback) async {}
}

class _FakeWebViewController extends PlatformWebViewController {
  _FakeWebViewController(PlatformWebViewControllerCreationParams params)
    : super.implementation(params);

  @override
  Future<void> addJavaScriptChannel(JavaScriptChannelParams params) async {}

  @override
  Future<void> loadFlutterAsset(String key) async {}

  @override
  Future<void> runJavaScript(String javaScript) async {}

  @override
  Future<void> setBackgroundColor(Color color) async {}

  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async {}

  @override
  Future<void> setPlatformNavigationDelegate(
    PlatformNavigationDelegate handler,
  ) async {}
}

class _FakeWebViewWidget extends PlatformWebViewWidget {
  _FakeWebViewWidget(PlatformWebViewWidgetCreationParams params)
    : super.implementation(params);

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}

void main() {
  testWidgets('App shell builds without throwing', (WidgetTester tester) async {
    WebViewPlatform.instance = _FakeWebViewPlatform();
    await tester.pumpWidget(const KelimelerBahcesiApp());

    // Give one frame to settle; do not pumpAndSettle() because the
    // WebView will keep scheduling frames while it loads.
    await tester.pump();

    expect(find.byType(KelimelerBahcesiApp), findsOneWidget);
  });
}
