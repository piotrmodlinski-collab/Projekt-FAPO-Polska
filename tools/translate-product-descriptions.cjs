const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const cachePath = path.join(root, 'import', 'translation-cache-en-pl.json');
const checkOnly = process.argv.includes('--check');
const force = process.argv.includes('--force');
const concurrency = Number(process.env.TRANSLATE_CONCURRENCY || 4);

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJsonIfChanged(filePath, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (previous === next) return false;
  if (!checkOnly) fs.writeFileSync(filePath, next);
  return true;
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeTag(tag) {
  const match = String(tag).match(/^<\/?\s*([a-z0-9-]+)/i);
  if (!match) return '';
  const name = match[1].toLowerCase();
  const allowed = new Set([
    'p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i',
    'h2', 'h3', 'h4', 'h5', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ]);
  if (!allowed.has(name)) return '';
  if (/^<\//.test(tag)) return `</${name}>`;
  if (name === 'br') return '<br />';
  return `<${name}>`;
}

function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? sanitizeTag(part) : escapeHtml(decodeEntities(part))))
    .join('')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function htmlToText(html, maxLength = 420) {
  const text = decodeEntities(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|h2|h3|h4|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function normalizePolishText(value) {
  return String(value || '')
    .replace(/\bFunkcje:/gi, 'Cechy produktu:')
    .replace(/\bCechy:/gi, 'Cechy produktu:')
    .replace(/\bAplikacja:/gi, 'Zastosowanie:')
    .replace(/\bMontaż:/gi, 'Dopasowanie:')
    .replace(/\bDopasowanie pojazdu:/gi, 'Dopasowanie:')
    .replace(/\bPakiet zawiera:/gi, 'Zawartość zestawu:')
    .replace(/\bPakiet obejmuje:/gi, 'Zawartość zestawu:')
    .replace(/\bZawiera pakiet:/gi, 'Zawartość zestawu:')
    .replace(/\bSpecyfikacje:/gi, 'Specyfikacja:')
    .replace(/\bSpecyfikacja techniczna:/gi, 'Dane techniczne:')
    .replace(/\bPolityka wysyłki:/gi, 'Wysyłka:')
    .replace(/\bWażna uwaga:/gi, 'Ważne informacje:')
    .replace(/\bWażne powiadomienie:/gi, 'Ważne informacje:')
    .replace(/\bDla ([A-Z])/g, 'Do $1')
    .replace(/\b([0-9]+)\.\s+Generacji\b/g, '$1. generacji')
    .replace(/\bTak\b/g, 'Tak')
    .replace(/\bNie\b/g, 'Nie')
    .replace(/\bCoilover(?:y|ów|a|em)?\b/gi, 'zawieszenie gwintowane')
    .replace(/\bcewki gwintowane\b/gi, 'zawieszenie gwintowane')
    .replace(/\bcewek\b/gi, 'kolumn gwintowanych')
    .replace(/\bcewki\b/gi, 'kolumny gwintowane')
    .replace(/\bamortyzatora FAPO o 32 poziomach\b/gi, 'zawieszenia gwintowanego FAPO z 32-stopniową regulacją tłumienia')
    .replace(/\bZestaw do obniżania amortyzatora FAPO o 32 poziomach\b/gi, 'Zestaw zawieszenia gwintowanego FAPO z 32-stopniową regulacją tłumienia')
    .replace(/\bZestaw do obniżania zawieszenie gwintowane\b/gi, 'Zestaw zawieszenia gwintowanego')
    .replace(/\bSzybkość sprężyny\b/gi, 'Twardość sprężyny')
    .replace(/\bSztywność sprężyny\b/gi, 'Twardość sprężyny')
    .replace(/\bfuntów\/cal\b/gi, 'lbs/in')
    .replace(/\bPełnogwintowana rura absorbera\b/gi, 'Pełnogwintowany korpus amortyzatora')
    .replace(/\bRegulacja wysokości jazdy\b/gi, 'Regulacja wysokości zawieszenia')
    .replace(/\bgumowe kalosze\b/gi, 'gumowe osłony')
    .replace(/\bpoduszki-kulki\b/gi, 'typu pillow-ball')
    .replace(/\b4 machające pierścienie\b/gi, '4 pierścienie faliste')
    .replace(/\bDomyślna roczna gwarancja\b/gi, 'Standardowa roczna gwarancja')
    .replace(/\bkomfortową jazdę po ulicach\b/gi, 'komfortową jazdę na drodze')
    .replace(/\bIdealny do toru\b/gi, 'Odpowiedni na tor')
    .replace(/\bOdpowiedni na tor, driftu, szybkiej jazdy i codziennej jazdy\b/gi, 'Odpowiedni na tor, do driftu, szybkiej jazdy drogowej i codziennego użytkowania')
    .replace(/\b1 zestaw zestawu sprężyn zawieszenie gwintowane\b/gi, '1 zestaw zawieszenia gwintowanego')
    .replace(/\b100% nowy\b/gi, '100% fabrycznie nowy')
    .replace(/\bPaczki o wartości powyżej 500 USD będą wymagały podpisu przy dostawie, aby zapewnić wartość paczki\b/gi, 'Paczki o wartości powyżej 500 USD wymagają podpisu przy odbiorze')
    .replace(/\bGórne mocowanie w formie typu pillow-ball\b/gi, 'Górne mocowanie typu pillow-ball')
    .replace(/\bdo 2,5 do 3 cala\b/gi, 'do 2,5-3 cala')
    .replace(/\bTłumik:/gi, 'Amortyzator:')
    .replace(/\bDamper\b/gi, 'amortyzator')
    .replace(/\bCal(?:e|i)\b/gi, 'cala')
    .replace(/\bCali\b/gi, 'cala')
    .replace(/\bprzed wysyłką\b/gi, 'przed wysłaniem')
    .replace(/\bFedEx lub USPS\b/g, 'FedEx lub USPS')
    .replace(/\s+([,.:%)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fallbackPolishDescription(product) {
  const sku = product.sku ? ` SKU ${product.sku}.` : '';
  const category = product.category || 'Performance';
  return `<p>${escapeHtml(`${product.title}. ${category}. Produkt dostępny w katalogu FAPO Polska z obsługą zamówienia przez nasz sklep.${sku}`)}</p>`;
}

function splitHtmlTextParts(html) {
  return sanitizeHtml(html)
    .split(/(<[^>]+>)/g)
    .filter((part) => part !== '');
}

function translateRequest(text) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'pl');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  return new Promise((resolve, reject) => {
    https.get(url, {
      rejectUnauthorized: false,
      timeout: 20000,
      headers: {
        accept: 'application/json',
        'user-agent': 'FAPO Polska catalog translator',
      },
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const translated = (parsed[0] || []).map((entry) => entry[0] || '').join('');
          resolve(translated);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function translateBatch(texts, cache) {
  const translated = new Array(texts.length);

  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    const key = text.trim();
    if (!key) {
      translated[index] = text;
    } else if (cache[key]) {
      translated[index] = normalizePolishText(cache[key]);
    } else {
      const value = normalizePolishText(await translateRequest(text));
      translated[index] = value || text;
      cache[key] = translated[index];
    }
  }

  return translated;
}

async function translateHtml(html, cache) {
  const parts = splitHtmlTextParts(html);
  const textParts = parts
    .filter((part) => !part.startsWith('<'))
    .map((part) => decodeEntities(part).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const translations = await translateBatch(textParts, cache);
  let textIndex = 0;
  return parts.map((part) => {
    if (part.startsWith('<')) return part;
    const original = decodeEntities(part).replace(/\s+/g, ' ').trim();
    if (!original) return part;
    const translated = translations[textIndex] || original;
    textIndex += 1;
    return escapeHtml(translated);
  }).join('').replace(/<p>\s*<\/p>/g, '').trim();
}

async function runLimited(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const products = readJson(productsPath, []);
  const cache = readJson(cachePath, {});
  const targets = products.filter((product) => (
    product.descriptionHtmlEn
    && (force || !product.descriptionHtmlPl || /(?:\bwith\b|\bfor\b|\bFeatures\b|\bPackage\b|\bWarranty\b|\bShipping\b|\bAdjustable\b|\bRide\b|\bMono-tube\b)/i.test(product.descriptionHtmlPl))
  ));

  const changedIds = [];
  await runLimited(targets, concurrency, async (product, index) => {
    const translated = await translateHtml(product.descriptionHtmlEn, cache);
    product.descriptionHtmlPl = translated || fallbackPolishDescription(product);
    product.descriptionTextPl = htmlToText(product.descriptionHtmlPl);
    changedIds.push(product.id);

    if ((index + 1) % 25 === 0) {
      console.log(`Translated descriptions: ${index + 1}/${targets.length}`);
      if (!checkOnly) fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    }
  });

  const changed = writeJsonIfChanged(productsPath, products);
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  }

  if (checkOnly && changed) {
    console.error('Product descriptions need translation refresh.');
    process.exit(1);
  }

  console.log(JSON.stringify({
    products: products.length,
    processed: targets.length,
    changed,
    changedSample: changedIds.slice(0, 12),
    cacheEntries: Object.keys(cache).length,
    check_only: checkOnly,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
