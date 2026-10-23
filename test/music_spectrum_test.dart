import 'package:flutter_test/flutter_test.dart';
import 'package:kelimeler_bahcesi_webview/music_spectrum.dart';

void main() {
  test('first five loud bands still fall and rise with the beat', () {
    final spectrum = MusicSpectrum();
    List<double> frame(double strength) =>
        List.generate(256, (bin) => strength / (1 + bin * 0.003));
    for (var n = 0; n < 40; n++) {
      spectrum.update(frame(3));
    }
    final loud = spectrum.update(frame(3));
    var quieter = loud;
    // Both levels used to be clipped to 1 even before band averaging.
    for (var n = 0; n < 5; n++) {
      quieter = spectrum.update(frame(1.1));
    }
    final beat = spectrum.update(frame(3));
    for (var band = 0; band < 5; band++) {
      expect(loud[band], lessThan(0.95));
      expect(loud[band] - quieter[band], greaterThan(0.12));
      expect(beat[band], greaterThan(quieter[band]));
    }
  });

  test('quiet treble has independent movement and silence settles', () {
    final spectrum = MusicSpectrum();
    final samples = List<double>.filled(256, 0);
    samples.fillRange(104, 160, 0.025);
    final levels = spectrum.update(samples);
    expect(levels[0], MusicSpectrum.floor);
    expect(levels[7], greaterThan(0.3));
    var silence = levels;
    for (var n = 0; n < 30; n++) {
      silence = spectrum.update(List<double>.filled(256, 0));
    }
    expect(silence, everyElement(closeTo(MusicSpectrum.floor, 0.0001)));
  });

  test('invalid samples and a track reset cannot leave stuck bars', () {
    final spectrum = MusicSpectrum();
    final malformed = List<double>.generate(
      256,
      (n) => [double.nan, double.infinity, -1.0][n % 3],
    );
    expect(spectrum.update(malformed), everyElement(MusicSpectrum.floor));
    spectrum.update(List<double>.filled(256, 2));
    spectrum.reset();
    expect(spectrum.update([]), everyElement(MusicSpectrum.floor));
  });
}
