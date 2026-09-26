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
  return (Number(minor) / 100).toFixed(2) + ' ' + safe_(currency).toUpperCase();
}

function html_(value) {
  return safe_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function orderRef_(order) {
  const id = safe_(order.designId).replace(/^mc_/, '').slice(0, 8).toUpperCase();
  return id ? 'MMC-' + id : 'MyMagiCanvas order';
}

function notesSet_(value) {
  const out = {};
  safe_(value).split(/\s+/).filter(Boolean).forEach(function(v) { out[v] = true; });
  return out;
}

function notesText_(set) {
  return Object.keys(set).sort().join(' ');
}

function sendAdminEmail_(adminEmail, order, customer, driveUrl, pdfBlob) {
  if (!adminEmail) return;

  const subject = 'MyMagiCanvas order — ' + safe_(order.names) + ' — ' + safe_(order.size);
  const body = [
    'A new paid MyMagiCanvas order is ready for production.',
    '',
    'Order: ' + orderRef_(order),
    'Names: ' + safe_(order.names),
    'Date: ' + safe_(order.canvasDate),
    'Size: ' + safe_(order.size),
    'Variant: ' + safe_(order.variant),
    'Customer: ' + safe_(customer.name),
    'Email: ' + safe_(customer.email),
    'Phone: ' + safe_(order.phone || customer.phone),
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

function sendCustomerEmail_(order, customer, adminEmail) {
  const email = safe_(customer.email).trim();
  if (!email) return false;

  const ref = orderRef_(order);
  const total = money_(order.amountTotal, order.currency);
  const shipping = order.shipping || {};
  const address = shipping.address || {};
  const deliveryName = safe_(shipping.name || customer.name).trim();
  const deliveryPhone = safe_(order.phone || customer.phone).trim();
  const addressLine = [
    safe_(address.line1).trim(),
    safe_(address.line2).trim()
  ].filter(Boolean).join(', ');
  const cityLine = [
    safe_(address.postal_code).trim(),
    safe_(address.city).trim()
  ].filter(Boolean).join(' ');
  const deliveryCountry = safe_(address.country).trim();
  const plain = [
    'Thank you for your MyMagiCanvas order.',
    '',
    'Your payment was successful and we have received your personalized order.',
    '',
    'Order reference: ' + ref,
    'Names: ' + safe_(order.names),
    'Date: ' + safe_(order.canvasDate),
    'Canvas size: ' + safe_(order.size),
    'Total paid: ' + total,
    '',
    'Delivery details:',
    deliveryName ? 'Name: ' + deliveryName : '',
    addressLine ? 'Address: ' + addressLine : '',
    cityLine ? 'City / postal code: ' + cityLine : '',
    deliveryCountry ? 'Country: ' + deliveryCountry : '',
    deliveryPhone ? 'Phone: ' + deliveryPhone : '',
    '',
    'We will prepare your canvas using the personalization submitted at checkout.',
    'Please keep this email as your order confirmation.',
    '',
    'If anything in these details looks wrong, reply to this email as soon as possible.',
    '',
    'Thank you,',
    'MyMagiCanvas'
  ].join('\n');

  const deliveryRows = [
    deliveryName
      ? '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Name</td><td style="padding:4px 0;text-align:right;">' + html_(deliveryName) + '</td></tr>'
      : '',
    addressLine
      ? '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Address</td><td style="padding:4px 0;text-align:right;">' + html_(addressLine) + '</td></tr>'
      : '',
    cityLine
      ? '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">City / postal code</td><td style="padding:4px 0;text-align:right;">' + html_(cityLine) + '</td></tr>'
      : '',
    deliveryCountry
      ? '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Country</td><td style="padding:4px 0;text-align:right;">' + html_(deliveryCountry) + '</td></tr>'
      : '',
    deliveryPhone
      ? '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Phone</td><td style="padding:4px 0;text-align:right;">' + html_(deliveryPhone) + '</td></tr>'
      : ''
  ].join('');

  const htmlBody =
    '<div style="margin:0;padding:32px 16px;background:#f7f4e8;font-family:Arial,sans-serif;color:#1d1e1a;">' +
      '<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e7e5dc;border-radius:18px;padding:34px;">' +
        '<div style="font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:28px;">MyMagi<span style="color:#7f9a67;font-style:italic;">Canvas</span></div>' +
        '<div style="width:46px;height:46px;line-height:46px;text-align:center;border-radius:50%;background:#b3c99c;color:#4a5c3a;font-size:24px;margin-bottom:22px;">✓</div>' +
        '<h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.15;margin:0 0 14px;font-weight:500;">Thank you for your order.</h1>' +
        '<p style="font-size:16px;line-height:1.65;color:#4a4c45;margin:0 0 26px;">Your payment was successful and we have received your personalized MyMagiCanvas order.</p>' +
        '<div style="background:#f7f4e8;border-radius:12px;padding:20px;margin-bottom:26px;">' +
          '<p style="margin:0 0 10px;font-size:13px;color:#7a7c72;">ORDER REFERENCE</p>' +
          '<p style="margin:0 0 18px;font-size:17px;font-weight:600;">' + html_(ref) + '</p>' +
          '<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">' +
            '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Names</td><td style="padding:4px 0;text-align:right;font-weight:600;">' + html_(order.names) + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Date</td><td style="padding:4px 0;text-align:right;">' + html_(order.canvasDate) + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Canvas size</td><td style="padding:4px 0;text-align:right;">' + html_(order.size) + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#7a7c72;">Total paid</td><td style="padding:4px 0;text-align:right;font-weight:600;">' + html_(total) + '</td></tr>' +
          '</table>' +
        '</div>' +
        '<div style="background:#ffffff;border:1px solid #e7e5dc;border-radius:12px;padding:20px;margin-bottom:26px;">' +
          '<p style="margin:0 0 10px;font-size:13px;color:#7a7c72;">DELIVERY DETAILS</p>' +
          '<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">' +
            deliveryRows +
          '</table>' +
        '</div>' +
        '<p style="font-size:14px;line-height:1.65;color:#4a4c45;margin:0 0 12px;">We will prepare your canvas using the personalization submitted at checkout. Please keep this email as your order confirmation.</p>' +
        '<p style="font-size:14px;line-height:1.65;color:#4a4c45;margin:0;">If anything in these details looks wrong, reply to this email as soon as possible.</p>' +
        '<p style="font-size:14px;line-height:1.65;margin:28px 0 0;">Thank you,<br><strong>MyMagiCanvas</strong></p>' +
      '</div>' +
    '</div>';

  const message = {
    to: email,
    subject: 'Your MyMagiCanvas order is confirmed — ' + ref,
    body: plain,
    htmlBody: htmlBody,
    name: 'MyMagiCanvas'
  };
  if (adminEmail) message.replyTo = adminEmail;

  MailApp.sendEmail(message);
  return true;
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

    const pdfBytes = Utilities.base64Decode(order.pdfBase64);
    const pdfName = safe_(order.pdfFileName || ('MyMagiCanvas-' + order.designId + '.pdf'));
    const pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', pdfName);
    const customer = order.customer || {};
    const shipping = order.shipping || {};
    const address = shipping.address || {};
    const adminEmail = PropertiesService.getScriptProperties().getProperty(CONFIG.adminEmailProperty);

    let row = null;
    let driveUrl = '';
    let notes = {};

    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const finder = sheet.getRange(2, 2, lastRow - 1, 1)
        .createTextFinder(order.stripeSessionId)
        .matchEntireCell(true)
        .findNext();

      if (finder) {
        row = finder.getRow();
        driveUrl = safe_(sheet.getRange(row, 23).getValue());
        const status = safe_(sheet.getRange(row, 25).getValue());
        notes = notesSet_(sheet.getRange(row, 26).getValue());

        if (status === 'Paid / PDF generated / emails sent') {
          return json_(200, { ok: true, duplicate: true, driveUrl: driveUrl });
        }
      }
    }

    if (!row) {
      const folder = DriveApp.getFolderById(CONFIG.pdfFolderId);
      const pdfFile = folder.createFile(pdfBlob);
      driveUrl = pdfFile.getUrl();

      sheet.appendRow([
        safe_(order.paidAt),
        safe_(order.stripeSessionId),
        safe_(customer.name),
        safe_(customer.email),
        safe_(order.phone || customer.phone),
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
        'Processing',
        ''
      ]);

      row = sheet.getLastRow();
      notes = {};
    }

    if (!notes.ADMIN_SENT) {
      if (adminEmail) {
        sendAdminEmail_(adminEmail, order, customer, driveUrl, pdfBlob);
        notes.ADMIN_SENT = true;
      } else {
        notes.ADMIN_SKIPPED = true;
      }
      sheet.getRange(row, 26).setValue(notesText_(notes));
    }

    if (!notes.CUSTOMER_SENT && !notes.CUSTOMER_SKIPPED) {
      if (safe_(customer.email).trim()) {
        sendCustomerEmail_(order, customer, adminEmail);
        notes.CUSTOMER_SENT = true;
      } else {
        notes.CUSTOMER_SKIPPED = true;
      }
      sheet.getRange(row, 26).setValue(notesText_(notes));
    }

    sheet.getRange(row, 25).setValue('Paid / PDF generated / emails sent');

    return json_(200, {
      ok: true,
      driveUrl: driveUrl,
      customerEmailSent: Boolean(notes.CUSTOMER_SENT)
    });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_(500, { ok: false, error: safe_(err && err.message) });
  }
}
