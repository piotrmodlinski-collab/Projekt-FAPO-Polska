const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const prePricingBackupPath = path.join(root, 'assets', 'data', 'products.backup.before-pricing.json');
const importDir = path.join(root, 'import', 'fapomoto');
const reportPath = path.join(root, 'import', 'combined', 'pricing_update_report.json');
const checkOnly = process.argv.includes('--check');

const shopifyProductsUrl = 'https://www.fapomoto.com/products.json?limit=250&page=';
const nbpUsdUrl = 'https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json';
const fixedCostPln = Number(process.env.PRICE_FIXED_COST_PLN || 375);
const marginPercent = Number(process.env.PRICE_MARGIN_PERCENT || 20);
const marginMultiplier = 1 + (marginPercent / 100);

const fallbackSeriesUsd = {
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
        'user-agent': 'FAPO Polska price update',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        resolve(body);
      });
    });

    request.on('timeout', () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on('error', reject);
  });
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchNbpRate() {
  const payload = await fetchJson(nbpUsdUrl);
  const rate = payload.rates?.[0] || {};
  const mid = Number(rate.mid || 0);
  if (!mid) throw new Error('NBP USD rate is missing.');
  return {
    usdPln: mid,
    effectiveDate: rate.effectiveDate || '',
    tableNo: rate.no || '',
  };
}

async function fetchRemoteProducts() {
  const products = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await fetchJson(`${shopifyProductsUrl}${page}`);
    const pageProducts = Array.isArray(payload.products) ? payload.products : [];
    products.push(...pageProducts);
    if (pageProducts.length < 250) break;
  }
  return products;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((fields) => fields.some((value) => value !== ''));
}

function rowsFromCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const header = rows.shift() || [];
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] || ''])));
}

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function skuTokens(value) {
  return Array.from(new Set(
    String(value || '').toUpperCase().match(/\b[A-Z]{2,8}\d{4,9}\b/g) || [],
  )).map(normalizeSku).filter(Boolean);
}

function usdPrice(value) {
  if (value === undefined || value === null || value === '') return 0;
  const raw = String(value).trim();
  const number = Number(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(number) || number <= 0) return 0;
  if (typeof value === 'number') return number >= 1000 ? number / 100 : number;
  return raw.includes('.') ? number : number >= 1000 ? number / 100 : number;
}

