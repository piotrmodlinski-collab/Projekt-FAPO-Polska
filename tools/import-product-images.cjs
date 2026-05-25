const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const importDir = path.join(root, 'import', 'fapomoto');
const checkOnly = process.argv.includes('--check');
const force = process.argv.includes('--force');
const concurrency = Number(process.env.IMAGE_IMPORT_CONCURRENCY || 6);

function readJson(filePath, fallback = null) {
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

function readProductsFromGit(ref) {
  try {
    const raw = execFileSync('git', ['show', `${ref}:assets/data/products.json`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function findHistoricalSourceMap() {
  const map = new Map();
  const refs = ['HEAD'];
  for (let index = 1; index <= 30; index += 1) refs.push(`HEAD~${index}`);

  for (const ref of refs) {
    const products = readProductsFromGit(ref);
    for (const product of products) {
      if (!product?.id || !product?.sourceUrl || map.has(product.id)) continue;
      map.set(product.id, String(product.sourceUrl));
    }
    if (map.size) break;
  }
  return map;
}

function sourceUrlToHandle(sourceUrl) {
  const match = String(sourceUrl || '').match(/\/products\/([^/?#]+)/i);
  return match ? match[1] : '';
}

function toProductJsonUrl(sourceUrl) {
  const value = String(sourceUrl || '').trim();
  if (!/^https:\/\/(?:www\.)?fapomoto\.com\/products\//i.test(value)) return '';
  return value.replace(/\/$/, '') + '.js';
}

function normalizeImageUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace(/^http:\/\//i, 'https://');
  return url;
}

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function imageFileName(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split('/').pop() || '').toUpperCase();
  } catch (error) {
    return String(url || '').toUpperCase();
  }
}

function imageSkuTokens(url) {
  const fileName = imageFileName(url);
  const matches = fileName.match(/(?:PF|PS|PA|FE|FT|FZ|PZ|PP|PJ|FR|FI|FL|FJ|PT|MX|TY)\d{3,6}/g) || [];
  return Array.from(new Set(matches));
}

function keepProductImage(product, url) {
  const sku = String(product?.sku || '').trim().toUpperCase();
  if (!sku) return true;

  const tokens = imageSkuTokens(url);
  if (!tokens.length) return true;
  return tokens.includes(sku);
}

function fetchTextWithCurl(url) {
  const args = ['-k', '-g', '-L', '-sS', '--fail', url];
  for (const command of ['curl.exe', 'curl']) {
    try {
      return execFileSync(command, args, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 8,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (error) {
      // Try the next curl command name.
    }
  }
  throw new Error('curl failed');
}

function readLocalProductJson(sourceUrl) {
  const handle = sourceUrlToHandle(sourceUrl);
  if (!handle) return null;
  return readJson(path.join(importDir, `product_${handle}.json`), null);
}

function findSuggestedProductJsonUrl(product) {
  const sku = String(product.sku || '').trim();
  if (!sku) return '';

  const searchUrl = `https://www.fapomoto.com/search/suggest.json?q=${encodeURIComponent(sku)}&resources[type]=product&resources[limit]=8`;
  const raw = fetchTextWithCurl(searchUrl);
  const results = JSON.parse(raw)?.resources?.results?.products || [];
  const skuToken = normalizeToken(sku);
  const candidate = results.find((item) => {
    const title = normalizeToken(item.title);
    const handle = normalizeToken(item.handle);
    return title.includes(skuToken) || handle.includes(skuToken);
  });

  if (!candidate?.handle) return '';
  return `https://www.fapomoto.com/products/${candidate.handle}.js`;
}

function fetchProductJson(product, sourceUrl) {
  const local = readLocalProductJson(sourceUrl);
  if (local) return local;

  let jsonUrl = toProductJsonUrl(sourceUrl);
  if (!jsonUrl) return null;

  try {
    return JSON.parse(fetchTextWithCurl(jsonUrl));
  } catch (error) {
    jsonUrl = findSuggestedProductJsonUrl(product);
    if (!jsonUrl) throw error;
    return JSON.parse(fetchTextWithCurl(jsonUrl));
  }
}

function extractRemoteImages(remote) {
  const images = [];
  for (const value of remote?.images || []) {
    const url = normalizeImageUrl(value);
    if (url) images.push(url);
  }
  for (const media of remote?.media || []) {
    const url = normalizeImageUrl(media?.src || media?.preview_image?.src);
    if (url) images.push(url);
  }
  if (remote?.featured_image) {
    const url = normalizeImageUrl(remote.featured_image);
    if (url) images.unshift(url);
  }
  return Array.from(new Set(images))
    .filter((url) => /^https:\/\/cdn\.shopify\.com\//i.test(url));
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
  const sourceMap = findHistoricalSourceMap();
  const targets = products.filter((product) => (
    product.source === 'fapomoto'
    && sourceMap.has(product.id)
    && (force || !Array.isArray(product.images) || product.images.length <= 1)
  ));
  const changedIds = [];
  const failed = [];

  await runLimited(targets, concurrency, async (product, index) => {
    try {
      const remote = fetchProductJson(product, sourceMap.get(product.id));
      const remoteImages = extractRemoteImages(remote);
      if (remoteImages.length) {
        const images = remoteImages.filter((url) => keepProductImage(product, url));
        product.images = images;
        product.image = images[0] || '';
        changedIds.push(product.id);
      }
    } catch (error) {
      failed.push({ id: product.id, reason: error.message });
    }

    if ((index + 1) % 50 === 0) {
      console.log(`Imported image galleries: ${index + 1}/${targets.length}`);
    }
  });

  const changed = writeJsonIfChanged(productsPath, products);
  if (checkOnly && changed) {
    console.error('Product image galleries are stale.');
    process.exit(1);
  }

  console.log(JSON.stringify({
    products: products.length,
    processed: targets.length,
    changed,
    changedIds: changedIds.length,
    changedSample: changedIds.slice(0, 12),
    failed: failed.length,
    failedSample: failed.slice(0, 12),
    check_only: checkOnly,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
