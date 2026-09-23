"""
Build the canopy mask for the configurator.

The fingerprints must land where leaves would actually grow: over the
branches and a little past their tips, never on the bare trunk. Rather
than guessing an ellipse, we derive the shape from the artwork itself —
dilate the branches until they merge into one canopy, fill the gaps,
smooth the outline, then emit a compact bitmap the browser can sample.
"""
from PIL import Image, ImageFilter, ImageOps
from collections import deque
import base64, sys

SRC        = 'assets/img/tree-base.jpg'
WORK_W     = 300      # work small; the mask only needs to be approximate
CANOPY_END = 0.665    # fraction of tree height where leaves stop at the sides
CANOPY_MID = 0.500    # over the trunk the canopy lifts, so the bark shows
DILATE     = 29       # odd; how far leaves reach past a branch
ROUND      = 41       # odd; closes the notches between branches into a dome
SMOOTH     = 5.0
GRID_W     = 120      # exported resolution

im = Image.open(SRC).convert('L')
W0, H0 = im.size
w = WORK_W; h = round(W0 and WORK_W * H0 / W0)
im = im.resize((w, h), Image.LANCZOS)

# branches = anything darker than paper
ink = im.point(lambda v: 255 if v < 232 else 0).convert('L')

# Keep only the canopy band. The lower edge is not a straight line: leaves
# hang lowest over the outer branches and lift in the middle, where the
# trunk climbs through — cutting flat would leave a shelf across the tree.
px = ink.load()
side = h * CANOPY_END
mid  = h * CANOPY_MID
half = w * 0.32
for x in range(w):
    t = max(0.0, 1 - ((x - w / 2) / half) ** 2)
    limit = int(side - (side - mid) * t)
    for y in range(limit, h):
        px[x, y] = 0

# grow the branches until they close into a single mass
blob = ink.filter(ImageFilter.MaxFilter(DILATE))
blob = blob.filter(ImageFilter.MinFilter(5))          # pull the outline back in a little

# fill the holes between branches: flood the outside, then invert it
bp = blob.load()
outside = [[False]*w for _ in range(h)]
q = deque()
for x in range(w):
    for y in (0, h-1):
        if bp[x, y] == 0 and not outside[y][x]: outside[y][x] = True; q.append((x, y))
for y in range(h):
    for x in (0, w-1):
        if bp[x, y] == 0 and not outside[y][x]: outside[y][x] = True; q.append((x, y))
while q:
    x, y = q.popleft()
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx, ny = x+dx, y+dy
        if 0 <= nx < w and 0 <= ny < h and bp[nx, ny] == 0 and not outside[ny][nx]:
            outside[ny][nx] = True; q.append((nx, ny))
for y in range(h):
    for x in range(w):
        if not outside[y][x]: bp[x, y] = 255

# A canopy carries its own volume: seen from across a room it is a round
# mass, not a branch-shaped one. Closing the blob — grow, then shrink by
# the same amount — swallows the notches between the branches and leaves
# a rounded outline, without pushing the whole canopy outwards.
blob = blob.filter(ImageFilter.MaxFilter(ROUND)).filter(ImageFilter.MinFilter(ROUND))

# A real canopy is a dome: round through the middle, and trimmed back to
# an ellipse at the edge, which rounds the sides and the flat bottom left
# by the cut. The inner ellipse fills the last hollows between the big
# limbs — everything outside it still follows the branches, so the
# outline keeps its bumps instead of turning into a drawn circle.
bp = blob.load()
xs = [x for y in range(h) for x in range(w) if bp[x, y]]
ys = [y for y in range(h) for x in range(w) if bp[x, y]]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
rx, ry = (x1 - x0) / 2 * 1.06, (y1 - y0) / 2 * 1.05
import math
for y in range(h):
    for x in range(w):
        t = max(0.0, 1 - ((x - w / 2) / half) ** 2)
        limit = side - (side - mid) * t
        dx, dy = (x - cx) / rx, (y - cy) / ry
        e = math.hypot(dx, dy)
        a = math.atan2(dy, dx)
        # the edge wanders a little, the way a canopy does; without it the
        # outline reads as a drawn circle rather than a tree
        env = 1 + 0.038 * math.sin(3 * a + 1.9) + 0.024 * math.sin(5 * a + 0.4)
        if e <= env * 0.97 and y < limit:
            bp[x, y] = 255
        elif e > env:
            bp[x, y] = 0

# round off the silhouette
blob = blob.filter(ImageFilter.GaussianBlur(SMOOTH)).point(lambda v: 255 if v > 120 else 0)

# keep the biggest island only
bp = blob.load()
seen = [[False]*w for _ in range(h)]
best, bestn = None, 0
for y in range(h):
    for x in range(w):
        if bp[x, y] and not seen[y][x]:
            comp, q = [], deque([(x, y)]); seen[y][x] = True
            while q:
                cx, cy = q.popleft(); comp.append((cx, cy))
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= nx < w and 0 <= ny < h and bp[nx, ny] and not seen[ny][nx]:
                        seen[ny][nx] = True; q.append((nx, ny))
            if len(comp) > bestn: best, bestn = comp, len(comp)
clean = Image.new('L', (w, h), 0); cp = clean.load()
for cx, cy in best: cp[cx, cy] = 255

# ── export ────────────────────────────────────────────────────────────
gh = round(GRID_W * h / w)
grid = clean.resize((GRID_W, gh), Image.BILINEAR).point(lambda v: 1 if v > 110 else 0)
gp = grid.load()
bits = ''.join('1' if gp[x, y] else '0' for y in range(gh) for x in range(GRID_W))
pad = (-len(bits)) % 8
packed = bytes(int(bits[i:i+8].ljust(8, '0'), 2) for i in range(0, len(bits) + pad, 8))
b64 = base64.b64encode(packed).decode()

cov = bits.count('1') / len(bits)
print(f'grid {GRID_W}x{gh}  coverage {cov:.1%}  base64 {len(b64)} chars')

with open('assets/js/canopy-mask.js', 'w') as f:
    f.write('/* Generated by tools/make-canopy-mask.py — do not edit by hand.\n'
            '   Where a fingerprint may land, as a %dx%d bitmap over the tree\n'
            '   artwork, packed one pixel per bit and base64 encoded. */\n'
            'window.MMC_CANOPY = { w: %d, h: %d, bits: "%s" };\n' % (GRID_W, gh, GRID_W, gh, b64))

# visual check
chk = Image.open(SRC).convert('RGB').resize((w, h), Image.LANCZOS)
ov = Image.new('RGB', (w, h), (120, 200, 110))
chk = Image.composite(Image.blend(chk, ov, 0.45), chk, clean)
chk.resize((w*2, h*2), Image.LANCZOS).save(sys.argv[1] if len(sys.argv) > 1 else '/tmp/mask-check.png')
