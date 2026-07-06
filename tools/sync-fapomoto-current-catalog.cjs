const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const reportPath = path.join(root, 'import', 'combined', 'fapomoto_current_catalog_compare.json');
const checkOnly = process.argv.includes('--check');

const shopifyProductsUrl = 'https://www.fapomoto.com/products.json?limit=250&page=';
const sourceProductBase = 'https://www.fapomoto.com/products/';
const currency = 'PLN';
const fallbackUsdPlnRate = Number(process.env.USD_PLN_RATE || '3.6374');
const marginMultiplier = 1 + (Number(process.env.PRICE_MARKUP_PERCENT || '30') / 100);
const priceMultiplier = fallbackUsdPlnRate * marginMultiplier;
const seriesUsd = {
  PS: 275,
  PSPLUS: 309,
  PF: 400,
  P1: 320,
  P3: 420,
  P5: 650,
  P7: 700,
  PJ: 350,
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonIfChanged(filePath, data, changedFiles) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (previous === next) return false;
  changedFiles.push(path.relative(root, filePath));
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, next);
  }
  return true;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'user-agent': 'FAPO Polska catalog sync',
      },
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve(body));
    });

    request.on('timeout', () => request.destroy(new Error('Timeout')));
    request.on('error', reject);
  });
}

async function fetchCurrentShopifyProducts() {
  const products = [];
  for (let page = 1; page <= 20; page += 1) {
    const raw = await fetchText(`${shopifyProductsUrl}${page}`);
    const payload = JSON.parse(raw);
    const pageProducts = Array.isArray(payload.products) ? payload.products : [];
    products.push(...pageProducts);
    if (pageProducts.length < 250) break;
  }
  return products;
}

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeImageUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace(/^http:\/\//i, 'https://');
  return url;
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
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
}

