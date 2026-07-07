const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const productsPath = path.join(root, 'assets', 'data', 'products.json');
const productsDir = path.join(root, 'produkty');
const sitemapPath = path.join(root, 'sitemap.xml');
const siteUrl = 'https://fapomoto.pl';
const assetVersion = '20260707-cart-remove';
const checkOnly = process.argv.includes('--check');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value) {
  const text = String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return decodeHtmlEntities(text);
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)));
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function normalizeCategory(category) {
  const map = {
    Coilovers: 'Zawieszenie gwintowane',
    'Off-Road': 'Off-road',
    Exhaust: 'Układ wydechowy',
    Turbo: 'Układ turbo',
    Chassis: 'Podwozie',
    Performance: 'Performance',
  };
  return map[category] || category || 'Performance';
}

function normalizeCategoryEn(category) {
  return category || 'Performance';
}

function localizeProductTitlePL(title) {
  let text = String(title || '');
  const rules = [
    [/(\d+)-Level Damping Coilovers?/gi, '$1-stopniowe zawieszenie gwintowane'],
    [/Coilovers?\s+for/gi, 'Zawieszenie gwintowane do'],
    [/Coilovers?/gi, 'zawieszenie gwintowane'],
    [/Off-?road/gi, 'off-road'],
    [/Front shock/gi, 'przedni amortyzator'],
    [/Rear shock/gi, 'tylny amortyzator'],
    [/Shocks?/gi, 'amortyzatory'],
    [/Shock absorber(s)?/gi, 'amortyzator$1'],
    [/Adjustable height/gi, 'regulowana wysokość'],
    [/Damping/gi, 'tłumienie'],
    [/Lowering springs?/gi, 'sprężyny obniżające'],
    [/Control arm(s)?/gi, 'wahacz$1'],
    [/Sway bar end link(s)?/gi, 'łącznik stabilizatora$1'],
    [/Track bar/gi, 'drążek prowadzący'],
    [/Brake line(s)?/gi, 'przewód hamulcowy$1'],
    [/Extended/gi, 'wydłużony'],
    [/Long tube header(s)?/gi, 'kolektor wydechowy long tube'],
    [/Shorty header(s)?/gi, 'kolektor wydechowy shorty'],
    [/Header(s)?/gi, 'kolektor$1'],
    [/Exhaust/gi, 'wydech'],
    [/Turbo manifold/gi, 'kolektor turbo'],
    [/Turbo charger|Turbocharger|Turbo/gi, 'turbosprężarka'],
    [/Intercooler/gi, 'intercooler'],
    [/Charge pipe/gi, 'rura dolotowa'],
    [/Muffler delete pipe kit/gi, 'zestaw rury zastępującej tłumik'],
    [/For /gi, 'Do '],
    [/Compatible with/gi, 'Kompatybilne z'],
  ];

  for (const [pattern, replacement] of rules) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(
    /(zawieszenie gwintowane)\s+Do\s+((?:19|20)\d{2}(?:-(?:19|20)\d{2})?)\s+(.+)/i,
    '$1 do $3 $2',
  );
  text = text.replace(/\s+([A-Z]{2}\d{5,})\s+((?:19|20)\d{2}(?:-(?:19|20)\d{2})?)$/i, ' $2 $1');

  return text.replace(/^(\s*)([a-ząćęłńóśźż])/i, (match, lead, char) => `${lead}${char.toUpperCase()}`);
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (!number) return 'Cena na zapytanie';
  return `${number.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} PLN`;
}

function formatPriceRange(product) {
  const from = Number(product.priceFrom || product.price || 0);
  const to = Number(product.priceTo || product.oldPrice || 0);
  return formatMoney(from || to);
}

function fitmentLabel(product) {
  const labels = {
    universal: 'Uniwersalny',
    swap: 'Swap/custom',
    engine: 'Silnik',
  };
  if (product.fitmentType && labels[product.fitmentType]) return labels[product.fitmentType];

  const years = Array.isArray(product.vehicle?.years) ? product.vehicle.years : [];
  if (years.length) {
    const sorted = Array.from(new Set(years.map(Number))).sort((a, b) => a - b);
    return sorted[0] === sorted[sorted.length - 1]
      ? String(sorted[0])
      : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  }

  const makes = Array.isArray(product.vehicle?.makes) ? product.vehicle.makes : [];
  return makes.slice(0, 2).join(' / ') || 'Dobór po kontakcie';
}

