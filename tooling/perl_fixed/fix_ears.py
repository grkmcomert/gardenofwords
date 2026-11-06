import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
POLY = {
 "wave": [(0,0),(330,0),(330,62),(250,70),(200,110),(150,135),(110,160),(85,190),(62,212),(30,216),(0,212)],
 "think": [(0,0),(260,0),(260,100),(200,120),(150,140),(105,160),(70,180),(45,175),(0,170)],
 "celebrate": [(0,0),(320,0),(320,100),(250,115),(200,128),(160,150),(125,165),(108,140),(70,138),(30,100),(0,60)],
}
src_dir, out_dir, prev_dir = sys.argv[1:4]
for pose, poly in POLY.items():
    im = Image.open(f"{src_dir}/{pose}.webp").convert("RGBA")
    a = np.array(im).astype(np.int16)
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    region = np.array(m) > 0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > r + 4) & (g > b + 4)
    # grow the protected hat by a couple of pixels so its fuzzy edge stays
    hat = Image.fromarray((green * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    hat = np.array(hat) > 0
    erase = region & ~hat
    em = Image.fromarray((erase * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    keep = 1 - np.array(em) / 255.0
    out = np.array(im).copy()
    out[..., 3] = (out[..., 3] * keep).astype(np.uint8)
    if pose == "wave": out[70:115, 0:45, 3] = 0
    o = Image.fromarray(out, "RGBA")
    o.save(f"{out_dir}/{pose}.webp", "WEBP", quality=88, method=6)
    bg = Image.new("RGBA", o.size, (40, 40, 60, 255)); bg.alpha_composite(o)
    bg.convert("RGB").save(f"{prev_dir}/fix_{pose}.png")
