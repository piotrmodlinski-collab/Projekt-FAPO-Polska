const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const checkOnly = process.argv.includes('--check');
const force = process.argv.includes('--force');
const translateOnly = process.argv.includes('--translate-only');
const concurrency = Number(process.env.DESCRIPTION_IMPORT_CONCURRENCY || 6);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  for (let index = 1; index <= 25; index += 1) refs.push(`HEAD~${index}`);

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

function toProductJsonUrl(sourceUrl) {
  const value = String(sourceUrl || '').trim();
  if (!/^https:\/\/(?:www\.)?fapomoto\.com\/products\//i.test(value)) return '';
  return value.replace(/\/$/, '') + '.js';
}

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
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

function replaceAll(text, replacements) {
  let next = text;
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function translateTextToPolish(value) {
  let text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const exact = new Map([
    ['Application:', 'Zastosowanie:'],
    ['Application', 'Zastosowanie'],
    ['Fitment:', 'Dopasowanie:'],
    ['Fitment', 'Dopasowanie'],
    ['Package Includes:', 'Zawartość zestawu:'],
    ['Package Includes', 'Zawartość zestawu'],
    ['Package included:', 'Zawartość zestawu:'],
    ['Package included', 'Zawartość zestawu'],
    ['Page Includes:', 'Zawartość zestawu:'],
    ['Page Includes', 'Zawartość zestawu'],
    ['Features:', 'Cechy produktu:'],
    ['Features', 'Cechy produktu'],
    ['Specification:', 'Specyfikacja:'],
    ['Specifications:', 'Specyfikacja:'],
    ['Specification', 'Specyfikacja'],
    ['Specifications', 'Specyfikacja'],
    ['Notes:', 'Uwagi:'],
    ['Note:', 'Uwaga:'],
    ['Notes', 'Uwagi'],
    ['Note', 'Uwaga'],
    ['Important Notes:', 'Ważne uwagi:'],
    ['Important Note:', 'Ważna uwaga:'],
    ['Warranty:', 'Gwarancja:'],
    ['Warranty', 'Gwarancja'],
  ]);
  if (exact.has(text)) return exact.get(text);

  const replacements = [
    [/\bPackage\s+Includes\b/gi, 'Zawartość zestawu'],
    [/\bPackage\s+included\b/gi, 'Zawartość zestawu'],
    [/\bPage\s+Includes\b/gi, 'Zawartość zestawu'],
    [/\bApplication\b/gi, 'Zastosowanie'],
    [/\bInstruction\b/gi, 'Informacje'],
    [/\bFitment\b/gi, 'Dopasowanie'],
    [/\bFeatures\b/gi, 'Cechy produktu'],
    [/\bSpecifications?\b/gi, 'Specyfikacja'],
    [/\bImportant\s+Notes?\b/gi, 'Ważne uwagi'],
    [/\bNotes?\b/gi, 'Uwagi'],
    [/\bWarranty\b/gi, 'Gwarancja'],
    [/\bSpring\s+Rate\b/gi, 'Twardość sprężyn'],
    [/\bTechnical\s+Specifications?\b/gi, 'Dane techniczne'],
    [/\bMono-?tube\s+shock\s+design\b/gi, 'Konstrukcja amortyzatora monotube'],
    [/\bAdjustable\s+pre-?load\s+spring\s+tension\b/gi, 'Regulacja napięcia wstępnego sprężyny'],
    [/\bHigh-?tensile\s+performance\s+spring\b/gi, 'Sportowa sprężyna o wysokiej wytrzymałości'],
    [/\bRubber\s+boots\s+included\s+on\s+all\s+inserts\s+to\s+protect\s+dampers\s+&\s+keep\s+them\s+clean\b/gi, 'Gumowe osłony na wszystkich wkładach chronią amortyzatory i pomagają utrzymać je w czystości'],
    [/\bBetter\s+handling\s+without\s+sacrificing\s+ride\s+comfort\b/gi, 'Lepsze prowadzenie bez utraty komfortu jazdy'],
    [/\bQuick,\s+cost-effective\s+way\s+to\s+upgrade\s+your\s+car'?s\s+appearance\b/gi, 'Szybki i ekonomiczny sposób na poprawę wyglądu auta'],
    [/\bEasy\s+installation\s+with\s+proper\s+tools\b/gi, 'Łatwy montaż przy użyciu właściwych narzędzi'],
    [/\bSuitable\s+for\s+track,\s+drift,\s+fast-road,\s+and\s+daily\s+driving\b/gi, 'Odpowiednie do jazdy torowej, driftu, szybkiej jazdy drogowej i codziennego użytkowania'],
    [/\bAll\s+pictured\s+accessories\s+included\b/gi, 'Wszystkie widoczne akcesoria są w zestawie'],
    [/\bDefault\s+1-year\s+warranty\s+for\s+any\s+manufacturing\s+defect,\s+upgrade\s+to\s+2\s+years\s+with\s+our\s+Extended\s+Warranty\s+Program\b/gi, 'Standardowa roczna gwarancja na wady produkcyjne z możliwością przedłużenia do 2 lat w programie rozszerzonej gwarancji'],
    [/\bFront\s+coilovers?\b/gi, 'Przednie kolumny gwintowane'],
    [/\bRear\s+coilovers?\b/gi, 'Tylne kolumny gwintowane'],
    [/\bcoilovers?\b/gi, 'zawieszenie gwintowane'],
    [/\bLowering\s+springs?\b/gi, 'sprężyny obniżające'],
    [/\bFront\s+springs?\b/gi, 'Przednie sprężyny'],
    [/\bRear\s+springs?\b/gi, 'Tylne sprężyny'],
    [/\bsprings?\b/gi, 'sprężyny'],
    [/\bFront\s+shocks?\b/gi, 'Przednie amortyzatory'],
    [/\bRear\s+shocks?\b/gi, 'Tylne amortyzatory'],
    [/\bshock\s+absorbers?\b/gi, 'amortyzatory'],
    [/\bshocks?\b/gi, 'amortyzatory'],
    [/\bstruts?\b/gi, 'kolumny amortyzatora'],
    [/\bspanners?\b/gi, 'klucze regulacyjne'],
    [/\bwrenches?\b/gi, 'klucze'],
    [/\bprovides\s+larger\s+oil\s+&\s+gas\s+capacity\b/gi, 'zapewnia większą pojemność oleju i gazu'],
    [/\bAdjustable\s+ride\s+height\b/gi, 'Regulowana wysokość zawieszenia'],
    [/\bAdjustable\s+height\b/gi, 'Regulowana wysokość'],
    [/\bpre-?load\b/gi, 'napięcie wstępne'],
    [/\bsurface-treated\s+for\s+durability\b/gi, 'z powierzchnią zabezpieczoną dla trwałości'],
    [/\bdistortion\s+after\b/gi, 'odkształcenia po'],
    [/\bcycles?\b/gi, 'cyklach'],
    [/\bPillow\s+ball\s+top\s+mounts?\b/gi, 'Górne mocowanie typu pillow ball'],
    [/\bCamber\s+plates?\b/gi, 'Płyty camber'],
    [/\bPowder\s+coated\b/gi, 'Malowane proszkowo'],
    [/\bRust\s+resistant\b/gi, 'Odporne na korozję'],
    [/\bCorrosion\s+resistant\b/gi, 'Odporne na korozję'],
    [/\bProfessional\s+installation\s+is\s+highly\s+recommended\b/gi, 'Zalecany montaż przez profesjonalny serwis'],
    [/\bProfessional\s+installation\s+recommended\b/gi, 'Zalecany montaż przez profesjonalny serwis'],
    [/\bNo\s+instruction\s+included\b/gi, 'Instrukcja nie jest dołączona'],
    [/\bInstruction\s+is\s+not\s+included\b/gi, 'Instrukcja nie jest dołączona'],
    [/\bCompatible\s+with\b/gi, 'Kompatybilne z'],
    [/\bWITHOUT\b/g, 'bez'],
    [/\bwithout\b/g, 'bez'],
    [/\bmodels?\b/gi, 'wersji'],
    [/\bFit\s+for\b/gi, 'Pasuje do'],
    [/\bFits?\b/gi, 'Pasuje do'],
    [/\bDoes\s+not\s+fit\b/gi, 'Nie pasuje do'],
    [/\bDo\s+not\s+fit\b/gi, 'Nie pasuje do'],
    [/\bNot\s+fit\b/gi, 'Nie pasuje do'],
    [/\bFront\b/gi, 'Przód'],
    [/\bRear\b/gi, 'Tył'],
    [/\bLeft\b/gi, 'Lewy'],
    [/\bRight\b/gi, 'Prawy'],
    [/\bPair\b/gi, 'Para'],
    [/\bSet\b/gi, 'Zestaw'],
    [/\bFull\s+set\b/gi, 'Kompletny zestaw'],
    [/\bIncludes?\b/gi, 'Zawiera'],
    [/\bIncluded\b/gi, 'w zestawie'],
    [/\bMounting\s+hardware\b/gi, 'elementy montażowe'],
    [/\bHardware\b/gi, 'elementy montażowe'],
    [/\bSteel\b/gi, 'stal'],
    [/\bStainless\s+steel\b/gi, 'stal nierdzewna'],
    [/\bAluminum\b/gi, 'aluminium'],
    [/\bRubber\b/gi, 'guma'],
    [/\bBushing\b/gi, 'tuleja'],
    [/\bBushings\b/gi, 'tuleje'],
    [/\bControl\s+arms?\b/gi, 'wahacze'],
    [/\bSway\s+bar\s+end\s+links?\b/gi, 'łączniki stabilizatora'],
    [/\bBrake\s+lines?\b/gi, 'przewody hamulcowe'],
    [/\bHeader(s)?\b/gi, 'kolektor$1'],
    [/\bTurbo\s+manifold\b/gi, 'kolektor turbo'],
    [/\bTurbocharger\b/gi, 'turbosprężarka'],
    [/\bIntercooler\b/gi, 'intercooler'],
    [/\bExhaust\b/gi, 'wydech'],
    [/\bMuffler\b/gi, 'tłumik'],
    [/\bDirect\s+replacement\b/gi, 'bezpośredni zamiennik'],
    [/\bEasy\s+installation\b/gi, 'łatwy montaż'],
    [/\bRide\s+quality\b/gi, 'komfort jazdy'],
    [/\bRide\s+comfort\b/gi, 'komfort jazdy'],
    [/\bHandling\b/gi, 'prowadzenie'],
    [/\bStreet\s+use\b/gi, 'jazda uliczna'],
    [/\bTrack\s+use\b/gi, 'jazda torowa'],
    [/\bRacing\b/gi, 'sportowa jazda'],
    [/\bStock\b/gi, 'seryjny'],
    [/\bApproximately\b/gi, 'około'],
    [/\bApprox\b/gi, 'około'],
    [/\bLower\s+your\s+car\b/gi, 'obniżają samochód'],
    [/\bHigh\s+quality\b/gi, 'wysoka jakość'],
    [/\bHigh\s+performance\b/gi, 'wysoka wydajność'],
    [/\bDurable\b/gi, 'trwały'],
    [/\bDurability\b/gi, 'trwałość'],
    [/\bAdjustable\b/gi, 'regulowany'],
    [/\bBrand\s+new\b/gi, 'fabrycznie nowy'],
    [/\bCondition\b/gi, 'stan'],
    [/\bMaterial\b/gi, 'materiał'],
    [/\bColor\b/gi, 'kolor'],
    [/\bQuantity\b/gi, 'ilość'],
    [/\bVehicle\b/gi, 'pojazd'],
    [/\bEngine\b/gi, 'silnik'],
    [/\bLift\b/gi, 'lift'],
    [/\bDrop\b/gi, 'obniżenie'],
    [/\binch(?:es)?\b/gi, 'cala'],
  ];

  text = replaceAll(text, replacements);
  text = text
    .replace(/\s+([,.:%)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
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
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function fallbackDescription(product) {
  const sku = product.sku ? ` SKU ${product.sku}.` : '';
  const category = product.category || 'Performance';
  return `<p>${escapeHtml(`${product.title}. ${category}. Produkt dostępny w katalogu FAPO Polska z obsługą zamówienia przez nasz sklep.${sku}`)}</p>`;
}

async function fetchProductDescription(product, sourceUrl) {
  let jsonUrl = toProductJsonUrl(sourceUrl);
  if (!jsonUrl) return null;

  try {
    return await fetchProductDescriptionUrl(jsonUrl);
  } catch (error) {
    jsonUrl = findSuggestedProductJsonUrl(product);
    if (!jsonUrl) throw error;
    return fetchProductDescriptionUrl(jsonUrl);
  }
}

async function fetchProductDescriptionUrl(jsonUrl) {
  if (!jsonUrl) return null;

  let payload;
  try {
    payload = await fetchTextWithNodeHttps(jsonUrl);
  } catch (error) {
    payload = fetchTextWithCurl(jsonUrl);
  }

  const remote = JSON.parse(payload);
  return remote.description || '';
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

function fetchTextWithCurl(url) {
  const args = ['-k', '-g', '-L', '-sS', '--fail', url];
  for (const command of ['curl.exe', 'curl']) {
    try {
      return execFileSync(command, args, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (error) {
      // Try the next curl command name.
    }
  }
  throw new Error('curl failed');
}

function fetchTextWithNodeHttps(jsonUrl) {
  return new Promise((resolve, reject) => {
    const request = https.get(jsonUrl, {
      timeout: 20000,
      headers: {
        accept: 'application/json',
        'user-agent': 'FAPO Polska catalog importer',
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
      response.on('end', () => resolve(body));
    });

    request.on('timeout', () => {
      request.destroy(new Error('Request timeout'));
    });
    request.on('error', reject);
  });
}

async function runLimited(items, limit, worker) {
  let index = 0;
  const results = [];
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const products = readJson(productsPath);
  const sourceMap = findHistoricalSourceMap();
  const changedIds = [];
  const failed = [];
  const targets = products.filter((product) => (
    force
    || translateOnly
    || !product.descriptionHtmlPl
    || (product.source === 'fapomoto' && !product.descriptionHtmlEn)
  ));

  await runLimited(targets, concurrency, async (product, index) => {
    let descriptionHtmlEn = translateOnly && product.descriptionHtmlEn
      ? product.descriptionHtmlEn
      : '';
    const sourceUrl = sourceMap.get(product.id);

    if (!descriptionHtmlEn) {
      try {
        descriptionHtmlEn = await fetchProductDescription(product, sourceUrl);
      } catch (error) {
        failed.push({ id: product.id, reason: error.message });
      }
    }

    const cleanEn = sanitizeHtml(descriptionHtmlEn);
    const descriptionHtmlPl = cleanEn
      ? translateHtmlToPolish(cleanEn)
      : fallbackDescription(product);

    product.descriptionHtmlEn = cleanEn || '';
    product.descriptionHtmlPl = descriptionHtmlPl;
    product.descriptionTextPl = htmlToText(descriptionHtmlPl);
    changedIds.push(product.id);

    if ((index + 1) % 50 === 0) {
      console.log(`Imported descriptions: ${index + 1}/${targets.length}`);
    }
  });

  const changed = writeJsonIfChanged(productsPath, products);
  if (checkOnly && changed) {
    console.error('Product descriptions are stale.');
    process.exit(1);
  }

  console.log(JSON.stringify({
    products: products.length,
    processed: targets.length,
    changed,
    failed: failed.length,
    failedSample: failed.slice(0, 12),
    check_only: checkOnly,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
