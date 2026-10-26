#!/usr/bin/env python3
"""Split the real Perl artwork into animation layers.

Inputs (in this folder):
  perl-icon-cutout.png  the app icon bunny with the background removed (1024x1024 RGBA)
  perl-logo-crop.png    Perl peeking over the sign, cropped from the high-res logo (RGBA)
Outputs: layers/*.png (RGBA) and assets/game/perl-sprites.js (WebP data URIs, patchable).
Needs: pip install pillow numpy opencv-python-headless

Ears are lifted out so they can rotate behind the hat/headphones; the waving paw is lifted
out and the cheek under it is inpainted so a wave never shows a hole.
"""
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
OUT = HERE / "layers"
OUT.mkdir(exist_ok=True)


def poly_mask(size, pts, feather=0):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(m, dtype=np.float32) / 255.0


def hue_sat(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    return hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255


def soften(mask, r=1.2):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255


def save(rgb, alpha, name):
    a = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    Image.fromarray(np.dstack([rgb, a]), "RGBA").save(OUT / f"{name}.png")


icon = np.asarray(Image.open(HERE / "perl-icon-cutout.png").convert("RGBA"))
rgb, alpha = icon[..., :3].copy(), icon[..., 3].astype(np.float32) / 255
size = (icon.shape[1], icon.shape[0])
H, S, V = hue_sat(rgb)
furry = ((H < 52) | (H > 345)) & (S > 0.12)          # tan fur and the peach inner ear
not_gear = ~(((H > 230) & (H < 310)) | ((H > 55) & (H < 140)))   # purple band, green hat/leaves

# Ears: everything above the headphone band. The layer reaches a little below the band's top
# edge (hidden behind it), so a rotating ear never shows its cut base. On the body only the
# band and the hat leaves are kept inside the ear area, which also clears the cutout halo.
gear = soft_gear = soften((~not_gear).astype(np.float32), 0.8)
for side, pts, base in [
    ("l", [(130, 10), (340, 10), (452, 192), (440, 236), (330, 292), (262, 352), (150, 330)],
          [(130, 10), (340, 10), (452, 192), (424, 207), (320, 260), (256, 318), (150, 305)]),
    ("r", [(590, 10), (880, 10), (890, 330), (816, 352), (760, 292), (590, 232), (578, 190)],
          [(590, 10), (880, 10), (890, 300), (822, 318), (768, 258), (602, 203), (578, 190)]),
]:
    clear_of_band = 1 - cv2.dilate((~not_gear).astype(np.uint8), np.ones((11, 11), np.uint8)).astype(np.float32)
    ear_tone = (((H < 62) | (H > 340)) & (S > 0.2) & (V > 0.42) & ~((S < 0.3) & (V > 0.85))).astype(np.float32)   # fur and inner ear only
    ear = poly_mask(size, pts, feather=1.5) * soften(clear_of_band * ear_tone, 0.8) * alpha
    save(rgb, ear, f"icon-ear-{side}")
    above = poly_mask(size, base, feather=1.5)
    deep = cv2.erode((above > 0.5).astype(np.uint8), np.ones((17, 17), np.uint8)).astype(np.float32)
    keep_band = above * (1 - deep) * soft_gear * (alpha > 0.5)
    alpha = alpha * (1 - above) + alpha * keep_band

# Waving paw: lifted out whole, then the cheek and ear cup under it are filled in.
paw_tone = soften((((H > 12) & (H < 55)) & (V > 0.32)).astype(np.float32), 0.8)
paw = poly_mask(size, [(778, 770), (805, 745), (845, 738), (885, 748), (906, 790), (912, 880), (908, 1024), (782, 1024), (776, 880)], feather=1.5) * alpha * paw_tone
save(rgb, paw, "icon-paw")
hole = (paw > 0.1).astype(np.uint8) * 255
hole = cv2.dilate(hole, np.ones((7, 7), np.uint8))
filled = cv2.inpaint(rgb, hole, 20, cv2.INPAINT_TELEA)
keep = np.maximum(poly_mask(size, [(700, 700), (796, 690), (806, 760), (800, 1024), (700, 1024)], feather=3),
                  poly_mask(size, [(780, 600), (905, 590), (902, 760), (800, 772)], feather=3))
body_alpha = np.where(hole > 0, keep, alpha * (1 - paw))
body_rgb = np.where(hole[..., None] > 0, filled, rgb)
save(body_rgb, body_alpha, "icon-body")

# Peek: the logo bunny without the sign and the big leaf.
logo = np.asarray(Image.open(HERE / "perl-logo-crop.png").convert("RGBA"))
lrgb, la = logo[..., :3], logo[..., 3].astype(np.float32) / 255
lsize = (logo.shape[1], logo.shape[0])
sign_left = poly_mask(lsize, [(0, 165), (42, 182), (60, 232), (66, 296), (58, 330), (0, 376)])
below = poly_mask(lsize, [(0, 300), (60, 305), (130, 322), (200, 334), (270, 345), (330, 356), (434, 372), (434, 376), (0, 376)])
leaf = poly_mask(lsize, [(388, 266), (434, 255), (434, 376), (352, 376), (372, 330), (386, 300)])
paws = np.maximum(poly_mask(lsize, [(60, 300), (80, 285), (125, 286), (142, 305), (140, 342), (100, 350), (64, 338)], feather=1),
                  poly_mask(lsize, [(262, 340), (285, 324), (325, 326), (345, 345), (342, 376), (262, 376)], feather=1))
cut = np.maximum(np.maximum(sign_left, below * (1 - paws)), leaf)
save(lrgb, la * (1 - soften(cut, 1.0)), "peek")

# Web sprites, embedded as data URIs in assets/game/perl-sprites.js (patchable, no new assets).
import base64, io
sprites = {}
for name, width in [("icon-body", 560), ("icon-ear-l", 560), ("icon-ear-r", 560), ("icon-paw", 560), ("peek", 420)]:
    im = Image.open(OUT / f"{name}.png")
    if name.startswith("icon"):
        im = im.resize((width, width), Image.LANCZOS)
    else:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=84, method=6)
    sprites[name] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
target = HERE.parent.parent / "assets" / "game" / "perl-sprites.js"
lines = ["/* GENERATED by tooling/perl/build_layers.py from the real Perl artwork. Do not edit. */",
         "window.PerlSprites = {"]
lines += [f'  "{k}": "{v}",' for k, v in sprites.items()]
lines += ["};", ""]
target.write_text("\n".join(lines), encoding="utf-8")
print("layers written to", OUT, "| sprites:", {k: len(v) // 1024 for k, v in sprites.items()}, "KB")
