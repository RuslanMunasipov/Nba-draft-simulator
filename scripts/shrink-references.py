"""The small copies of the picture pipeline's references (scripts/image-pipeline.mjs, readImage): <name>.ref.<ext> next to
each image of scripts/assets/{team-logos,people,zak-onn,gm} and awards-bot/assets/fbl-logo.png. OpenAI bills a reference
by its area (one token per 16×16 pixels, measured 22.10.2026: 1254² is 1521 tokens, the cap; 512² is 1024; 256² is 256),
so a logo goes as 256² at most and a face as 512² at most; an image already that small needs no copy. The originals
stay as they are for the cards and Telegram.

Run it after adding or changing an image there: python3 scripts/shrink-references.py
"""
import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The area a reference may keep, in pixels: logos 256², people 512².
LOGO, FACE = 256 * 256, 512 * 512
SOURCES = [('scripts/assets/team-logos/*', LOGO), ('awards-bot/assets/fbl-logo.png', LOGO),
           ('scripts/assets/people/*', FACE), ('scripts/assets/zak-onn/*', FACE), ('scripts/assets/gm/*', FACE)]
EXTS = ('.jpg', '.jpeg', '.png', '.webp')


def shrink(src, area):
    stem, ext = os.path.splitext(src)
    im = Image.open(src)
    alpha = im.mode in ('RGBA', 'LA', 'P') and 'A' in im.convert('RGBA').getbands()
    w, h = im.size
    scale = (area / (w * h)) ** 0.5
    dst = stem + ('.ref.png' if alpha else '.ref.jpg')
    for old in glob.glob(stem + '.ref.*'):
        if old != dst or scale >= 1:
            os.remove(old)
    if scale >= 1:
        return None, im.size
    im = im.convert('RGBA' if alpha else 'RGB').resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    if alpha:
        im.save(dst, 'PNG', optimize=True)
    else:
        im.save(dst, 'JPEG', quality=88, optimize=True)
    return dst, im.size


def main():
    for pattern, area in SOURCES:
        for src in sorted(glob.glob(os.path.join(ROOT, pattern))):
            if src.lower().endswith(EXTS) and '.ref.' not in os.path.basename(src):
                dst, size = shrink(src, area)
                if dst:
                    print(f'{os.path.relpath(dst, ROOT)} {size[0]}×{size[1]}')


if __name__ == '__main__':
    main()
