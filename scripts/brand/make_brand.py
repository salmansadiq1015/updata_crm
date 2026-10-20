"""Generate Updata brand assets (mobile + web) from the master logo image.

    python3 -m venv /tmp/brand && /tmp/brand/bin/pip install pillow numpy
    /tmp/brand/bin/python scripts/brand/make_brand.py scripts/brand/updata-logo-master.png /tmp/brand-out

Then copy the outputs: m_* -> mobile/assets/ (icon.png, android-icon-foreground.png,
splash-icon.png, brand-mark.png); w_favicon.ico, w_icon.png, w_apple-icon.png ->
client/src/app/; w_updata-*.svg -> client/public/; w_icons_* -> client/public/icons/.
Run `npx expo prebuild --platform android` afterwards so native icons update.
"""
import base64
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

master = Image.open(SRC).convert('RGB')
W = master.width
RADIUS = 0.22  # corner radius as a share of the side (old mark: 14/64)
NAVY = (0x00, 0x0F, 0x45)  # background right around the mark


def square(size):
    return master.resize((size, size), Image.LANCZOS)


def rounded(size):
    big = size * 4
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * RADIUS), fill=255)
    tile = square(size).convert('RGBA')
    tile.putalpha(mask.resize((size, size), Image.LANCZOS))
    return tile


def cutout():
    """The mark alone on transparency: the mark's blue channel is >= ~220,
    the background around it <= ~161."""
    a = np.asarray(master).astype(np.float64)
    blue = a[..., 2]
    lo, hi = 165.0, 215.0
    t = np.clip((blue - lo) / (hi - lo), 0, 1)
    alpha = t * t * (3 - 2 * t)
    # Only the central region holds the mark; the bright outer corners are background.
    region = np.zeros_like(alpha)
    region[290:910, 310:950] = 1
    alpha *= region
    # Remove the navy that antialiased edges blended in.
    bg = np.array(NAVY, dtype=np.float64)
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - (1 - alpha[..., None]) * bg) / safe, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    return img.crop(img.getbbox())


def pad_square(img, size, fill_ratio):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    scale = fill_ratio * size / max(img.size)
    mark = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas.paste(mark, ((size - mark.width) // 2, (size - mark.height) // 2), mark)
    return canvas


def png_b64(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


mark = cutout()
mark.save(OUT / 'mark-transparent-full.png')

# ---- mobile ----
square(1024).save(OUT / 'm_icon.png')
# Full-bleed: the launcher mask keeps the centre 66 %, which contains the whole mark.
square(1024).save(OUT / 'm_android-icon-foreground.png')
pad_square(mark, 1024, 0.62).save(OUT / 'm_splash-icon.png')
rounded(512).save(OUT / 'm_brand-mark.png')

# ---- web ----
rounded(256).save(OUT / 'w_favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
rounded(512).save(OUT / 'w_icon.png')
square(180).save(OUT / 'w_apple-icon.png')

tile128 = png_b64(rounded(128))
tile112 = png_b64(rounded(112))


def svg_image(size, b64, extra=''):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{size}" height="{size}" viewBox="0 0 {size} {size}" role="img" aria-label="Updata"{extra}>\n'
        f'  <image width="{size}" height="{size}" href="data:image/png;base64,{b64}"/>\n</svg>\n'
    )


(OUT / 'w_updata-mark.svg').write_text(svg_image(64, tile128))
(OUT / 'w_updata-mark-dark.svg').write_text(svg_image(64, tile128))


def wordmark(title, sub):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" viewBox="0 0 220 56" role="img" aria-label="Updata ERP">\n'
        f'  <image x="0" y="0" width="56" height="56" href="data:image/png;base64,{tile112}"/>\n'
        f'  <text x="72" y="31" fill="{title}" font-family="Inter, Geist, Arial, sans-serif" font-size="24" font-weight="760">Updata</text>\n'
        f'  <text x="72" y="46" fill="{sub}" font-family="Inter, Geist, Arial, sans-serif" font-size="11" font-weight="650" letter-spacing="3">ERP</text>\n'
        '</svg>\n'
    )


(OUT / 'w_updata-logo.svg').write_text(wordmark('#0B1E5B', '#64748B'))
(OUT / 'w_updata-logo-dark.svg').write_text(wordmark('#FFFFFF', '#CBD5E1'))

# Legacy PWA-style icon files (not referenced in code today, kept consistent).
for name, size, full_bleed in [('icon-192', 192, False), ('icon-512', 512, False),
                               ('icon-512-maskable', 512, True), ('apple-touch-icon', 180, True)]:
    img = square(size) if full_bleed else rounded(size)
    (OUT / f'w_icons_{name}.svg').write_text(svg_image(size, png_b64(img)))

print('mark bbox', mark.size)


# ---- raster wordmarks (PDF headers, Excel exports, legacy web PNGs) ----
# 329:100 like the files they replace: the Excel export draws them in a fixed 132x40 box.
from PIL import ImageFont  # noqa: E402

FONTS = Path(__file__).resolve().parents[2] / 'mobile' / 'assets' / 'fonts'


def raster_wordmark(title, sub, scale=3):
    w, h = 329 * scale, 100 * scale
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    tile = rounded(h)
    canvas.paste(tile, (0, 0), tile)
    draw = ImageDraw.Draw(canvas)
    big = ImageFont.truetype(str(FONTS / 'Geist-Bold.ttf'), int(h * 0.44))
    small = ImageFont.truetype(str(FONTS / 'Geist-SemiBold.ttf'), int(h * 0.19))
    x = int(h * 1.24)
    draw.text((x, int(h * 0.50)), 'Updata', font=big, fill=title, anchor='ls')
    erp_x = x + 4 * scale
    for ch in 'ERP':
        draw.text((erp_x, int(h * 0.80)), ch, font=small, fill=sub, anchor='ls')
        erp_x += draw.textlength(ch, font=small) + int(h * 0.055)
    return canvas


raster_wordmark('#0B1E5B', '#64748B').save(OUT / 's_logo.png', optimize=True)
raster_wordmark('#FFFFFF', '#CBD5E1').save(OUT / 's_logo-dark.png', optimize=True)
rounded(329).save(OUT / 's_logo-mark.png', optimize=True)

# ---- Chrome extension (lead_extention/public/icons) ----
for size in (16, 32, 48, 128):
    rounded(size).save(OUT / f'x_icon{size}.png', optimize=True)
