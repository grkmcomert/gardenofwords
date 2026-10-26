#!/usr/bin/env python3
"""App Store screenshots from the live game, with Perl in a different pose on each.

Usage (from the project root):  python3 tooling/store_screenshots/make.py [en tr de]
Needs: pip install playwright pillow  (and a Playwright Chromium).
Output: store_screenshots/6.9/<lang>-<n>.png (1290x2796) and 6.5/ (1284x2778), RGB, no alpha.

Pass 1 captures the game screen (harness.js seeds a demo save and opens the view).
Pass 2 renders frame.html at 3x with that capture, the headline and a frozen Perl pose.
Google Fonts are served from tooling/store_screenshots/fonts so the text matches the app.
"""
import functools
import http.server
import shutil
import sys
import threading
import urllib.parse
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path.cwd()
HERE = ROOT / "tooling" / "store_screenshots"
WORK = ROOT / "build" / "store_shots"
OUT = ROOT / "store_screenshots"
PORT = 8791

# view query, Perl pose, pose time (s), Perl side, palette
SHOTS = [
    ("1-home", "view=home", "wave", 0.3, "left", "meadow"),
    ("2-play", "view=game&bed=42&found=3", "idea", 1.7, "right", "sky"),
    ("3-complete", "view=gamedone&bed=42&xp=300&clean=1", "clap", 0.2, "left", "peach"),
    ("4-leaderboard", "view=leaderboard", "cheer", 0.4, "right", "gold"),
    ("5-greenhouse", "view=greenhouse", "stretch", 1.7, "left", "mint"),
    ("6-themes", "view=themes", "hearts", 0.62, "right", "rose"),
]

COPY = {
    "en": {
        "name": "Lily",
        "1-home": ("A cozy garden *of words*", "Find hidden words and grow a blooming garden", "Hi! I'm Perl!"),
        "2-play": ("Every word makes *a flower bloom*", "Swipe letters in any direction", "I see one!"),
        "3-complete": ("Finish beds, *earn rewards*", "XP, petals and quests with every bed", "Bravo!"),
        "4-leaderboard": ("Climb the *XP leaderboard*", "Keep your daily streak burning", "To the top!"),
        "5-greenhouse": ("Grow treats in *your greenhouse*", "Plant seeds, harvest hints and petals", "Grow, little sprout!"),
        "6-themes": ("Pick your *garden's mood*", "Cozy themes, from rose cottage to moonlit nights", "I love this one!"),
    },
    "tr": {
        "name": "Deniz",
        "1-home": ("Kelimelerle büyüyen *bahçe*", "Gizli kelimeleri bul, bahçeni çiçeklendir", "Selam! Ben Perl!"),
        "2-play": ("Her kelime *bir çiçek* açtırır", "Harfleri her yöne kaydır", "Bir tane gördüm!"),
        "3-complete": ("Bölümü bitir, *ödülleri topla*", "Her bölümde XP, yaprak ve görevler", "Bravo!"),
        "4-leaderboard": ("*XP tablosunda* zirveye çık", "Günlük serini koru, herkesi geç", "Zirve bizim!"),
        "5-greenhouse": ("*Serada* ödül yetiştir", "Tohum ek, ipucu ve yaprak hasat et", "Hadi büyü, minik filiz!"),
        "6-themes": ("Bahçenin *havasını* seç", "Gül kulübesinden ay ışıklı gecelere temalar", "Buna bayıldım!"),
    },
    "de": {
        "name": "Lena",
        "1-home": ("Dein gemütlicher *Wortgarten*", "Finde versteckte Wörter und lass alles erblühen", "Hallo! Ich bin Perl!"),
        "2-play": ("Jedes Wort lässt *eine Blume* blühen", "Wische Buchstaben in jede Richtung", "Da ist eins!"),
        "3-complete": ("Beete fertig, *Belohnung* sichern", "EP, Blütenblätter und Aufgaben in jedem Beet", "Bravo!"),
        "4-leaderboard": ("Klettere in der *EP-Bestenliste*", "Halte deine Tagesserie am Leben", "Ganz nach oben!"),
        "5-greenhouse": ("Ernte im *Gewächshaus*", "Säe Samen, ernte Tipps und Blütenblätter", "Wachs, kleiner Spross!"),
        "6-themes": ("Wähle deine *Gartenstimmung*", "Vom Rosenhäuschen bis zur Mondnacht", "Das liebe ich!"),
    },
}


