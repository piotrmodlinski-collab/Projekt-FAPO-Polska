const products = require('../assets/data/products.json');

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

  return Array.from(years);
}

function isInternalProductUrl(url) {
  const value = String(url || '').trim();
  if (/^produkty\/[a-z0-9-]+\.html$/i.test(value)) return true;
  if (/^\/produkty\/[a-z0-9-]+\.html$/i.test(value)) return true;
  if (/^https:\/\/(?:www\.)?fapomoto\.pl\/produkty\/[a-z0-9-]+\.html$/i.test(value)) return true;
  return false;
}

const ids = new Set();
const duplicateIds = [];
for (const product of products) {
  if (ids.has(product.id)) duplicateIds.push(product.id);
  ids.add(product.id);
}

const missingSku = products.filter((product) => !String(product.sku || '').trim());
const badUrl = products.filter((product) => !isInternalProductUrl(product.url));
const noYear = products.filter((product) => {
  if (product.fitmentType) return false;
  const explicitYears = product.vehicle && Array.isArray(product.vehicle.years)
    ? product.vehicle.years
    : [];
  return !(explicitYears.length || extractYearsFromText(product.title || '').length);
});
const externalVisibleUrl = products.filter((product) => /^https?:\/\//i.test(product.url || '')
  && !/^https:\/\/(?:www\.)?fapomoto\.pl\//i.test(product.url || ''));
const exposedSourceUrl = products.filter((product) => String(product.sourceUrl || '').trim());
const externalSourceLabel = products.filter((product) => /alibaba|ridershox|fapomoto\.com/i.test(String(product.source || '')));

const fitment = products.reduce((acc, product) => {
  const key = product.fitmentType || 'vehicle';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const report = {
  total: products.length,
  duplicateIds: duplicateIds.length,
  missingSku: missingSku.length,
  badUrl: badUrl.length,
  externalVisibleUrl: externalVisibleUrl.length,
  exposedSourceUrl: exposedSourceUrl.length,
  externalSourceLabel: externalSourceLabel.length,
  noYear: noYear.length,
  fitment,
  internalSku: products.filter((product) => product.skuSource === 'internal').map((product) => product.id),
};

console.log(JSON.stringify(report, null, 2));

if (
  duplicateIds.length
  || missingSku.length
  || badUrl.length
  || externalVisibleUrl.length
  || exposedSourceUrl.length
  || externalSourceLabel.length
  || noYear.length
) {
  process.exit(1);
}
