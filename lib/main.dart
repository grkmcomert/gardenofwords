import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:kelimeler_bahcesi_webview/game_audio_service.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'retention_service.dart';
import 'revenuecat_service.dart';
import 'ad_load_backoff.dart';
import 'javascript_reply_queue.dart';
import 'generated/game_document.g.dart';

enum _RewardedLoadResult { loaded, failed }

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0xFF0E1A15),
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.black,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  // Initialise the native mixer before the WebView can receive its first
  // interaction. This keeps the first click/word feedback out of the iOS
  // WebView media pipeline.
  try {
    await GameAudioService.instance.initialize();
  } catch (_) {
    // Keep the shell bootable if a device audio route is temporarily
    // unavailable. The native service will retry when the channel is used.
  }
  unawaited(_configureRevenueCat());
  runApp(const KelimelerBahcesiApp());
}

Future<void> _configureRevenueCat() async {
  try {
    await RevenueCatService.instance.configure();
  } catch (error, stackTrace) {
    debugPrint('RevenueCat startup configuration failed: $error');
    debugPrintStack(stackTrace: stackTrace);
  }
}

class KelimelerBahcesiApp extends StatelessWidget {
  const KelimelerBahcesiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: GamePage(),
    );
  }
}

class GamePage extends StatefulWidget {
  const GamePage({super.key});

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> with WidgetsBindingObserver {
  late final WebViewController _controller;
  late final Future<void> _adsInitialization;
  DateTime _loadStartedAt = DateTime.now();

  bool _isDisposed = false;
  bool _controllerReady = false;
  bool _webViewPageReady = false;
  bool _gameDocumentWritten = false;
  bool _gameReady = false;
  bool _startupLoadActive = true;
  bool _audioBackgrounded = false;
  bool _appLifecycleActive = true;
  bool _adsCanRequest = false;
  bool _privacyOptionsRequired = false;
  bool _trackingAuthorizationReady = false;
  bool _trackingAuthorizationRequestInFlight = false;
  bool _trackingAuthorizationResolved = false;
  BannerAd? _bannerAd;
  InterstitialAd? _interstitialAd;
  // The AdMob console unit is an "Ödüllü Geçiş Reklamı" (rewarded
  // interstitial), not a standard rewarded ad. Loading it through RewardedAd
  // produces "Ad unit doesn't match format" on iOS.
  RewardedInterstitialAd? _rewardedInterstitialAd;
  // The WebView starts on the Rose Cottage default theme before its first JS theme
  // message reaches Flutter. Keep the native banner frame on that same surface
  // from the very first frame, otherwise the ad gets a garden-coloured surround.
  static const _darkSurface = Color(0xFF0E1A15);
  Color _themeSurfaceColor = _darkSurface;
  String _themeBackgroundAsset = 'assets/game/images/themes/rose-cottage.webp';
  bool _bannerVisible = false;
  bool _bannerLoading = false;
  bool _bannerRequested = false;
  Timer? _bannerRetryTimer;
  bool _firebaseManualPremium = false;
  bool get _hasPremium =>
      _firebaseManualPremium || RevenueCatService.instance.hasProEntitlement();
  static final _rewardedBackoff = AdLoadBackoff();
  // Every entitlement/privacy transition invalidates callbacks belonging to
  // an older ad request. This prevents an ad that finished loading just after
  // Premium was activated from being shown.
  int _adRequestGeneration = 0;
  Future<void>? _interstitialLoadFuture;
  Future<void>? _rewardedLoadFuture;
  int _audioPausingAdCount = 0;
  Future<void>? _audioPauseForAdFuture;
  Map<String, Object?>? _pendingNativeAudioState;
  bool _nativeAudioStateDispatchInFlight = false;
  late final _javaScriptReplies = JavaScriptReplyQueue(
    canSend: () => _canRunJavaScript,
    send: _tryRunJavaScriptSafely,
  );

  // Native loading overlay: previously there was no real loading screen, so
  // the app jumped straight from a blank frame to the home menu before the
  // WebView content had actually finished loading. This keeps a simple
  // branded overlay up until onPageFinished fires, with a small minimum
  // display time so it never just flashes on fast devices.
  bool _showLoadingOverlay = true;
  static const _minLoadingDisplay = Duration(milliseconds: 1400);
  static const _loadingFallbackDelay = Duration(seconds: 5);
  Timer? _loadingFallbackTimer;

  static const _bannerAdUnitId = 'ca-app-pub-7480771330660307/8951177303';
  static const _rewardedAdUnitId = 'ca-app-pub-7480771330660307/8820099189';

  // Optional UMP test controls. They are inert unless a device ID is passed
  // explicitly at run time, so production builds keep real geography rules.
  // Example: --dart-define=UMP_TEST_DEVICE_ID=... --dart-define=UMP_DEBUG_GEOGRAPHY=eea
  static const _umpTestDeviceId = String.fromEnvironment('UMP_TEST_DEVICE_ID');
  static const _umpDebugGeography = String.fromEnvironment(
    'UMP_DEBUG_GEOGRAPHY',
  );

  // No normal interstitial unit has been supplied. Never fall back to a
  // Google test unit in a release build; the game simply continues without
  // this optional ad until a real interstitial ID is configured.
  static const String? _interstitialAdUnitId = null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    GameAudioService.instance.onStateChanged = _handleNativeAudioState;
    _startStartupLoad();
    // UMP consent and iOS ATT must be settled before any ad load. This future
    // is intentionally independent from the WebView first paint; only ad
    // operations await it.
    _adsInitialization = _initializeAdsWithConsent();

    late final PlatformWebViewControllerCreationParams webViewParams;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      webViewParams = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      webViewParams = const PlatformWebViewControllerCreationParams();
    }