function fitmentLabelEn(product) {
  const labels = {
    universal: 'Universal',
    swap: 'Swap/custom',
    engine: 'Engine',
  };
  if (product.fitmentType && labels[product.fitmentType]) return labels[product.fitmentType];

  const years = Array.isArray(product.vehicle?.years) ? product.vehicle.years : [];
  if (years.length) {
    const sorted = Array.from(new Set(years.map(Number))).sort((a, b) => a - b);
    return sorted[0] === sorted[sorted.length - 1]
      ? String(sorted[0])
      : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  }

  const makes = Array.isArray(product.vehicle?.makes) ? product.vehicle.makes : [];
  return makes.slice(0, 2).join(' / ') || 'Fitment by contact';
}

function productFileName(product) {
  const sku = slugify(product.sku || product.id || 'produkt');
  const title = slugify(product.title || product.id || 'fapo');
  return `${product.id}-${sku}-${title}.html`;
}

function normalizeProducts(products) {
  return products.map((product) => {
    const next = { ...product };
    const fileName = productFileName(next);
    next.url = `produkty/${fileName}`;
    next.canonicalUrl = `${siteUrl}/produkty/${fileName}`;
    if (next.source === 'ridershox_alibaba') {
      next.source = 'special_order';
    }
    delete next.sourceUrl;
    return next;
  });
}

function productDescription(product, title, category, fitment) {
  if (product.descriptionTextPl) {
    return product.descriptionTextPl;
  }

  const sku = product.sku ? ` SKU ${product.sku}.` : '';
  return `${title}. ${category}, ${fitment}. Produkt dostępny w katalogu FAPO Polska z obsługą zamówienia przez nasz sklep.${sku}`;
}

function productDescriptionEn(product, title, category, fitment) {
  const imported = stripHtml(product.descriptionHtmlEn);
  if (imported) {
    return imported;
  }

  const sku = product.sku ? ` SKU ${product.sku}.` : '';
  return `${title}. ${category}, ${fitment}. Product available in the FAPO Poland catalogue with order support through our store.${sku}`;
}

function safeProductDescriptionHtml(product, fallbackDescription, language = 'pl') {
  const source = language === 'en' ? product.descriptionHtmlEn : product.descriptionHtmlPl;
  const html = String(source || '').trim();
  if (!html) {
    return `<p>${escapeHtml(fallbackDescription)}</p>`;
  }

  return html;
}

function productImages(product, fallbackImage) {
  const images = [
    product.image,
    ...(Array.isArray(product.images) ? product.images : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const unique = Array.from(new Set(images));
  return unique.length ? unique : [fallbackImage];
}

function productPageAssetUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(?:https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('../')) return url;
  return `../${url.replace(/^\.?\//, '')}`;
}

function siteAssetUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(?:https?:)?\/\//i.test(url)) return url;
  return `${siteUrl}/${url.replace(/^(?:\.\.\/|\.\/|\/)+/, '')}`;
}

function renderProductGallery(images, title) {
  const imageTags = images.map(productPageAssetUrl).filter(Boolean);
  const firstImage = imageTags[0];
  const imageCount = imageTags.length;
  const thumbs = imageTags.map((src, index) => `
            <button class="product-gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-gallery-src="${escapeHtml(src)}" data-gallery-index="${index}" aria-label="Pokaż zdjęcie ${index + 1} z ${imageCount}" aria-pressed="${index === 0 ? 'true' : 'false'}">
              <img src="${escapeHtml(src)}" alt="${escapeHtml(`${title} - zdjęcie ${index + 1}`)}" loading="${index === 0 ? 'eager' : 'lazy'}" />
            </button>`).join('');

  return `
        <div class="product-detail-media" data-product-gallery data-gallery-count="${imageCount}">
          <div class="product-gallery-stage">
            <img class="product-main-image" src="${escapeHtml(firstImage)}" alt="${escapeHtml(title)}" decoding="async" fetchpriority="high" />
            ${imageCount > 1 ? `<button class="product-gallery-control product-gallery-prev" type="button" data-gallery-prev aria-label="Poprzednie zdjęcie">‹</button>
            <button class="product-gallery-control product-gallery-next" type="button" data-gallery-next aria-label="Następne zdjęcie">›</button>
            <span class="product-gallery-counter" data-gallery-counter>1 / ${imageCount}</span>` : ''}
          </div>
          ${imageCount > 1 ? `<div class="product-gallery-thumbs" aria-label="Miniatury produktu">${thumbs}
          </div>` : ''}
        </div>`;
}

