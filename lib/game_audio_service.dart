import 'dart:async';
import 'dart:io';

import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_soloud/flutter_soloud.dart';

import 'music_spectrum.dart';

/// The single audio owner for the Flutter/iOS build.
///
/// The game is rendered in a WebView, but audio must not be rendered there as
/// well. Web Audio and HTMLMediaElement each have their own lifecycle and
/// buffering rules on iOS. This service keeps one native SoLoud mixer for all
/// SFX and music, while the WebView only sends semantic game events.
class GameAudioService {
  GameAudioService._();

  static final GameAudioService instance = GameAudioService._();

  static const _effectVolume = 0.2;
  static const _musicVolume = 0.75;
  static const _clickMinimumInterval = Duration(milliseconds: 80);
  static const _completionDuplicateInterval = Duration(milliseconds: 350);
  static const _completionFade = Duration(milliseconds: 45);

  static const _clickAsset =
      'assets/game/audio/universfield-bubble-pop-02-293341.wav';
  static const _wordFoundAssets = <String>[
    'assets/game/audio/universfield-bubble-popping-229138.wav',
    'assets/game/audio/universfield-bubble-pop-07-487896.wav',
  ];
  static const _levelCompleteAssets = <String>[
    'assets/game/audio/floraphonic-marimba-win-d-1-209681.wav',
    'assets/game/audio/floraphonic-violin-win-1-175616.wav',
    'assets/game/audio/floraphonic-marimba-win-b-2-209675.wav',
  ];
  static const _musicAssets = <String, String>{
    'midnight-club': 'assets/game/audio/midnight-club.mp3',
    'cocktail-bar': 'assets/game/audio/cocktail-bar.mp3',
    'restaurant': 'assets/game/audio/restaurant.mp3',
    'chill-vlog-beats': 'assets/game/audio/chill-vlog-beats.mp3',
    'echoes-of-lumen':
        'assets/game/audio/echoes-of-lumen-lofi-hiphop-rainy-day-coffee-589277.mp3',
    'alex-morgan-sunny-cafe':
        'assets/game/audio/alex-morgan-lofi-sunny-cafe-568156.mp3',
    'alex-morgan-study-rainy-night':
        'assets/game/audio/alex-morgan-lofi-study-rainy-night-568166.mp3',
    'alex-morgan-hip-hop-rhythm-rainy-night':
        'assets/game/audio/alex-morgan-lofi-hip-hop-rhythm-rainy-night-560050.mp3',
  };

  final SoLoud _engine = SoLoud.instance;

  Future<void>? _initialization;
  AudioSession? _audioSession;
  bool _audioSessionActive = false;
  StreamSubscription<AudioInterruptionEvent>? _interruptionSubscription;
  StreamSubscription<void>? _becomingNoisySubscription;

  final List<AudioSource> _clickSounds = <AudioSource>[];
  final List<AudioSource> _wordFoundSounds = <AudioSource>[];
  final List<AudioSource> _levelCompleteSounds = <AudioSource>[];
  final Map<SoundHandle, AudioSource> _effectHandles =
      <SoundHandle, AudioSource>{};

  AudioSource? _musicSource;
  SoundHandle? _musicHandle;
  String? _musicTrackId;
  String? _requestedMusicTrackId;
  AudioData? _musicAudioData;
  Timer? _musicVisualizationTimer;
  List<double> _musicLevels = List<double>.filled(9, 0.16);
  final _musicSpectrum = MusicSpectrum();

  bool _sfxEnabled = true;
  final bool _musicEnabled = true;
  bool _backgrounded = false;
  bool _externalAudioPaused = false;
  bool _musicWasPlayingBeforeInterruption = false;
  bool _musicWasPlayingBeforeBackground = false;
  bool _musicWasPlayingBeforeExternalAudio = false;
  bool _musicUserPaused = false;
  DateTime? _lastClickAt;
  int _musicRequestId = 0;
  int _lifecycleRequestId = 0;
  int _effectGeneration = 0;
  int _nextWordFoundIndex = 0;
  int _nextLevelCompleteIndex = 0;
  String? _musicLoadingTrackId;
  bool _levelCompleteInFlight = false;
  DateTime? _lastLevelCompleteAt;

