#!/usr/bin/env python3
"""Repair the edges of the floater-frame cut-out.

The frame is painted as a CSS border-image, so every pixel inside the slice
lines ends up on screen. Two things in the cut file did not belong there:

  * a four-to-seven pixel transparent fringe all the way round the outside,
    left behind by the antialiased crop;
  * a band of the white canvas face, up to sixteen pixels of it along the
    top and the left, sitting between the dark recess and the cleared
    middle — which is what renders as a pale gap where the shadow should be.

There was also nothing to spare at the inner boundary: the slice line fell
within a pixel or two of the cleared middle, so a renderer that landed on a
half pixel had transparency to sample and left a seam.

So: carry the wood outward to the very edge of the file, and carry the
recess inward over the white band and on past the slice lines, leaving a
solid margin the renderer can round into either way. The cut-out itself —
everything more than MARGIN inside the opening — stays clear, because that
is where the canvas shows through.

Run from the project root. Safe to run twice.
"""
import numpy as np
from PIL import Image

SRC    = 'assets/img/frame-oak.png'
DST    = 'assets/img/frame-oak.webp'
BRIGHT = 150    # above this luminance a pixel is canvas face, not recess
MARGIN = 26     # how far past the opening the recess is carried

img = Image.open(SRC).convert('RGBA')
a = np.array(img).astype(np.int16)
h, w, _ = a.shape
lum = (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2])

# ── the outer fringe: carry the outermost wood pixel to the file edge ──
for y in range(h):
    solid = np.nonzero(a[y, :, 3] >= 250)[0]
    if len(solid):
        a[y, :solid[0], :3] = a[y, solid[0], :3]
        a[y, :solid[0],  3] = 255
        a[y, solid[-1] + 1:, :3] = a[y, solid[-1], :3]
        a[y, solid[-1] + 1:,  3] = 255
for x in range(w):
    solid = np.nonzero(a[:, x, 3] >= 250)[0]
    if len(solid):
        a[:solid[0], x, :3] = a[solid[0], x, :3]
        a[:solid[0], x,  3] = 255
        a[solid[-1] + 1:, x, :3] = a[solid[-1], x, :3]
        a[solid[-1] + 1:, x,  3] = 255
lum = (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2])
clear = a[:, :, 3] < 250   # now only the cut-out in the middle

# ── the opening: the cleared middle, grown over the white canvas fringe ──
cy, cx = h // 2, w // 2
x0 = cx
while x0 > 1 and (clear[cy, x0 - 1] or lum[cy, x0 - 1] > BRIGHT): x0 -= 1
x1 = cx
while x1 < w - 2 and (clear[cy, x1 + 1] or lum[cy, x1 + 1] > BRIGHT): x1 += 1
y0 = cy
while y0 > 1 and (clear[y0 - 1, cx] or lum[y0 - 1, cx] > BRIGHT): y0 -= 1
y1 = cy
while y1 < h - 2 and (clear[y1 + 1, cx] or lum[y1 + 1, cx] > BRIGHT): y1 += 1
print('opening x %d..%d  y %d..%d' % (x0, x1, y0, y1))

# ── carry the recess inward, over the white band and past the slice ──
# Each line takes the colour of the recess pixel just outside the opening,
# so the shadow keeps the grain and the falloff of the photograph.
def darkest(block, axis):
    """The deepest pixel of the recess within a few of the opening's edge.

    The boundary between shadow and canvas wanders by a pixel or two along
    the length of the frame, so reading a single line would pick up canvas
    here and there and smear it back across the shadow."""
    l = 0.299 * block[:, :, 0] + 0.587 * block[:, :, 1] + 0.114 * block[:, :, 2]
    i = l.argmin(axis=axis)
    j = np.arange(block.shape[1 - axis])
    return block[i, j] if axis == 0 else block[j, i]

PROBE = 8
left   = darkest(a[:, x0 - PROBE:x0, :3], 1)
right  = darkest(a[:, x1 + 1:x1 + 1 + PROBE, :3], 1)
top    = darkest(a[y0 - PROBE:y0, :, :3], 0)
bottom = darkest(a[y1 + 1:y1 + 1 + PROBE, :, :3], 0)

for y in range(y0, y1 + 1):
    dt, db = y - y0, y1 - y
    for x in range(x0, x1 + 1):
        dl, dr = x - x0, x1 - x
        d = min(dl, dr, dt, db)
        if d >= MARGIN and clear[y, x]:
            a[y, x, 3] = 0          # the cut-out: the canvas shows through
            continue
        if d == dl:   a[y, x, :3] = left[y]
        elif d == dr: a[y, x, :3] = right[y]
        elif d == dt: a[y, x, :3] = top[x]
        else:         a[y, x, :3] = bottom[x]
        a[y, x, 3] = 255

out = Image.fromarray(a.astype(np.uint8), 'RGBA')
out.save(SRC, optimize=True)
out.save(DST, format='WEBP', quality=92, method=6)

# ── check: nothing pale may survive inside a slice line ──
chk = np.array(out).astype(np.int16)
cl = (0.299 * chk[:, :, 0] + 0.587 * chk[:, :, 1] + 0.114 * chk[:, :, 2])
# Only the part of each border band that falls inside the opening matters:
# the wood outside it is meant to be light.
bands = {'top':    (slice(y0, 117),      slice(x0, x1 + 1)),
         'bottom': (slice(h - 104, y1 + 1), slice(x0, x1 + 1)),
         'left':   (slice(y0, y1 + 1),   slice(x0, 114)),
         'right':  (slice(y0, y1 + 1),   slice(w - 102, x1 + 1))}
for name, (ys, xs) in bands.items():
    band = cl[ys, xs]
    print('%-7s %d pixels, %d of them pale, brightest %d'
          % (name, band.size, int((band > BRIGHT).sum()), int(band.max()) if band.size else -1))
print('written', SRC, DST, out.size)