function productJsonLd(product, title, description, images) {
  const price = Number(product.priceFrom || product.price || 0);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${product.canonicalUrl}#product`,
    name: title,
    sku: product.sku || product.id,
    category: normalizeCategory(product.category),
    brand: {
      '@type': 'Brand',
      name: 'FAPO',
    },
    image: images?.length ? images : undefined,
    description,
    url: product.canonicalUrl,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'PLN',
      price: price || undefined,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: product.canonicalUrl,
      seller: {
        '@type': 'Organization',
        name: 'FAPO Polska',
        url: siteUrl,
      },
    },
  };

  return JSON.stringify(data, null, 2).replace(/\n/g, '\n    ');
}

function renderCartDrawer() {
  return `
  <aside class="cart-drawer" id="cart-drawer" aria-hidden="true">
    <div class="cart-head">
      <h3>Twój koszyk</h3>
      <button class="cart-close" type="button" id="cart-close" aria-label="Zamknij koszyk">×</button>
    </div>
    <div class="cart-items" id="cart-items"></div>
    <div class="cart-summary">
      <p>Wartość orientacyjna:</p>
      <strong id="cart-total">0 PLN</strong>
    </div>
    <form id="checkout-form" class="checkout-form">
      <h4>Finalizacja zamówienia</h4>
      <label>Imię i nazwisko / Firma
        <input type="text" name="customerName" required />
      </label>
      <label>E-mail
        <input type="email" name="customerEmail" required />
      </label>
      <label>Telefon
        <input type="tel" name="customerPhone" required />
      </label>
      <label>Adres dostawy
        <textarea name="customerAddress" rows="3" required></textarea>
      </label>
      <label>Uwagi
        <textarea name="customerNote" rows="2"></textarea>
      </label>
      <button type="submit" class="btn btn-primary">Wyślij zamówienie</button>
      <p class="checkout-note">Po kliknięciu wyślemy zamówienie bezpośrednio do obsługi FAPO Polska.</p>
    </form>
  </aside>
  <div class="cart-backdrop" id="cart-backdrop" hidden></div>`;
}

function renderProductPage(product) {
  const title = localizeProductTitlePL(product.title || 'Produkt FAPO');
  const titleEn = product.title || title;
  const category = normalizeCategory(product.category);
  const categoryEn = normalizeCategoryEn(product.category);
  const fitment = fitmentLabel(product);
  const fitmentEn = fitmentLabelEn(product);
  const description = productDescription(product, title, category, fitment);
  const descriptionEn = productDescriptionEn(product, titleEn, categoryEn, fitmentEn);
  const richDescription = safeProductDescriptionHtml(product, description, 'pl');
  const richDescriptionEn = safeProductDescriptionHtml(product, descriptionEn, 'en');
  const price = formatPriceRange(product);
  const fallbackImage = '../assets/media/fapo-recommendations-poster.jpg';
  const images = productImages(product, fallbackImage);
  const image = productPageAssetUrl(images[0]);
  const jsonLdImages = images.map(siteAssetUrl);
  const imageMeta = jsonLdImages[0] || image;
  const makes = (product.vehicle?.makes || []).join(', ') || 'Dobór po kontakcie';
  const models = (product.vehicle?.models || []).join(', ') || 'Dobór po kontakcie';
  const productPageFileName = String(product.url || productFileName(product)).split('/').pop();

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <title>${escapeHtml(title)} | FAPO Polska</title>
  <link rel="canonical" href="${escapeHtml(product.canonicalUrl)}" />
  <meta property="og:type" content="product" />
  <meta property="og:locale" content="pl_PL" />
  <meta property="og:site_name" content="FAPO Polska" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(product.canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageMeta)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageMeta)}" />
  <script type="application/ld+json">
    ${productJsonLd(product, title, description, jsonLdImages)}
  </script>
  <link rel="stylesheet" href="../styles.css?v=${assetVersion}" />