  static const _musicVisualizationInterval = Duration(milliseconds: 50);
  static const _musicVisualizerBarCount = 9;

  /// Called by the WebView host when the native playback state changes.
  void Function(Map<String, Object?> state)? onStateChanged;

  bool get isInitialized => _initialization != null && _engine.isInitialized;

  Future<void> initialize() {
    return _initialization ??= _initialize();
  }

  Future<void> _initialize() async {
    try {
      if (Platform.isIOS || Platform.isAndroid || Platform.isMacOS) {
        final session = await AudioSession.instance;
        await session.configure(const AudioSessionConfiguration.music());
        _audioSession = session;
        _interruptionSubscription = session.interruptionEventStream.listen(
          _handleInterruption,
        );
        _becomingNoisySubscription = session.becomingNoisyEventStream.listen(
          (_) => _handleBecomingNoisy(),
        );
      }

      await _engine.init(
        sampleRate: 44100,
        // 1024 is a practical iPhone compromise: materially less reactive
        // latency than SoLoud's 2048 default without courting underruns on
        // older devices with a WebView, ads and Firebase alive together.
        bufferSize: 1024,
        channels: Channels.stereo,
        lowLatency: true,
      );
      _engine.setMaxActiveVoiceCount(32);
      // The home rhythm bar is driven by the same native mixer that emits the
      // music. WebView-side HTML audio cannot observe this path on Flutter/iOS.
      _engine.setVisualizationEnabled(true);
      _engine.setFftSmoothing(0.45);
      _musicAudioData = AudioData(GetSamplesKind.linear);

      // Short effects stay decoded in memory. They are the only sounds that
      // need to begin immediately after a board event.
      final loaded = await Future.wait(<Future<AudioSource?>>[
        _loadEffect(_clickAsset),
        ..._wordFoundAssets.map(_loadEffect),
        ..._levelCompleteAssets.map(_loadEffect),
      ]);
      if (loaded.isNotEmpty && loaded[0] != null) {
        _clickSounds.add(loaded[0]!);
      }
      for (var i = 0; i < _wordFoundAssets.length; i++) {
        final source = loaded[i + 1];
        if (source != null) _wordFoundSounds.add(source);
      }
      final levelOffset = 1 + _wordFoundAssets.length;
      for (var i = 0; i < _levelCompleteAssets.length; i++) {
        final source = loaded[levelOffset + i];
        if (source != null) _levelCompleteSounds.add(source);
      }
      // Activate once during the loading window. Re-activating for every
      // click would add exactly the first-event latency this service avoids.
      await _activateAudioSession();
      _emitState();
    } catch (error, stackTrace) {
      debugPrint('Native game audio initialization failed: $error');
      debugPrintStack(stackTrace: stackTrace);
      _initialization = null;
      rethrow;
    }
  }

  Future<AudioSource?> _loadEffect(String asset) async {
    try {
      return await _engine.loadAsset(asset, mode: LoadMode.memory);
    } catch (error) {
      debugPrint('Native game effect failed to load ($asset): $error');
      return null;
    }
  }

  Future<AudioSource?> _loadMusic(String trackId) async {
    final asset = _musicAssets[trackId];
    if (asset == null) return null;
    try {
      // Music is large and only one track is active. Disk mode avoids keeping
      // an entire decoded album in RAM while SoLoud still owns the playback
      // and mix path instead of an iOS WebView media element.
      return await _engine.loadAsset(asset, mode: LoadMode.disk);
    } catch (error) {
      debugPrint('Native music failed to load ($trackId): $error');
      return null;
    }
  }