def prepare():
    shutil.rmtree(WORK, ignore_errors=True)
    WORK.mkdir(parents=True)
    shutil.copytree(ROOT / "assets" / "game", WORK / "site")
    shutil.copy(HERE / "harness.js", WORK / "site")
    shutil.copy(HERE / "frame.html", WORK)
    shutil.copytree(HERE / "fonts", WORK / "fonts")
    index = WORK / "site" / "index.html"
    html = index.read_text(encoding="utf-8")
    hook = '<script src="meta.js"></script>'
    assert hook in html, "meta.js script tag not found"
    index.write_text(html.replace(hook, hook + '<script src="harness.js"></script>'), encoding="utf-8")
    fonts = (HERE / "fonts" / "fonts.css").read_text(encoding="utf-8")
    return fonts.replace("url(./", f"url(http://localhost:{PORT}/fonts/")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(WORK))
    httpd = http.server.ThreadingHTTPServer(("localhost", PORT), handler)
    httpd.handle_error = lambda *a: None  # aborted image/font requests are expected
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def route_network(context, fonts_css):
    def handle(route):
        url = route.request.url
        if url.startswith("https://fonts.googleapis.com/"):
            return route.fulfill(status=200, content_type="text/css", body=fonts_css)
        if url.startswith("http://localhost"):
            return route.continue_()
        return route.abort()  # Firebase, ads: the game falls back to offline mode
    context.route("**/*", handle)


def main():
    langs = sys.argv[1:] or ["en", "tr", "de"]
    fonts_css = prepare()
    httpd = serve()
    (OUT / "6.9").mkdir(parents=True, exist_ok=True)
    (OUT / "6.5").mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in langs:
            copy = COPY[lang]
            for name, view, pose, pt, side, pal in SHOTS:
                # Pass 1: the game screen in a fresh profile (harness seeds and reloads once).
                ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                                          is_mobile=True, has_touch=True)
                route_network(ctx, fonts_css)
                page = ctx.new_page()
                query = f"{view}&lang={lang}&name={urllib.parse.quote(copy['name'])}&hints=12&petals=248&streak=6&done=41"
                page.goto(f"http://localhost:{PORT}/site/index.html?{query}")
                page.wait_for_load_state("load")
                page.wait_for_timeout(2600)
                page.evaluate("document.fonts.ready")
                game_png = WORK / f"game-{lang}-{name}.png"
                page.screenshot(path=str(game_png))
                ctx.close()

                # Pass 2: the framed store image.
                title, subtitle, bubble = copy[name]
                params = urllib.parse.urlencode({"img": game_png.name, "t": title, "s": subtitle, "b": bubble,
                                                 "side": side, "pose": pose, "pt": pt, "pal": pal})
                ctx = browser.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=3)
                route_network(ctx, fonts_css)
                page = ctx.new_page()
                page.goto(f"http://localhost:{PORT}/frame.html?{params}")
                page.wait_for_load_state("load")
                page.evaluate("document.fonts.ready")
                page.wait_for_timeout(400)
                frame_png = WORK / f"frame-{lang}-{name}.png"
                page.screenshot(path=str(frame_png))
                ctx.close()

                img = Image.open(frame_png).convert("RGB")
                assert img.size == (1290, 2796), img.size
                img.save(OUT / "6.9" / f"{lang}-{name}.png", optimize=True)
                img.resize((1284, 2778), Image.LANCZOS).save(OUT / "6.5" / f"{lang}-{name}.png", optimize=True)
                print(f"{lang}-{name}")
        browser.close()
    httpd.shutdown()


if __name__ == "__main__":
    main()
