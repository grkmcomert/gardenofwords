# Firebase Premium yönetimi

`users` içindeki kullanıcı belgesinde:

| Alan | Anlamı |
| --- | --- |
| `manualPremium` | Boolean `true` vererek Premium açın; `false` yaparak manuel yetkiyi kaldırın. |
| `purchasePremium` | Uygulamanın RevenueCat'ten aldığı son satın alma durumu. |
| `isPremium` | Manuel yetki veya satın alma aktifse `true`. |

Manuel yetki, satın alınan Premium ile aynı reklamsız oyun, günlük ipucu,
tema ve profil düzenleme kontrollerini kullanır. Aktif satın alma varsa
`manualPremium: false` yapmak satın alma hakkını kaldırmaz.

Uygulama çevrimiçiyken sunucudan gelen profil değişikliklerini dinler;
`isPremium` ve `purchasePremium` alanlarını senkronize eder. Bu iki alan
son istemci durumunun özetidir, sunucu tarafından doğrulanmış satın alma
makbuzu değildir. Oyun, satın alma hakkını bu özetlerden açmaz; RevenueCat
durumunu kullanır. Manuel hak yalnızca `manualPremium` üzerinden açılır.
Yeni açılışta manuel hakkın doğrulanması için Firebase bağlantısı gerekir.

Kullanıcı adı değişince profil belgesinin kimliği sabit kalır, `name` ve
`nameLower` güncellenir; manuel yetki taşınırken kaybolmaz.

`user_progress` koleksiyonu okunmaz veya oluşturulmaz. Ayrıntılı bölüm ilerlemesi
cihazda kalır; mevcut `users` özetleri ve ipucu bakiyesi senkronize edilir.
Eski koleksiyondaki veriler bu değişiklikle topluca silinmez.

Günlük ipucu miktarı, tema erişimi ve diğer Premium davranışları
`assets/game/index.html` içindedir; Firebase'de ayrı hak ayarları tutulmaz.
Oyun bundle'ı `dart tooling/build_shorebird_game.dart` ile hazırlanır ve
mevcut Shorebird patch akışına girer. Yeni fiziksel görsel/ses asset'leri
mevcut release'in asset kapsamına bağlıdır; bkz. `SHOREBIRD.md`.

Yayın sırası: önce `firestore.rules` kurallarını Firebase'e yayınlayın
(`firebase deploy --only firestore:rules --project gardenofwords-ef918`),
ardından Shorebird patch'ini gönderin. Eski kurallar yeni profil alanlarını
reddeder. Bu çalışma canlı Firebase kurallarını veya Shorebird patch'ini
yayınlamaz.

Referanslar: [Firestore dinleyicileri](https://firebase.google.com/docs/firestore/query-data/listen),
[alan erişim kuralları](https://firebase.google.com/docs/firestore/security/rules-fields).