  Future<bool> _activateAudioSession() async {
    final session = _audioSession;
    if (session == null) return true;
    if (_audioSessionActive) return true;
    try {
      final active = await session.setActive(true);
      _audioSessionActive = active;
      return active;
    } catch (error) {
      debugPrint('Native audio session activation failed: $error');
      return false;
    }
  }

  Future<void> handleCommand(String action, Map<String, dynamic> params) async {
    switch (action) {
      case 'warmup':
        try {
          await initialize();
        } catch (_) {}
        return;
      case 'sfx':
        await playEffect(params['type']?.toString() ?? 'click');
        return;
      case 'setSfxEnabled':
        setSfxEnabled(params['enabled'] == true);
        return;
      case 'musicPlay':
        await playMusic(params['trackId']?.toString());
        return;
      case 'musicPause':
        pauseMusic();
        return;
      case 'musicStop':
        await stopMusic();
        return;
      case 'background':
        await pauseForBackground();
        return;
      case 'foreground':
        await resumeFromBackground();
        return;
      case 'externalAudioStart':
        await pauseForExternalAudio();
        return;
      case 'externalAudioEnd':
        await resumeFromExternalAudio();
        return;
      default:
        debugPrint('Unknown native audio action: $action');
    }
  }

  Future<void> playEffect(String type) async {
    if (!_sfxEnabled || _backgrounded || _externalAudioPaused) return;
    if (type != 'levelComplete' && _levelCompleteInFlight) return;
    final lifecycleId = _lifecycleRequestId;
    if (type == 'click') {
      final now = DateTime.now();
      final last = _lastClickAt;
      if (last != null && now.difference(last) < _clickMinimumInterval) {
        return;
      }
      _lastClickAt = now;
    }
    var effectGeneration = _effectGeneration;
    if (type == 'levelComplete') {
      final now = DateTime.now();
      final last = _lastLevelCompleteAt;
      if (_levelCompleteInFlight ||
          (last != null &&
              now.difference(last) < _completionDuplicateInterval)) {
        return;
      }
      _levelCompleteInFlight = true;
      _lastLevelCompleteAt = now;
      effectGeneration = ++_effectGeneration;
    }

    try {
      await initialize();
      if (!_sfxEnabled ||
          _backgrounded ||
          _externalAudioPaused ||
          effectGeneration != _effectGeneration ||
          lifecycleId != _lifecycleRequestId) {
        return;
      }
      if (!await _activateAudioSession() ||
          _backgrounded ||
          _externalAudioPaused ||
          effectGeneration != _effectGeneration ||
          lifecycleId != _lifecycleRequestId) {
        return;
      }
      final sounds = switch (type) {
        'wordFound' => _wordFoundSounds,
        'levelComplete' => _levelCompleteSounds,
        _ => _clickSounds,
      };
      if (sounds.isEmpty) return;

      final source = switch (type) {
        'wordFound' => _takeNextAvailableWordFoundSound(),
        'levelComplete' => _takeNextLevelCompleteSound(),
        _ => _isEffectSourceActive(sounds.first) ? null : sounds.first,
      };
      if (source == null) return;
      if (type == 'levelComplete') {
        await _fadeAndStopEffects();
        await Future<void>.delayed(_completionFade);
        if (!_sfxEnabled ||
            _backgrounded ||
            _externalAudioPaused ||
            effectGeneration != _effectGeneration ||
            lifecycleId != _lifecycleRequestId) {
          return;
        }
      }

      _pruneEffectHandles();
      final handle = _engine.play(source, volume: _effectVolume);
      if (!_sfxEnabled ||
          _backgrounded ||
          _externalAudioPaused ||
          effectGeneration != _effectGeneration ||
          lifecycleId != _lifecycleRequestId) {
        await _stopHandle(handle);
        return;
      }
      _effectHandles[handle] = source;
    } catch (error) {
      debugPrint('Native game effect could not play ($type): $error');
    } finally {
      if (type == 'levelComplete') _levelCompleteInFlight = false;
    }
  }

