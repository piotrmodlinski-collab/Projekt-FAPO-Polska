const crypto = require('crypto');
const nodemailer = require('nodemailer');

const DEFAULT_SMTP_HOST = 'poczta2651521.home.pl';
const DEFAULT_SMTP_USER = 'info@fapomoto.pl';
const DEFAULT_TO = 'office@fapomoto.pl';

const _rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip) {
  if (!ip) return false;
  const now = Date.now();
  const entry = _rateLimitMap.get(ip);
  if (!entry || now - entry.resetAt >= RATE_LIMIT_WINDOW_MS) {
    _rateLimitMap.set(ip, { count: 1, resetAt: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count += 1;
  return false;
}

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body,
  };
}

function emptyResponse(status) {
  return {
    status,
    headers: {
      'cache-control': 'no-store',
    },
    body: null,
  };
}

function clean(value, maxLength = 1000) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  return JSON.parse(body);
}

function parseList(value, fallback) {
  return String(value || fallback)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function makeOrderId() {
  const now = new Date();
  const stamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  return `FAPO-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function getSmtpConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secureValue = String(process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureValue
    ? ['1', 'true', 'yes'].includes(secureValue)
    : port === 465;
  const user = process.env.SMTP_USER || DEFAULT_SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!pass) {
    const error = new Error('Missing SMTP_PASS environment variable.');
    error.code = 'MAIL_CONFIG_MISSING';
    throw error;
  }

  return {
    host: process.env.SMTP_HOST || DEFAULT_SMTP_HOST,
    port,
    secure,
    auth: { user, pass },
    from: process.env.SMTP_FROM || `FAPO Polska <${user}>`,
    to: parseList(process.env.MAIL_TO, DEFAULT_TO),
    bcc: parseList(process.env.MAIL_BCC, ''),
  };
}

function buildContactMessage(data) {
  const name = clean(data.name, 160);
  const email = clean(data.email, 200);
  const type = clean(data.type, 120);
  const message = clean(data.message, 5000);
  const page = clean(data.page || data.source, 300);
  const language = clean(data.language, 20);

  if (!name || !email || !message) {
    return {
      error: jsonResponse(400, {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Name, email and message are required.',
      }),
    };
  }

  if (!isEmail(email)) {
    return {
      error: jsonResponse(400, {
        ok: false,
        code: 'INVALID_EMAIL',
        message: 'Invalid email address.',
      }),
    };
  }

  const subject = `FAPO Polska - zapytanie od ${name}`;
  const lines = [
    'Nowe zapytanie z formularza FAPO Polska',
    '',
    `Firma / imie: ${name}`,
    `E-mail klienta: ${email}`,
    type ? `Profil wspolpracy: ${type}` : null,
    page ? `Strona: ${page}` : null,
    language ? `Jezyk: ${language}` : null,
    '',
    'Wiadomosc:',
    message,
  ].filter(Boolean);

  const html = `
    <h2>Nowe zapytanie z formularza FAPO Polska</h2>
    <p><strong>Firma / imie:</strong> ${escapeHtml(name)}</p>
    <p><strong>E-mail klienta:</strong> ${escapeHtml(email)}</p>
    ${type ? `<p><strong>Profil wspolpracy:</strong> ${escapeHtml(type)}</p>` : ''}
    ${page ? `<p><strong>Strona:</strong> ${escapeHtml(page)}</p>` : ''}
    ${language ? `<p><strong>Jezyk:</strong> ${escapeHtml(language)}</p>` : ''}
    <hr />
    <p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>
  `;

  return {
    mail: {
      subject,
      text: lines.join('\n'),
      html,
      replyTo: email,
    },
  };
}

function buildOrderMessage(data) {
  const orderId = clean(data.orderId, 80) || makeOrderId();
  const customerName = clean(data.customerName, 160);
  const customerEmail = clean(data.customerEmail, 200);
  const customerPhone = clean(data.customerPhone, 80);
  const customerAddress = clean(data.customerAddress, 1200);
  const customerNote = clean(data.customerNote, 2500);
  const page = clean(data.page || data.source, 300);
  const termsAccepted = data.termsAccepted === true || data.termsAccepted === 'true' || data.termsAccepted === 'yes';
  const policiesVersion = clean(data.policiesVersion, 80);
  const items = Array.isArray(data.items) ? data.items.slice(0, 80) : [];

  if (!customerName || !customerEmail || !customerPhone || !customerAddress || !items.length) {
    return {
      error: jsonResponse(400, {
        ok: false,
        code: 'ORDER_VALIDATION_ERROR',
        message: 'Customer data and order items are required.',
      }),
    };
  }

  if (!isEmail(customerEmail)) {
    return {
      error: jsonResponse(400, {
        ok: false,
        code: 'INVALID_EMAIL',
        message: 'Invalid customer email address.',
      }),
    };
  }

  const normalizedItems = items.map((item, index) => {
    const qty = Math.max(1, Number.parseInt(item.qty, 10) || 1);
    const priceFrom = Math.max(0, Number(item.priceFrom) || 0);
    const lineTotal = Math.max(0, Number(item.lineTotal) || priceFrom * qty);

    return {
      index: index + 1,
      id: clean(item.id, 80),
      title: clean(item.title, 500),
      sku: clean(item.sku, 120),
      category: clean(item.category, 120),
      source: clean(item.source, 120),
      url: clean(item.url, 500),
      qty,
      priceFrom,
      lineTotal,
    };
  });

  const total = Number.isFinite(Number(data.total))
    ? Math.max(0, Number(data.total))
    : normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const itemLines = normalizedItems.map((item) => [
    `${item.index}. ${item.title || item.id || 'Produkt'}`,
    `   ID: ${item.id || '-'}`,
    `   SKU: ${item.sku || '-'}`,
    `   Kategoria: ${item.category || '-'}`,
    `   Zrodlo: ${item.source || '-'}`,
    `   Ilosc: ${item.qty}`,
    `   Cena od: ${item.priceFrom} PLN`,
    `   Suma pozycji: ${item.lineTotal} PLN`,
    item.url ? `   URL: ${item.url}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const htmlItems = normalizedItems.map((item) => `
    <tr>
      <td>${item.index}</td>
      <td>
        <strong>${escapeHtml(item.title || item.id || 'Produkt')}</strong><br />
        ID: ${escapeHtml(item.id || '-')}<br />
        SKU: ${escapeHtml(item.sku || '-')}<br />
        Kategoria: ${escapeHtml(item.category || '-')}<br />
        Zrodlo: ${escapeHtml(item.source || '-')}<br />
        ${item.url ? `<a href="${escapeHtml(item.url)}">Produkt</a>` : ''}
      </td>
      <td>${item.qty}</td>
      <td>${item.priceFrom} PLN</td>
      <td>${item.lineTotal} PLN</td>
    </tr>
  `).join('');

  const subject = `FAPO Polska - zamowienie ${orderId} - ${customerName}`;
  const text = [
    `Nowe zamowienie ze sklepu FAPO Polska`,
    `Numer zamowienia: ${orderId}`,
    '',
    `Klient: ${customerName}`,
    `E-mail: ${customerEmail}`,
    `Telefon: ${customerPhone}`,
    `Adres dostawy: ${customerAddress}`,
    customerNote ? `Uwagi: ${customerNote}` : null,
    `Akceptacja warunkow: ${termsAccepted ? 'tak' : 'nie'}`,
    policiesVersion ? `Wersja polityk: ${policiesVersion}` : null,
    page ? `Strona: ${page}` : null,
    '',
    'Pozycje:',
    itemLines,
    '',
    `Wartosc orientacyjna: ${total} PLN`,
  ].filter(Boolean).join('\n');

  const html = `
    <h2>Nowe zamowienie ze sklepu FAPO Polska</h2>
    <p><strong>Numer zamowienia:</strong> ${escapeHtml(orderId)}</p>
    <p><strong>Klient:</strong> ${escapeHtml(customerName)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(customerEmail)}</p>
    <p><strong>Telefon:</strong> ${escapeHtml(customerPhone)}</p>
    <p><strong>Adres dostawy:</strong><br />${escapeHtml(customerAddress).replace(/\n/g, '<br />')}</p>
    ${customerNote ? `<p><strong>Uwagi:</strong><br />${escapeHtml(customerNote).replace(/\n/g, '<br />')}</p>` : ''}
    <p><strong>Akceptacja warunkow:</strong> ${termsAccepted ? 'tak' : 'nie'}</p>
    ${policiesVersion ? `<p><strong>Wersja polityk:</strong> ${escapeHtml(policiesVersion)}</p>` : ''}
    ${page ? `<p><strong>Strona:</strong> ${escapeHtml(page)}</p>` : ''}
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th>#</th>
          <th>Produkt</th>
          <th>Ilosc</th>
          <th>Cena od</th>
          <th>Suma</th>
        </tr>
      </thead>
      <tbody>${htmlItems}</tbody>
    </table>
    <p><strong>Wartosc orientacyjna:</strong> ${total} PLN</p>
  `;

  return {
    mail: {
      subject,
      text,
      html,
      replyTo: customerEmail,
    },
    response: {
      ok: true,
      orderId,
    },
  };
}

async function sendMail(mail) {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    bcc: config.bcc.length ? config.bcc : undefined,
    replyTo: mail.replyTo,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

async function handleMailRequest({ method, body, ip }) {
  if (method === 'OPTIONS') return emptyResponse(204);

  if (checkRateLimit(ip)) {
    return jsonResponse(429, {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    });
  }

  if (method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Only POST is allowed.',
    });
  }

  let data;
  try {
    data = parseBody(body);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON.',
    });
  }

  const isOrder = data.kind === 'order';
  const { mail, error, response } = isOrder
    ? buildOrderMessage(data)
    : buildContactMessage(data);
  if (error) return error;

  try {
    await sendMail(mail);
    return jsonResponse(200, response || { ok: true });
  } catch (error) {
    console.error(isOrder ? 'Order mail failed' : 'Contact mail failed', error);
    return jsonResponse(500, {
      ok: false,
      code: 'MAIL_SEND_FAILED',
      message: 'Could not send message.',
    });
  }
}

module.exports = {
  handleMailRequest,
};
