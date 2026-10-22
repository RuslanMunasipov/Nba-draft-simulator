"""A holiday frame of the awards bot's cards made safe and small (holiday-frames.mjs): the centre of the drawn frame is
cleared to full transparency with a soft edge, so a frame never covers a card's numbers, and the result is packed as a
WebP with alpha. Usage: python3 frame-clean.py <in.png> <out.webp>"""
import sys
from PIL import Image, ImageDraw, ImageFilter

# The cleared centre as fractions of the frame: the ornaments keep to the outer 11% at the sides, 9% at top and bottom.
SIDE, TOP = 0.11, 0.09
FEATHER = 24


def clean(src, dst):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    mask = Image.new('L', (w, h), 255)
    ImageDraw.Draw(mask).rounded_rectangle([int(w * SIDE), int(h * TOP), int(w * (1 - SIDE)), int(h * (1 - TOP))], radius=60, fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(FEATHER))
    alpha = Image.composite(im.getchannel('A'), Image.new('L', (w, h), 0), mask)
    im.putalpha(alpha)
    im.save(dst, 'WEBP', quality=86, method=6)


if __name__ == '__main__':
    clean(sys.argv[1], sys.argv[2])