</head>
<body>
  <div class="bg-grid"></div>
  <header class="site-header">
    <a class="brand" href="../index.html" aria-label="Przejdź do strony głównej">FAPO <span>POLSKA</span></a>
    <nav class="main-nav">
      <a href="../index.html#oferta">Oferta</a>
      <a href="../index.html#media">Media</a>
      <a href="../sklep.html">Sklep</a>
      <a href="../index.html#o-nas">O nas</a>
      <a href="../index.html#b2b">B2B</a>
      <a href="../polityki.html">Warunki</a>
      <a href="../index.html#kontakt">Kontakt</a>
    </nav>
    <div class="lang-switch product-lang-switch" aria-label="Wybór języka opisu produktu">
      <a href="${escapeHtml(productPageFileName)}" class="active" data-product-lang-link="pl" aria-current="page">PL</a>
      <a href="${escapeHtml(productPageFileName)}?lang=en" data-product-lang-link="en">EN</a>
    </div>
    <button class="cart-toggle" type="button" id="cart-toggle" aria-label="Otwórz koszyk">
      Koszyk <span id="cart-count">0</span>
    </button>
    <a class="cta-small" href="../index.html#kontakt">Zapytaj o produkt</a>
  </header>

  <main>
    <div class="product-return-bar" aria-label="Nawigacja produktu">
      <a class="product-return-link" href="../sklep.html">&larr; Wr&oacute;&cacute; do sklepu</a>
    </div>
    <section class="section reveal product-detail-page" id="product-detail" data-product-id="${escapeHtml(product.id)}" data-product-lang-root data-product-title-pl="${escapeHtml(`${title} | FAPO Polska`)}" data-product-title-en="${escapeHtml(`${titleEn} | FAPO Poland`)}" data-product-description-pl="${escapeHtml(description)}" data-product-description-en="${escapeHtml(descriptionEn)}">
      <nav class="breadcrumbs" aria-label="Ścieżka">
        <a href="../index.html">FAPO Polska</a>
        <span>/</span>
        <a href="../sklep.html">Sklep</a>
        <span>/</span>
        <span>${escapeHtml(product.sku || product.id)}</span>
      </nav>
      <div class="product-detail-layout">
        ${renderProductGallery(images, title)}
        <div class="product-detail-content">
          <div class="product-meta-line">
            <span class="tag">${escapeHtml(category)}</span>
            <span class="tag">${escapeHtml(product.sku || product.id)}</span>
            <span class="tag">${escapeHtml(fitment)}</span>
            <span class="tag">FAPO Polska</span>
          </div>
          <h1 data-lang-text data-lang-pl="${escapeHtml(title)}" data-lang-en="${escapeHtml(titleEn)}">${escapeHtml(title)}</h1>
          <p class="product-detail-lead" data-lang-panel="pl">${escapeHtml(description)}</p>
          <p class="product-detail-lead" data-lang-panel="en" hidden>${escapeHtml(descriptionEn)}</p>
          <p class="price">${escapeHtml(price)}</p>
          <div class="product-actions">
            <button class="btn btn-primary" type="button" data-add-id="${escapeHtml(product.id)}">Dodaj do koszyka</button>
            <a class="btn btn-ghost" href="../sklep.html">Wr&oacute;&cacute; do sklepu</a>
          </div>
        </div>
      </div>
      <div class="product-description">
        <h2 data-lang-text data-lang-pl="Opis produktu" data-lang-en="Product description">Opis produktu</h2>
        <div data-lang-panel="pl">${richDescription}</div>
        <div data-lang-panel="en" hidden>${richDescriptionEn}</div>
      </div>
      <div class="product-detail-specs">
        <article>
          <span>Kategoria</span>
          <strong>${escapeHtml(category)}</strong>
        </article>
        <article>
          <span>SKU</span>
          <strong>${escapeHtml(product.sku || product.id)}</strong>
        </article>
        <article>
          <span>Marka</span>
          <strong>${escapeHtml(makes)}</strong>
        </article>
        <article>
          <span>Model</span>
          <strong>${escapeHtml(models)}</strong>
        </article>
        <article>
          <span>Dopasowanie</span>
          <strong>${escapeHtml(fitment)}</strong>
        </article>
        <article>
          <span>Obsługa zamówienia</span>
          <strong>FAPO Polska</strong>
        </article>
      </div>
    </section>

    <section class="section reveal product-home-context" aria-labelledby="product-home-context-title">
      <div class="section-head">
        <p class="eyebrow">FAPO Polska</p>
        <h2 id="product-home-context-title">Ten produkt obsługujemy lokalnie</h2>
      </div>
      <div class="cards product-context-grid">
        <article class="card">
          <h3>Autoryzowana obsługa</h3>
          <p>FAPO Polska prowadzi katalog, kontakt i zamówienia bez odsyłania klienta do zewnętrznych sklepów.</p>
        </article>
        <article class="card">
          <h3>Dobór po aucie</h3>
          <p>Sprawdzamy dopasowanie produktu do pojazdu, rocznika i wersji przed finalizacją zamówienia.</p>
        </article>
        <article class="card">
          <h3>Wsparcie po zakupie</h3>
          <p>Masz kontakt w Polsce w sprawach zamówień, wysyłki, gwarancji i zwrotów.</p>
        </article>
      </div>
      <div class="product-context-actions">
        <a class="btn btn-primary" href="../index.html#kontakt">Zapytaj o dostępność</a>
        <a class="btn btn-ghost" href="../index.html#oferta">Poznaj FAPO Polska</a>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-brand">
      <p class="brand">FAPO <span>POLSKA</span></p>
    </div>
    <nav class="footer-links" aria-label="Linki w stopce">
      <a href="../index.html">Strona główna</a>
      <a href="../sklep.html">Sklep</a>
      <a href="../polityki.html">Warunki</a>
      <a href="../index.html#kontakt">Kontakt</a>
    </nav>
    <div class="footer-company">
      <p>FAPO Polska | NIP 9512184841 | REGON 141812444</p>
      <p><a href="mailto:info@fapomoto.pl">info@fapomoto.pl</a></p>
      <p>&copy; 2026 FAPO Polska.</p>
    </div>
  </footer>

