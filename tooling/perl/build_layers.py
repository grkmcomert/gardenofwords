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

# 1. Silhouette. perl-logo-isnet.png is the rembg (isnet) cut-out: it drops the sign and the
#    leaf cleanly but also eats the right ear and the flower, so the top keeps the logo's alpha.
isnet = np.zeros((H, W), np.float32)
isnet[:H0] = np.asarray(Image.open(HERE / "perl-logo-isnet.png").convert("RGBA"))[..., 3] / 255.0
top_keep = np.maximum(poly([(70, 0), (W, 0), (W, 232), (392, 232), (392, 252), (280, 252), (280, 232), (70, 232)]),
                      poly([(0, 0), (70, 0), (70, 165), (0, 165)]))
top_keep = blur(top_keep, 3)
alpha = isnet * (1 - top_keep) + alpha * top_keep
alpha[alpha < 0.03] = 0
paw_l_m = poly([(60, 300), (80, 285), (125, 286), (142, 305), (146, 352), (100, 358), (58, 345)], 1.0)
paw_r_m = poly([(258, 342), (284, 323), (326, 325), (350, 345), (350, H0), (258, H0)], 1.0)

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
head_a = alpha * (1 - ear_l_m) * (1 - ear_r_m) * (1 - grow(paws_hole, 3))
head_a[head_a < 0.06] = 0
head_shape = ellipse(208, 252, 136, 104, 1.2)         # the face continues behind paws and sign
# Trust the painting only where it is clearly face: drop the sign's shadow under the chin and
# thin gaps the cut-out left; everything else inside the face oval is repainted from the fur.
brownish = ((Hh > 15) & (Hh < 45) & (V < 0.68) & (S > 0.35)).astype(np.float32)
below_mouth = poly([(60, 326), (360, 326), (360, H), (60, H)], 3)
trust = head_a * (1 - grow(brownish * below_mouth, 2))
trust = cv2.erode((trust > 0.85).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32) * trust
hat_px = alpha * (green > 0.5) * (1 - np.maximum(ear_l_m, ear_r_m))        # the hat brim, even where a paw was
outside = head_a * (1 - head_shape)
low = poly([(0, 280), (W, 280), (W, H), (0, H)], 2)
outside = outside * (1 - low) + outside * low * blur((green > 0.5).astype(np.float32), 0.7)   # below the brim: hat only
head_a = np.maximum(np.maximum(trust, outside), hat_px * poly([(300, 230), (W, 230), (W, H0), (300, H0)]))
fill_zone = np.clip(head_shape - trust, 0, 1)
def smooth_fill(rgb_, a_, sigma):
    """Fill hidden fur from the visible fur around it: coarse estimate first, refined by finer
    ones blended smoothly (no hard steps, so no visible patches)."""
    have = (a_ > 0.6).astype(np.float32)
    est = []
    for s_ in (sigma * 8, sigma * 3, sigma):
        w = cv2.GaussianBlur(have, (0, 0), s_)
        c = cv2.GaussianBlur(rgb_.astype(np.float32) * have[..., None], (0, 0), s_)
        est.append((c / np.maximum(w[..., None], 1e-6), w))
    out = est[0][0]
    for e, w in est[1:]:
        k = np.clip(w * 4, 0, 1)[..., None]
        out = out * (1 - k) + e * k
    return out


filled = smooth_fill(rgb, trust, 6)
fur_noise = cv2.GaussianBlur(np.random.default_rng(7).normal(0, 9, (H, W)).astype(np.float32), (0, 0), 0.8)[..., None]
wk = blur(np.clip((trust - 0.25) / 0.55, 0, 1), 1.0)[..., None]
head_rgb = np.clip(rgb * wk + (filled + fur_noise) * (1 - wk), 0, 255).astype(np.uint8)
# Soft shading toward the chin so the completed part does not look flat.
shade = blur(head_shape * poly([(60, 318), (360, 318), (360, 370), (60, 370)]), 10) * 0.12
head_rgb = np.clip(head_rgb.astype(np.float32) * (1 - shade[..., None]), 0, 255).astype(np.uint8)
head_alpha = np.maximum(head_a, head_shape * (1 - np.maximum(ear_l_m, ear_r_m)))
# A soft darker edge on the repainted lower outline, like the painting's own outline.
edge = np.clip(head_shape - blur(cv2.erode((head_shape > 0.5).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), 1.5), 0, 1)
edge *= (1 - trust) * poly([(0, 280), (W, 280), (W, H), (0, H)], 4)
head_rgb = np.clip(head_rgb * (1 - edge[..., None] * 0.5) + np.array([176, 128, 84]) * edge[..., None] * 0.5, 0, 255).astype(np.uint8)
save("head", head_rgb, head_alpha)
save("ear-l", ear_rgb, ear_l)
save("ear-r", ear_rgb, ear_r)

# 4. Body (chest), paws and forearms.
fur_ref = rgb[(head_a > 0.9) & (V > 0.72) & (S < 0.45) & (np.arange(H)[:, None] > 260)].reshape(-1, 3).astype(np.float32)
FUR = np.median(fur_ref, 0)                      # the face's light fur
OUTLINE = np.array([176, 128, 84], np.float32)   # the soft brown line the art uses around fur


