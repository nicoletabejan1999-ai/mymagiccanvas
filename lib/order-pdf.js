const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb, BlendMode } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const CM = 72 / 2.54;
const SIZES = {
  S: [30, 40],
  M: [40, 50],
  L: [50, 60]
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

function fitContain(iw, ih, bw, bh) {
  const scale = Math.min(bw / iw, bh / ih);
  return { width: iw * scale, height: ih * scale };
}

async function embedNameFont(pdf, fontNumber) {
  const def = FONTS[fontNumber] || FONTS[7];
  const main = await pdf.embedFont(fileBytes('assets', 'fonts', def.file), { subset: true });
  const amp = def.ampFile
    ? await pdf.embedFont(fileBytes('assets', 'fonts', def.ampFile), { subset: true })
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

async function generatePrintPdf(design, designId, stripeSessionId) {
  const dims = SIZES[design.size];
  if (!dims) throw new Error('Unsupported canvas size');

  const width = dims[0] * CM;
  const height = dims[1] * CM;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle('MyMagiCanvas print file - ' + designId);
  pdf.setSubject('Paid personalized fingerprint tree canvas');
  pdf.setCreator('MyMagiCanvas');
  pdf.setProducer('MyMagiCanvas PDF generator');

  const page = pdf.addPage([width, height]);
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(252/255, 252/255, 250/255) });

  const tree = await pdf.embedJpg(fileBytes('assets', 'img', 'tree-base.jpg'));
  const boxTop = height * 0.074;
  const boxHeight = height * 0.769;
  const fitted = fitContain(tree.width, tree.height, width, boxHeight);
  const treeX = (width - fitted.width) / 2;
  const treeY = height - boxTop - (boxHeight + fitted.height) / 2;
  page.drawImage(tree, {
    x: treeX,
    y: treeY,
    width: fitted.width,
    height: fitted.height,
    blendMode: BlendMode.Multiply
  });

  const { def, main, amp } = await embedNameFont(pdf, Number(design.font));
  const nameSize = width * 0.09 * def.scale * Number(design.nameScale || 1);
  const dateSize = width * 0.025;

  const dateFont = await pdf.embedFont(StandardFonts.Helvetica);
  const dateBottom = 1 * CM;
  const dateText = String(design.date || '').trim();

  if (dateText) {
    const dateWidth = dateFont.widthOfTextAtSize(dateText, dateSize);
    page.drawText(dateText, {
      x: (width - dateWidth) / 2,
      y: dateBottom,
      size: dateSize,
      font: dateFont,
      color: rgb(42/255, 42/255, 42/255)
    });
  }

  const nameText = String(design.names || '').trim();
  if (nameText) {
    const naturalY = dateBottom + (dateText ? dateSize * 1.55 : 0) + nameSize * 0.08;
    const nameY = naturalY + Number(design.nameY || 0) * height;
    const centerX = width / 2 + Number(design.nameX || 0) * width;
    drawSegmentedName(page, nameText, main, amp, nameSize, centerX, nameY);
  }

  return Buffer.from(await pdf.save());
}

module.exports = { generatePrintPdf };
