#!/usr/bin/env python3
"""Rig the logo Perl (the bunny peeking over the sign) for animation.

Input:  perl-logo-crop.png  (Perl cropped from the high-res logo, RGBA, 434x376)
Output: layers/*.png and assets/game/perl-sprites.js (WebP data URIs, ships in a Shorebird patch)
Needs:  pip install pillow numpy opencv-python-headless

Layers (all on one canvas; the canvas extends below the sign line for the forearms):
  head          face + hat + flower, chin and cheeks completed where paws/sign covered them
  ear-l, ear-r  ears, drawn behind the head so they can wiggle and flop
  paw-l, paw-r  paws with a forearm reaching down behind the ledge, so a raised paw has an arm
  eyes-closed   peaceful closed eyes painted over the same face (blink, sleep, yawn)
  eyes-happy    ^^ eyes (laughing, cheering)
  mouth-closed  a small closed smile (sleeping, thinking)
"""
from pathlib import Path
import base64, io
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
OUT = HERE / "layers"
OUT.mkdir(exist_ok=True)
SS = 4          # supersampling for drawn strokes
PAD = 170       # canvas extension below the crop for forearms

src = np.asarray(Image.open(HERE / "perl-logo-crop.png").convert("RGBA"))
H0, W0 = src.shape[:2]
W, H = W0, H0 + PAD
rgb = np.zeros((H, W, 3), np.uint8); rgb[:H0] = src[..., :3]
alpha = np.zeros((H, W), np.float32); alpha[:H0] = src[..., 3] / 255.0
size = (W, H)


def poly(pts, feather=0.0):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(m, np.float32) / 255


def ellipse(cx, cy, rx, ry, feather=0.0):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(m, np.float32) / 255