  AudioSource? _takeNextAvailableWordFoundSound() {
    _pruneEffectHandles();
    for (var attempt = 0; attempt < _wordFoundSounds.length; attempt++) {
      final source =
          _wordFoundSounds[_nextWordFoundIndex % _wordFoundSounds.length];
      _nextWordFoundIndex = (_nextWordFoundIndex + 1) % _wordFoundSounds.length;
      if (!_isEffectSourceActive(source)) return source;
    }
    return null;
  }

  AudioSource _takeNextLevelCompleteSound() {
    final source =
        _levelCompleteSounds[_nextLevelCompleteIndex %
            _levelCompleteSounds.length];
    _nextLevelCompleteIndex =
        (_nextLevelCompleteIndex + 1) % _levelCompleteSounds.length;
    return source;
  }

  void _pruneEffectHandles() {
    _effectHandles.removeWhere((handle, _) => !_isValidHandle(handle));
  }

  bool _isEffectSourceActive(AudioSource source) {
    _pruneEffectHandles();
    return _effectHandles.values.any((active) => identical(active, source));
  }

  Future<void> _fadeAndStopEffects() async {
    final handles = <SoundHandle>[..._effectHandles.keys];
    for (final handle in handles) {
      if (_isValidHandle(handle)) {
        try {
          _engine.fadeVolume(handle, 0, _completionFade);
        } catch (_) {}
      }
    }
    await Future<void>.delayed(_completionFade);
    await Future.wait(handles.map(_stopHandle));
    _effectHandles.clear();
  }

  Future<void> _stopHandle(SoundHandle handle) async {
    try {
      if (_engine.getIsValidVoiceHandle(handle)) await _engine.stop(handle);
    } catch (_) {}
  }

  void setSfxEnabled(bool enabled) {
    _sfxEnabled = enabled;
    if (!enabled) {
      _effectGeneration++;
      unawaited(_stopEffectHandles());
    }
    _emitState();
  }

  Future<void> _stopEffectHandles() async {
    final handles = <SoundHandle>[..._effectHandles.keys];
    await Future.wait(handles.map(_stopHandle));
    _effectHandles.clear();
  }

  Future<void> playMusic(String? requestedTrackId) async {
    if (!_musicEnabled || _backgrounded || _externalAudioPaused) return;
    final trackId = _musicAssets.containsKey(requestedTrackId)
        ? requestedTrackId!
        : _musicTrackId ?? _musicAssets.keys.first;
    // Taps outside the music widget also ask for playback. Do not restart an
    // in-flight local track load for every one of those taps.
    if (_musicLoadingTrackId == trackId) return;
    final requestId = ++_musicRequestId;
    _requestedMusicTrackId = trackId;
    _musicUserPaused = false;
    _musicLoadingTrackId = trackId;

    try {
      await initialize();
      if (!_musicEnabled ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused ||
          requestId != _musicRequestId) {
        return;
      }
      if (!await _activateAudioSession() ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused ||
          requestId != _musicRequestId) {
        return;
      }

      if (_musicTrackId == trackId &&
          _musicHandle != null &&
          _engine.getIsValidVoiceHandle(_musicHandle!)) {
        _engine.setPause(_musicHandle!, false);
        _engine.setVolume(_musicHandle!, _musicVolume);
        _emitState();
        return;
      }

      final nextSource = await _loadMusic(trackId);
      if (nextSource == null ||
          !_musicEnabled ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused ||
          requestId != _musicRequestId) {
        if (nextSource != null) await _engine.disposeSource(nextSource);
        _emitState();
        return;
      }

      final oldHandle = _musicHandle;
      final oldSource = _musicSource;
      _musicHandle = null;
      _musicSource = null;
      if (oldHandle != null) await _stopHandle(oldHandle);
      if (oldSource != null) {
        try {
          await _engine.disposeSource(oldSource);
        } catch (_) {}
      }

      final handle = _engine.play(
        nextSource,
        volume: _musicVolume,
        looping: true,
      );
      if (!_musicEnabled ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused ||
          requestId != _musicRequestId) {
        await _stopHandle(handle);
        await _engine.disposeSource(nextSource);
        return;
      }

      _musicSource = nextSource;
      _musicHandle = handle;
      _musicTrackId = trackId;
      _engine.setProtectVoice(handle, true);
      _emitState();
    } catch (error) {
      debugPrint('Native music could not play ($trackId): $error');
      _emitState();
    } finally {
      if (_musicLoadingTrackId == trackId) _musicLoadingTrackId = null;
    }
  }

