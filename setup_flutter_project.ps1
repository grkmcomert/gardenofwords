$ErrorActionPreference = 'Stop'

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter bulunamadı. Önce Flutter PATH ayarını düzelt.'
}

Write-Host 'Flutter platform dosyaları oluşturuluyor...' -ForegroundColor Cyan

# flutter create can regenerate the native Android/iOS runner around our existing
# Dart/assets files. Save our files first because the command may refresh metadata.
$backup = Join-Path $PWD '.kb_backup'
if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item pubspec.yaml $backup
Copy-Item lib $backup -Recurse
Copy-Item assets $backup -Recurse

# iOS is intentionally left out: building/running the iOS target requires
# Xcode, which only runs on macOS. Add ",ios" back to --platforms only once
# you have (or borrow) a Mac to finish that side (see tooling/IOS_SETUP_PATCH.txt).
flutter create --platforms=android --org com.grkmcomert .

Copy-Item (Join-Path $backup 'pubspec.yaml') pubspec.yaml -Force
Remove-Item lib -Recurse -Force
Remove-Item assets -Recurse -Force
Copy-Item (Join-Path $backup 'lib') lib -Recurse
Copy-Item (Join-Path $backup 'assets') assets -Recurse
Remove-Item $backup -Recurse -Force

# Add INTERNET permission if it isn't present.
$manifest = 'android/app/src/main/AndroidManifest.xml'
if (Test-Path $manifest) {
  $text = Get-Content $manifest -Raw
  if ($text -notmatch 'android.permission.INTERNET') {
    $text = $text -replace '(<manifest[^>]*>)', '$1`r`n    <uses-permission android:name="android.permission.INTERNET" />'
    Set-Content -Path $manifest -Value $text -Encoding UTF8
  }
  if ($text -notmatch 'com.google.android.gms.ads.APPLICATION_ID') {
    $text = Get-Content $manifest -Raw
    $text = $text -replace '(<application[^>]*>)', "`$1`r`n        <meta-data`r`n            android:name=`"com.google.android.gms.ads.APPLICATION_ID`"`r`n            android:value=`"ca-app-pub-7480771330660307~8773437111`"/>"
    Set-Content -Path $manifest -Value $text -Encoding UTF8
  }
}

# --- Firebase (google-services.json) wiring ---
# The uploaded google-services.json was generated for applicationId
# com.grkmcomert.gardenofwords, which does NOT match what --org
# com.grkmcomert + this folder name would normally produce. Force the
# applicationId (and namespace) so it matches the Firebase config exactly.
$FIREBASE_APP_ID = 'com.grkmcomert.gardenofwords'

$appGradleKts = 'android/app/build.gradle.kts'
$appGradle = 'android/app/build.gradle'
$gradleFile = if (Test-Path $appGradleKts) { $appGradleKts } else { $appGradle }

if (Test-Path $gradleFile) {
  $g = Get-Content $gradleFile -Raw
  $g = $g -replace 'applicationId\s*=?\s*"[^"]*"', "applicationId = `"$FIREBASE_APP_ID`""
  $g = $g -replace 'namespace\s*=?\s*"[^"]*"', "namespace = `"$FIREBASE_APP_ID`""
  Set-Content -Path $gradleFile -Value $g -Encoding UTF8
}

$srcGoogleServices = 'firebase_config_for_android/google-services.json'
if (Test-Path $srcGoogleServices) {
  Copy-Item $srcGoogleServices 'android/app/google-services.json' -Force
} elseif (-not (Test-Path 'android/app/google-services.json')) {
  Write-Host 'UYARI: android/app/google-services.json bulunamadı - Firebase Android tarafında çalışmayacak.' -ForegroundColor Yellow
}

$rootGradleKts = 'android/build.gradle.kts'
$rootGradle = 'android/build.gradle'
$rootGradleFile = if (Test-Path $rootGradleKts) { $rootGradleKts } else { $rootGradle }
if (Test-Path $rootGradleFile) {
  $rg = Get-Content $rootGradleFile -Raw
  if ($rg -notmatch 'google-services') {
    if ($rootGradleFile -like '*.kts') {
      $rg = $rg -replace '(dependencies\s*\{)', "`$1`r`n        classpath(`"com.google.gms:google-services:4.4.2`")"
    } else {
      $rg = $rg -replace '(dependencies\s*\{)', "`$1`r`n        classpath 'com.google.gms:google-services:4.4.2'"
    }
    Set-Content -Path $rootGradleFile -Value $rg -Encoding UTF8
  }
}

if (Test-Path $gradleFile) {
  $g = Get-Content $gradleFile -Raw
  if ($g -notmatch 'com\.google\.gms\.google-services') {
    if ($gradleFile -like '*.kts') {
      $g = $g -replace '(plugins\s*\{)', "`$1`r`n    id(`"com.google.gms.google-services`")"
    } else {
      $g = "$g`r`napply plugin: 'com.google.gms.google-services'`r`n"
    }
    Set-Content -Path $gradleFile -Value $g -Encoding UTF8
  }
}

flutter pub get

Write-Host ''
Write-Host 'Hazır. Test etmek için: flutter run' -ForegroundColor Green
Write-Host 'Android APK: flutter build apk --release' -ForegroundColor Green
Write-Host 'iOS build yalnızca macOS üzerinde yapılabilir.' -ForegroundColor Yellow
