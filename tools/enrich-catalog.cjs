const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const dryRun = process.argv.includes('--dry-run');

const VEHICLE_MAKE_ALIASES = [
  { canonical: 'Acura', aliases: ['Acura'] },
  { canonical: 'Alfa Romeo', aliases: ['Alfa Romeo'] },
  { canonical: 'Audi', aliases: ['Audi'] },
  { canonical: 'BMW', aliases: ['BMW'] },
  { canonical: 'Buick', aliases: ['Buick'] },
  { canonical: 'Cadillac', aliases: ['Cadillac'] },
  { canonical: 'Chevrolet', aliases: ['Chevrolet', 'Chevy'] },
  { canonical: 'Chrysler', aliases: ['Chrysler'] },
  { canonical: 'Dodge', aliases: ['Dodge'] },
  { canonical: 'Ford', aliases: ['Ford'] },
  { canonical: 'GMC', aliases: ['GMC'] },
  { canonical: 'Honda', aliases: ['Honda'] },
  { canonical: 'Hyundai', aliases: ['Hyundai'] },
  { canonical: 'Infiniti', aliases: ['Infiniti'] },
  { canonical: 'Jaguar', aliases: ['Jaguar'] },
  { canonical: 'Jeep', aliases: ['Jeep'] },
  { canonical: 'Kia', aliases: ['Kia'] },
  { canonical: 'Land Rover', aliases: ['Land Rover'] },
  { canonical: 'Lexus', aliases: ['Lexus'] },
  { canonical: 'Lincoln', aliases: ['Lincoln'] },
  { canonical: 'Mazda', aliases: ['Mazda', 'Mazdaspeed'] },
  { canonical: 'Mercedes-Benz', aliases: ['Mercedes-Benz', 'Mercedes Benz', 'Mercedes'] },
  { canonical: 'Mercury', aliases: ['Mercury'] },
  { canonical: 'Merkur', aliases: ['Merkur'] },
  { canonical: 'Mini', aliases: ['Mini'] },
  { canonical: 'Mitsubishi', aliases: ['Mitsubishi'] },
  { canonical: 'Nissan', aliases: ['Nissan'] },
  { canonical: 'Oldsmobile', aliases: ['Oldsmobile', 'Olds'] },
  { canonical: 'Opel', aliases: ['Opel'] },
  { canonical: 'Pontiac', aliases: ['Pontiac'] },
  { canonical: 'Porsche', aliases: ['Porsche'] },
  { canonical: 'Saab', aliases: ['Saab'] },
  { canonical: 'Saturn', aliases: ['Saturn'] },
  { canonical: 'Scion', aliases: ['Scion'] },
  { canonical: 'Subaru', aliases: ['Subaru'] },
  { canonical: 'Suzuki', aliases: ['Suzuki'] },
  { canonical: 'Tesla', aliases: ['Tesla'] },
  { canonical: 'Toyota', aliases: ['Toyota'] },
  { canonical: 'Volkswagen', aliases: ['Volkswagen', 'VW'] },
  { canonical: 'Volvo', aliases: ['Volvo'] },
];

const VEHICLE_ALIAS_TO_MAKE = new Map();
const VEHICLE_MAKE_PATTERN = new RegExp(
  `\\b(${VEHICLE_MAKE_ALIASES.flatMap((entry) => entry.aliases)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})\\b`,
  'gi',
);

const MODEL_SKIP_TOKENS = new Set([
  'for', 'and', 'or', 'with', 'without', 'fit', 'fits', 'compatible', 'suitable',
  'the', 'new', 'old', 'front', 'rear', 'left', 'right', 'upper', 'lower',
  'series', 'gen', 'generation', 'stage', 'level', 'levels', 'damping', 'adj',
  'adjustable', 'height', 'in', 'inch', 'inches', 'lift', 'lifts', 'set', 'full',
  'shock', 'shocks', 'strut', 'struts', 'coilover', 'coilovers', 'suspension',
  'arm', 'arms', 'control', 'link', 'links', 'bar', 'stabilizer', 'fapo',
  '2wd', '4wd', 'awd', 'fwd', 'rwd', 'sedan', 'coupe', 'hatchback', 'hatch',
  'wagon', 'convertible', 'pickup', 'truck',
]);

const MODEL_BREAK_TOKENS = new Set(['for', 'and', 'or', 'with', 'without', 'compatible', 'fit', 'fits']);
const MODEL_TRIM_TOKENS = new Set(['si', 'ex', 'lx', 'dx', 'se', 'le', 'xle', 'xse', 'gt', 'gti', 'type-r', 'type', 'sport', 'touring', 'limited', 'premium', 'srt', 'srt-8', 'st', 'rs']);

const MANUAL_SKU_OVERRIDES = {
  p0551: { sku: 'FAPO-P0551', skuSource: 'internal' },
};

