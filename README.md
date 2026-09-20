# MyMagiCanvas — fingerprint tree landing page

A single-page shop front for the fingerprint tree guest book canvas, with a
live configurator that draws the customer's canvas as they choose options.

No build step, no framework, no server. Open `index.html` and it runs.

---

## 1. Before you go live

Everything you need to edit lives in **`assets/js/config.js`**.

### a. Stripe Payment Links (required)

Create one Payment Link per variant in your Stripe dashboard, then paste the
URLs into `CHECKOUT.links`:

```js
links: {
  'S':                'https://buy.stripe.com/xxxxx',
  'M':                'https://buy.stripe.com/xxxxx',
  'L':                'https://buy.stripe.com/xxxxx',
  'FRAMED-S':         'https://buy.stripe.com/xxxxx',
  'FRAMED-M':         'https://buy.stripe.com/xxxxx',
  'FRAMED-L':         'https://buy.stripe.com/xxxxx',
  'S-EASEL':          'https://buy.stripe.com/xxxxx',
  'M-EASEL':          'https://buy.stripe.com/xxxxx',
  'L-EASEL':          'https://buy.stripe.com/xxxxx',
  'FRAMED-S-EASEL':   'https://buy.stripe.com/xxxxx',
  'FRAMED-M-EASEL':   'https://buy.stripe.com/xxxxx',
  'FRAMED-L-EASEL':   'https://buy.stripe.com/xxxxx'
}
```

Any variant left empty falls back to an email order instead of a dead button,
and a small reminder appears in the corner of the page until all twelve are
filled in. That reminder disappears on its own — it is only there for you.

**Personalisation reaches you two ways.** The page appends
`?client_reference_id=M_F0_E0_C3-4-6_T5_R_LEN` to the Stripe link, which shows
up on the payment in your dashboard and decodes as: size M, no frame, no easel,
inks 3+4+6, font 5, round canopy, English card. The customer also gets a
"copy this into the order note" block with the names and date spelled out — add
a **custom text field** to each Payment Link (Stripe → your link → *Options →
Custom fields*) labelled something like "Your personalisation" so they have
somewhere to paste it.

### b. Two missing prices

`FRAMED-M-EASEL` and `FRAMED-L-EASEL` are set to `null`, because the Etsy
dropdown was cut off before those two. While they are `null` the configurator
shows "Price on request" and switches the button to email. Add the numbers and
they behave like every other variant:

```js
'FRAMED-M-EASEL': { price: 142.99 },
'FRAMED-L-EASEL': { price: 182.99 },
```

### c. Your details

In `SHOP`, set `email` (used by the contact and quote buttons) and, if you want
it, `etsyUrl`.

### d. Payment method badges

`CHECKOUT.methods` only controls which logos are *shown*. Which methods actually
work is decided in Stripe → **Settings → Payment methods**. Turn on the ones you
want there (cards, Apple Pay, Google Pay, PayPal, Klarna, iDEAL, Bancontact,
SEPA, Link) and keep the two lists in step.

---

## 2. The configurator

Section `#configurator`. The preview is built from three stacked layers inside
`.sheet`:

1. the paper,
2. a `<canvas>` where the guests' fingerprints are drawn,
3. `assets/img/tree-base.webp` — the real printed artwork, laid over the prints
   in `mix-blend-mode: multiply` so the branches sit *on top* of the
   fingerprints exactly as they do on a real canvas,
4. the lettering.

The tree image was lifted from the product photography, so what customers see is
the artwork they will actually receive, not a drawing of it.

What it reacts to: canvas size (the preview changes shape — 3:4, 4:5 and 5:6 are
genuinely different), frame, easel, names, date, font, up to four ink colours,
canopy shape and guest count. The price, the checkout link and the
personalisation recap all follow.

**Tuning the canopy.** `CROWN` in `assets/js/configurator.js` holds the ellipse
(and heart) the fingerprints fall inside, in fractions of the canvas. Print size
and softness are in `render()` and `drawPrint()`.

**Guest capacity.** `SIZES[].capacity` drives the "room for about N" hint and
the tight-fit warning. These are estimates — adjust them to whatever you tell
customers.

**Fonts.** The preview uses the closest Google Font to each of your eight
numbered fonts, and says so on the page. Swap `FONTS[].css` if you find a better
match; `FONTS[].n` must keep matching the numbers on your chart, because that is
what the customer orders by.

---

## 3. Media

`assets/media/` is numbered in display order. **The film is number 2 on purpose**
— it plays second in the gallery strip.

Each photo is stored three ways: `NN-name.jpg` (fallback), `NN-name.webp` (what
loads) and `NN-name-thumb.webp` (the strip). To add or reorder photos, edit the
`GALLERY` array in `config.js` — the `src` has no extension, the page adds it.

To regenerate the derivatives after dropping in a new photo:

```bash
python3 - <<'PY'
from PIL import Image
import sys, os
f = 'assets/media/13-new-photo.jpg'
im = Image.open(f).convert('RGB')
w, h = im.size
if w > 1400: im = im.resize((1400, round(1400*h/w)), Image.LANCZOS)
base = os.path.splitext(f)[0]
im.save(base + '.webp', 'WEBP', quality=80, method=6)
im.save(f, 'JPEG', quality=78, optimize=True, progressive=True)
t = im.copy(); t.thumbnail((320, 320), Image.LANCZOS)
t.save(base + '-thumb.webp', 'WEBP', quality=76, method=6)
PY
```

### The second film (production / behind the scenes)

There is a section already built and waiting, currently sitting between
**"In the box"** and **"Sizes"** — the point in the page where someone has just
been told what they get and is deciding whether to trust you.

To switch it on, drop the file in and flip one flag in `config.js`:

```js
const PRODUCTION_FILM = {
  enabled: true,                              // ← was false
  src: 'assets/media/production.mp4',
  poster: 'assets/media/production-poster.jpg',
  title: 'Made by hand, two at a time',
  text: '…'
};
```

To move it somewhere else, move the `<section id="production">` block in
`index.html` — it carries its own styling.

Encoding a vertical phone clip for the web:

```bash
ffmpeg -i input.mov -vf scale=720:-2 -c:v libx264 -profile:v main \
  -pix_fmt yuv420p -crf 26 -preset slow -movflags +faststart \
  -c:a aac -b:a 96k assets/media/production.mp4
ffmpeg -ss 1.2 -i input.mov -frames:v 1 -vf scale=720:-2 -q:v 3 \
  assets/media/production-poster.jpg
```

---

## 4. Copy, reviews, FAQ

`REVIEWS`, `FAQ`, `DELIVERY` and `SIZES` in `config.js` feed the page directly.
The FAQ and the product details are also emitted as schema.org structured data,
so Google can show the ratings and the questions in search results — keep them
honest, since that data is claimed publicly.

---

## 5. Brand

Set once at the top of `assets/css/styles.css`:

| Token | Value | Used for |
|---|---|---|
| `--sand` | `#EDE8D0` | the wide feature band |
| `--sand-soft` | `#F7F4E8` | alternating section backgrounds |
| `--sage` | `#B3C99C` | accents, step markers, switches |
| `--sage-deep` | `#7F9A67` | italic headline accent, focus rings |
| white | `#ffffff` | the page ground |

---

## 6. Publishing

Static files — anything will serve them. Drag the folder onto Netlify, or:

```bash
npx vercel deploy --prod
```

For GitHub Pages: repository → *Settings → Pages* → deploy from this branch,
root folder.

Test locally with `python3 -m http.server 8000`, then open
`http://localhost:8000`. Opening `index.html` straight off disk works too, but
a server is closer to the real thing.
