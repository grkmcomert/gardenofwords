"""Removes the extra ears from Perl's wave/think/celebrate paintings.

The source paintings show four ears in wave and celebrate (an upright left ear
plus a second ear on the right) and three in think. idle/water have one ear per
side, so the upright left ear goes everywhere and the back right ear goes in
wave and celebrate. Usage: fix_ears.py <src images/perl> <out dir> [preview dir]
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ERASE = {
    "wave": [
        [(0,0),(330,0),(330,62),(250,70),(200,110),(150,135),(110,160),(85,190),(62,212),(30,216),(0,212)],
        [(392,215),(486,215),(486,480),(445,480),(428,430),(424,390),(418,350),(408,310),(398,270),(393,240)],
    ],
    "think": [
        [(0,0),(260,0),(260,100),(200,120),(150,140),(105,160),(70,180),(45,175),(0,170)],
    ],
    "celebrate": [
        [(0,0),(320,0),(320,100),(250,115),(200,128),(160,150),(125,165),(108,140),(70,138),(30,100),(0,60)],
        [(382,235),(481,235),(481,430),(445,430),(418,400),(416,365),(388,330),(382,300)],
    ],
}

PINK_BANDS = {"wave": [(392, 240, 440, 380), (416, 376, 434, 408)], "celebrate": [(400, 320, 432, 398)]}
PETALS = {"celebrate": [(428, 238, 466, 282)]}

src_dir, out_dir = sys.argv[1], sys.argv[2]
prev_dir = sys.argv[3] if len(sys.argv) > 3 else None
for pose, polys in ERASE.items():
    im = Image.open(f"{src_dir}/{pose}.webp").convert("RGBA")
    a = np.array(im).astype(np.int16)
    m = Image.new("L", im.size, 0)
    for poly in polys:
        ImageDraw.Draw(m).polygon(poly, fill=255)
    region = np.array(m) > 0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > r + 4) & (g > b + 4)            # leaf hat
    petal = np.zeros_like(green)
    for (x0, y0, x1, y1) in PETALS.get(pose, []):  # loose petals inside an erase area
        petal[y0:y1, x0:x1] = True
    petal &= (r - g) > 60
    protect = Image.fromarray(((green | petal) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    erase = region & ~(np.array(protect) > 0)
    for (x0, y0, x1, y1) in PINK_BANDS.get(pose, []):  # back-ear pink left beside the kept ear
        band = np.zeros_like(green); band[y0:y1, x0:x1] = True
        erase |= band & ((r - g) > 34) & (a[..., 3] > 0)
    if pose == "wave":
        erase[70:115, 0:45] = True                # stray speck left of the hat
    em = Image.fromarray((erase * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    keep = 1 - np.array(em) / 255.0
    out = np.array(im).copy()
    out[..., 3] = (out[..., 3] * keep).astype(np.uint8)
    o = Image.fromarray(out, "RGBA")
    o.save(f"{out_dir}/{pose}.webp", "WEBP", quality=88, method=6)
    if prev_dir:
        bg = Image.new("RGBA", o.size, (40, 40, 60, 255)); bg.alpha_composite(o)
        bg.convert("RGB").save(f"{prev_dir}/fix_{pose}.png")
