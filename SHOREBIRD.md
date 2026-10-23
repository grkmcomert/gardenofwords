# Garden of Words / Shorebird

Codemagic'in kullandığı uygulama Flutter projesidir (`lib/` ve `assets/game/`).
Shorebird uygulama kimliği: `26269317-00c5-49c5-8dae-42ac7c2f24eb`.

## Kontrol edilen ilk derleme

Codemagic build 45'in indirilen IPA ve artifact dosyaları kontrol edildi:

- IPA: `kelimeler_bahcesi_webview.ipa`, sürüm `1.1.27+31`.
- Bundle ID: `com.grkmcomert.gardenofwords`.
- Xcode: `26.4.1` (`17E202`); iOS SDK: `26.4`.
- CocoaPods: `1.16.2`.
- IPA içindeki Shorebird kimliği projeyle aynı ve `auto_update: true`.
- Patch edilebilir oyun yükleyicisi `shorebird_bootstrap.html` IPA içinde mevcut.

`gardenofwords_45_artifacts.zip` içindeki `ios/Podfile.lock` projeye alındı.
Lock dosyasının Podfile checksum'u mevcut `ios/Podfile` ile eşleşiyor.
Codemagic Xcode/CocoaPods sürümleri bu derlemeye sabitlendi. İlk patch hedefi
`1.1.27+31` olarak kalır. Patch öncesinde bu dosyalar kaynak depoya aktarılmalıdır.
IPA incelemesi, TestFlight yüklemesinin veya cihazda patch uygulamasının
başarıyla tamamlandığını göstermez; bunlar ayrıca cihazda kontrol edilir.

## Codemagic'ten yayınlama

1. İlk kez **Garden of Words - Shorebird Release + TestFlight** çalıştırılır.
   Bu, `1.1.27+31` sürümünü Shorebird'e kaydeder ve imzalı IPA'yı mevcut `gow`
   bağlantısıyla TestFlight'a yükler. İlk testte bu sürüm cihaza kurulur.
   App Store kullanıcılarına ulaşması için bu ilk sürüm ayrıca App Store'da
   yayımlanmalıdır; eski, Shorebird içermeyen kurulumlar patch alamaz.
2. Sonraki Dart, HTML, CSS, JavaScript ve kelime listesi değişikliklerinde
   **Garden of Words - Shorebird Patch** çalıştırılır. Varsayılan hedef
   `1.1.27+31`, kanal `stable` olur. Patch için sürüm numarası artırılmaz.
   `staging` kanalı test içindir; normal kurulumlara dağıtılmaz.
3. Yeni mağaza sürümünde `codemagic.yaml` içindeki `BUILD_NAME`, `BUILD_NUMBER`
   ve `pubspec.yaml` sürümü birlikte artırılır. Patch ekranında güncellenecek
   kurulu sürüm seçilir. Yeni sürüm varsayılan olacaksa patch input'u da güncellenir.

İki akış da Codemagic'ten elle başlatılır. `main` push'undaki eski otomatik
TestFlight yüklemesi, aynı build numarasının yeniden yüklenmesini ve ilk
release hazır olmadan patch gönderilmesini önlemek için kaldırıldı.
Shorebird güncellemeyi arka planda indirir; indirilen patch bir sonraki uygulama
başlatılışında etkinleşir. Mevcut oyun oturumu zorla yeniden başlatılmaz.

## Oyun kodu nasıl güncelleniyor?

`tooling/build_shorebird_game.dart`, `assets/game/index.html` içindeki yerel
JavaScript dosyalarını gömer ve HTML/CSS/JS içeriğini sıkıştırarak Dart kaynak
dosyası üretir. Codemagic her release ve patch öncesinde bunu otomatik çalıştırır.
Üretilen `lib/generated/game_document.g.dart` yerel çalıştırma için de tutulur.
HTML ve kelime listeleri artık Flutter asset listesine dahil değildir;
böylece değişiklikleri Dart patch'ine girer.

Sabit `shorebird_bootstrap.html`, Dart içeriğini mevcut WebView'e yükler.
Oyun aynı `assets/game/` dizininde bir file URL üzerinde çalışır; göreli medya
yolları ve mevcut localStorage kullanımı devam eder. Fiziksel iPhone'da ilk
geçişte kayıtlı ilerleme, reklam/satın alma köprüleri ve çevrimdışı açılış
kontrol edilmelidir.

Yerel HTML/JS düzenlemesinden sonra:

```sh
dart tooling/build_shorebird_game.dart
flutter run
```

## Yeni mağaza sürümü gereken değişiklikler

- Swift/Kotlin, izinler, entitlement'lar, uygulama ikonu, splash ve native SDK'lar.
- Asset olarak paketlenen görseller, sesler, fontlar ve privacy-policy.html.
- Flutter/engine değişiklikleri.

Bu değişiklikler patch komutunda zorla kabul edilmez. Release akışı kullanılır.
Firebase, AdMob ve RevenueCat hizmetlerinin sunucu tarafı ayarları kendi
panellerinden yönetilir; Flutter/oyun tarafındaki entegrasyon kodu patch edilebilir.
`app/` altındaki ayrı Expo projesi bu Codemagic Flutter yayınına dahil değildir.

İlk release'in `ios/Podfile.lock` artifact'ı kaynaklara alındı; sonraki
patch'lerde aynı native bağımlılıkların kullanılmasını sağlar. Akış bu lock
dosyasını silmez. Flutter sürümü `3.47.2` olarak sabitlendi; Shorebird patch
sırasında hedef release'in Flutter revizyonunu otomatik seçer.

API anahtarı kullanıcının isteğiyle `codemagic.yaml` içinde yalnızca CI ortamına
tanımlıdır; `shorebird.yaml` veya uygulama içeriğine eklenmemiştir. Dosyaya erişimi
olanlar anahtarı okuyabilir. Codemagic Secure değişkenlerine taşınacaksa değişken
adı `SHOREBIRD_TOKEN` olarak korunmalı ve YAML içindeki açık değer kaldırılmalıdır.

Kaynaklar: [Shorebird + Codemagic](https://docs.shorebird.dev/code-push/ci/codemagic/),
[patch kapsamı](https://docs.shorebird.dev/code-push/patch/),
[güncelleme stratejileri](https://docs.shorebird.dev/code-push/update-strategies/).

## Doğrulama

`flutter test test/shorebird_game_test.dart` kaynak/bundle eşleşmesini ve
oyun kodunun patch'e dahil oluşunu kontrol eder. `node tooling/verify_shorebird.cjs`
Codemagic YAML'ını, Bash betiklerini, JavaScript sözdizimini ve Chrome'da
çevrimdışı açılış/localStorage/göreli medya yollarını doğrular. Son komut için
Node, Bash ve Chrome gerekir; farklı kurulum yollarında `BASH_BINARY` ve
`CHROME_BINARY` kullanılabilir.

Mevcut `test/widget_test.dart`, Windows test ortamında
`flutter_soloud_plugin.dll` yüklenemediği için başarısız olur; bu testin native
ses bağımlılığı bu değişiklikte yeniden düzenlenmedi. Codemagic hazırlık adımı
Shorebird'e özel üç testi çalıştırır. İmzalı iOS derlemesi ve gerçek cihazda patch
uygulaması Windows'ta doğrulanmadı; Codemagic/macOS ve iPhone gerekir.
