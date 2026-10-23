$ErrorActionPreference = 'Stop'

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter bulunamadı. flutter doctor komutunun çalıştığından emin olun.'
}

flutter pub get
Write-Host ''
Write-Host 'Kurulum tamamlandı. Test için: flutter run' -ForegroundColor Green