    _controller = WebViewController.fromPlatformCreationParams(webViewParams)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // An opaque WebView avoids an extra transparent platform-view
      // composition pass on Android. Match the Rose Cottage default before the
      // first theme message arrives from the page.
      ..setBackgroundColor(_darkSurface)
      ..addJavaScriptChannel(
        'FlutterGameContent',
        onMessageReceived: (message) {
          if (message.message == 'load') unawaited(_loadPatchableGame());
        },
      )
      ..addJavaScriptChannel(
        'FlutterAdMob',
        onMessageReceived: (message) => _handleAdMobMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterRevenueCat',
        onMessageReceived: (message) =>
            _handleRevenueCatMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterTheme',
        onMessageReceived: (message) =>
            _handleGameThemeMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterPrivacy',
        onMessageReceived: (message) => _handlePrivacyMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterGameReady',
        onMessageReceived: (message) =>
            _handleGameReadyMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterGameDiagnostics',
        onMessageReceived: (message) =>
            _handleGameDiagnosticsMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterAudio',
        onMessageReceived: (message) => _handleAudioMessage(message.message),
      )
      ..addJavaScriptChannel(
        'FlutterRetention',
        onMessageReceived: (message) =>
            unawaited(RetentionService.instance.handle(message.message)),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            _gameDocumentWritten = false;
            if (!_startupLoadActive) return;
            _webViewPageReady = false;
            _gameReady = false;
          },
          onProgress: (progress) {
            // WKWebView can restore a cached local page without sending the
            // usual finished callback on a later app launch. A completed
            // progress signal is enough for native bridge injections, but it
            // is not proof that the game's final startup script has painted.
            if (progress >= 100) {
              _webViewPageReady = true;
            }
          },
          onNavigationRequest: (request) {
            if (request.url.startsWith('mailto:') ||
                request.url.startsWith('tel:')) {
              // WKWebView (iOS) does not reliably hand mailto:/tel: links off
              // to the Mail/Phone app on its own - returning .navigate here
              // just makes the in-app WebView try to "load" the link and
              // silently fail, which is exactly the "nothing happens, it's
              // just a dead link" bug that was reported. Launching it
              // explicitly through the OS is what actually opens Mail with
              // the address pre-filled.
              final uri = Uri.tryParse(request.url);
              if (uri != null) {
                unawaited(launchUrl(uri, mode: LaunchMode.externalApplication));
              }
              return NavigationDecision.prevent;
            }
            if (request.url.startsWith('file:') ||
                request.url.startsWith('about:') ||
                request.url.startsWith('https://') ||
                request.url.startsWith('http://')) {
              return NavigationDecision.navigate;
            }
            return NavigationDecision.prevent;
          },
          onPageFinished: (_) async {
            if (!_gameDocumentWritten) return;
            _webViewPageReady = true;
            // These integrations are optional for the first paint. Do not
            // make the branded loading screen wait for device APIs or a
            // RevenueCat/network refresh, especially after an iOS relaunch.
            unawaited(
              _runJavaScriptSafely('window.__notifyFlutterGameReady?.();'),
            );
            unawaited(_injectDeviceInfo());
            unawaited(_injectRevenueCatState());
            unawaited(_injectPrivacyOptionsState());
          },
        ),
      )
      ..loadFlutterAsset('assets/game/shorebird_bootstrap.html');

    if (_controller.platform is AndroidWebViewController) {
      unawaited(
        (_controller.platform as AndroidWebViewController)
            .setMediaPlaybackRequiresUserGesture(false),
      );
    }

    RevenueCatService.instance.onCustomerInfoChanged =
        _handleRevenueCatCustomerInfoChanged;
    _controllerReady = true;
  }

  Future<void> _loadPatchableGame() async {
    if (_isDisposed || _gameDocumentWritten) return;
    _gameDocumentWritten = true;
    try {
      // document.write keeps the local file origin and relative media paths.
      // jsonEncode prevents HTML/JS text from escaping the bridge argument.
      final document = jsonEncode(decodeGameDocument());
      await _controller.runJavaScript(
        'document.open(); document.write($document); document.close();',
      );
    } catch (error, stackTrace) {
      _gameDocumentWritten = false;
      debugPrint('Game document could not be loaded: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  void _handleAudioMessage(String message) {
    try {
      final decoded = jsonDecode(message);
      if (decoded is! Map) return;
      final action = decoded['action']?.toString();
      if (action == null || action.isEmpty) return;
      final rawParams = decoded['params'];
      final params = rawParams is Map
          ? Map<String, dynamic>.from(rawParams)
          : <String, dynamic>{};
      unawaited(GameAudioService.instance.handleCommand(action, params));
    } catch (error) {
      debugPrint('Native audio bridge message ignored: $error');
    }
  }

  void _handleNativeAudioState(Map<String, Object?> state) {
    if (_isDisposed || !_webViewPageReady) return;
    // FFT updates arrive about 20 times per second. Keep only the newest
    // sample while a WebView bridge call is still in flight; otherwise a slow
    // iOS WebView can accumulate stale JS evaluations and make the visualizer
    // visibly lag behind the music.
    _pendingNativeAudioState = Map<String, Object?>.from(state);
    if (_nativeAudioStateDispatchInFlight) return;
    _nativeAudioStateDispatchInFlight = true;
    unawaited(_flushNativeAudioState());
  }

  Future<void> _flushNativeAudioState() async {
    try {
      while (!_isDisposed && _webViewPageReady) {
        final state = _pendingNativeAudioState;
        if (state == null) break;
        _pendingNativeAudioState = null;
        final payload = jsonEncode(state);
        await _runJavaScriptSafely('window.__nativeAudioState?.($payload);');
      }
    } finally {
      _nativeAudioStateDispatchInFlight = false;
      if (!_isDisposed &&
          _webViewPageReady &&
          _pendingNativeAudioState != null) {
        _nativeAudioStateDispatchInFlight = true;
        unawaited(_flushNativeAudioState());
      }
    }
  }

  void _startStartupLoad() {
    _loadStartedAt = DateTime.now();
    _startupLoadActive = true;
    _webViewPageReady = false;
    _gameReady = false;
    _showLoadingOverlay = true;
    _loadingFallbackTimer?.cancel();
    _loadingFallbackTimer = Timer(_loadingFallbackDelay, () {
      if (!mounted || !_startupLoadActive || _gameReady) return;
      debugPrint(
        'WebView startup is still running; continuing background initialization.',
      );
    });
  }

  void _handleGameReadyMessage(String message) {
    if (message.trim().toLowerCase() != 'ready' || !mounted) return;

    _startupLoadActive = false;
    _loadingFallbackTimer?.cancel();
    _loadingFallbackTimer = null;
    _webViewPageReady = true;
    _gameReady = true;
    unawaited(_javaScriptReplies.flush());
    setState(() {});
    unawaited(_dismissLoadingOverlay());
  }

  void _handleGameDiagnosticsMessage(String message) {
    debugPrint('WebView startup diagnostic: $message');
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      // iOS emits inactive/hidden/paused while an app-close transition may
      // already be tearing down WKWebView. The page's visibilitychange and
      // pagehide handlers pause audio without a native bridge call. Starting
      // evaluateJavaScript here can race WKWebView teardown and trigger a
      // native webview_flutter_wkwebview unowned-retain abort in its callback.
      _appLifecycleActive = false;
      _audioBackgrounded = true;
      unawaited(GameAudioService.instance.pauseForBackground());
      return;
    }

    if (state == AppLifecycleState.resumed) {
      final wasBackgrounded = _audioBackgrounded;
      _appLifecycleActive = true;
      unawaited(_javaScriptReplies.flush());
      _audioBackgrounded = false;
      unawaited(GameAudioService.instance.resumeFromBackground());
      if (Platform.isIOS &&
          _trackingAuthorizationReady &&
          !_trackingAuthorizationResolved) {
        unawaited(_requestTrackingAuthorization());
      }
      if (wasBackgrounded && !_isDisposed && _controllerReady) {
        unawaited(_injectRevenueCatState());
        unawaited(_runJavaScriptSafely('window.__nativeAppForeground?.();'));
        unawaited(_refreshRevenueCatOnResume());
      }
    }
  }

  Future<void> _runJavaScriptSafely(String script) async {
    await _tryRunJavaScriptSafely(script);
  }

  bool get _canRunJavaScript =>
      !_isDisposed &&
      _controllerReady &&
      _webViewPageReady &&
      _appLifecycleActive;

  Future<bool> _tryRunJavaScriptSafely(String script) async {
    if (!_canRunJavaScript) return false;
    try {
      await _controller.runJavaScript(script);
      return true;
    } catch (error) {
      // The WebView can already be tearing down while iOS sends its final
      // lifecycle callback. It is safe to ignore that bridge call.
      debugPrint('WebView lifecycle script ignored: $error');
      return false;
    }
  }

  Future<void> _refreshRevenueCatOnResume() async {
    try {
      await RevenueCatService.instance.refreshCustomerInfo();
    } catch (error) {
      debugPrint('RevenueCat resume refresh failed: $error');
    }
  }

  Future<void> _pauseNativeAudioForAd() async {
    _audioPausingAdCount++;
    if (_audioPausingAdCount > 1) {
      await (_audioPauseForAdFuture ?? Future<void>.value());
      return;
    }
    final pauseFuture = GameAudioService.instance.pauseForExternalAudio();
    _audioPauseForAdFuture = pauseFuture;
    try {
      await pauseFuture;
    } catch (error) {
      debugPrint('Native audio could not pause for ad: $error');
    }
  }

  void _resumeNativeAudioAfterAd() {
    if (_audioPausingAdCount == 0) return;
    _audioPausingAdCount--;
    if (_audioPausingAdCount != 0) return;
    _audioPauseForAdFuture = null;
    unawaited(GameAudioService.instance.resumeFromExternalAudio());
  }

  Future<void> _initializeAdsWithConsent() async {
    // Native consent forms and the ATT prompt need a visible, active app
    // surface. Waiting for the first Flutter frame keeps them out of the
    // blank startup frame without delaying WebView construction.
    await WidgetsBinding.instance.endOfFrame;

    // UMP and Mobile Ads expose iOS/Android platform channels. Keeping this
    // no-op on desktop makes the WebView shell testable without leaving a
    // native consent callback timer pending in flutter_test.
    if (!Platform.isIOS && !Platform.isAndroid) return;

    final consentInformation = ConsentInformation.instance;
    final consentInfoUpdated = await _requestConsentInfoUpdate(
      consentInformation,
    );

    if (consentInfoUpdated) {
      try {
        await ConsentForm.loadAndShowConsentFormIfRequired((error) {
          if (error != null) {
            debugPrint(
              'UMP consent form failed: ${error.errorCode} ${error.message}',
            );
          }
        });
      } catch (error, stackTrace) {
        debugPrint('UMP consent form exception: $error');
        debugPrintStack(stackTrace: stackTrace);
      }
    } else {
      // Do not guess a consent result after a failed update. canRequestAds()
      // below may still allow ads using the previous, privacy-safe state.
      debugPrint('UMP consent form skipped because the info update failed.');
    }

    try {
      _privacyOptionsRequired =
          await consentInformation.getPrivacyOptionsRequirementStatus() ==
          PrivacyOptionsRequirementStatus.required;
    } catch (error) {
      debugPrint('UMP privacy options status failed: $error');
      _privacyOptionsRequired = false;
    }
    unawaited(_injectPrivacyOptionsState());

    // Present ATT on the first active launch, as required before personalized
    // ad measurement. The localized InfoPlist.strings files keep this native
    // prompt in the same language as the app.
    _trackingAuthorizationReady = true;
    await _requestTrackingAuthorization();

    try {
      _adsCanRequest = await consentInformation.canRequestAds().timeout(
        const Duration(seconds: 10),
      );
    } catch (error) {
      // A failed or timed-out consent check must fail closed for ad requests.
      // The next app launch will request fresh consent information again.
      _adsCanRequest = false;
      debugPrint('Ads consent check failed; ad requests disabled: $error');
    }

    // SDK initialization is not an ad request. Actual banner/rewarded loads
    // are gated by _adsCanRequest in their individual paths below.
    try {
      await MobileAds.instance.initialize();
    } catch (error, stackTrace) {
      _adsCanRequest = false;
      debugPrint('Mobile Ads SDK initialization failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  Future<bool> _requestConsentInfoUpdate(
    ConsentInformation consentInformation,
  ) async {
    final completed = Completer<bool>();

    try {
      consentInformation.requestConsentInfoUpdate(
        _consentRequestParameters(),
        () {
          if (!completed.isCompleted) completed.complete(true);
        },
        (error) {
          debugPrint(
            'UMP consent info update failed: ${error.errorCode} ${error.message}',
          );
          if (!completed.isCompleted) completed.complete(false);
        },
      );
    } catch (error, stackTrace) {
      debugPrint('UMP consent info update exception: $error');
      debugPrintStack(stackTrace: stackTrace);
      if (!completed.isCompleted) completed.complete(false);
    }

    return completed.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        debugPrint('UMP consent info update timed out.');
        return false;
      },
    );
  }

  ConsentRequestParameters _consentRequestParameters() {
    if (_umpTestDeviceId.trim().isEmpty) {
      return ConsentRequestParameters();
    }

    final debugGeography = switch (_umpDebugGeography.trim().toLowerCase()) {
      'eea' => DebugGeography.debugGeographyEea,
      'us_state' || 'us-state' => DebugGeography.debugGeographyRegulatedUsState,
      'other' => DebugGeography.debugGeographyOther,
      _ => null,
    };

    return ConsentRequestParameters(
      consentDebugSettings: ConsentDebugSettings(
        debugGeography: debugGeography,
        testIdentifiers: <String>[_umpTestDeviceId.trim()],
      ),
    );
  }

  Future<void> _requestTrackingAuthorization() async {
    if (!Platform.isIOS ||
        !_trackingAuthorizationReady ||
        _trackingAuthorizationRequestInFlight ||
        _trackingAuthorizationResolved) {
      return;
    }

    _trackingAuthorizationRequestInFlight = true;
    try {
      // UMP's native form can still be dismissing when its Dart future
      // completes. ATT rejects overlapping permission presentations.
      await WidgetsBinding.instance.endOfFrame;
      await Future<void>.delayed(const Duration(milliseconds: 350));
      final lifecycleState = WidgetsBinding.instance.lifecycleState;
      if (lifecycleState != null &&
          lifecycleState != AppLifecycleState.resumed) {
        return;
      }

      final status = await AppTrackingTransparency.trackingAuthorizationStatus;
      debugPrint('iOS ATT status before request: $status');
      if (status == TrackingStatus.notDetermined) {
        await AppTrackingTransparency.requestTrackingAuthorization();
      }
      final finalStatus =
          await AppTrackingTransparency.trackingAuthorizationStatus;
      debugPrint('iOS ATT status after request: $finalStatus');
      _trackingAuthorizationResolved =
          finalStatus != TrackingStatus.notDetermined;
    } catch (error, stackTrace) {
      // ATT is optional for serving non-personalized ads. UMP/AdMob can still
      // continue with the platform's privacy-safe configuration.
      debugPrint('iOS ATT request failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    } finally {
      _trackingAuthorizationRequestInFlight = false;
    }
  }

  Future<void> _handlePrivacyMessage(String action) async {
    if (action.trim() != 'showPrivacyOptions') return;
    if (!_privacyOptionsRequired) return;

    try {
      await ConsentForm.showPrivacyOptionsForm((error) {
        if (error != null) {
          debugPrint(
            'UMP privacy options form failed: ${error.errorCode} ${error.message}',
          );
        }
      });
      await _refreshPrivacyConsentState();
    } catch (error, stackTrace) {
      debugPrint('UMP privacy options exception: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  Future<void> _refreshPrivacyConsentState() async {
    final consentInformation = ConsentInformation.instance;
    try {
      _privacyOptionsRequired =
          await consentInformation.getPrivacyOptionsRequirementStatus() ==
          PrivacyOptionsRequirementStatus.required;
      _adsCanRequest = await consentInformation.canRequestAds();
      if (!_adsCanRequest) {
        _discardAdsForPrivacy();
      } else if (_bannerRequested) {
        unawaited(_showBanner());
      }
      unawaited(_injectPrivacyOptionsState());
    } catch (error, stackTrace) {
      debugPrint('UMP privacy consent refresh failed: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  Future<void> _injectPrivacyOptionsState() async {
    if (!mounted) return;
    try {
      await _runJavaScriptSafely(
        'window.__setNativePrivacyOptionsRequired?.($_privacyOptionsRequired);',
      );
    } catch (error) {
      // The WebView can still be loading when consent finishes. onPageFinished
      // retries this injection, so this is intentionally non-fatal.
      debugPrint('Privacy options state injection deferred: $error');
    }
  }

  void _discardAdsForPrivacy() {
    _adRequestGeneration++;
    _bannerRequested = false;
    _cancelBannerRetry();
    _bannerAd?.dispose();
    _bannerAd = null;
    _interstitialAd?.dispose();
    _interstitialAd = null;
    _rewardedInterstitialAd?.dispose();
    _rewardedInterstitialAd = null;
    _bannerLoading = false;
    if (mounted) {
      setState(() => _bannerVisible = false);
    }
    _notifyBannerHeight(0);
  }

  Future<void> _dismissLoadingOverlay() async {
    final elapsed = DateTime.now().difference(_loadStartedAt);
    final remaining = _minLoadingDisplay - elapsed;
    if (remaining > Duration.zero) {
      await Future.delayed(remaining);
    }
    if (!mounted || !_gameReady || _startupLoadActive) return;
    setState(() => _showLoadingOverlay = false);
  }

  Future<Map<String, String>> _readDeviceInfo() async {
    final plugin = DeviceInfoPlugin();

    if (Platform.isIOS) {
      final info = await plugin.iosInfo;
      return {
        'modelName': info.modelName,
        'manufacturer': 'Apple',
        'platform': 'iOS',
        'osVersion': info.systemVersion,
      };
    }

    if (Platform.isAndroid) {
      final info = await plugin.androidInfo;
      final manufacturer = info.manufacturer.trim();
      final model = info.model.trim();
      final modelName =
          model.toLowerCase().startsWith(manufacturer.toLowerCase())
          ? model
          : '$manufacturer $model'.trim();
      return {
        'modelName': modelName,
        'manufacturer': manufacturer,
        'platform': 'Android',
        'osVersion': info.version.release,
      };
    }

    return {
      'modelName': Platform.operatingSystem,
      'manufacturer': '',
      'platform': Platform.operatingSystem,
      'osVersion': '',
    };
  }

  Future<void> _injectDeviceInfo() async {
    try {
      final deviceInfo = jsonEncode(await _readDeviceInfo());
      await _runJavaScriptSafely('''
        (() => {
          const info = $deviceInfo;
          window.__nativeDeviceInfo = info;
          window.__setNativeDeviceInfo?.(info);
        })();
      ''');
    } catch (error) {
      debugPrint('Device info injection failed: $error');
    }
  }

  Future<void> _injectRevenueCatState([CustomerInfo? info]) async {
    try {
      final service = RevenueCatService.instance;
      if (info == null) {
        await service.configure();
      }
      final payload = jsonEncode(service.customerInfoPayload(info));
      await _runJavaScriptSafely(
        'window.__setNativeRevenueCatState?.($payload);',
      );
    } catch (error) {
      debugPrint('RevenueCat state injection failed: $error');
    }
  }

  void _handleGameThemeMessage(String theme) {
    // Every theme shares the dark "night garden" chrome; only the painting changes.
    const nextColor = _darkSurface;
    final nextBackgroundAsset = switch (theme) {
      'moonlit' => 'assets/game/images/themes/moonlit.webp',
      'autumn' => 'assets/game/images/themes/autumn.webp',
      'seaside' => 'assets/game/images/themes/seaside.webp',
      'rose' => 'assets/game/images/themes/rose-cottage.webp',
      'forest' => 'assets/game/images/themes/forest-mist.webp',
      'lavender' => 'assets/game/images/themes/lavender.webp',
      'winter' => 'assets/game/images/themes/winter-hearth.webp',
      'dawn-garden' => 'assets/game/images/themes/dawn-garden.png',
      'rainy-greenhouse' => 'assets/game/images/themes/rainy-greenhouse.png',
      'meadowlight' => 'assets/game/images/themes/meadowlight.png',
      'orchard-walk' => 'assets/game/images/themes/orchard-walk.png',
      'tropical-grove' => 'assets/game/images/themes/tropical-grove.png',
      'sunset-terrace' => 'assets/game/images/themes/sunset-terrace.png',
      'desert-bloom' => 'assets/game/images/themes/desert-bloom.png',
      'misty-lake' => 'assets/game/images/themes/misty-lake.png',
      _ => 'assets/game/images/themes/garden.webp',
    };
    if (_themeSurfaceColor == nextColor &&
        _themeBackgroundAsset == nextBackgroundAsset) {
      return;
    }

    _themeSurfaceColor = nextColor;
    _themeBackgroundAsset = nextBackgroundAsset;
    unawaited(_controller.setBackgroundColor(nextColor));
    final isLightSurface = nextColor.computeLuminance() > .45;
    SystemChrome.setSystemUIOverlayStyle(
      SystemUiOverlayStyle(
        statusBarColor: nextColor,
        statusBarIconBrightness: isLightSurface
            ? Brightness.dark
            : Brightness.light,
        statusBarBrightness: isLightSurface
            ? Brightness.light
            : Brightness.dark,
        systemNavigationBarColor: nextColor,
        systemNavigationBarIconBrightness: isLightSurface
            ? Brightness.dark
            : Brightness.light,
      ),
    );
    if (mounted) setState(() {});
  }

  void _handleRevenueCatCustomerInfoChanged(CustomerInfo info) {
    _adRequestGeneration++;
    if (_firebaseManualPremium ||
        RevenueCatService.instance.hasProEntitlement(info)) {
      _removeAdsForPremium();
    }
    unawaited(_injectRevenueCatState(info));
  }

  void _reply(int id, {Object? result, String? error}) {
    _replyToJavaScript(
      id,
      result: result,
      error: error,
      resolveFunction: '__admobResolve',
      rejectFunction: '__admobReject',
    );
  }

  void _replyRevenueCat(int id, {Object? result, String? error}) {
    _replyToJavaScript(
      id,
      result: result,
      error: error,
      resolveFunction: '__revenueCatResolve',
      rejectFunction: '__revenueCatReject',
    );
  }

  void _logAdEvent(
    String format,
    String event, {
    required String adUnitId,
    AdError? error,
    ResponseInfo? responseInfo,
    Map<String, Object?>? extra,
  }) {
    final resolvedResponseInfo =
        responseInfo ?? (error is LoadAdError ? error.responseInfo : null);
    final payload = <String, Object?>{
      'event': event,
      'format': format,
      'adUnitId': adUnitId,
      'platform': Platform.isAndroid
          ? 'Android'
          : Platform.isIOS
          ? 'iOS'
          : Platform.operatingSystem,
    };

    if (error != null) {
      payload.addAll({
        'errorCode': error.code,
        'errorDomain': error.domain,
        'errorMessage': error.message,
        'error': error.toString(),
      });
    }

    if (resolvedResponseInfo != null) {
      payload.addAll({
        'responseId': resolvedResponseInfo.responseId,
        'mediationAdapter': resolvedResponseInfo.mediationAdapterClassName,
        'responseInfo': resolvedResponseInfo.toString(),
      });
      final adapterResponses = resolvedResponseInfo.adapterResponses
          ?.map((adapter) => adapter.toString())
          .join('\n');
      if (adapterResponses != null && adapterResponses.isNotEmpty) {
        payload['adapterResponses'] = adapterResponses;
      }
    }

    extra?.forEach((key, value) {
      if (value != null) payload[key] = value;
    });

    final encodedPayload = jsonEncode(payload);
    debugPrint('AdMob $format/$event: ${error ?? resolvedResponseInfo ?? ''}');
    unawaited(
      _runJavaScriptSafely(
        'window.__logNativeAdEvent?.($encodedPayload);',
      ).catchError((error, stackTrace) {
        debugPrint('Firebase ad log bridge failed: $error');
      }),
    );
  }

  void _replyToJavaScript(
    int id, {
    Object? result,
    String? error,
    required String resolveFunction,
    required String rejectFunction,
  }) {
    final payload = jsonEncode(
      error == null
          ? {
              'id': id,
              'result': result ?? {'ok': true},
            }
          : {'id': id, 'error': error},
    );

    _javaScriptReplies.add('''
      (() => {
        const p = $payload;
        if (p.error) {
          window.$rejectFunction?.(p.id, p.error);
        } else {
          window.$resolveFunction?.(p.id, p.result);
        }
      })();
    ''');
  }

  Future<void> _handleAdMobMessage(String raw) async {
    try {
      final message = jsonDecode(raw) as Map<String, dynamic>;
      final id = (message['id'] as num?)?.toInt() ?? 0;
      final action = message['action'] as String? ?? '';

      switch (action) {
        case 'initialize':
          _reply(id, result: {'ok': true});
          break;
        case 'showBanner':
          await _showBanner();
          _reply(id, result: {'ok': true});
          break;
        case 'hideBanner':
          _hideBanner();
          _reply(id, result: {'ok': true});
          break;
        case 'prepareInterstitial':
          await _prepareInterstitial();
          _reply(id, result: {'ok': true});
          break;
        case 'showInterstitial':
          await _showInterstitial();
          _reply(id, result: {'ok': true});
          break;
        case 'prepareRewardVideoAd':
          await _prepareRewarded();
          _reply(id, result: {'ok': true});
          break;
        case 'showRewardVideoAd':
          final rewardedShown = await _showRewarded();
          _reply(
            id,
            result: {
              'ok': true,
              'premiumSkipped': false,
              'rewardedShown': rewardedShown,
            },
          );
          break;
        default:
          _reply(id, error: 'Unknown AdMob action: $action');
      }
    } catch (e) {
      debugPrint('AdMob bridge error: $e');
      try {
        final decoded = jsonDecode(raw) as Map<String, dynamic>;
        final id = (decoded['id'] as num?)?.toInt() ?? 0;
        _reply(id, error: e.toString());
      } catch (_) {}
    }
  }

  Future<void> _handleRevenueCatMessage(String raw) async {
    var id = 0;

    try {
      final message = jsonDecode(raw) as Map<String, dynamic>;
      id = (message['id'] as num?)?.toInt() ?? 0;
      final action = message['action'] as String? ?? '';
      final params = message['params'] is Map
          ? Map<String, dynamic>.from(message['params'] as Map)
          : <String, dynamic>{};
      final revenueCat = RevenueCatService.instance;

      switch (action) {
        case 'setFirebasePremium':
          _firebaseManualPremium = params['enabled'] == true;
          if (_hasPremium) _removeAdsForPremium();
          _replyRevenueCat(id, result: {'enabled': _firebaseManualPremium});
          break;
        case 'initialize':
          await revenueCat.configure();
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload());
          break;
        case 'getCustomerInfo':
          final info = await revenueCat.refreshCustomerInfo(
            forceRefresh: params['forceRefresh'] == true,
          );
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload(info));
          break;
        case 'isPro':
          final info = await revenueCat.refreshCustomerInfo();
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload(info));
          break;
        case 'getOfferings':
          final offerings = await revenueCat.getOfferings();
          _replyRevenueCat(id, result: revenueCat.offeringsPayload(offerings));
          break;
        case 'purchase':
          final plan = params['plan'] as String?;
          if (plan == null) {
            throw ArgumentError('Missing RevenueCat purchase plan.');
          }
          final purchase = await revenueCat.purchasePlan(plan);
          final confirmedInfo = await revenueCat
              .refreshCustomerInfoAfterTransaction(
                purchase.customerInfo,
                expectPremium: revenueCat.hintAmountForPlan(plan) == null,
              );
          final hintAmount = revenueCat.hintAmountForPlan(plan);
          _replyRevenueCat(
            id,
            result: {
              'result': 'purchased',
              'plan': plan,
              'hintAmount': ?hintAmount,
              'transactionId': purchase.storeTransaction.transactionIdentifier,
              ...revenueCat.customerInfoPayload(confirmedInfo),
            },
          );
          break;
        case 'restorePurchases':
          final info = await revenueCat.restorePurchases();
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload(info));
          break;
        case 'presentPaywall':
          final result = await revenueCat.presentPaywall();
          _replyRevenueCat(
            id,
            result: {
              'result': result.name,
              ...revenueCat.customerInfoPayload(),
            },
          );
          break;
        case 'presentPaywallIfNeeded':
          final result = await revenueCat.presentPaywallIfNeeded();
          _replyRevenueCat(
            id,
            result: {
              'result': result.name,
              ...revenueCat.customerInfoPayload(),
            },
          );
          break;
        case 'presentCustomerCenter':
          await revenueCat.presentCustomerCenter();
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload());
          break;
        case 'logIn':
          final appUserId = params['appUserId'] as String?;
          if (appUserId == null || appUserId.trim().isEmpty) {
            throw ArgumentError('Missing RevenueCat app user ID.');
          }
          await revenueCat.logIn(appUserId.trim());
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload());
          break;
        case 'logOut':
          await revenueCat.logOut();
          _replyRevenueCat(id, result: revenueCat.customerInfoPayload());
          break;
        default:
          throw UnsupportedError('Unknown RevenueCat action: $action');
      }
    } catch (error, stackTrace) {
      debugPrint('RevenueCat bridge error: $error');
      debugPrintStack(stackTrace: stackTrace);
      _replyRevenueCat(id, error: _revenueCatErrorMessage(error));
    }
  }

  String _revenueCatErrorMessage(Object error) {
    if (error is PlatformException) {
      final errorCode = PurchasesErrorHelper.getErrorCode(error);
      if (errorCode == PurchasesErrorCode.purchaseCancelledError) {
        return 'Purchase cancelled';
      }
      return '${errorCode.name}: ${error.message ?? error.details ?? error}';
    }
    return error.toString();
  }

  Future<void> _showBanner() async {
    _bannerRequested = true;
    if (await _isPremiumForAds()) {
      _removeAdsForPremium();
      return;
    }
    final requestGeneration = _adRequestGeneration;
    if (_isDisposed || !_bannerRequested) return;
    if (_bannerVisible || _bannerLoading) return;

    await _adsInitialization;
    if (!_adsCanRequest ||
        !_bannerRequested ||
        _isDisposed ||
        requestGeneration != _adRequestGeneration) {
      return;
    }

    if (_bannerAd == null) {
      // Standart, sabit 320x50 banner boyutu kullanılıyor. Önceden
      // "Large Anchored Adaptive" boyut isteniyordu; bu boyut cihaz
      // genişliğine göre reklamdan çok daha yüksek bir alan (~90-100dp)
      // ayırıyordu. Gerçek reklam içeriği 320x50 olduğundan, ayrılan
      // fazladan alan uygulamanın arka plan rengiyle dolduruluyor ve
      // reklamın üstünde/altında "garip renkli" boşluk gibi görünüyordu.
      // Ayrıca bu fazladan yükseklik, WebView'dan çalınan alanı
      // gereğinden fazla artırarak ana ekranın aşırı küçülmesine yol
      // açıyordu. Sabit AdSize.banner, reklamla birebir aynı boyutta
      // olduğu için hem renk uyuşmazlığını hem de gereksiz küçülmeyi
      // ortadan kaldırır.
      _bannerLoading = true;
      _logAdEvent('banner', 'load_requested', adUnitId: _bannerAdUnitId);
      final banner = BannerAd(
        adUnitId: _bannerAdUnitId,
        request: const AdRequest(),
        size: AdSize.banner,
        listener: BannerAdListener(
          onAdLoaded: (ad) {
            _logAdEvent(
              'banner',
              'loaded',
              adUnitId: ad.adUnitId,
              responseInfo: ad.responseInfo,
            );
            final premium = _hasPremium;
            final isCurrent =
                !_isDisposed &&
                requestGeneration == _adRequestGeneration &&
                identical(_bannerAd, ad);
            if (!isCurrent || !_bannerRequested || premium) {
              ad.dispose();
              if (premium) _removeAdsForPremium();
              if (isCurrent) {
                _bannerLoading = false;
                _bannerAd = null;
              }
              return;
            }
            _bannerLoading = false;
            _bannerRetryTimer?.cancel();
            _bannerRetryTimer = null;
            if (!mounted) return;
            const shouldShow = true;
            setState(() => _bannerVisible = shouldShow);
            _notifyBannerHeight((ad as BannerAd).size.height.toDouble());
          },
          onAdFailedToLoad: (ad, error) {
            debugPrint('Banner failed: $error');
            _logAdEvent(
              'banner',
              'load_failed',
              adUnitId: ad.adUnitId,
              error: error,
              extra: {'isNoFill': error.code == 3},
            );
            ad.dispose();
            final isCurrent =
                !_isDisposed &&
                requestGeneration == _adRequestGeneration &&
                identical(_bannerAd, ad);
            if (!isCurrent) return;
            _bannerLoading = false;
            _bannerAd = null;
            if (!mounted) return;
            setState(() {
              _bannerVisible = false;
            });
            _notifyBannerHeight(0);
            if (error.code == 3 && _bannerRequested) {
              _scheduleBannerRetry();
            } else {
              _cancelBannerRetry();
            }
          },
        ),
      );
      _bannerAd = banner;
      banner.load();
    } else if (mounted &&
        _bannerRequested &&
        requestGeneration == _adRequestGeneration &&
        !_hasPremium) {
      _bannerVisible = true;
      setState(() {});
      _notifyBannerHeight(_bannerAd!.size.height.toDouble());
    }
  }

  void _hideBanner() {
    _bannerRequested = false;
    _cancelBannerRetry();
    if (!mounted) return;
    setState(() => _bannerVisible = false);
    _notifyBannerHeight(0);
  }

  Future<void> _prepareInterstitial() async {
    if (_interstitialAdUnitId == null) return;
    if (await _isPremiumForAds()) {
      _removeAdsForPremium();
      return;
    }
    final requestGeneration = _adRequestGeneration;
    if (_interstitialAd != null) return;
    final loading = _interstitialLoadFuture;
    if (loading != null) {
      await loading;
      return;
    }
    await _adsInitialization;
    if (!_adsCanRequest ||
        _isDisposed ||
        requestGeneration != _adRequestGeneration ||
        _hasPremium) {
      if (_hasPremium) {
        _removeAdsForPremium();
      }
      return;
    }
    _logAdEvent(
      'interstitial',
      'load_requested',
      adUnitId: _interstitialAdUnitId!,
    );
    final loadFuture = InterstitialAd.load(
      adUnitId: _interstitialAdUnitId!,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          _logAdEvent(
            'interstitial',
            'loaded',
            adUnitId: ad.adUnitId,
            responseInfo: ad.responseInfo,
          );
          final premium = _hasPremium;
          if (_isDisposed ||
              requestGeneration != _adRequestGeneration ||
              premium ||
              _interstitialAd != null) {
            ad.dispose();
            if (premium) _removeAdsForPremium();
            return;
          }
          _interstitialAd = ad;
        },
        onAdFailedToLoad: (error) {
          debugPrint('Interstitial failed: $error');
          _logAdEvent(
            'interstitial',
            'load_failed',
            adUnitId: _interstitialAdUnitId!,
            error: error,
            extra: {'isNoFill': error.code == 3},
          );
          if (requestGeneration == _adRequestGeneration) {
            _interstitialAd = null;
          }
        },
      ),
    );
    _interstitialLoadFuture = loadFuture;
    try {
      await loadFuture;
    } finally {
      if (identical(_interstitialLoadFuture, loadFuture)) {
        _interstitialLoadFuture = null;
      }
    }
  }

  Future<void> _showInterstitial() async {
    if (_interstitialAdUnitId == null) return;
    if (await _isPremiumForAds()) {
      _removeAdsForPremium();
      return;
    }
    final ad = _interstitialAd;
    _interstitialAd = null;
    if (ad == null) {
      await _prepareInterstitial();
      if (await _isPremiumForAds()) {
        _removeAdsForPremium();
        return;
      }
      final retry = _interstitialAd;
      if (retry == null) return;
      _interstitialAd = null;
      await _showLoadedInterstitial(retry);
      return;
    }
    await _showLoadedInterstitial(ad);
  }

  Future<void> _showLoadedInterstitial(InterstitialAd ad) async {
    final completed = Completer<void>();

    void finish() {
      if (!completed.isCompleted) completed.complete();
    }

    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        _logAdEvent('interstitial', 'shown', adUnitId: ad.adUnitId);
      },
      onAdImpression: (ad) {
        _logAdEvent('interstitial', 'impression', adUnitId: ad.adUnitId);
      },
      onAdDismissedFullScreenContent: (ad) {
        _logAdEvent('interstitial', 'dismissed', adUnitId: ad.adUnitId);
        _resumeNativeAudioAfterAd();
        ad.dispose();
        finish();
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        debugPrint('Interstitial show failed: $error');
        _logAdEvent(
          'interstitial',
          'show_failed',
          adUnitId: ad.adUnitId,
          error: error,
        );
        _resumeNativeAudioAfterAd();
        ad.dispose();
        finish();
      },
    );
    try {
      _logAdEvent('interstitial', 'show_requested', adUnitId: ad.adUnitId);
      await _pauseNativeAudioForAd();
      if (await _isPremiumForAds()) {
        _resumeNativeAudioAfterAd();
        ad.dispose();
        finish();
      } else {
        ad.show();
      }
    } catch (error) {
      debugPrint('Interstitial show threw: $error');
      _logAdEvent(
        'interstitial',
        'show_threw',
        adUnitId: ad.adUnitId,
        extra: {'errorMessage': error.toString()},
      );
      _resumeNativeAudioAfterAd();
      ad.dispose();
      finish();
    }
    await completed.future;
  }

  Future<void> _prepareRewarded() async {
    if (await _isPremiumForAds()) {
      _removeAdsForPremium();
      return;
    }
    final requestGeneration = _adRequestGeneration;
    if (_rewardedInterstitialAd != null) return;
    final loading = _rewardedLoadFuture;
    if (loading != null) {
      await loading;
      return;
    }

    final future = _loadRewarded(requestGeneration);
    _rewardedLoadFuture = future;
    try {
      await future;
    } finally {
      if (identical(_rewardedLoadFuture, future)) _rewardedLoadFuture = null;
    }
  }

  Future<void> _loadRewarded(int requestGeneration) async {
    await _adsInitialization;
    if (!_adsCanRequest ||
        _isDisposed ||
        requestGeneration != _adRequestGeneration ||
        _hasPremium) {
      if (_hasPremium) {
        _removeAdsForPremium();
      }
      return;
    }
    if (!_rewardedBackoff.tryStart()) return;
    try {
      await _loadRewardedAttempt(requestGeneration);
    } catch (error) {
      _rewardedBackoff.failed();
      debugPrint('Rewarded load threw: $error');
    }
  }

  Future<_RewardedLoadResult> _loadRewardedAttempt(
    int requestGeneration,
  ) async {
    final completed = Completer<_RewardedLoadResult>();
    _logAdEvent('rewarded', 'load_requested', adUnitId: _rewardedAdUnitId);
    await RewardedInterstitialAd.load(
      adUnitId: _rewardedAdUnitId,
      request: const AdRequest(),
      rewardedInterstitialAdLoadCallback: RewardedInterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          _logAdEvent(
            'rewarded',
            'loaded',
            adUnitId: ad.adUnitId,
            responseInfo: ad.responseInfo,
          );
          final premium = _hasPremium;
          if (_isDisposed ||
              requestGeneration != _adRequestGeneration ||
              premium ||
              _rewardedInterstitialAd != null) {
            _rewardedBackoff.succeeded();
            ad.dispose();
            if (premium) _removeAdsForPremium();
            if (!completed.isCompleted) {
              completed.complete(_RewardedLoadResult.failed);
            }
            return;
          }
          _rewardedBackoff.succeeded();
          _rewardedInterstitialAd = ad;
          if (!completed.isCompleted) {
            completed.complete(_RewardedLoadResult.loaded);
          }
        },
        onAdFailedToLoad: (error) {
          _rewardedBackoff.failed();
          debugPrint('Rewarded failed: $error');
          _logAdEvent(
            'rewarded',
            'load_failed',
            adUnitId: _rewardedAdUnitId,
            error: error,
            extra: {'isNoFill': error.code == 3},
          );
          if (requestGeneration == _adRequestGeneration) {
            _rewardedInterstitialAd = null;
          }
          if (!completed.isCompleted) {
            completed.complete(_RewardedLoadResult.failed);
          }
        },
      ),
    );
    return completed.future;
  }

  Future<bool> _showRewarded() async {
    if (await _isPremiumForAds()) {
      _removeAdsForPremium();
      return false;
    }
    final ad = _rewardedInterstitialAd;
    _rewardedInterstitialAd = null;
    if (ad == null) {
      await _prepareRewarded();
      if (await _isPremiumForAds()) {
        _removeAdsForPremium();
        return false;
      }
      final retry = _rewardedInterstitialAd;
      if (retry == null) return false;
      _rewardedInterstitialAd = null;
      return _showLoadedRewarded(retry);
    }
    return _showLoadedRewarded(ad);
  }

  Future<bool> _isPremiumForAds() async {
    if (_hasPremium) return true;
    try {
      final service = RevenueCatService.instance;
      await service.configure().timeout(const Duration(seconds: 5));
      if (service.customerInfo == null) {
        await service.refreshCustomerInfo().timeout(const Duration(seconds: 5));
      }
      return _hasPremium;
    } catch (error) {
      // A RevenueCat/network failure must never grant Premium, but it also
      // must not stop the free version's ads from working.
      debugPrint('Premium ad check failed; using known entitlements: $error');
      return _hasPremium;
    }
  }

  void _removeAdsForPremium() {
    _adRequestGeneration++;
    _bannerRequested = false;
    _cancelBannerRetry();
    _bannerAd?.dispose();
    _bannerAd = null;
    _interstitialAd?.dispose();
    _interstitialAd = null;
    _rewardedInterstitialAd?.dispose();
    _rewardedInterstitialAd = null;
    _bannerLoading = false;
    if (mounted) {
      setState(() => _bannerVisible = false);
    }
    _notifyBannerHeight(0);
  }

  void _scheduleBannerRetry() {
    if (!_bannerRequested || !mounted) return;
    _bannerRetryTimer?.cancel();
    _bannerRetryTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!mounted || !_bannerRequested || _bannerVisible || _bannerLoading) {
        return;
      }
      unawaited(_showBanner());
    });
  }

  void _cancelBannerRetry() {
    _bannerRetryTimer?.cancel();
    _bannerRetryTimer = null;
  }

  Future<bool> _showLoadedRewarded(RewardedInterstitialAd ad) async {
    final completed = Completer<bool>();
    var rewardEarned = false;

    void finish(bool rewarded) {
      if (!completed.isCompleted) completed.complete(rewarded);
    }

    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        _logAdEvent('rewarded', 'shown', adUnitId: ad.adUnitId);
      },
      onAdImpression: (ad) {
        _logAdEvent('rewarded', 'impression', adUnitId: ad.adUnitId);
      },
      onAdDismissedFullScreenContent: (ad) {
        _logAdEvent('rewarded', 'dismissed', adUnitId: ad.adUnitId);
        _resumeNativeAudioAfterAd();
        ad.dispose();
        // If the SDK dismisses without delivering the reward callback, do
        // not leave the WebView bridge pending forever.
        finish(rewardEarned);
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        debugPrint('Rewarded show failed: $error');
        _logAdEvent(
          'rewarded',
          'show_failed',
          adUnitId: ad.adUnitId,
          error: error,
        );
        _resumeNativeAudioAfterAd();
        ad.dispose();
        finish(false);
      },
    );
    try {
      _logAdEvent('rewarded', 'show_requested', adUnitId: ad.adUnitId);
      await _pauseNativeAudioForAd();
      if (await _isPremiumForAds()) {
        _resumeNativeAudioAfterAd();
        ad.dispose();
        finish(false);
      } else {
        ad.show(
          onUserEarnedReward: (_, reward) {
            rewardEarned = true;
            debugPrint('Reward granted: ${reward.amount} ${reward.type}');
            _logAdEvent(
              'rewarded',
              'reward_earned',
              adUnitId: ad.adUnitId,
              extra: {
                'rewardAmount': reward.amount.toString(),
                'rewardType': reward.type,
              },
            );
            // This is the authoritative completion signal. Waiting only for
            // onAdDismissedFullScreenContent can leave Android/WebView builds
            // stuck on "Loading video..." even though the ad was completed.
            finish(true);
          },
        );
      }
    } catch (error) {
      debugPrint('Rewarded show threw: $error');
      _logAdEvent(
        'rewarded',
        'show_threw',
        adUnitId: ad.adUnitId,
        extra: {'errorMessage': error.toString()},
      );
      _resumeNativeAudioAfterAd();
      ad.dispose();
      finish(false);
    }
    return completed.future;
  }

  @override
  void dispose() {
    _isDisposed = true;
    _controllerReady = false;
    _webViewPageReady = false;
    WidgetsBinding.instance.removeObserver(this);
    _loadingFallbackTimer?.cancel();
    _cancelBannerRetry();
    _pendingNativeAudioState = null;
    _javaScriptReplies.clear();
    RevenueCatService.instance.onCustomerInfoChanged = null;
    GameAudioService.instance.onStateChanged = null;
    _bannerAd?.dispose();
    _interstitialAd?.dispose();
    _rewardedInterstitialAd?.dispose();
    super.dispose();
  }

  /// Her banner göster/gizle state değişiminde WebView'e reklam yüksekliğini
  /// bildir; oyun içi word-list bu değeri padding olarak kullanır.
  void _notifyBannerHeight(double height) {
    unawaited(
      _runJavaScriptSafely(
        'window.__nativeBannerHeight = $height; '
        'document.documentElement.style.setProperty("--native-banner-h","${height}px"); '
        'window.dispatchEvent(new CustomEvent("nativeBannerChange",{detail:{height:$height}}));',
      ),
    );
  }

  // ---- iPhone-style left-edge swipe-to-go-back ----
  // The WebView is a single-page app, so there's no browser history for the
  // system back-swipe to hook into. Instead we watch for a drag that starts
  // within a thin strip along the left edge and report live progress to the
  // page (window.__swipeDragUpdate) so the topmost modal visually follows
  // the finger, the way a real iOS interactive pop transition does. On
  // release, window.__swipeDragEnd either completes the close (which then
  // calls window.__nativeSwipeBack itself) or snaps back if the swipe was
  // too short/slow - all defined in index.html.
  double _edgeSwipeDx = 0;

  void _handleEdgeSwipeStart(DragStartDetails details) {
    _edgeSwipeDx = 0;
  }

  void _handleEdgeSwipeUpdate(DragUpdateDetails details) {
    _edgeSwipeDx += details.delta.dx;
    if (_edgeSwipeDx < 0) _edgeSwipeDx = 0;
    unawaited(
      _runJavaScriptSafely(
        'window.__swipeDragUpdate && window.__swipeDragUpdate($_edgeSwipeDx);',
      ),
    );
  }

  Future<void> _handleEdgeSwipeEnd(DragEndDetails details) async {
    const distanceThreshold = 60.0;
    const velocityThreshold = 600.0;
    final velocity = details.primaryVelocity ?? 0;
    final shouldComplete =
        _edgeSwipeDx > distanceThreshold || velocity > velocityThreshold;
    _edgeSwipeDx = 0;
    if (!shouldComplete) {
      unawaited(
        _runJavaScriptSafely(
          'window.__swipeDragEnd && window.__swipeDragEnd(false);',
        ),
      );
      return;
    }
    // Privacy Policy and EULA are opened as real navigations away from the
    // single-page game (the EULA link even leaves the app's own assets for
    // Apple's page), so neither has the game's __swipeDragEnd/__nativeSwipeBack
    // hooks to catch the gesture - swiping right there used to do nothing,
    // stranding the player on that screen. Falling back to the WebView's own
    // back-history whenever one exists covers those pages (and anything else
    // navigated to) without needing every destination to know about the
    // game's custom gesture bridge. The in-game SPA never pushes browser
    // history entries, so canGoBack() is reliably false while actually
    // inside the game/menus, leaving the existing JS-driven modal/back
    // handling untouched there.
    if (await _controller.canGoBack()) {
      unawaited(_controller.goBack());
      return;
    }
    unawaited(
      _runJavaScriptSafely(
        'window.__swipeDragEnd && window.__swipeDragEnd(true);',
      ),
    );
  }

  void _handleEdgeSwipeCancel() {
    unawaited(
      _runJavaScriptSafely(
        'window.__swipeDragEnd && window.__swipeDragEnd(false);',
      ),
    );
    _edgeSwipeDx = 0;
  }

  @override
  Widget build(BuildContext context) {
    // Android back closes the game's top modal or screen first; only on the
    // home screen does it leave the app.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_handleAndroidBack());
      },
      child: _buildGame(context),
    );
  }

  Future<void> _handleAndroidBack() async {
    try {
      final handled = await _controller.runJavaScriptReturningResult(
        'window.__nativeSwipeBack ? String(window.__nativeSwipeBack()) : "false"',
      );
      if (handled.toString().contains('true')) return;
    } catch (error) {
      debugPrint('Back handling failed: $error');
    }
    await SystemNavigator.pop();
  }

  Widget _buildGame(BuildContext context) {
    final banner = _bannerAd;
    return Scaffold(
      // Arka plan rengi oyunla aynı olsun, siyah boşluk görünmesin
      backgroundColor: _themeSurfaceColor,
      body: DecoratedBox(
        decoration: BoxDecoration(
          color: _themeSurfaceColor,
          image: DecorationImage(
            image: AssetImage(_themeBackgroundAsset),
            fit: BoxFit.cover,
          ),
        ),
        child: SafeArea(
          // Status bar alanının arkası artık WebView'in kendi (dokulu) arka
          // planıyla doluyor - önceden burada Scaffold'un düz rengi
          // görünüyordu ve oyunun arka planından belli oluyordu ("bildirim
          // panelinin altı farklı renk" bug'ı). Sadece dokunulabilir içerik
          // (oyunun kendi CSS'i env(safe-area-inset-top) ile) durum
          // çubuğundan kaçınıyor; arka plan tam ekran boyanıyor.
          top: false,
          bottom: false,
          left: false,
          right: false,
          child: Stack(
            children: [
              // Keep the WebView at one stable size. On Android, inserting the
              // native banner as a Column sibling changes the platform-view
              // height and can make the WebView surface disappear/reappear.
              Positioned.fill(child: WebViewWidget(controller: _controller)),
              // Thin invisible strip so the swipe gesture doesn't fight the
              // WebView's own touch handling everywhere else.
              if (Platform.isIOS)
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onHorizontalDragStart: _handleEdgeSwipeStart,
                    onHorizontalDragUpdate: _handleEdgeSwipeUpdate,
                    onHorizontalDragEnd: _handleEdgeSwipeEnd,
                    onHorizontalDragCancel: _handleEdgeSwipeCancel,
                  ),
                ),
              // Always mounted (not conditionally, so AnimatedOpacity can
              // actually animate the fade-out instead of being yanked
              // out of the tree the instant _showLoadingOverlay flips).
              Positioned.fill(
                child: IgnorePointer(
                  ignoring: !_showLoadingOverlay,
                  child: AnimatedOpacity(
                    opacity: _showLoadingOverlay ? 1 : 0,
                    duration: const Duration(milliseconds: 320),
                    curve: Curves.easeOut,
                    child: Container(
                      alignment: Alignment.center,
                      // Theme-neutral night garden: the player's own theme is not known
                      // yet, so showing any theme photo here would flash the wrong one.
                      decoration: const BoxDecoration(
                        gradient: RadialGradient(
                          center: Alignment(0, -0.2),
                          radius: 1.1,
                          colors: [Color(0xFF24402E), Color(0xFF12241B), Color(0xFF0B1612)],
                          stops: [0, 0.55, 1],
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Perl waits on the loading screen too.
                          Image.asset(
                            'assets/game/images/perl/wave.webp',
                            height: 170,
                            fit: BoxFit.contain,
                          ),
                          const SizedBox(height: 18),
                          const Text(
                            'Garden\nof Words',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Color(0xFFFFF3D9),
                              fontSize: 46,
                              height: 1.0,
                              fontWeight: FontWeight.w900,
                              shadows: [Shadow(color: Color(0xFF3B2410), offset: Offset(0, 4), blurRadius: 0)],
                            ),
                          ),
                          const SizedBox(height: 28),
                          SizedBox(
                            width: 160,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: const LinearProgressIndicator(
                                minHeight: 5,
                                backgroundColor: Color(0x33B8E986),
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Color(0xFF8CCB5A),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              // Banner dock: the ad itself stays at the standard 320x50 size,
              // while the full-width tray uses the active theme palette. Do not
              // crop the theme artwork into this very short strip: that makes
              // an unrelated slice of the scene appear under the ad.
              if (_bannerVisible && banner != null)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color.lerp(_themeSurfaceColor, Colors.white, .12)!,
                          Color.lerp(_themeSurfaceColor, Colors.black, .16)!,
                        ],
                      ),
                      border: Border(
                        top: BorderSide(
                          color: Colors.white.withAlpha(58),
                          width: 1,
                        ),
                        bottom: BorderSide(
                          color: Colors.black.withAlpha(38),
                          width: 1,
                        ),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withAlpha(24),
                          blurRadius: 8,
                          offset: const Offset(0, -2),
                        ),
                      ],
                    ),
                    child: SafeArea(
                      top: false,
                      left: false,
                      right: false,
                      child: SizedBox(
                        height: banner.size.height.toDouble(),
                        child: Center(
                          child: SizedBox(
                            width: banner.size.width.toDouble(),
                            height: banner.size.height.toDouble(),
                            child: AdWidget(ad: banner),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
