#!/bin/bash
# Builds the App Store screenshots (1290x2796) from the live game.
# Usage: bash tooling/store_screenshots/make.sh   (run from the project root; LANGS="en tr de")
# Pass 1 captures the game screen alone, pass 2 places it in frame.html.
set -e
ROOT=$(pwd)
HERE="$ROOT/tooling/store_screenshots"
WORK="$ROOT/build/store_shots"
OUT="$ROOT/store_screenshots"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
rm -rf "$WORK"; mkdir -p "$WORK" "$OUT"
cp -r "$ROOT/assets/game" "$WORK/site"
cp "$HERE/harness.js" "$WORK/site/"
cp "$HERE/frame.html" "$WORK/"
sed -i 's|<script src="meta.js"></script>|<script src="meta.js"></script><script src="harness.js"></script>|' "$WORK/site/index.html"

enc() { local s="$1"; s="${s//%/%25}"; s="${s// /%20}"; s="${s//&/%26}"; s="${s//=/%3D}"; s="${s//\?/%3F}"; s="${s//#/%23}"; s="${s//\'/%27}"; echo -n "$s"; }
chrome() { # out.png window dsf budget url
  rm -rf "$WORK/prof"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --user-data-dir="$(cygpath -w "$WORK/prof")" --force-device-scale-factor=$3 \
    --window-size=$2 --virtual-time-budget=$4 --screenshot="$(cygpath -w "$1")" "$5" 2>/dev/null
}
crop() { # in out w h
  powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Drawing; \$i=[Drawing.Image]::FromFile('$(cygpath -w "$1")'); \$b=New-Object Drawing.Bitmap $3,$4; \$g=[Drawing.Graphics]::FromImage(\$b); \$g.DrawImage(\$i,(New-Object Drawing.Rectangle 0,0,$3,$4),(New-Object Drawing.Rectangle 0,0,$3,$4),[Drawing.GraphicsUnit]::Pixel); \$b.Save('$(cygpath -w "$2")',[Drawing.Imaging.ImageFormat]::Png); \$g.Dispose(); \$i.Dispose(); \$b.Dispose()"
}

shot() { # name lang view title subtitle bubble side
  local name=$1 lang=$2 view="$3&lang=$2&name=Lily&hints=12&petals=248&streak=6&done=${DONE:-41}"
  local game="$WORK/game-$lang-$name.png"
  cat > "$WORK/host.html" <<H
<!doctype html><html><body style="margin:0;background:#0B1612"><iframe src="site/index.html?$view" style="border:0;width:390px;height:827px;display:block"></iframe></body></html>
H
  chrome "$game" 500,827 2.32 ${VT:-30000} "file:///$(cygpath -m "$WORK/host.html")"
  local url="file:///$(cygpath -m "$WORK/frame.html")?t=$(enc "$4")&s=$(enc "$5")&b=$(enc "$6")&m=$7&img=$(enc "$(basename "$game")")"
  chrome "$WORK/frame-$lang-$name.png" 500,1084 2.58 4000 "$url"
  crop "$WORK/frame-$lang-$name.png" "$OUT/$lang-$name.png" 1290 2796
  echo "$OUT/$lang-$name.png"
}

for L in ${LANGS:-en tr de}; do
  case $L in
    en) T1="A cozy garden of words"; S1="Find hidden words and watch your garden grow"; B1="Hi! Let's grow a garden!"
        T2="Every word makes a flower bloom"; S2="Swipe letters, fill the planter with flowers"; B2="Look, a tulip!"
        T3="950 beds, 19 gardens"; S3="Walk the stepping-stone path at your own pace"; B3="So many beds to bloom!"
        T4="Finish a garden, open the chest"; S4="Big rewards when all 50 beds bloom"; B4="Treasure time!"
        T5="Level up as you play"; S5="Earn XP, collect hints and climb the ranks"; B5="You're on fire!"
        T6="Grow rewards in your greenhouse"; S6="Daily quests, gifts and seeds that bloom"; B6="Come back tomorrow!" ;;
    tr) T1="Kelimelerle büyüyen bahçe"; S1="Gizli kelimeleri bul, bahçeni çiçeklendir"; B1="Merhaba! Hadi bahçe büyütelim!"
        T2="Her kelime bir çiçek açtırır"; S2="Harfleri kaydır, saksını çiçeklerle doldur"; B2="Bak, bir lale!"
        T3="950 bölüm, 19 bahçe"; S3="Taş patikada kendi hızınla ilerle"; B3="Açılacak ne çok bölüm var!"
        T4="Bahçeyi bitir, sandığı aç"; S4="50 bölümün hepsi açınca büyük ödüller"; B4="Hazine zamanı!"
        T5="Oynadıkça seviye atla"; S5="XP kazan, ipucu topla, yüksel"; B5="Harika gidiyorsun!"
        T6="Serada ödül yetiştir"; S6="Günlük görevler, hediyeler ve açan tohumlar"; B6="Yarın yine gel!" ;;
    de) T1="Ein gemütlicher Wortgarten"; S1="Finde versteckte Wörter und lass deinen Garten wachsen"; B1="Hallo! Lass uns gärtnern!"
        T2="Jedes Wort lässt eine Blume blühen"; S2="Wische Buchstaben und fülle den Pflanzkasten"; B2="Schau, eine Tulpe!"
        T3="950 Beete, 19 Gärten"; S3="Folge dem Trittsteinpfad in deinem Tempo"; B3="So viele Beete!"
        T4="Garten fertig, Truhe auf"; S4="Große Belohnungen, wenn alle 50 Beete blühen"; B4="Schatzzeit!"
        T5="Steig beim Spielen auf"; S5="Sammle EP und Tipps und werde besser"; B5="Super gemacht!"
        T6="Belohnungen aus dem Gewächshaus"; S6="Tägliche Aufgaben, Geschenke und Samen"; B6="Bis morgen!" ;;
  esac
  shot 1-home $L "view=home" "$T1" "$S1" "$B1" left
  shot 2-play $L "view=game&bed=42&found=3" "$T2" "$S2" "$B2" right
  shot 3-map $L "view=levels" "$T3" "$S3" "$B3" left
  DONE=49 shot 4-chest $L "view=gamedone&bed=50&xp=1" "$T4" "$S4" "$B4" right
  shot 5-levelup $L "view=gamedone&bed=42&xp=1250" "$T5" "$S5" "$B5" left
  shot 6-greenhouse $L "view=greenhouse" "$T6" "$S6" "$B6" right
done
