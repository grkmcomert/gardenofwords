import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AppStateStatus, ImageSourcePropType } from 'react-native';
import { WebView } from 'react-native-webview';

import { buildExpoGameDocument } from '@/expo-game-runtime';

const INTRO_INDEX_KEY = '@kelimeler-bahcesi/intro-image-index';
const INTRO_FADE_MS = 350;

const INTRO_IMAGES: ImageSourcePropType[] = [
  require('../../acilis/ChatGPT Image 20 A\u011fu 2026 02_16_22.png'),
  require('../../acilis/ChatGPT Image 20 A\u011fu 2026 02_16_28.png'),
  require('../../acilis/ChatGPT Image 20 A\u011fu 2026 02_16_36.png'),
];

const EXPO_BOOTSTRAP = `
  (() => {
    window.__expoGameRuntime = true;
    window.__nativePlatform = "expo";
  })();
  true;
`;

const EXPO_AUDIO_BACKGROUND = `
  window.__nativeAppBackground?.();
  true;
`;
const EXPO_AUDIO_FOREGROUND = `
  window.__nativeAppForeground?.();
  true;
`;

// The HTML document is inlined by Metro's Babel transform. Apply the theme
// grid sizing from the Expo bridge as well, so a cached HTML transform cannot
// bring back the old one-row grid on a device.
const EXPO_THEME_GRID_PATCH = `
  (() => {
    const applyThemeGridSize = () => {
      const backdrop = document.getElementById("themesModalBackdrop");
      const grid = document.getElementById("themeChoiceGrid");
      if (!backdrop || !grid || !backdrop.classList.contains("open")) return;
      const viewportHeight = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight));
      const visibleHeight = Math.min(352, Math.max(310, Math.round(viewportHeight * 0.42)));
      grid.style.setProperty("flex", "0 0 " + String(visibleHeight) + "px", "important");
      grid.style.setProperty("height", String(visibleHeight) + "px", "important");
      grid.style.setProperty("max-height", String(visibleHeight) + "px", "important");
      grid.style.setProperty("overflow-y", "auto", "important");
      grid.querySelectorAll(".game-theme-card").forEach((card) => {
        card.style.setProperty("height", "132px", "important");
        card.style.setProperty("min-height", "132px", "important");
      });
      grid.querySelectorAll(".game-theme-art").forEach((art) => {
        art.style.setProperty("min-height", "88px", "important");
        art.style.setProperty("background-size", "contain", "important");
      });
      grid.querySelectorAll(".game-theme-name").forEach((name) => {
        name.style.setProperty("font-size", ".82rem", "important");
        name.style.setProperty("line-height", "1.2", "important");
        name.style.setProperty("min-height", "1.2em", "important");
      });
    };

    if (!window.__expoThemeGridPatchInstalled) {
      window.__expoThemeGridPatchInstalled = true;
      const backdrop = document.getElementById("themesModalBackdrop");
      if (backdrop && typeof MutationObserver === "function") {
        new MutationObserver(applyThemeGridSize).observe(backdrop, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
      window.addEventListener("resize", applyThemeGridSize, { passive: true });
      window.visualViewport?.addEventListener("resize", applyThemeGridSize, { passive: true });
    }

    applyThemeGridSize();
  })();
  true;
`;

let fallbackIntroIndex = 0;