  void pauseMusic() {
    _musicRequestId++;
    _musicLoadingTrackId = null;
    _musicUserPaused = true;
    _musicWasPlayingBeforeExternalAudio = false;
    final handle = _musicHandle;
    if (handle != null && _isValidHandle(handle)) {
      _engine.setPause(handle, true);
    }
    _emitState();
  }

  Future<void> stopMusic() async {
    _musicRequestId++;
    _musicLoadingTrackId = null;
    _musicUserPaused = true;
    _musicWasPlayingBeforeExternalAudio = false;
    final handle = _musicHandle;
    final source = _musicSource;
    _musicHandle = null;
    _musicSource = null;
    if (handle != null) await _stopHandle(handle);
    if (source != null) {
      try {
        await _engine.disposeSource(source);
      } catch (_) {}
    }
    _emitState();
  }

  Future<void> pauseForBackground() async {
    if (_backgrounded) return;
    _backgrounded = true;
    _lifecycleRequestId++;
    _effectGeneration++;
    _audioSessionActive = false;
    _musicWasPlayingBeforeBackground = _isMusicPlaying && !_musicUserPaused;
    final handle = _musicHandle;
    if (handle != null && _isValidHandle(handle)) {
      _engine.setPause(handle, true);
    }
    await _stopEffectHandles();
    _emitState();
  }

  Future<void> resumeFromBackground() async {
    if (!_backgrounded) return;
    final lifecycleId = ++_lifecycleRequestId;
    _backgrounded = false;
    final shouldResumeMusic = _musicWasPlayingBeforeBackground;
    if (_externalAudioPaused) {
      _musicWasPlayingBeforeBackground = shouldResumeMusic;
      _emitState();
      return;
    }
    _musicWasPlayingBeforeBackground = false;
    if (!shouldResumeMusic || !_musicEnabled || _musicUserPaused) {
      _emitState();
      return;
    }

    try {
      await initialize();
      if (lifecycleId != _lifecycleRequestId ||
          !_musicEnabled ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused) {
        return;
      }
      if (!await _activateAudioSession() ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused ||
          lifecycleId != _lifecycleRequestId) {
        return;
      }
      final handle = _musicHandle;
      if (handle != null && _isValidHandle(handle)) {
        _engine.setPause(handle, false);
      } else {
        await playMusic(_musicTrackId ?? _requestedMusicTrackId);
        return;
      }
      _emitState();
    } catch (error) {
      debugPrint('Native music resume failed: $error');
    }
  }

  bool get _isMusicPlaying {
    final handle = _musicHandle;
    return _isValidHandle(handle);
  }

  Future<void> pauseForExternalAudio() async {
    if (_externalAudioPaused) return;
    _externalAudioPaused = true;
    _effectGeneration++;
    _audioSessionActive = false;
    _musicWasPlayingBeforeExternalAudio = _isMusicPlaying && !_musicUserPaused;
    final handle = _musicHandle;
    if (handle != null && _isValidHandle(handle)) {
      _engine.setPause(handle, true);
    }
    await _stopEffectHandles();
    _emitState();
  }

