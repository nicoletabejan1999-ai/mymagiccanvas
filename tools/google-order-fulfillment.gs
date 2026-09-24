const CONFIG = Object.freeze({
  spreadsheetId: '1lqc2ZCFDn2m6cTUJgsAWPKxJKPu0hke-vnOX-SiILTk',
  sheetName: 'Orders',
  pdfFolderId: '1i_uOwkCv1yluSdpUsAxxfdkZ7p2frJGO',
  secretProperty: 'MYMAGICCANVAS_WEBHOOK_SECRET',
  adminEmailProperty: 'MYMAGICCANVAS_ADMIN_EMAIL'
});

function json_(status, body) {
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({ status: status }, body || {})))
    .setMimeType(ContentService.MimeType.JSON);
}

function hex_(bytes) {
  return bytes.map(function(b) {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function safe_(value) {
  return value == null ? '' : String(value);
}

function money_(minor, currency) {
  if (minor == null || minor === '') return '';
  const amount = Number(minor) / 100;
  return amount.toFixed(2) + ' ' + safe_(currency).toUpperCase();
}

function doPost(e) {
  try {
    const envelope = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const payloadB64 = safe_(envelope.payload);
    const signature = safe_(envelope.signature);
    const secret = PropertiesService.getScriptProperties().getProperty(CONFIG.secretProperty);

    if (!payloadB64 || !signature || !secret) {
      return json_(401, { ok: false, error: 'Unauthorized' });
    }

    const expected = hex_(Utilities.computeHmacSha256Signature(payloadB64, secret));
    if (signature !== expected) {
      return json_(401, { ok: false, error: 'Invalid signature' });
    }

    const payloadJson = Utilities.newBlob(Utilities.base64Decode(payloadB64)).getDataAsString('UTF-8');
    const order = JSON.parse(payloadJson);
    if (!order || !order.stripeSessionId || !order.pdfBase64) {
      return json_(400, { ok: false, error: 'Invalid payload' });
    }

    const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    const sheet = ss.getSheetByName(CONFIG.sheetName);
    if (!sheet) throw new Error('Orders sheet not found');

    // Idempotency: Stripe can retry webhooks. Column B is Stripe Session ID.
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const finder = sheet.getRange(2, 2, lastRow - 1, 1)
        .createTextFinder(order.stripeSessionId)
        .matchEntireCell(true)
        .findNext();
      if (finder) {
        const existingUrl = safe_(sheet.getRange(finder.getRow(), 23).getValue());
        return json_(200, { ok: true, duplicate: true, driveUrl: existingUrl });
      }
    }

    const pdfBytes = Utilities.base64Decode(order.pdfBase64);
    const pdfName = safe_(order.pdfFileName || ('MyMagiCanvas-' + order.designId + '.pdf'));
    const pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', pdfName);
    const folder = DriveApp.getFolderById(CONFIG.pdfFolderId);
    const pdfFile = folder.createFile(pdfBlob);
    const driveUrl = pdfFile.getUrl();

    const shipping = order.shipping || {};
    const address = shipping.address || {};
    const customer = order.customer || {};

    sheet.appendRow([
      safe_(order.paidAt),
      safe_(order.stripeSessionId),
      safe_(customer.name),
      safe_(customer.email),
      safe_(customer.phone),
      safe_(address.country),
      safe_(address.line1) + (address.line2 ? ', ' + safe_(address.line2) : ''),
      safe_(address.city),
      safe_(address.postal_code),
      safe_(order.size),
      order.framed ? 'Yes' : 'No',
      order.easel ? 'Yes' : 'No',
      safe_(order.names),
      safe_(order.canvasDate),
      safe_(order.fontName || order.font),
      Array.isArray(order.inks) ? order.inks.join(', ') : safe_(order.inks),
      safe_(order.guests),
      safe_(order.variant),
      money_(order.shippingCost, order.currency),
      money_(order.amountTotal, order.currency),
      safe_(order.currency).toUpperCase(),
      pdfName,
      driveUrl,
      safe_(order.designId),
      'Paid / PDF generated',
      ''
    ]);

    const adminEmail = PropertiesService.getScriptProperties().getProperty(CONFIG.adminEmailProperty);
    if (adminEmail) {
      const subject = 'MyMagiCanvas order — ' + safe_(order.names) + ' — ' + safe_(order.size);
      const body = [
        'A new paid MyMagiCanvas order is ready for production.',
        '',
        'Names: ' + safe_(order.names),
        'Date: ' + safe_(order.canvasDate),
        'Size: ' + safe_(order.size),
        'Variant: ' + safe_(order.variant),
        'Customer: ' + safe_(customer.name),
        'Email: ' + safe_(customer.email),
        'Total: ' + money_(order.amountTotal, order.currency),
        '',
        'PDF in Google Drive:',
        driveUrl,
        '',
        'Stripe Session: ' + safe_(order.stripeSessionId)
      ].join('\n');

      MailApp.sendEmail({
        to: adminEmail,
        subject: subject,
        body: body,
        attachments: [pdfBlob],
        name: 'MyMagiCanvas Orders'
      });
    }

    return json_(200, { ok: true, driveUrl: driveUrl, fileId: pdfFile.getId() });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_(500, { ok: false, error: safe_(err && err.message) });
  }
}