const MANUAL_FITMENT_OVERRIDES = {
  p0015: { fitmentType: 'swap' },
  p0065: { vehicle: vehicleRange(['BMW'], ['E46'], 1998, 2006) },
  p0089: { vehicle: vehicleRange(['BMW'], ['E36'], 1990, 2000) },
  p0127: { fitmentType: 'swap' },
  p0350: { fitmentType: 'engine' },
  p0356: { vehicle: vehicleRange(['BMW'], ['E36'], 1990, 2000) },
  p0574: { vehicle: vehicleRange(['BMW'], ['E36'], 1990, 2000) },
  p0610: { vehicle: vehicleRange(['BMW'], ['E36', 'E46', 'M3'], 1990, 2006) },
};

VEHICLE_MAKE_ALIASES.forEach((entry) => {
  entry.aliases.forEach((alias) => VEHICLE_ALIAS_TO_MAKE.set(alias.toLowerCase(), entry.canonical));
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function vehicleRange(makes, models, fromYear, toYear) {
  const years = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    years.push(year);
  }
  return { makes, models, years };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function htmlToText(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isReasonableYear(year) {
  return Number.isInteger(year) && year >= 1960 && year <= 2030;
}

function addYearRange(years, fromYear, toYear) {
  if (!isReasonableYear(fromYear) || !isReasonableYear(toYear)) return;
  const minYear = Math.min(fromYear, toYear);
  const maxYear = Math.max(fromYear, toYear);
  if (maxYear - minYear > 45) return;
  for (let year = minYear; year <= maxYear; year += 1) {
    years.add(year);
  }
}

function expandTwoDigitYear(value) {
  const year = Number(value);
  return year >= 60 ? 1900 + year : 2000 + year;
}

function extractYearsFromText(text) {
  const source = String(text || '');
  const years = new Set();
  let match;

  const fullRangeRegex = /\b(19\d{2}|20\d{2})\s*[-/]\s*(19\d{2}|20\d{2})\b/g;
  while ((match = fullRangeRegex.exec(source)) !== null) {
    addYearRange(years, Number(match[1]), Number(match[2]));
  }

  const shortRangeRegex = /\b(\d{2})\s*[-/]\s*(\d{2})\b/g;
  while ((match = shortRangeRegex.exec(source)) !== null) {
    addYearRange(years, expandTwoDigitYear(match[1]), expandTwoDigitYear(match[2]));
  }

  const openRangeRegex = /\b(19\d{2}|20\d{2})\s*\+/g;
  while ((match = openRangeRegex.exec(source)) !== null) {
    addYearRange(years, Number(match[1]), 2030);
  }

  const singleRegex = /\b(19\d{2}|20\d{2})\b/g;
  while ((match = singleRegex.exec(source)) !== null) {
    const year = Number(match[1]);
    if (isReasonableYear(year)) years.add(year);
  }

  return Array.from(years).sort((a, b) => a - b);
}

function normalizeModelLabel(model) {
  return String(model || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (/^\d+$/.test(token)) return token;
      if (/^\d+(st|nd|rd|th)$/i.test(token)) return '';
      if (/^[A-Za-z0-9-]*\d+[A-Za-z0-9-]*$/.test(token) || token.includes('/') || token.includes('-')) {
        return token.toUpperCase();
      }
      if (token.length <= 3) return token.toUpperCase();
      return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
    })
    .filter(Boolean)
    .join(' ');
}

function extractModelFromTail(tail) {
  const tokens = String(tail || '').match(/[A-Za-z0-9][A-Za-z0-9+./-]*/g) || [];
  const modelTokens = [];

  for (const rawToken of tokens.slice(0, 14)) {
    const token = rawToken.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!token) continue;
    const lower = token.toLowerCase();
    if (/^(19|20)\d{2}$/.test(token) || /^[A-Z]{2,}\d{3,}$/.test(token)) break;
    if (MODEL_BREAK_TOKENS.has(lower) && modelTokens.length) break;
    if (MODEL_SKIP_TOKENS.has(lower)) continue;
    if (MODEL_TRIM_TOKENS.has(lower) && modelTokens.length) break;
    modelTokens.push(token);
    if (modelTokens.length >= 3) break;
  }

  while (modelTokens.length && MODEL_SKIP_TOKENS.has(modelTokens[modelTokens.length - 1].toLowerCase())) {
    modelTokens.pop();
  }

  return normalizeModelLabel(modelTokens.join(' '));
}

function extractVehicleMeta(text) {
  const source = String(text || '').replace(/[|,;()]/g, ' ');
  const makes = [];
  const models = [];
  const years = extractYearsFromText(source);
  let match;

  VEHICLE_MAKE_PATTERN.lastIndex = 0;
  while ((match = VEHICLE_MAKE_PATTERN.exec(source)) !== null) {
    const canonicalMake = VEHICLE_ALIAS_TO_MAKE.get(String(match[1] || '').toLowerCase());
    if (!canonicalMake) continue;
    if (!makes.includes(canonicalMake)) makes.push(canonicalMake);
    const model = extractModelFromTail(source.slice(match.index + match[0].length));
    if (model && model.toLowerCase() !== canonicalMake.toLowerCase() && !models.includes(model)) {
      models.push(model);
    }
  }

  return { makes, models, years };
}

function mergeYears(vehicle, text) {
  return {
    ...vehicle,
    years: Array.from(new Set([...(vehicle.years || []), ...extractYearsFromText(text)])).sort((a, b) => a - b),
  };
}

function isUniversalFitment(product, text, vehicle) {
  if (vehicle.years.length || vehicle.makes.length || vehicle.models.length) return false;
  return /universal|catalogue|catalog|t-shirt|spanner wrench|heat wrap|v[- ]?band|weld on flange|flex bellows|intercooler pipe kit|dump pipe|high-strength nut/i
    .test(`${product.title || ''} ${text || ''}`);
}

function toShopifyJsonUrl(url) {
  if (!/^https:\/\/www\.fapomoto\.com\/products\//i.test(url || '')) return '';
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  if (!parsed.pathname.endsWith('.js')) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}.js`;
  }
  return parsed.toString();
}

function getSourceUrl(product) {
  return String(product.sourceUrl || product.url || '');
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function skuFromText(text) {
  const match = String(text || '').match(/\b([A-Z]{2,4}\d{4,6}(?:\+[A-Z]{2,4}\d{4,6})*)\b/i);
  return match ? match[1].toUpperCase() : '';
}

function shouldFetchRemote(product) {
  const sourceUrl = getSourceUrl(product);
  if (!toShopifyJsonUrl(sourceUrl)) return false;
  const localVehicle = mergeYears(extractVehicleMeta(product.title || ''), sourceUrl);
  return Boolean(product.vehicle) || !String(product.sku || '').trim() || !localVehicle.years.length;
}

async function main() {
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  const stats = {
    fetched: 0,
    fetchFailed: 0,
    skuFilled: 0,
    vehicleAdded: 0,
    universalMarked: 0,
  };

  for (const product of products) {
    let remote = null;
    let remoteText = '';
    const sourceUrl = getSourceUrl(product);
    const remoteUrl = shouldFetchRemote(product) ? toShopifyJsonUrl(sourceUrl) : '';

    if (remoteUrl) {
      try {
        remote = await fetchJson(remoteUrl);
        remoteText = htmlToText(remote.description || '');
        stats.fetched += 1;
      } catch (error) {
        stats.fetchFailed += 1;
        console.warn(`Could not fetch ${product.id}: ${remoteUrl} (${error.message})`);
      }
    }

    if (!String(product.sku || '').trim()) {
      const remoteSku = remote?.variants?.map((variant) => String(variant.sku || '').trim()).find(Boolean) || '';
      const inferredSku = skuFromText(`${product.title || ''} ${sourceUrl}`);
      const override = MANUAL_SKU_OVERRIDES[product.id];
      const sku = remoteSku || inferredSku || override?.sku || '';
      if (sku) {
        product.sku = sku;
        if (override?.skuSource) product.skuSource = override.skuSource;
        stats.skuFilled += 1;
      }
    }

    const localText = `${product.title || ''} ${remote?.title || ''}`;
    const localVehicle = mergeYears(extractVehicleMeta(localText), `${product.title || ''} ${sourceUrl}`);
    const remoteVehicle = mergeYears(
      extractVehicleMeta(remoteText || localText),
      `${product.title || ''} ${sourceUrl} ${remoteText}`,
    );
    const bestVehicle = remoteVehicle.years.length > localVehicle.years.length ? remoteVehicle : localVehicle;

    if (remote && bestVehicle.years.length && bestVehicle.years.length > localVehicle.years.length) {
      product.vehicle = bestVehicle;
      stats.vehicleAdded += 1;
    }

    const effectiveVehicle = product.vehicle || bestVehicle;
    if (isUniversalFitment(product, remoteText, effectiveVehicle)) {
      product.fitmentType = 'universal';
      stats.universalMarked += 1;
    } else if (product.fitmentType === 'universal') {
      delete product.fitmentType;
    }

    const manualFitment = MANUAL_FITMENT_OVERRIDES[product.id];
    if (manualFitment?.vehicle) {
      product.vehicle = manualFitment.vehicle;
    }
    if (manualFitment?.fitmentType) {
      product.fitmentType = manualFitment.fitmentType;
    }
  }

  const missingSku = products.filter((product) => !String(product.sku || '').trim()).length;
  const noYear = products.filter((product) => {
    if (product.fitmentType) return false;
    const vehicle = product.vehicle || extractVehicleMeta(`${product.title || ''} ${getSourceUrl(product)}`);
    return !vehicle.years.length;
  }).length;

  if (!dryRun) {
    fs.writeFileSync(productsPath, `${JSON.stringify(products, null, 2)}\n`);
  }

  console.log(JSON.stringify({ ...stats, missingSku, noYear, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