function remoteProductPrice(remote) {
  const prices = (remote.variants || [])
    .map((variant) => usdPrice(variant.price))
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : usdPrice(remote.price_min || remote.price);
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundUpToHundredMinusCent(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  let rounded = (Math.ceil(amount / 100) * 100) - 0.01;
  if (rounded + 1e-9 < amount) rounded += 100;
  return roundMoney(rounded);
}

function retailPriceFromBasePln(basePln) {
  const base = Number(basePln || 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return roundUpToHundredMinusCent((base + fixedCostPln) * marginMultiplier);
}

function plnPrice(usd, usdPlnRate) {
  const basePln = Number(usd || 0) * usdPlnRate;
  return {
    basePln: roundMoney(basePln),
    price: retailPriceFromBasePln(basePln),
  };
}

function sourceCounts(products) {
  return products.reduce((acc, product) => {
    const source = product.source || 'missing';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
}

function addMapRecord(map, key, record) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(record);
}

function buildRemoteIndex(remoteProducts) {
  const bySku = new Map();
  const byTitle = new Map();
  const byToken = new Map();

  for (const remote of remoteProducts) {
    const productPrice = remoteProductPrice(remote);
    if (!productPrice) continue;

    const productRecord = {
      source: 'fapomoto-live',
      title: remote.title || '',
      handle: remote.handle || '',
      url: `https://www.fapomoto.com/products/${remote.handle}`,
      usd: productPrice,
      variantSku: '',
    };

    byTitle.set(normalizeTitle(remote.title), productRecord);

    const textTokens = skuTokens(`${remote.title || ''} ${remote.handle || ''} ${(remote.variants || []).map((variant) => variant.sku).join(' ')}`);
    for (const token of textTokens) addMapRecord(byToken, token, productRecord);

    for (const variant of remote.variants || []) {
      const variantPrice = usdPrice(variant.price);
      if (!variantPrice) continue;
      const variantRecord = {
        ...productRecord,
        usd: variantPrice,
        variantSku: variant.sku || '',
      };
      addMapRecord(bySku, normalizeSku(variant.sku), variantRecord);
    }
  }

  return { bySku, byTitle, byToken };
}

function loadImportedPriceIndex() {
  const records = [];

  const csvPath = path.join(importDir, 'products.csv');
  for (const row of rowsFromCsv(csvPath)) {
    const price = usdPrice(row.price_min || row.price_max);
    if (!price) continue;
    records.push({
      source: 'fapomoto-import',
      title: row.title || '',
      handle: row.handle || '',
      url: row.url || (row.handle ? `https://www.fapomoto.com/products/${row.handle}` : ''),
      usd: price,
      variantSku: '',
      text: `${row.title || ''} ${row.handle || ''}`,
    });
  }

  if (fs.existsSync(importDir)) {
    for (const fileName of fs.readdirSync(importDir)) {
      if (!/^product_.*\.json$/i.test(fileName)) continue;
      const filePath = path.join(importDir, fileName);
      const remote = readJson(filePath, null);
      if (!remote) continue;
      const price = remoteProductPrice(remote);
      if (!price) continue;
      const sku = (remote.variants || []).map((variant) => variant.sku).find(Boolean) || '';
      records.push({
        source: 'fapomoto-import',
        title: remote.title || '',
        handle: remote.handle || '',
        url: remote.handle ? `https://www.fapomoto.com/products/${remote.handle}` : '',
        usd: price,
        variantSku: sku,
        text: `${remote.title || ''} ${remote.handle || ''} ${sku}`,
      });
    }
  }

  const bySku = new Map();
  const byTitle = new Map();
  const byToken = new Map();
  for (const record of records) {
    byTitle.set(normalizeTitle(record.title), record);
    addMapRecord(bySku, normalizeSku(record.variantSku), record);
    for (const token of skuTokens(record.text || `${record.title} ${record.handle}`)) {
      addMapRecord(byToken, token, record);
    }
  }

  return { bySku, byTitle, byToken };
}

function chooseRecord(records, product) {
  const list = (records || []).filter(Boolean);
  if (!list.length) return null;
  const localTitle = normalizeTitle(product.title);
  const exactTitle = list.find((record) => normalizeTitle(record.title) === localTitle);
  if (exactTitle) return exactTitle;
  const localSku = normalizeSku(product.sku);
  const exactSku = list.find((record) => normalizeSku(record.variantSku) === localSku);
  if (exactSku) return exactSku;
  return [...list].sort((a, b) => Number(a.usd || 0) - Number(b.usd || 0))[0];
}

function matchFromIndex(product, index) {
  const localSku = normalizeSku(product.sku);
  const bySku = chooseRecord(index.bySku.get(localSku), product);
  if (bySku) return { ...bySku, method: 'sku' };

  const byTitle = index.byTitle.get(normalizeTitle(product.title));
  if (byTitle) return { ...byTitle, method: 'title' };

  const tokens = skuTokens(`${product.sku || ''} ${product.title || ''}`);
  for (const token of tokens) {
    const byToken = chooseRecord(index.byToken.get(token), product);
    if (byToken) return { ...byToken, method: 'token' };
  }

  return null;
}

function skuSeries(product) {
  const sku = String(product.sku || '').toUpperCase().replace(/\s+/g, '');
  const title = String(product.title || '').toUpperCase();
  const text = `${sku} ${title}`;

  if (sku.startsWith('PSPLUS') || /\bPS\+\b/.test(text)) return 'PSPLUS';
  if (sku.startsWith('PS') || /\bPS\d{4,9}\b/.test(text)) return 'PS';
  if (sku.startsWith('PF') || /\bPF\d{4,9}\b/.test(text)) return 'PF';
  if (sku.startsWith('PJ')) return 'PJ';
  if (sku.startsWith('P1') || /\bP1\b/.test(text)) return 'P1';
  if (sku.startsWith('P3') || /\bP3\b/.test(text)) return 'P3';
  if (sku.startsWith('P5') || /\bP5\b/.test(text)) return 'P5';
  if (sku.startsWith('P7') || /\bP7\b/.test(text)) return 'P7';
  return '';
}

function fallbackPrice(product, usdPlnRate) {
  const series = skuSeries(product);
  if (series && fallbackSeriesUsd[series]) {
    const pricing = plnPrice(fallbackSeriesUsd[series], usdPlnRate);
    return {
      method: 'series-fallback',
      usd: fallbackSeriesUsd[series],
      series,
      basePln: pricing.basePln,
      price: pricing.price,
    };
  }

  const from = Number(product.priceFrom || product.price || 0);
  const to = Number(product.priceTo || product.oldPrice || 0);
  if (product.source === 'special_order' && from > 0) {
    const pricing = from < 1000
      ? plnPrice(from, usdPlnRate)
      : { basePln: Math.round(from), price: retailPriceFromBasePln(from) };
    return {
      method: 'special-usd-min-fallback',
      usd: from < 1000 ? from : 0,
      basePln: pricing.basePln,
      price: pricing.price,
    };
  }

  const fallbackBase = Math.max(0, Math.round(from || to || 0));
  return {
    method: from ? 'preserve-local-min-fallback' : 'no-price-fallback',
    usd: 0,
    basePln: fallbackBase,
    price: retailPriceFromBasePln(fallbackBase),
  };
}

function priceSourceForProduct(product, liveIndex, importIndex, usdPlnRate) {
  const live = matchFromIndex(product, liveIndex);
  if (live) {
    const pricing = plnPrice(live.usd, usdPlnRate);
    return {
      method: `live-${live.method}`,
      source: live.source,
      usd: live.usd,
      basePln: pricing.basePln,
      price: pricing.price,
      sourceUrl: live.url,
      remoteTitle: live.title,
      remoteSku: live.variantSku,
    };
  }

  const imported = matchFromIndex(product, importIndex);
  if (imported) {
    const pricing = plnPrice(imported.usd, usdPlnRate);
    return {
      method: `import-${imported.method}`,
      source: imported.source,
      usd: imported.usd,
      basePln: pricing.basePln,
      price: pricing.price,
      sourceUrl: imported.url,
      remoteTitle: imported.title,
      remoteSku: imported.variantSku,
    };
  }

  const fallback = fallbackPrice(product, usdPlnRate);
  return {
    ...fallback,
    source: fallback.method,
    sourceUrl: '',
    remoteTitle: '',
    remoteSku: '',
  };
}

async function main() {
  const products = readJson(productsPath, []);
  const prePricingBackup = readJson(prePricingBackupPath, []);
  const prePricingBackupById = new Map(prePricingBackup.map((product) => [product.id, product]));
  const beforeRanges = products.filter((product) => Number(product.priceFrom || 0) !== Number(product.priceTo || 0)).length;
  const beforeById = new Map(products.map((product) => [product.id, {
    priceFrom: Number(product.priceFrom || 0),
    priceTo: Number(product.priceTo || 0),
  }]));

  const [nbp, remoteProducts] = await Promise.all([fetchNbpRate(), fetchRemoteProducts()]);
  const liveIndex = buildRemoteIndex(remoteProducts);
  const importIndex = loadImportedPriceIndex();
  const changes = [];
  const methodCounts = {};
  const unresolved = [];

  for (const product of products) {
    const priceSource = priceSourceForProduct(product, liveIndex, importIndex, nbp.usdPln);
    methodCounts[priceSource.method] = (methodCounts[priceSource.method] || 0) + 1;

    if (['preserve-local-min-fallback', 'no-price-fallback'].includes(priceSource.method)) {
      const backupProduct = prePricingBackupById.get(product.id) || {};
      unresolved.push({
        id: product.id,
        source: product.source || '',
        sku: product.sku || '',
        title: product.title || '',
        previousPriceFrom: backupProduct.priceFrom || product.priceFrom || 0,
        previousPriceTo: backupProduct.priceTo || product.priceTo || 0,
        basePricePln: priceSource.basePln || 0,
        newPrice: priceSource.price,
        reason: 'No matching live/imported source price.',
      });
    }

    const previous = beforeById.get(product.id) || {};
    product.priceFrom = priceSource.price;
    product.priceTo = priceSource.price;
    product.currency = 'PLN';

    if (previous.priceFrom !== product.priceFrom || previous.priceTo !== product.priceTo) {
      changes.push({
        id: product.id,
        sku: product.sku || '',
        title: product.title || '',
        oldPriceFrom: previous.priceFrom || 0,
        oldPriceTo: previous.priceTo || 0,
        newPricePLN: product.priceFrom,
        sourceMethod: priceSource.method,
        sourceUsd: priceSource.usd || undefined,
        basePricePLN: priceSource.basePln || undefined,
        formulaPriceBeforeRoundingPLN: priceSource.basePln
          ? roundMoney((priceSource.basePln + fixedCostPln) * marginMultiplier)
          : undefined,
        sourceUrl: product.url || undefined,
      });
    }
  }

  const afterRanges = products.filter((product) => Number(product.priceFrom || 0) !== Number(product.priceTo || 0)).length;
  const changedFiles = [];
  writeJsonIfChanged(productsPath, products, changedFiles);

  const report = {
    timestamp: new Date().toISOString(),
    pricing_strategy: 'base_pln_plus_fixed_cost_margin_99_99',
    source_file: productsPath,
    remote_source: 'fapomoto live products JSON',
    exchange_rate_source: 'NBP USD rate API',
    nbp_table: nbp.tableNo,
    nbp_effective_date: nbp.effectiveDate,
    usd_pln_rate: nbp.usdPln,
    base_currency: 'PLN',
    fixed_cost_pln: fixedCostPln,
    margin_percent: marginPercent,
    margin_multiplier: marginMultiplier,
    formula: '(base_pln + fixed_cost_pln) * margin_multiplier',
    rounding: 'round up to 0.01 PLN below the next full 100 PLN',
    total_products: products.length,
    remote_products: remoteProducts.length,
    price_ranges_before: beforeRanges,
    price_ranges_after: afterRanges,
    products_without_price: products.filter((product) => (
      !Number(product.priceFrom || product.priceTo || product.price || 0)
    )).length,
    changed_products: changes.length,
    unchanged_products: products.length - changes.length,
    method_counts: methodCounts,
    unresolved_without_com_price_count: unresolved.length,
    unresolved_without_com_price: unresolved,
    source_counts: sourceCounts(products),
    examples: changes.slice(0, 20),
  };
  writeJsonIfChanged(reportPath, report, changedFiles);

  if (checkOnly && changedFiles.length) {
    console.error(`Price files are stale:\n${changedFiles.map((file) => `- ${file}`).join('\n')}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    products: products.length,
    remote_products: remoteProducts.length,
    usd_pln_rate: nbp.usdPln,
    nbp_effective_date: nbp.effectiveDate,
    fixed_cost_pln: fixedCostPln,
    margin_percent: marginPercent,
    price_ranges_before: beforeRanges,
    price_ranges_after: afterRanges,
    changed_products: changes.length,
    method_counts: methodCounts,
    unresolved_without_com_price_count: unresolved.length,
    changed_files: changedFiles,
    check_only: checkOnly,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
