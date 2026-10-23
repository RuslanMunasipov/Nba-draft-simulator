"""The site's copies of the league teams' logos (src/team-logo.js): src/assets/team-logos/<team number>.webp, 96×96, from
scripts/assets/team-logos/<team number>.<ext> (the originals, 1254² and up to 500 KB, stay for the bots' cards). The site
shows a logo at 48 px at most, so 96² covers a 2× screen at about 5 KB. Empty margins of the logo's background colour
(read from its corners) are cut, and a logo that is not square (Black Jacks' card, School Shooters') is centred on that
colour, so nothing of it is cut off and a small one fills its badge.

Run it after adding or changing a logo in scripts/assets/team-logos: python3 scripts/site-team-logos.py
"""
import glob
import os

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, DST, SIZE = 'scripts/assets/team-logos', 'src/assets/team-logos', 96
# The air left around a logo once its empty margins are cut: a share of its longer side.
AIR = .04
EXTS = ('.jpg', '.jpeg', '.png', '.webp')


def corner_colour(im):
    """The most common of the four corner pixels: the logo's background."""
    w, h = im.size
    corners = [im.getpixel(p) for p in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]]
    return max(corners, key=corners.count)


def site_logo(src):
    im = Image.open(src).convert('RGBA')
    bg = corner_colour(im)
    box = ImageChops.difference(im.convert('RGB'), Image.new('RGB', im.size, bg[:3])).convert('L').point(lambda v: 255 if v > 24 else 0).getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    side = round(max(w, h) * (1 + 2 * AIR))
    square = Image.new('RGBA', (side, side), bg)
    square.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return square.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(os.path.join(ROOT, DST), exist_ok=True)
    for team in range(1, 9):
        found = [p for p in glob.glob(os.path.join(ROOT, SRC, f'{team}.*')) if p.lower().endswith(EXTS) and '.ref.' not in p]
        if not found:
            continue
        dst = os.path.join(ROOT, DST, f'{team}.webp')
        site_logo(sorted(found)[0]).save(dst, 'WEBP', quality=86, method=6)
        print(f'{os.path.relpath(dst, ROOT)} {os.path.getsize(dst)} bytes')


if __name__ == '__main__':
    main()