def aa_shape(pts):
    m = Image.new("L", (W * SS, H * SS), 0)
    ImageDraw.Draw(m).polygon([(x * SS, y * SS) for x, y in pts], fill=255)
    return np.asarray(m.resize(size, Image.LANCZOS), np.float32) / 255


def fur_texture(seed, streak=6.0):
    """Fine fur grain: noise smeared along the hair direction (mostly vertical)."""
    n = np.random.default_rng(seed).normal(0, 1, (H, W)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigmaX=0.7, sigmaY=streak)
    return n / (n.std() + 1e-6)


def shaded_fur(mask, cx, half, base, seed, light=0.0):
    xx = (np.arange(W)[None, :] - cx) / max(half, 1)
    vol = np.clip(1.05 - 0.28 * xx ** 2 + light * xx, 0.68, 1.1)            # rounded, lit from the left
    col = base[None, None, :] * vol[..., None] + fur_texture(seed)[..., None] * 4
    inner = blur(cv2.erode((mask > 0.5).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), 1.6)
    rim = np.clip(mask - inner, 0, 1)[..., None]
    return np.clip(col * (1 - rim * 0.55) + OUTLINE * rim * 0.55, 0, 255)


# Chest: rises behind the chin and runs down out of the canvas (always hidden by the ledge).
chest_pts = [(118, 340), (150, 318), (205, 312), (262, 318), (300, 342), (318, H), (96, H)]
chest_a = aa_shape(chest_pts)
yy = np.clip((np.arange(H)[:, None] - 312) / 120, 0, 1)
chest_rgb = shaded_fur(chest_a, 207, 110, FUR * 0.88, 21, 0.06) * (1 - 0.10 * yy[..., None])
chest_rgb = chest_rgb * (1 - 0.16 * np.exp(-((np.arange(H)[:, None] - 330) / 18) ** 2))[..., None]   # shadow under the chin
save("body", chest_rgb.astype(np.uint8), chest_a)


def paw_layer(mask, name, cx, half, top, seed):
    paw_a = mask * alpha * (1 - blur(grow(green * (alpha > 0.5), 1), 0.8))
    save(name, rgb, paw_a)
    # Forearm: behind the paw, starting under its middle, a little narrower and tapering out.
    pts = [(cx - half * 0.50, top), (cx + half * 0.50, top), (cx + half * 0.56, top + 90), (cx + half * 0.62, H), (cx - half * 0.62, H), (cx - half * 0.56, top + 90)]
    arm_a = aa_shape(pts)
    ys_, xs_ = np.nonzero(paw_a > 0.8)
    px_ = rgb[ys_, xs_].reshape(-1, 3).astype(np.float32)
    base = px_[px_.sum(1) > np.percentile(px_.sum(1), 45)].mean(0)
    arm_rgb = shaded_fur(arm_a, cx, half * 0.56, base, seed, 0.08)
    arm_rgb *= (1 - 0.10 * np.clip((np.arange(H)[:, None] - top) / 160, 0, 1))[..., None]
    arm_rgb *= (1 - 0.22 * np.exp(-((np.arange(H)[:, None] - top - 6) / 12) ** 2))[..., None]    # shade right under the paw
    save(name.replace("paw", "arm"), arm_rgb.astype(np.uint8), arm_a)


paw_layer(paw_l_m, "paw-l", 103, 40, 328, 31)
paw_layer(paw_r_m, "paw-r", 304, 44, 356, 37)

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

# Closed mouth: only the open part (dark mouth, tongue, teeth) is painted over with the fur
# around it; the painting's own "w" upper lip stays and becomes the closed smile.
hsv_h = cv2.cvtColor(head_rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
hh, ss, vv = hsv_h[..., 0] * 360 / 255, hsv_h[..., 1] / 255, hsv_h[..., 2] / 255
inside = (((hh < 20) | (hh > 330)) & (ss > 0.32)) | (vv < 0.5) | ((ss < 0.12) & (vv > 0.93))
zone = ellipse(186, 320, 25, 21) * poly([(0, 303), (W, 303), (W, H), (0, H)])
open_m = (inside * (zone > 0.5)).astype(np.uint8)
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(open_m)
if n_ > 1:
    big = 1 + int(np.argmax(st_[1:, cv2.CC_STAT_AREA]))
    open_m = (lab_ == big).astype(np.uint8)
open_m = cv2.morphologyEx(open_m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
open_m = cv2.dilate(open_m, np.ones((9, 9), np.uint8)).astype(np.float32)
fill_m = blur(open_m, 2.4)
fur_m = smooth_fill(head_rgb, head_alpha * (1 - grow(open_m, 2)) * (vv > 0.6), 3)
fur_m = fur_m + fur_texture(51, 1.5)[..., None] * 2.5
mouthless = np.clip(head_rgb * (1 - fill_m[..., None]) + fur_m * fill_m[..., None], 0, 255).astype(np.uint8)
save("mouth-closed", mouthless, np.clip(fill_m * 1.4, 0, 1) * head_alpha)

# 6. Web sprites (scaled up a little for crisp store art), embedded as data URIs.
SCALE = 1.3
sprites = {}
for name in ["body", "head", "ear-l", "ear-r", "paw-l", "paw-r", "eyes-closed", "eyes-happy", "mouth-closed"]:
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