export default function HomeScreen() {
  const [gameDocument, setGameDocument] = useState<{
    htmlUri: string;
    logoUri: string;
    baseUrl: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [introImage, setIntroImage] = useState<ImageSourcePropType | null>(null);
  const [introVisible, setIntroVisible] = useState(true);
  const webViewRef = useRef<WebView>(null);
  const introOpacity = useRef(new Animated.Value(1)).current;
  const introProgress = useRef(new Animated.Value(0)).current;
  const introProgressState = useRef({ image: 0, storage: 0, webView: 0 });
  const gameReady = useRef(false);
  const introFinished = useRef(false);
  const finishIntroRef = useRef<() => void>(() => undefined);

  const refreshIntroProgress = useCallback(() => {
    const { image, storage, webView } = introProgressState.current;
    const target = image * 0.2 + storage * 0.1 + webView * 0.7;
    Animated.timing(introProgress, {
      toValue: target,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [introProgress]);

  const markIntroImageReady = () => {
    introProgressState.current.image = 1;
    refreshIntroProgress();
    finishIntroRef.current();
  };

  useEffect(() => {
    let cancelled = false;

    const finishIfReady = () => {
      if (
        cancelled ||
        introFinished.current ||
        !gameReady.current ||
        introProgressState.current.image < 1 ||
        introProgressState.current.storage < 1 ||
        introProgressState.current.webView < 1
      ) {
        return;
      }

      introFinished.current = true;
      Animated.timing(introProgress, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished || cancelled) return;

        Animated.timing(introOpacity, {
          toValue: 0,
          duration: INTRO_FADE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(({ finished: fadeFinished }) => {
          if (fadeFinished && !cancelled) setIntroVisible(false);
        });
      });
    };

    finishIntroRef.current = finishIfReady;

    const startIntro = async () => {
      let index = fallbackIntroIndex;

      try {
        const savedIndex = await AsyncStorage.getItem(INTRO_INDEX_KEY);
        const parsedIndex = Number(savedIndex);
        if (Number.isInteger(parsedIndex) && parsedIndex >= 0) {
          index = parsedIndex % INTRO_IMAGES.length;
        }
      } catch {
        // Keep the in-memory fallback when storage is temporarily unavailable.
      }

      const nextIndex = (index + 1) % INTRO_IMAGES.length;
      fallbackIntroIndex = nextIndex;

      if (cancelled) return;

      setIntroImage(INTRO_IMAGES[index]);
      introProgress.setValue(0);
      introProgressState.current = { image: 0, storage: 0, webView: 0 };
      gameReady.current = false;
      introFinished.current = false;

      try {
        await AsyncStorage.setItem(INTRO_INDEX_KEY, String(nextIndex));
      } catch {
        // The in-memory fallback still advances the sequence for this run.
      }

      if (cancelled) return;
      introProgressState.current.storage = 1;
      refreshIntroProgress();
      finishIfReady();
    };

    void startIntro();

    return () => {
      cancelled = true;
      finishIntroRef.current = () => undefined;
      introOpacity.stopAnimation();
      introProgress.stopAnimation();
    };
  }, [introOpacity, introProgress, refreshIntroProgress]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    let mounted = true;

    const prepareExpoRuntime = async () => {
      // Configure iOS audio before creating the WebView. Starting Web Audio
      // while AVAudioSession is still changing can produce a startup crackle.
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
      } catch {
        // The WebView still owns playback if Expo audio is unavailable.
      }
      if (!mounted) return;

      try {
        const document = await buildExpoGameDocument();
        if (mounted) setGameDocument(document);
      } catch (error: unknown) {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    };

    void prepareExpoRuntime();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    let currentState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = currentState === 'active';
      const isActive = nextState === 'active';
      currentState = nextState;

      // iOS can emit inactive before background and Android can go straight
      // to background. Bridge only the active/non-active edge so duplicate
      // lifecycle events do not schedule two audio fades.
      if (wasActive === isActive || !gameReady.current) return;
      try {
        webViewRef.current?.injectJavaScript(
          isActive ? EXPO_AUDIO_FOREGROUND : EXPO_AUDIO_BACKGROUND,
        );
      } catch {
        // The WebView may already be unmounting; its own page lifecycle
        // handler remains the fallback for this transition.
      }
    });

    return () => subscription.remove();
  }, []);

  const readyScript = useMemo(() => {
    if (!gameDocument) return 'true;';

    return `
      ${EXPO_THEME_GRID_PATCH}
      (() => {
        const logo = document.getElementById('homeBrandLogo');
        if (logo) logo.src = ${JSON.stringify(gameDocument.logoUri)};
        window.__notifyFlutterGameReady?.();
      })();
      true;
    `;
  }, [gameDocument]);

  const webViewSource = useMemo(
    () =>
      gameDocument
        ? { uri: gameDocument.htmlUri }
        : undefined,
    [gameDocument],
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedTitle}>Garden of Words</Text>
        <Text style={styles.unsupportedBody}>
          Oyunu Expo Go ile Android veya iOS üzerinde açın.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {webViewSource ? (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={webViewSource}
          allowingReadAccessToURL={gameDocument?.baseUrl}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          cacheEnabled={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={EXPO_BOOTSTRAP}
          injectedJavaScript={readyScript}
          onLoadProgress={({ nativeEvent }) => {
            const progress = Number(nativeEvent.progress);
            if (Number.isFinite(progress)) {
              introProgressState.current.webView = Math.max(
                introProgressState.current.webView,
                progress,
              );
              refreshIntroProgress();
            }
          }}
          onLoadEnd={() => {
            // The HTML starts hidden for Flutter's ready handshake. Expo has
            // no Flutter channel, so complete that same final handshake here.
            webViewRef.current?.injectJavaScript(readyScript);
            introProgressState.current.webView = 1;
            refreshIntroProgress();
            gameReady.current = true;
            finishIntroRef.current();
          }}
          onError={(event) => {
            setLoadError(event.nativeEvent.description || 'WebView yüklenemedi.');
          }}
          style={styles.webview}
        />
      ) : null}

      {introVisible ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.introOverlay, { opacity: introOpacity }]}
        >
          {introImage ? (
            <Image
              source={introImage}
              resizeMode="cover"
              style={styles.introImage}
              onLoad={markIntroImageReady}
              onError={markIntroImageReady}
            />
          ) : null}
          <View style={styles.introLoadingArea}>
            {loadError ? (
              <Text style={styles.errorText}>{loadError}</Text>
            ) : (
              <View style={styles.introProgressTrack}>
                <Animated.View
                  style={[
                    styles.introProgressFill,
                    {
                      width: introProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            )}
          </View>
          {!introImage && !loadError ? (
            <ActivityIndicator color="#FFFFFF" style={styles.spinner} />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
  },
  introOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 10,
  },
  introImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  introLoadingArea: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 42,
  },
  introProgressTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  introProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  spinner: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 76,
  },
  errorText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 13,
  },
  unsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#EFE6D2',
  },
  unsupportedTitle: {
    color: '#2B3B28',
    fontSize: 26,
    fontWeight: '700',
  },
  unsupportedBody: {
    marginTop: 12,
    color: '#5B6B52',
    textAlign: 'center',
  },
});
