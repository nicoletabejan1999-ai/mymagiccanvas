const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const CM = 72 / 2.54;
const SIZES = {
  S: [30, 40],
  M: [40, 50],
  L: [50, 60]
};

const TREE_FILES = {
  S: 'tree-s.jpg',
  M: 'tree-m.jpg',
  L: 'tree-l.jpg'
};

const FONTS = {
  1: { file: 'hubiland.otf', scale: 1.06 },
  2: { file: 'millerstone.ttf', scale: 0.80 },
  3: { file: 'boheme-floral.ttf', scale: 1.18 },
  4: { file: 'francisco.ttf', scale: 0.88, ampFile: 'dancing-script.ttf' },
  5: { file: 'belista.ttf', scale: 0.80 },
  6: { file: 'poppy-shower.ttf', scale: 1.02 },
  7: { file: 'dancing-script.ttf', scale: 0.94 },
  8: { file: 'savoye-let.ttf', scale: 1.10 }
};

function fileBytes(...parts) {
  return fs.readFileSync(path.join(process.cwd(), ...parts));
}

async function embedNameFont(pdf, fontNumber) {
  const def = FONTS[fontNumber] || FONTS[7];
  // Some decorative fonts (notably Hubiland) contain unusual metrics/tables
  // that can be corrupted by PDF subsetting. Embed the full font so glyph
  // advances remain faithful to the browser preview.
  // The original Dancing Script is a variable font. fontkit cannot embed it
  // in full, but its subset encoder works and preserves the chosen glyphs.
  const main = await pdf.embedFont(fileBytes('assets', 'fonts', def.file), {
    subset: def.file === 'dancing-script.ttf'
  });
  const amp = def.ampFile
    ? await pdf.embedFont(fileBytes('assets', 'fonts', def.ampFile), {
        subset: def.ampFile === 'dancing-script.ttf'
      })
    : main;
  return { def, main, amp };
}

function drawSegmentedName(page, value, mainFont, ampFont, size, centerX, y) {
  const parts = String(value || '').split(/(&)/).filter(Boolean);
  const measured = parts.map(part => {
    const font = part === '&' ? ampFont : mainFont;
    return { part, font, width: font.widthOfTextAtSize(part, size) };
  });
  const total = measured.reduce((sum, item) => sum + item.width, 0);
  let x = centerX - total / 2;

  for (const item of measured) {
    page.drawText(item.part, {
      x,
      y,
      size,
      font: item.font,
      color: rgb(20 / 255, 20 / 255, 20 / 255)
    });
    x += item.width;
  }
}

async function buildPrintPdf(design, designId, useCustomFont) {
  const dims = SIZES[design.size];
  if (!dims) throw new Error('Unsupported canvas size');

  const width = dims[0] * CM;
  const height = dims[1] * CM;
  const pdf = await PDFDocument.create();
  if (useCustomFont) pdf.registerFontkit(fontkit);
  pdf.setTitle('MyMagiCanvas print file - ' + designId);
  pdf.setSubject('Paid personalized fingerprint tree canvas');
  pdf.setCreator('MyMagiCanvas');
  pdf.setProducer('MyMagiCanvas PDF generator');

  const page = pdf.addPage([width, height]);
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(252/255, 252/255, 250/255) });

  const treeFile = TREE_FILES[design.size];
  if (!treeFile) throw new Error('Print tree artwork is unavailable for size ' + design.size);
  const tree = await pdf.embedJpg(fileBytes('assets', 'img', treeFile));
  // The supplied file already contains the final placement for this size.
  page.drawImage(tree, { x: 0, y: 0, width, height });

  const fontNumber = Number(design.font);
  const def = FONTS[fontNumber] || FONTS[7];
  let main, amp;
  if (useCustomFont) {
    ({ main, amp } = await embedNameFont(pdf, fontNumber));
  } else {
    // Guaranteed-safe fallback used only when fontkit cannot parse the chosen
    // custom font. This keeps a paid order flowing instead of returning 500.
    main = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    amp = main;
  }
  const layout = design.layout && typeof design.layout === 'object' ? design.layout : null;
  const nameSize = layout
    ? width * Number(layout.nameFontSize || 0.09 * def.scale * Number(design.nameScale || 1))
    : width * 0.09 * def.scale * Number(design.nameScale || 1);
  const dateSize = layout
    ? width * Number(layout.dateFontSize || 0.025)
    : width * 0.025;

  const dateFont = await pdf.embedFont(StandardFonts.Helvetica);
  const dateText = String(design.date || '').trim();

  if (dateText) {
    const dateWidth = dateFont.widthOfTextAtSize(dateText, dateSize);
    const dateCenterX = layout
      ? width * Number(layout.dateCenterX || 0.5)
      : width / 2;
    const dateY = layout
      ? height * (1 - Number(layout.dateBaselineY || 0.97))
      : 1 * CM;

    page.drawText(dateText, {
      x: dateCenterX - dateWidth / 2,
      y: dateY,
      size: dateSize,
      font: dateFont,
      color: rgb(42/255, 42/255, 42/255)
    });
  }

  const nameText = String(design.names || '').trim();
  if (nameText) {
    const centerX = layout
      ? width * Number(layout.nameCenterX || 0.5)
      : width / 2 + Number(design.nameX || 0) * width;
    const nameY = layout
      ? height * (1 - Number(layout.nameBaselineY || 0.9))
      : (1 * CM) + (dateText ? dateSize * 1.55 : 0) + nameSize * 0.08 + Number(design.nameY || 0) * height;

    drawSegmentedName(page, nameText, main, amp, nameSize, centerX, nameY);
  }

  return Buffer.from(await pdf.save());
}

async function generatePrintPdf(design, designId, stripeSessionId, allowTestFallback) {
  try {
    return await buildPrintPdf(design, designId, true);
  } catch (error) {
    const message = String(error && error.message || error || '');
    if (!/Trying to access beyond buffer length/i.test(message)) throw error;
    if (!allowTestFallback) {
      throw new Error(
        'Selected font cannot be embedded safely for print PDF (font ' +
        String(design && design.font || '') + '): ' + message
      );
    }

    console.warn(
      'PDF custom font fallback TEST ONLY',
      'design=' + designId,
      'font=' + String(design && design.font || ''),
      message
    );
    return buildPrintPdf(design, designId, false);
  }
}

module.exports = { generatePrintPdf };
