"""Draws Sooner's app icon (an original design) and writes every size the site uses into public/.

A teal tile with a counter-clockwise "rewind" arrow around clock hands: time moving earlier.
Run from the project root:  python3 scripts/make-icons.py   (needs Pillow)
"""
import math
from PIL import Image, ImageDraw

TEAL_LIGHT = (20, 184, 166)   # #14B8A6
TEAL_DARK = (11, 95, 88)      # #0B5F58
WHITE = (255, 255, 255, 255)
AMBER = (251, 191, 36, 255)   # #FBBF24

S = 2048  # draw large, then scale down for smooth edges


def gradient(size):
    """Diagonal teal gradient, light at top-left (computed small, then smoothly enlarged)."""
    n = 256
    g = Image.new("RGBA", (n, n))
    px = g.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TEAL_LIGHT, TEAL_DARK)) + (255,)
    return g.resize((size, size), Image.BICUBIC)


def symbol(scale):
    """White rewind arrow + clock hands on a transparent canvas, scaled about the centre."""
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    u = S * scale  # all measurements are fractions of the symbol size

    # Arc, open at the upper right. PIL angles run clockwise from 3 o'clock.
    r, w = 0.31 * u, 0.072 * u
    gap_start, arc_end = 300, 334  # the arrow travels counter-clockwise and ends at arc_end
    box = [c - r - w / 2, c - r - w / 2, c + r + w / 2, c + r + w / 2]
    d.arc(box, start=arc_end, end=gap_start + 360, fill=WHITE, width=round(w))

    def point(deg, radius=r):
        a = math.radians(deg)
        return c + radius * math.cos(a), c + radius * math.sin(a)

    # Round cap where the arrow starts.
    sx, sy = point(gap_start)
    d.ellipse([sx - w / 2, sy - w / 2, sx + w / 2, sy + w / 2], fill=WHITE)

    # Arrowhead at the end, pointing counter-clockwise (up and to the left on the right-hand side).
    a = math.radians(arc_end)
    ex, ey = point(arc_end)
    tangent = (math.sin(a), -math.cos(a))
    radial = (math.cos(a), math.sin(a))
    head_len, head_half = 0.125 * u, 0.088 * u
    tip = (ex + tangent[0] * head_len, ey + tangent[1] * head_len)
    back = (ex - tangent[0] * head_len * 0.15, ey - tangent[1] * head_len * 0.15)
    d.polygon(
        [tip, (back[0] + radial[0] * head_half, back[1] + radial[1] * head_half),
         (back[0] - radial[0] * head_half, back[1] - radial[1] * head_half)],
        fill=WHITE,
    )

    # Clock hands: minute hand up, hour hand towards ten o'clock, with rounded ends.
    def hand(deg, length, width):
        hx, hy = point(deg, length)
        d.line([(c, c), (hx, hy)], fill=WHITE, width=round(width))
        d.ellipse([hx - width / 2, hy - width / 2, hx + width / 2, hy + width / 2], fill=WHITE)

    hand(270, 0.19 * u, 0.058 * u)
    hand(210, 0.135 * u, 0.066 * u)
    dot = 0.052 * u
    d.ellipse([c - dot, c - dot, c + dot, c + dot], fill=AMBER)
    return im


def icon(size, *, rounded, scale):
    bg = gradient(S)
    if rounded:  # tile with transparent corners, for browsers and the page header
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * 0.23), fill=255)
        bg.putalpha(mask)
    bg.alpha_composite(symbol(scale))
    out = bg.resize((size, size), Image.LANCZOS)
    return out if rounded else out.convert("RGB")


if __name__ == "__main__":
    icon(512, rounded=True, scale=1.0).save("public/icon-512.png", optimize=True)
    icon(192, rounded=True, scale=1.0).save("public/icon-192.png", optimize=True)
    icon(48, rounded=True, scale=1.05).save("public/favicon-48.png", optimize=True)
    # Android may crop maskable icons to a circle: full-bleed background, symbol inside the safe zone.
    icon(512, rounded=False, scale=0.82).save("public/icon-maskable-512.png", optimize=True)
    # iOS rounds the corners itself and turns transparency black, so give it a full square.
    icon(180, rounded=False, scale=0.88).save("public/apple-touch-icon.png", optimize=True)
    print("Icons written to public/")