function translateTextToPolish(value) {
  let text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const replacements = [
    [/\bApplication\b/gi, 'Zastosowanie'],
    [/\bFitment\b/gi, 'Dopasowanie'],
    [/\bPackage\s+Includes\b/gi, 'Zawartość zestawu'],
    [/\bFeatures\b/gi, 'Cechy produktu'],
    [/\bSpecifications?\b/gi, 'Specyfikacja'],
    [/\bTechnical\s+Specifications?\b/gi, 'Dane techniczne'],
    [/\bNotes?\b/gi, 'Uwagi'],
    [/\bWarranty\b/gi, 'Gwarancja'],
    [/\bFront\s+coilovers?\b/gi, 'Przednie kolumny gwintowane'],
    [/\bRear\s+coilovers?\b/gi, 'Tylne kolumny gwintowane'],
    [/\bcoilovers?\b/gi, 'zawieszenie gwintowane'],
    [/\bAdjustable\s+damping\b/gi, 'regulacja tłumienia'],
    [/\bAdjustable\s+ride\s+height\b/gi, 'regulowana wysokość zawieszenia'],
    [/\bAdjustable\s+height\b/gi, 'regulowana wysokość'],
    [/\bpre-?load\b/gi, 'napięcie wstępne'],
    [/\bMono-?tube\s+shock\s+design\b/gi, 'konstrukcja amortyzatora monotube'],
    [/\bHigh\s+tensile\s+performance\s+spring\b/gi, 'sportowa sprężyna o wysokiej wytrzymałości'],
    [/\bRubber\s+boots?\b/gi, 'gumowe osłony'],
    [/\bhandling\b/gi, 'prowadzenie'],
    [/\bride\s+comfort\b/gi, 'komfort jazdy'],
    [/\btrack\b/gi, 'tor'],
    [/\bdrift\b/gi, 'drift'],
    [/\bdaily\s+driving\b/gi, 'codzienna jazda'],
    [/\bEasy\s+installation\b/gi, 'łatwy montaż'],
    [/\bProfessional\s+installation\s+is\s+highly\s+recommended\b/gi, 'zalecany montaż przez profesjonalny serwis'],
    [/\bProfessional\s+installation\s+recommended\b/gi, 'zalecany montaż przez profesjonalny serwis'],
    [/\bCompatible\s+with\b/gi, 'kompatybilne z'],
    [/\bFits?\b/gi, 'pasuje do'],
    [/\bDoes\s+not\s+fit\b/gi, 'nie pasuje do'],
    [/\bFront\b/gi, 'przód'],
    [/\bRear\b/gi, 'tył'],
    [/\bLeft\b/gi, 'lewy'],
    [/\bRight\b/gi, 'prawy'],
    [/\bPair\b/gi, 'para'],
    [/\bSet\b/gi, 'zestaw'],
    [/\bIncludes?\b/gi, 'zawiera'],
    [/\bIncluded\b/gi, 'w zestawie'],
    [/\bSteel\b/gi, 'stal'],
    [/\bStainless\s+steel\b/gi, 'stal nierdzewna'],
    [/\bAluminum\b/gi, 'aluminium'],
    [/\bControl\s+arms?\b/gi, 'wahacze'],
    [/\bTie\s+rod\b/gi, 'drążek kierowniczy'],
    [/\bBrake\s+lines?\b/gi, 'przewody hamulcowe'],
    [/\bHeader(s)?\b/gi, 'kolektor$1'],
    [/\bTurbo\s+manifold\b/gi, 'kolektor turbo'],
    [/\bTurbocharger\b/gi, 'turbosprężarka'],
    [/\bIntercooler\b/gi, 'intercooler'],
    [/\bExhaust\b/gi, 'wydech'],
    [/\bMuffler\b/gi, 'tłumik'],
    [/\bHigh\s+quality\b/gi, 'wysoka jakość'],
    [/\bHigh\s+performance\b/gi, 'wysoka wydajność'],
    [/\bDurable\b/gi, 'trwały'],
    [/\bMaterial\b/gi, 'materiał'],
    [/\bColor\b/gi, 'kolor'],
    [/\bVehicle\b/gi, 'pojazd'],
    [/\bEngine\b/gi, 'silnik'],
    [/\binch(?:es)?\b/gi, 'cala'],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\s+([,.:%)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function translateHtmlToPolish(html) {
  return sanitizeHtml(html)
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : escapeHtml(translateTextToPolish(part))))
    .join('')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
}

function htmlToText(html, maxLength = 420) {
  const text = decodeEntities(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|h2|h3|h4|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function skuFromRemote(product) {
  const variantSku = (product.variants || [])
    .map((variant) => String(variant.sku || '').trim())
    .find(Boolean) || '';
  const titleSku = String(`${product.title || ''} ${product.handle || ''}`)
    .match(/\b([A-Z]{2,6}\d{4,6}(?:-[A-Z0-9]+)?)\b/i)?.[1] || '';
  return (variantSku || titleSku).trim().toUpperCase();
}

function skuSeries(sku, title) {
  const normalizedSku = String(sku || '').toUpperCase().replace(/\s+/g, '');
  const text = normalizedSku || String(title || '').toUpperCase();
  if (/^PSPLUS/.test(text) || /\bPS\+\b/.test(text)) return 'PSPLUS';
  if (/^PS\d/.test(text) || (!normalizedSku && /\bPS\d{4,6}\b/.test(text))) return 'PS';
  if (/^PF\d/.test(text) || (!normalizedSku && /\bPF\d{4,6}\b/.test(text))) return 'PF';
  if (/^PJ/.test(text)) return 'PJ';
  if (/\bP1\b/.test(text)) return 'P1';
  if (/\bP3\b/.test(text)) return 'P3';
  if (/\bP5\b/.test(text)) return 'P5';
  if (/\bP7\b/.test(text)) return 'P7';
  return '';
}

function remoteUsdPrice(product) {
  const prices = (product.variants || [])
    .map((variant) => Number(variant.price || 0))
    .filter((price) => price > 0);
  if (prices.length) return Math.min(...prices);
  return Number(product.price_min || product.price || 0) || 0;
}

function priceForProduct(product, sku) {
  const usd = remoteUsdPrice(product);
  if (usd) return Math.round(usd * priceMultiplier);

  const series = skuSeries(sku, product.title);
  const seriesPrice = seriesUsd[series];
  if (seriesPrice) {
    return Math.round(seriesPrice * priceMultiplier);
  }

  return 0;
}

function categoryForProduct(product, sku) {
  const title = String(product.title || '').toLowerCase();
  const type = String(product.product_type || product.type || '').toLowerCase();
  const tags = (product.tags || []).join(' ').toLowerCase();
  const text = `${title} ${type} ${tags} ${sku || ''}`.toLowerCase();

  if (/tie rod|control arm|camber|toe arm|traction rod|sway bar|brake line|lollipop|angle kit/.test(text)) return 'Chassis';
  if (/muffler|header|manifold|exhaust|downpipe|dump pipe|heat wrap/.test(text)) return 'Exhaust';
  if (/turbocharger|twin turbo|turbo for|charge pipe|intercooler|bov|blow off|turbo kit|turbo inlet/.test(text)) return 'Turbo';
  if (/off-?road|lift shock|lift shocks|lift strut|lift struts|lift kit|steering stabilizer/.test(text)) return 'Off-Road';
  if (/spring/.test(text) && !/coilover for|coilovers for|damping coilover|adjustable coilover/.test(text)) return 'Performance';
  if (/coilover|shock absorber|damping/.test(text) || /^P[FSST]\d/i.test(sku || '')) return 'Coilovers';
  return 'Performance';
}

function imageUrls(product) {
  const images = [];
  for (const image of product.images || []) {
    const url = normalizeImageUrl(image.src || image);
    if (url) images.push(url);
  }
  return Array.from(new Set(images));
}

function fallbackDescription(product, category, sku) {
  const suffix = sku ? ` SKU ${sku}.` : '';
  return `<p>${escapeHtml(`${product.title}. ${category}. Produkt dostępny w katalogu FAPO Polska z obsługą zamówienia przez nasz sklep.${suffix}`)}</p>`;
}

function nextProductId(products) {
  const max = products.reduce((highest, product) => {
    const match = String(product.id || '').match(/^p(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `p${String(max + 1).padStart(4, '0')}`;
}

function remoteToLocalProduct(remote, id) {
  const sku = skuFromRemote(remote);
  const category = categoryForProduct(remote, sku);
  const price = priceForProduct(remote, sku);
  const images = imageUrls(remote);
  const descriptionHtmlEn = sanitizeHtml(remote.body_html || remote.description || '');
  const descriptionHtmlPl = descriptionHtmlEn
    ? translateHtmlToPolish(descriptionHtmlEn)
    : fallbackDescription(remote, category, sku);

  return {
    id,
    source: 'fapomoto',
    title: remote.title || sku || id,
    sku,
    category,
    priceFrom: price,
    priceTo: price,
    currency,
    image: images[0] || '',
    sourceUrl: `${sourceProductBase}${remote.handle}`,
    sourceHandle: remote.handle,
    descriptionHtmlEn: descriptionHtmlEn || `<p>${escapeHtml(remote.title || sku || id)}</p>`,
    descriptionHtmlPl,
    descriptionTextPl: htmlToText(descriptionHtmlPl),
    images,
  };
}

function buildExistingIndexes(products) {
  const skuIndex = new Map();
  const titleIndex = new Map();
  const comparableTitleIndex = new Map();
  const handleIndex = new Map();

  for (const product of products) {
    const sku = String(product.sku || '').trim().toUpperCase();
    if (sku) {
      if (!skuIndex.has(sku)) skuIndex.set(sku, []);
      skuIndex.get(sku).push(product);
    }

    const title = normalizeToken(product.title);
    if (title) titleIndex.set(title, product);

    const comparableTitle = comparableProductTitle(product.title);
    if (comparableTitle && !comparableTitleIndex.has(comparableTitle)) {
      comparableTitleIndex.set(comparableTitle, product);
    }

    const handle = String(product.sourceHandle || '').trim();
    if (handle) handleIndex.set(handle, product);
  }

  return { skuIndex, titleIndex, comparableTitleIndex, handleIndex };
}

function comparableProductTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\bopen\s+box\s+special\b/g, '')
    .replace(/\bfapo\b/g, '')
    .replace(/\b(?:p1|p3|p5|p7)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const products = readJson(productsPath, []);
  const remoteProducts = await fetchCurrentShopifyProducts();
  const {
    skuIndex, titleIndex, comparableTitleIndex, handleIndex,
  } = buildExistingIndexes(products);
  const added = [];
  const skippedExisting = [];
  const skippedNoSku = [];
  const changedFiles = [];

  for (const remote of remoteProducts) {
    const sku = skuFromRemote(remote);
    const normalizedTitle = normalizeToken(remote.title);
    const sameSku = sku ? (skuIndex.get(sku) || []) : [];
    const sameTitle = normalizedTitle ? titleIndex.get(normalizedTitle) : null;
    const sameComparableTitle = comparableTitleIndex.get(comparableProductTitle(remote.title));
    const sameHandle = handleIndex.get(remote.handle);

    if (sameSku.length || sameTitle || sameComparableTitle || sameHandle) {
      skippedExisting.push({
        handle: remote.handle,
        sku,
        title: remote.title,
        reason: sameSku.length ? 'sku' : sameTitle ? 'title' : sameComparableTitle ? 'comparable-title' : 'handle',
        matchedIds: sameSku
          .map((product) => product.id)
          .concat(sameTitle?.id || [], sameComparableTitle?.id || [], sameHandle?.id || [])
          .filter(Boolean),
      });
      continue;
    }

    if (!sku && !remote.title) {
      skippedNoSku.push({ handle: remote.handle, title: remote.title || '' });
      continue;
    }

    const id = nextProductId(products);
    const localProduct = remoteToLocalProduct(remote, id);
    products.push(localProduct);
    if (localProduct.sku) skuIndex.set(localProduct.sku, [localProduct]);
    titleIndex.set(normalizeToken(localProduct.title), localProduct);
    if (localProduct.sourceHandle) handleIndex.set(localProduct.sourceHandle, localProduct);
    added.push({
      id,
      sku: localProduct.sku,
      title: localProduct.title,
      category: localProduct.category,
      pricePLN: localProduct.priceFrom,
      handle: remote.handle,
    });
  }

  const sourceCounts = products.reduce((acc, product) => {
    const source = product.source || 'missing';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});

  const report = {
    timestamp: new Date().toISOString(),
    source: 'fapomoto live products JSON',
    remote_products: remoteProducts.length,
    local_products_after_sync: products.length,
    source_counts_after_sync: sourceCounts,
    pricing_multiplier: priceMultiplier,
    added_count: added.length,
    added,
    skipped_existing_count: skippedExisting.length,
    skipped_existing_sample: skippedExisting.slice(0, 40),
    skipped_no_sku_count: skippedNoSku.length,
    skipped_no_sku_sample: skippedNoSku.slice(0, 20),
  };

  writeJsonIfChanged(productsPath, products, changedFiles);
  writeJsonIfChanged(reportPath, report, changedFiles);

  if (checkOnly && added.length) {
    console.error(`FAPOMOTO current catalogue has ${added.length} products missing locally.`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    remote_products: remoteProducts.length,
    local_products: products.length,
    added_count: added.length,
    added,
    changed_files: changedFiles,
    check_only: checkOnly,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