${renderCartDrawer()}
  <script src="../app.js?v=${assetVersion}"></script>
</body>
</html>
`;
}

function renderSitemap(products) {
  const staticUrls = [
    {
      loc: `${siteUrl}/`,
      alternates: [
        { hreflang: 'pl', href: `${siteUrl}/` },
        { hreflang: 'en', href: `${siteUrl}/en` },
        { hreflang: 'x-default', href: `${siteUrl}/` },
      ],
    },
    {
      loc: `${siteUrl}/en`,
      alternates: [
        { hreflang: 'pl', href: `${siteUrl}/` },
        { hreflang: 'en', href: `${siteUrl}/en` },
        { hreflang: 'x-default', href: `${siteUrl}/` },
      ],
    },
    {
      loc: `${siteUrl}/sklep.html`,
      alternates: [
        { hreflang: 'pl', href: `${siteUrl}/sklep.html` },
        { hreflang: 'x-default', href: `${siteUrl}/sklep.html` },
      ],
    },
    {
      loc: `${siteUrl}/oferta.html`,
      alternates: [
        { hreflang: 'pl', href: `${siteUrl}/oferta.html` },
        { hreflang: 'x-default', href: `${siteUrl}/oferta.html` },
      ],
    },
    {
      loc: `${siteUrl}/polityki.html`,
      alternates: [
        { hreflang: 'pl', href: `${siteUrl}/polityki.html` },
        { hreflang: 'en', href: `${siteUrl}/policies.html` },
        { hreflang: 'x-default', href: `${siteUrl}/polityki.html` },
      ],
    },
    {
      loc: `${siteUrl}/policies.html`,
      alternates: [
        { hreflang: 'pl', href: `${siteUrl}/polityki.html` },
        { hreflang: 'en', href: `${siteUrl}/policies.html` },
        { hreflang: 'x-default', href: `${siteUrl}/polityki.html` },
      ],
    },
  ];

  const urlEntries = [
    ...staticUrls.map((entry) => `  <url>
    <loc>${entry.loc}</loc>
${entry.alternates.map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />`).join('\n')}
  </url>`),
    ...products.map((product) => `  <url>
    <loc>${product.canonicalUrl}</loc>
    <lastmod>2026-05-24</lastmod>
  </url>`),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries.join('\n')}
</urlset>
`;
}

function listProductPageFiles() {
  if (!fs.existsSync(productsDir)) return [];
  return fs.readdirSync(productsDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.join(productsDir, file));
}

function writeIfChanged(filePath, content, changed) {
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (previous === content) return;
  changed.push(path.relative(root, filePath));
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function main() {
  const rawProducts = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  const products = normalizeProducts(rawProducts);
  const changed = [];
  const expectedPages = new Set(products.map((product) => path.join(productsDir, productFileName(product))));

  writeIfChanged(productsPath, `${JSON.stringify(products, null, 2)}\n`, changed);
  writeIfChanged(sitemapPath, renderSitemap(products), changed);

  if (path.basename(productsDir) !== 'produkty' || path.dirname(productsDir) !== root) {
    throw new Error(`Refusing to manage unexpected product directory: ${productsDir}`);
  }
  if (!checkOnly) {
    fs.mkdirSync(productsDir, { recursive: true });
  }

  for (const existingFile of listProductPageFiles()) {
    if (!expectedPages.has(existingFile)) {
      changed.push(path.relative(root, existingFile));
      if (!checkOnly) {
        fs.rmSync(existingFile, { force: true });
      }
    }
  }

  for (const product of products) {
    const pagePath = path.join(productsDir, productFileName(product));
    writeIfChanged(pagePath, renderProductPage(product), changed);
  }

  if (checkOnly && changed.length) {
    console.error(`Product pages or URLs are stale:\n${changed.slice(0, 25).map((file) => `- ${file}`).join('\n')}${changed.length > 25 ? `\n...and ${changed.length - 25} more` : ''}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    products: products.length,
    product_pages: products.length,
    changed_files: changed.length,
    check_only: checkOnly,
  }, null, 2));
}

main();
