import 'dart:math' as math;

/// Maps the live FFT to nine bars without flattening loud bass at full height.
class MusicSpectrum {
  static const floor = 0.16;
  static const bands = [
    (1, 3),
    (3, 6),
    (6, 12),
    (12, 22),
    (22, 38),
    (38, 64),
    (64, 104),
    (104, 160),
    (160, 256),
  ];

  final _peaks = List<double>.filled(bands.length, 0.08);
  final _levels = List<double>.filled(bands.length, floor);

  void reset() {
    _peaks.fillRange(0, bands.length, 0.08);
    _levels.fillRange(0, bands.length, floor);
  }

  List<double> update(List<double> samples) {
    if (samples.length < 256) return List.of(_levels);
    for (var band = 0; band < bands.length; band++) {
      final (start, end) = bands[band];
      var total = 0.0;
      for (var bin = start; bin < end; bin++) {
        final value = samples[bin];
        if (value.isFinite && value > 0) total += value;
      }
      final energy = total / (end - start);
      // Each frequency range has its own slowly decaying reference. Preserve
      // beat-to-beat changes instead of clipping all values above 0.2625.
      _peaks[band] = math.max(0.08, math.max(energy, _peaks[band] * 0.985));
      final reference = _peaks[band] * 0.65;
      final response = energy / (energy + reference);
      final target = floor + 0.82 * math.pow(response, 0.75);
      final smoothing = target > _levels[band] ? 0.72 : 0.42;
      _levels[band] += (target - _levels[band]) * smoothing;
    }
    return List.of(_levels);
  }
}
