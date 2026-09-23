# The eight chart fonts, and the one for the date

The configurator shows the buyer the font they picked. Two of the nine are
free faces from Google Fonts and are already exact. The other seven are
bought fonts — they are not on any public font service, so they have to be
put here by hand, from the files you licensed.

## What to do

1. Convert each font to **woff2** (any converter will do; a .otf or .ttf
   works too, it is simply three to five times heavier to download).
2. Drop it in this folder under the name in the table below.
3. Open `assets/js/config.js` and set that font's `file` to the filename.
   Nothing else changes — the preview picks the real face up straight away
   and stops using the stand-in.
4. Look at the lettering in the configurator and nudge that font's `scale`
   until the names sit the way they do on the printed canvas. The same
   point size looks quite different from one face to another.

| # | Font on the chart     | File to put here       | Status                        |
|---|-----------------------|------------------------|-------------------------------|
| 1 | Hubiland              | `hubiland.woff2`       | needs your licensed file      |
| 2 | Millerstone Demo      | `millerstone.woff2`    | needs your licensed file      |
| 3 | Boheme Floral         | `boheme-floral.woff2`  | needs your licensed file      |
| 4 | Francisco             | `francisco.woff2`      | needs your licensed file      |
| 5 | Belista               | `belista.woff2`        | needs your licensed file      |
| 6 | Poppy Shower          | `poppy-shower.woff2`   | needs your licensed file      |
| 7 | Dancing Script        | —                      | free, served by Google Fonts  |
| 8 | Savoye LET            | `savoye-let.woff2`     | needs your licensed file      |
| 9 | Mukta Mahee ExtraLight| —                      | free, served by Google Fonts  |

## Before you put a font here

A font bought for Photoshop is licensed for making artwork with it, and
that licence usually does not cover serving the font from a website, which
is what this folder does — every visitor downloads a copy. A font marked
**demo** or **free for personal use** almost never covers a shop at all.

Check the licence that came with each font for a web or webfont licence,
and buy that part where it is missing. It is normally cheap, and it is the
one thing here that cannot be fixed in code.

Nothing about the printed canvas changes either way: you print from your
own machine with the font you bought.
