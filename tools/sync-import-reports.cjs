const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const backupPath = path.join(root, 'assets', 'data', 'products.backup.before-pricing.json');
const combinedDir = path.join(root, 'import', 'combined');
const checkOnly = process.argv.includes('--check');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeIfChanged(filePath, content, changedFiles) {
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (previous === content) return;

  changedFiles.push(path.relative(root, filePath));
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function writeJsonIfChanged(filePath, data, changedFiles) {
  writeIfChanged(filePath, `${JSON.stringify(data, null, 2)}\n`, changedFiles);
}

function countBy(products, keySelector) {
  return products.reduce((acc, product) => {
    const key = keySelector(product) || 'missing';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function orderedSourceCounts(sourceCounts) {
  const ordered = {};
  ['fapomoto', 'special_order', 'catalogue'].forEach((source) => {
    if (sourceCounts[source]) ordered[source] = sourceCounts[source];
  });
  Object.keys(sourceCounts).sort().forEach((source) => {
    if (!(source in ordered)) ordered[source] = sourceCounts[source];
  });
  return ordered;
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

function escapeCsv(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatCsv(rows) {
  const header = ['source', 'product_url', 'title', 'image_url', 'image_local_path'];
  return `${header.join(',')}\r\n${rows
    .map((row) => header.map((key) => escapeCsv(row[key])).join(','))
    .join('\r\n')}\r\n`;
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\?.*$/, '').replace(/\/$/, '').toLowerCase();
}

function getSourceUrl(product) {
  return String(product.sourceUrl || product.url || '');
}

function syncCombinedCsv(products, changedFiles) {
  const csvPath = path.join(combinedDir, 'products_all_sources.csv');
  const previousRows = rowsFromCsv(csvPath);
  const localPathByUrl = new Map(
    previousRows
      .filter((row) => row.product_url && row.image_local_path)
      .map((row) => [normalizeUrl(row.product_url), row.image_local_path]),
  );

  const rows = products.map((product) => ({
    source: product.source || '',
    product_url: product.url || '',
    title: product.title || '',
    image_url: product.image || '',
    image_local_path: localPathByUrl.get(normalizeUrl(product.url))
      || localPathByUrl.get(normalizeUrl(getSourceUrl(product)))
      || '',
  }));

  writeIfChanged(csvPath, formatCsv(rows), changedFiles);
  return rows.length;
}

function pricingSeries(product) {
  const sku = String(product.sku || '').toUpperCase();
  const title = String(product.title || '').toUpperCase();
  const text = `${sku} ${title} ${String(getSourceUrl(product)).toUpperCase()}`;

  if (sku.startsWith('PSPLUS') || /\bPS\+\b/.test(title)) return 'PS+';
  if (sku.startsWith('PS') || /\bPS\d{4,6}\b/.test(text)) return 'PS';
  if (sku.startsWith('PF') || /\bPF\d{4,6}\b/.test(text)) return 'PF';
  if (sku.startsWith('PJ')) return 'JEEP_P3';
  if (sku.startsWith('P1') || /\bP1\b/.test(title)) return 'P1';
  if (sku.startsWith('P3') || /\bP3\b/.test(title)) return 'P3';
  if (sku.startsWith('P5') || /\bP5\b/.test(title)) return 'P5';
  if (sku.startsWith('P7') || /\bP7\b/.test(title)) return 'P7';
  return '';
}

function productPriceMatches(product, price) {
  return [product.price, product.priceFrom, product.priceTo]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .some((value) => Number(value) === price);
}

function pricedBySeries(products, seriesUsd, multiplier) {
  const counts = {};
  Object.keys(seriesUsd).forEach((series) => {
    counts[series] = 0;
  });

  products.forEach((product) => {
    const series = pricingSeries(product);
    if (!series || !(series in seriesUsd)) return;
    const expectedPrice = Math.round(Number(seriesUsd[series]) * Number(multiplier));
    if (productPriceMatches(product, expectedPrice)) {
      counts[series] += 1;
    }
  });

  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

function seriesCounts(products) {
  const counts = countBy(products, pricingSeries);
  delete counts.missing;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function exampleForSeries(products, backupById, series, seriesUsd, multiplier) {
  const expectedPrice = Math.round(Number(seriesUsd[series]) * Number(multiplier));
  const product = products.find((item) => (
    pricingSeries(item) === series && productPriceMatches(item, expectedPrice)
  ));
  if (!product) return null;

  const backup = backupById.get(product.id) || {};
  return {
    title: product.title,
    sku: product.sku || '',
    oldPriceFrom: backup.priceFrom ?? backup.price ?? null,
    oldPriceTo: backup.priceTo ?? backup.oldPrice ?? null,
    newPricePLN: expectedPrice,
  };
}

function syncSummary(products, sourceCounts, csvRows, changedFiles) {
  const filePath = path.join(combinedDir, 'summary.json');
  const previous = readJson(filePath, {});
  const next = {
    ...previous,
    total_rows: products.length,
    runtime_products: products.length,
    fapomoto_rows: sourceCounts.fapomoto || 0,
    special_order_rows: sourceCounts.special_order || 0,
    ridershox_rows: 0,
    catalogue_rows: sourceCounts.catalogue || 0,
    source_counts: sourceCounts,
    combined_csv_rows: csvRows,
    products_json: productsPath,
    combined_csv: previous.combined_csv || path.join(combinedDir, 'products_all_sources.csv'),
    ridershox_images_dir: previous.ridershox_images_dir || path.join(combinedDir, 'images_ridershox'),
  };

  writeJsonIfChanged(filePath, next, changedFiles);
}

function syncPricingReport(products, sourceCounts, backup, changedFiles) {
  const filePath = path.join(combinedDir, 'pricing_update_report.json');
  const previous = readJson(filePath, {});
  if (!Object.keys(previous).length) return;

  if (previous.pricing_strategy === 'fapomoto_usd_to_pln_plus_margin') {
    const next = {
      ...previous,
      source_file: productsPath,
      total_products: products.length,
      price_ranges_after: products.filter((product) => (
        Number(product.priceFrom || 0) !== Number(product.priceTo || 0)
      )).length,
      products_without_price: products.filter((product) => (
        !Number(product.priceFrom || product.priceTo || product.price || 0)
      )).length,
      source_counts: sourceCounts,
    };

    writeJsonIfChanged(filePath, next, changedFiles);
    return;
  }

  const backupById = new Map(backup.map((product) => [product.id, product]));
  const seriesUsd = previous.series_usd || {};
  const multiplier = previous.multiplier || Number(previous.usd_pln_rate || 0) * (1 + Number(previous.markup_percent || 0) / 100);
  const updatedBySeries = pricedBySeries(products, seriesUsd, multiplier);
  const updatedProducts = Object.values(updatedBySeries).reduce((sum, count) => sum + count, 0);
  const examples = { ...(previous.examples || {}) };

  Object.keys(updatedBySeries).forEach((series) => {
    if (!examples[series]) {
      const example = exampleForSeries(products, backupById, series, seriesUsd, multiplier);
      if (example) examples[series] = example;
    }
  });

  const newProducts = products
    .filter((product) => !backupById.has(product.id))
    .map((product) => ({
      id: product.id,
      source: product.source || '',
      sku: product.sku || '',
      title: product.title || '',
    }));

  const next = {
    ...previous,
    source_file: productsPath,
    backup_file: fs.existsSync(backupPath) ? backupPath : previous.backup_file,
    total_products: products.length,
    updated_products: updatedProducts,
    unchanged_products: products.length - updatedProducts,
    updated_by_series: updatedBySeries,
    runtime_source_counts: sourceCounts,
    new_products_since_backup: newProducts,
    examples,
  };

  writeJsonIfChanged(filePath, next, changedFiles);
}

function syncCatalogAudit(products, sourceCounts, changedFiles) {
  const filePath = path.join(combinedDir, 'catalog_full_audit.json');
  const previous = readJson(filePath, {});
  if (!Object.keys(previous).length) return;

  const exactSkus = new Set(products.map((product) => String(product.sku || '').trim().toUpperCase()).filter(Boolean));
  const psSkus = previous.ps_skus_unique || [];
  const psStatus = psSkus.map((sku) => ({
    sku,
    present_in_shop: exactSkus.has(String(sku).toUpperCase()),
  }));

  const next = {
    ...previous,
    shop_total: products.length,
    shop_unique_urls: new Set(products.map((product) => normalizeUrl(product.url)).filter(Boolean)).size,
    source_counts: sourceCounts,
    ps_sku_status: psStatus,
    ps_skus_missing: psStatus.filter((status) => !status.present_in_shop).map((status) => status.sku),
    series_counts_in_shop: seriesCounts(products),
  };

  writeJsonIfChanged(filePath, next, changedFiles);
}

function idFromUrl(url) {
  const match = String(url || '').match(/_(\d+)\.html/i);
  return match ? match[1] : '';
}

function syncPriceCatalogCompare(products, sourceCounts, changedFiles) {
  const filePath = path.join(combinedDir, 'price_catalog_compare.json');
  const previous = readJson(filePath, {});
  if (!Object.keys(previous).length) return;

  const productUrls = products.map((product) => getSourceUrl(product));
  const missingUrls = (previous.ps_missing_urls || []).filter((url) => {
    const id = idFromUrl(url);
    return !id || !productUrls.some((productUrl) => productUrl.includes(id));
  });

  const next = {
    ...previous,
    shop_total: products.length,
    shop_unique_urls: new Set(products.map((product) => normalizeUrl(product.url)).filter(Boolean)).size,
    source_counts: sourceCounts,
    ps_missing_urls: missingUrls,
    ps_missing_ids: missingUrls.map(idFromUrl).filter(Boolean),
  };

  writeJsonIfChanged(filePath, next, changedFiles);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function productHasSku(product, sku) {
  const pattern = new RegExp(`\\b${escapeRegExp(sku)}\\b`, 'i');
  return pattern.test(`${product.sku || ''} ${product.title || ''} ${product.url || ''} ${getSourceUrl(product)}`);
}

function syncPriceCatalogSkuCompare(products, changedFiles) {
  const filePath = path.join(combinedDir, 'price_catalog_sku_compare.json');
  const previous = readJson(filePath, {});
  if (!Object.keys(previous).length) return;

  const psSkus = Array.from(new Set([
    ...(previous.matched_skus || []),
    ...(previous.missing_skus || []),
  ])).sort();
  const matchedSkus = psSkus.filter((sku) => products.some((product) => productHasSku(product, sku)));
  const missingSkus = psSkus.filter((sku) => !matchedSkus.includes(sku));
  const previousMissingMap = previous.missing_map || {};

  const next = {
    ...previous,
    ps_skus_total: psSkus.length,
    shop_skus_total: new Set(products.map((product) => String(product.sku || '').trim()).filter(Boolean)).size,
    shop_sku_rows: products.filter((product) => String(product.sku || '').trim()).length,
    matched_skus_total: matchedSkus.length,
    missing_skus_total: missingSkus.length,
    matched_skus: matchedSkus,
    missing_skus: missingSkus,
    missing_map: Object.fromEntries(missingSkus.map((sku) => [sku, previousMissingMap[sku] || []])),
  };

  writeJsonIfChanged(filePath, next, changedFiles);
}

function main() {
  if (!fs.existsSync(combinedDir)) {
    console.log('import/combined not found; nothing to sync.');
    return;
  }

  const products = readJson(productsPath, []);
  const backup = readJson(backupPath, []);
  const sourceCounts = orderedSourceCounts(countBy(products, (product) => product.source));
  const changedFiles = [];
  const csvRows = syncCombinedCsv(products, changedFiles);

  syncSummary(products, sourceCounts, csvRows, changedFiles);
  syncPricingReport(products, sourceCounts, backup, changedFiles);
  syncCatalogAudit(products, sourceCounts, changedFiles);
  syncPriceCatalogCompare(products, sourceCounts, changedFiles);
  syncPriceCatalogSkuCompare(products, changedFiles);

  if (checkOnly && changedFiles.length) {
    console.error(`Import reports are stale:\n${changedFiles.map((file) => `- ${file}`).join('\n')}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    runtime_products: products.length,
    source_counts: sourceCounts,
    changed_files: changedFiles,
    check_only: checkOnly,
  }, null, 2));
}

main();