  Future<void> resumeFromExternalAudio() async {
    if (!_externalAudioPaused) return;
    _externalAudioPaused = false;
    final shouldResumeMusic = _musicWasPlayingBeforeExternalAudio;
    _musicWasPlayingBeforeExternalAudio = false;
    if (_backgrounded) {
      _musicWasPlayingBeforeBackground =
          _musicWasPlayingBeforeBackground || shouldResumeMusic;
      _emitState();
      return;
    }
    if (!shouldResumeMusic || !_musicEnabled || _musicUserPaused) {
      _emitState();
      return;
    }

    try {
      await initialize();
      if (_externalAudioPaused ||
          _backgrounded ||
          !_musicEnabled ||
          _musicUserPaused) {
        return;
      }
      if (!await _activateAudioSession() ||
          _backgrounded ||
          _externalAudioPaused ||
          _musicUserPaused) {
        return;
      }
      final handle = _musicHandle;
      if (handle != null && _isValidHandle(handle)) {
        _engine.setPause(handle, false);
      } else {
        await playMusic(_musicTrackId ?? _requestedMusicTrackId);
        return;
      }
      _emitState();
    } catch (error) {
      debugPrint('Native music external-audio resume failed: $error');
    }
  }

  bool _isValidHandle(SoundHandle? handle) {
    if (handle == null || !_engine.isInitialized) return false;
    try {
      return _engine.getIsValidVoiceHandle(handle);
    } catch (_) {
      return false;
    }
  }

  void _startMusicVisualization() {
    if (_musicVisualizationTimer != null) return;
    _musicVisualizationTimer = Timer.periodic(
      _musicVisualizationInterval,
      (_) => _emitState(),
    );
  }

  void _stopMusicVisualization() {
    _musicVisualizationTimer?.cancel();
    _musicVisualizationTimer = null;
    _musicLevels = List<double>.filled(_musicVisualizerBarCount, 0.16);
    _musicSpectrum.reset();
  }

  List<double> _readMusicLevels() {
    final data = _musicAudioData;
    if (data == null || !_isMusicPlaying) return _musicLevels;

    try {
      data.updateSamples();
      final samples = data.getAudioData(alwaysReturnData: true);
      if (samples.length < 256) return _musicLevels;

      // SoLoud stores the 256 FFT magnitudes before the waveform samples.
      _musicLevels = _musicSpectrum.update(samples);
    } on Exception catch (error) {
      debugPrint('Native music visualization update failed: $error');
    }
    return _musicLevels;
  }

  void _pauseForInterruption() {
    _musicWasPlayingBeforeInterruption = _isMusicPlaying && !_musicUserPaused;
    unawaited(pauseForBackground());
  }

  void _handleBecomingNoisy() {
    _audioSessionActive = false;
    pauseMusic();
    unawaited(_stopEffectHandles());
  }

  void _handleInterruption(AudioInterruptionEvent event) {
    if (event.begin) {
      _pauseForInterruption();
      return;
    }
    if (_musicWasPlayingBeforeInterruption) {
      _musicWasPlayingBeforeInterruption = false;
      unawaited(resumeFromBackground());
    }
  }

  void _emitState() {
    final musicPlaying =
        _isMusicPlaying &&
        !_musicUserPaused &&
        !_backgrounded &&
        !_externalAudioPaused;
    if (musicPlaying) {
      _startMusicVisualization();
      _readMusicLevels();
    } else {
      _stopMusicVisualization();
    }
    onStateChanged?.call(<String, Object?>{
      'musicPlaying': musicPlaying,
      'musicTrackId': _musicTrackId,
      'sfxEnabled': _sfxEnabled,
      'musicLevels': musicPlaying ? _musicLevels : const <double>[],
    });
  }

  Future<void> dispose() async {
    _stopMusicVisualization();
    _musicAudioData?.dispose();
    _musicAudioData = null;
    await _interruptionSubscription?.cancel();
    await _becomingNoisySubscription?.cancel();
    _interruptionSubscription = null;
    _becomingNoisySubscription = null;
    _audioSessionActive = false;
    onStateChanged = null;
    if (_engine.isInitialized) {
      try {
        _engine.deinit();
      } catch (error) {
        debugPrint('Native game audio deinit failed: $error');
      }
    }
  }
}