def blur(m, r):
    return np.asarray(Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


def bleed(rgb_, a_, sigmas=(2, 5, 10, 20, 40)):
    """Spread known colours outward (ignores transparent black), for filling hidden fur."""
    out = rgb_.astype(np.float32).copy()
    have = (a_ > 0.6).astype(np.float32)
    for s_ in sigmas:
        w = cv2.GaussianBlur(have, (0, 0), s_)
        c = cv2.GaussianBlur(rgb_.astype(np.float32) * have[..., None], (0, 0), s_)
        est = c / np.maximum(w[..., None], 1e-4)
        take = (have < 0.5) & (w > 0.02)
        out[take] = est[take]
        have = np.maximum(have, (w > 0.02).astype(np.float32))
    return out


def grow(m, px):
    return cv2.dilate((m > 0.1).astype(np.uint8), np.ones((px * 2 + 1, px * 2 + 1), np.uint8)).astype(np.float32)


def save(name, rgb_, a_):
    Image.fromarray(np.dstack([rgb_, np.clip(a_ * 255, 0, 255).astype(np.uint8)]), "RGBA").save(OUT / f"{name}.png")


hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
Hh, S, V = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
green = ((Hh > 60) & (Hh < 160) & (S > 0.25)).astype(np.float32)

# 1. Remove the sign and the big leaf (everything that is not Perl).
sign = np.maximum(poly([(0, 165), (42, 182), (60, 232), (66, 296), (58, 330), (0, H0)]),
                  poly([(0, 300), (60, 305), (130, 322), (200, 334), (270, 345), (330, 356), (W, 372), (W, H0), (0, H0)]))
leaf = poly([(388, 266), (W, 255), (W, H0), (352, H0), (372, 330), (386, 300)])
paw_l_m = poly([(60, 300), (80, 285), (125, 286), (142, 305), (140, 342), (100, 350), (64, 338)], 1.0)
paw_r_m = poly([(260, 340), (284, 323), (326, 325), (347, 345), (345, H0), (260, H0)], 1.0)
not_perl = np.maximum(sign * (1 - np.maximum(paw_l_m, paw_r_m)), leaf)
alpha *= 1 - blur(not_perl, 1.0)

# 2. Ears: lifted out of the head, drawn behind it.
greenish = ((Hh > 55) & (Hh < 170) & (S > 0.12)).astype(np.float32)
not_hat = 1 - blur(grow(greenish, 4), 1.0)
# Ears and head split the ear areas exactly: the hat, its leaves and the flower stay on the
# head, every other pixel there goes to the ear (drawn behind). Together they rebuild the
# original, so there is no seam at rest, and a moving ear never drags hat pieces along.
ear_l_poly = poly([(138, 0), (274, 0), (272, 120), (250, 146), (168, 152), (138, 104)], 0.8)
ear_r_poly = poly([(290, 100), (300, 66), (340, 50), (W, 52), (W, 214), (386, 236), (352, 206), (318, 182), (294, 150)], 0.8)
solid_green = ((green > 0.5) & (alpha > 0.85)).astype(np.float32)
hat_region = poly([(0, 240), (40, 240), (60, 170), (130, 120), (205, 98), (214, 84), (300, 88), (302, 132), (336, 174), (388, 220), (W, 244), (W, H), (0, H)], 1.0)
keep_l = blur(solid_green * hat_region, 0.6)
petals = ((((Hh > 320) | (Hh < 14)) & (S > 0.3)) | ((Hh > 35) & (Hh < 60) & (S > 0.5))).astype(np.float32)
keep_r = np.maximum(blur(solid_green * hat_region, 0.6), blur(ellipse(326, 205, 36, 36) * petals, 0.6))
# The ear layers reach 3 px under what the head keeps, so the two edges overlap (no seam).
under = lambda k: blur(cv2.erode((k > 0.5).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32), 0.8)
ear_l = alpha * ear_l_poly * (1 - under(keep_l))
ear_r = alpha * ear_r_poly * (1 - under(keep_r))
# Anything in an ear layer that is not fur (hat edge, petal rim) is repainted with nearby fur,
# so a turning ear shows a fur edge instead of dragging hat or flower crumbs along.
non_fur = ((greenish > 0.5) | ((((Hh > 325) | (Hh < 8)) & (S > 0.42))) | (V < 0.3)).astype(np.float32)
non_fur = grow(non_fur, 1)
ear_rgb = np.where(non_fur[..., None] > 0.5, bleed(rgb, alpha * (1 - non_fur), (1.5, 3, 6, 12)), rgb).astype(np.uint8)
ear_l_m, ear_r_m = ear_l_poly * (1 - keep_l), ear_r_poly * (1 - keep_r)

# 3. Head: everything left once ears and paws are lifted; fill what they covered.
paws_hole = np.maximum(paw_l_m, paw_r_m)
head_a = alpha * (1 - ear_l_m) * (1 - ear_r_m) * (1 - grow(paws_hole, 2))
head_a[head_a < 0.06] = 0
head_shape = ellipse(205, 250, 128, 103)              # where the face continues behind paws/sign
chin = head_shape * poly([(70, 286), (350, 286), (350, 362), (70, 362)])
fill_zone = np.clip(np.maximum(paws_hole, chin) * head_shape - head_a, 0, 1)
known = (head_a > 0.6).astype(np.uint8)
filled = bleed(rgb, head_a)
fur_noise = cv2.GaussianBlur(np.random.default_rng(7).normal(0, 9, (H, W)).astype(np.float32), (0, 0), 0.8)[..., None]
wk = np.clip((head_a - 0.25) / 0.55, 0, 1)[..., None]
head_rgb = np.clip(rgb * wk + (filled + fur_noise) * (1 - wk), 0, 255).astype(np.uint8)
# Soft shading toward the chin so the completed part does not look flat.
shade = blur(head_shape * poly([(60, 318), (360, 318), (360, 370), (60, 370)]), 10) * 0.12
head_rgb = np.clip(head_rgb.astype(np.float32) * (1 - shade[..., None]), 0, 255).astype(np.uint8)
head_alpha = np.maximum(head_a, blur(head_shape, 1.2) * np.maximum(fill_zone > 0.02, head_a > 0.02) * (1 - np.maximum(ear_l_m, ear_r_m)))
save("head", head_rgb, head_alpha)
save("ear-l", ear_rgb, ear_l)
save("ear-r", ear_rgb, ear_r)

# 4. Paws with forearms reaching down behind the ledge.
# A patch of plain forehead fur, tiled down the forearm so it matches the painting.
FUR_PATCH = rgb[222:258, 186:222].astype(np.float32)


def paw_with_arm(mask, name, x0, x1, top):
    paw_a = mask * alpha
    cx, half = (x0 + x1) / 2, (x1 - x0) / 2
    shape = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(shape)
    pts = [(cx - half * 0.70, top), (cx + half * 0.70, top), (cx + half * 0.80, top + 120), (cx + half * 0.88, H), (cx - half * 0.88, H), (cx - half * 0.80, top + 120)]
    d.polygon([(x * SS, y * SS) for x, y in pts], fill=255)
    arm_a = np.asarray(shape.resize(size, Image.LANCZOS), np.float32) / 255
    ph, pw = FUR_PATCH.shape[:2]
    reps = (H // ph + 2, W // pw + 2)
    block = np.concatenate([np.concatenate([FUR_PATCH, FUR_PATCH[:, ::-1]], 1), np.concatenate([FUR_PATCH[::-1], FUR_PATCH[::-1, ::-1]], 1)], 0)
    tile = np.tile(block, (H // block.shape[0] + 1, W // block.shape[1] + 1, 1))[:H, :W]
    tile = cv2.GaussianBlur(tile, (0, 0), 0.7)
    ys_, xs_ = np.nonzero(paw_a > 0.5)
    px_ = rgb[ys_, xs_].reshape(-1, 3).astype(np.float32)
    paw_mean = px_[px_.sum(1) > np.percentile(px_.sum(1), 55)].mean(0)
    tile = np.clip(tile * (paw_mean / tile.reshape(-1, 3).mean(0)), 0, 255)          # match the paw's lighter fur
    xx = (np.arange(W)[None, :] - cx) / max(half, 1)
    yy = np.clip((np.arange(H)[:, None] - top) / 140, 0, 1)
    vol = np.clip(1.06 - 0.24 * (xx / 0.8) ** 2, 0.7, 1.08) * (1 - 0.08 * yy)          # round, darker lower down
    arm_rgb = tile * vol[..., None]
    inner = blur(cv2.erode((arm_a > 0.5).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32), 1.5)
    rim = np.clip(arm_a - inner, 0, 1)[..., None]
    arm_rgb = arm_rgb * (1 - rim * 0.45) + np.array([168, 118, 74]) * rim * 0.45
    out_rgb = np.clip(rgb * paw_a[..., None] + arm_rgb * (1 - paw_a[..., None]), 0, 255).astype(np.uint8)
    save(name, out_rgb, np.maximum(paw_a, arm_a))


paw_with_arm(paw_l_m, "paw-l", 70, 136, 322)
paw_with_arm(paw_r_m, "paw-r", 268, 340, 352)

# 5. Expressions painted over the same face.
eyes = [(152, 243, 25, 28), (253, 278, 27, 27)]
eye_hole = np.zeros((H, W), np.uint8)
for cx, cy, rx, ry in eyes:
    eye_hole |= (ellipse(cx, cy, rx + 5, ry + 5) > 0.5).astype(np.uint8)
# Fill each eye with fur colour interpolated from samples taken just outside it.
eyeless = head_rgb.astype(np.float32).copy()
yy_, xx_ = np.mgrid[0:H, 0:W].astype(np.float32)
for cx, cy, rx, ry in eyes:
    samples = []
    for ang in np.linspace(0, 2 * np.pi, 16, endpoint=False):
        sx, sy = cx + (rx + 14) * np.cos(ang), cy + (ry + 14) * np.sin(ang)
        patch = head_rgb[int(sy) - 3:int(sy) + 4, int(sx) - 3:int(sx) + 4].reshape(-1, 3).astype(np.float32)
        v = patch.max(1)
        good = patch[v > np.percentile(v, 40)]
        if len(good) and good.mean() > 150:
            samples.append((sx, sy, good.mean(0)))
    num = np.zeros((H, W, 3), np.float32); den = np.zeros((H, W, 1), np.float32)
    for sx, sy, c in samples:
        w = 1.0 / (((xx_ - sx) ** 2 + (yy_ - sy) ** 2)[..., None] + 25.0) ** 1.5
        num += w * c; den += w
    est = num / den
    m = ellipse(cx, cy, rx + 6, ry + 6, 3.0)[..., None]
    eyeless = eyeless * (1 - m) + est * m
eyeless += np.random.default_rng(11).normal(0, 3.5, (H, W, 1)) * (eye_hole[..., None] > 0)
eyeless = np.clip(eyeless, 0, 255).astype(np.uint8)
clean_fur = None
lid_a = np.zeros((H, W), np.float32)
for cx, cy, rx, ry in eyes:
    lid_a = np.maximum(lid_a, ellipse(cx, cy, rx + 7, ry + 7, 2.5))


def stroke_layer(paths, width, color=(58, 34, 20)):
    img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for pts in paths:
        pp = [(x * SS, y * SS) for x, y in pts]
        d.line(pp, fill=color + (255,), width=int(width * SS), joint="curve")
        r = width * SS / 2
        for x, y in (pp[0], pp[-1]):
            d.ellipse((x - r, y - r, x + r, y + r), fill=color + (255,))
    return np.asarray(img.resize(size, Image.LANCZOS)).astype(np.float32)


def curve(p0, p1, p2, n=24):
    t = np.linspace(0, 1, n)[:, None]
    return [tuple(v) for v in ((1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(p1) + t ** 2 * np.array(p2))]


def expression(name, strokes, width, base, base_a):
    s = stroke_layer(strokes, width)
    sa = s[..., 3] / 255
    out_rgb = base.astype(np.float32) * (1 - sa[..., None]) + s[..., :3] * sa[..., None]
    save(name, out_rgb.astype(np.uint8), np.maximum(base_a, sa))

closed = []
happy = []
for cx, cy, rx, ry in eyes:
    closed.append(curve((cx - rx * 0.95, cy - 2), (cx, cy + ry * 0.75), (cx + rx * 0.95, cy - 2)))
    closed.append(curve((cx + rx * 0.8, cy + 3), (cx + rx * 1.05, cy + 1), (cx + rx * 1.18, cy - 4), 8))
    happy.append(curve((cx - rx * 0.9, cy + 8), (cx, cy - ry * 0.9), (cx + rx * 0.9, cy + 8)))
expression("eyes-closed", closed, 4.6, eyeless, lid_a)
expression("eyes-happy", happy, 5.0, eyeless, lid_a)

mouth_hole = (ellipse(185, 316, 25, 22) > 0.5).astype(np.uint8)
mouthless = head_rgb.astype(np.float32).copy()
samples = []
for ang in np.linspace(0, 2 * np.pi, 14, endpoint=False):
    sx, sy = 185 + 34 * np.cos(ang), 316 + 30 * np.sin(ang)
    if 0 <= int(sy) < H0:
        patch = head_rgb[int(sy) - 2:int(sy) + 3, int(sx) - 2:int(sx) + 3].reshape(-1, 3).astype(np.float32)
        if patch.mean() > 170:
            samples.append((sx, sy, patch.mean(0)))
num = np.zeros((H, W, 3), np.float32); den = np.zeros((H, W, 1), np.float32)
for sx, sy, c in samples:
    w = 1.0 / (((xx_ - sx) ** 2 + (yy_ - sy) ** 2)[..., None] + 25.0) ** 1.5
    num += w * c; den += w
m = ellipse(185, 316, 27, 24, 3.0)[..., None]
mouthless = np.clip(mouthless * (1 - m) + (num / np.maximum(den, 1e-9)) * m, 0, 255).astype(np.uint8)
mouthless = (cv2.GaussianBlur(mouthless, (0, 0), 1.4) * (mouth_hole[..., None] > 0) + head_rgb * (mouth_hole[..., None] == 0)).astype(np.uint8)
smile = [curve((168, 302), (176, 312), (185, 304)), curve((185, 304), (194, 312), (202, 302))]
expression("mouth-closed", smile, 3.4, mouthless, ellipse(185, 316, 29, 26, 2.5))

# 6. Web sprites (scaled up a little for crisp store art), embedded as data URIs.
SCALE = 1.3
sprites = {}
for name in ["head", "ear-l", "ear-r", "paw-l", "paw-r", "eyes-closed", "eyes-happy", "mouth-closed"]:
    im = Image.open(OUT / f"{name}.png")
    im = im.resize((round(W * SCALE), round(H * SCALE)), Image.LANCZOS)
    if name == "head":
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    bbox = im.getbbox()
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=86, method=6)
    sprites[name] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
target = HERE.parent.parent / "assets" / "game" / "perl-sprites.js"
lines = ["/* GENERATED by tooling/perl/build_layers.py from the logo Perl. Do not edit. */",
         f"window.PerlSprites = {{ w: {round(W * SCALE)}, h: {round(H * SCALE)}, top: {round(H0 * SCALE)},"]
lines += [f'  "{k}": "{v}",' for k, v in sprites.items()]
lines += ["};", ""]
target.write_text("\n".join(lines), encoding="utf-8")
print("canvas", W, "x", H, "| sprites KB:", {k: len(v) // 1024 for k, v in sprites.items()})
