const reveals = document.querySelectorAll('.reveal');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('show');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

reveals.forEach((el) => observer.observe(el));

const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = contactForm.querySelector('button');
    const original = button.textContent;
    button.textContent = 'Wyslano';
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
      contactForm.reset();
    }, 1800);
  });
}

const state = {
  products: [],
  filtered: [],
  visibleCount: 12,
  cart: loadCart(),
  viewMode: loadViewMode(),
  tabCategory: loadTabCategory(),
};

const ui = {
  search: document.getElementById('shop-search'),
  category: document.getElementById('shop-category'),
  source: document.getElementById('shop-source'),
  sort: document.getElementById('shop-sort'),
  viewGridBtn: document.getElementById('view-grid'),
  viewListBtn: document.getElementById('view-list'),
  viewRowsBtn: document.getElementById('view-rows'),
  tabButtons: Array.from(document.querySelectorAll('[data-shop-tab]')),
  categoryTriggers: Array.from(document.querySelectorAll('[data-cat-tab]')),
  grid: document.getElementById('shop-grid'),
  results: document.getElementById('shop-results'),
  loadMore: document.getElementById('shop-load-more'),
  cartToggle: document.getElementById('cart-toggle'),
  cartCount: document.getElementById('cart-count'),
  cartDrawer: document.getElementById('cart-drawer'),
  cartClose: document.getElementById('cart-close'),
  cartBackdrop: document.getElementById('cart-backdrop'),
  cartItems: document.getElementById('cart-items'),
  cartTotal: document.getElementById('cart-total'),
  checkoutForm: document.getElementById('checkout-form'),
};

initShop().catch(() => {
  if (ui.results) {
    ui.results.textContent = 'Nie udalo sie zaladowac katalogu produktow.';
  }
});

async function initShop() {
  if (!ui.grid) return;

  const res = await fetch('assets/data/products.json');
  state.products = await res.json();

  const initialTab = readTabFromLocation();
  if (initialTab) {
    state.tabCategory = initialTab;
    saveTabCategory();
  }

  hydrateCategoryOptions();
  bindShopEvents();
  syncTabButtons();

  applyFilters();
  renderCart();
}

function bindShopEvents() {
  [ui.search, ui.category, ui.source, ui.sort].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => {
      state.visibleCount = 12;
      applyFilters();
    });
    el.addEventListener('change', () => {
      state.visibleCount = 12;
      applyFilters();
    });
  });

  if (ui.loadMore) {
    ui.loadMore.addEventListener('click', () => {
      state.visibleCount += 12;
      renderGrid();
    });
  }

  if (ui.viewGridBtn) {
    ui.viewGridBtn.addEventListener('click', () => {
      setViewMode('grid');
    });
  }
  if (ui.viewListBtn) {
    ui.viewListBtn.addEventListener('click', () => {
      setViewMode('list');
    });
  }
  if (ui.viewRowsBtn) {
    ui.viewRowsBtn.addEventListener('click', () => {
      setViewMode('rows');
    });
  }

  ui.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activateTab(button.dataset.shopTab || 'all');
    });
  });

  ui.categoryTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      onCategoryTrigger(trigger);
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onCategoryTrigger(trigger);
      }
    });
  });

  if (ui.grid) {
    ui.grid.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-add-id]');
      if (addBtn) {
        addToCart(addBtn.dataset.addId);
      }
    });
  }

  if (ui.cartToggle) ui.cartToggle.addEventListener('click', openCart);
  if (ui.cartClose) ui.cartClose.addEventListener('click', closeCart);
  if (ui.cartBackdrop) ui.cartBackdrop.addEventListener('click', closeCart);

  if (ui.cartItems) {
    ui.cartItems.addEventListener('click', (event) => {
      const plus = event.target.closest('[data-qty-plus]');
      const minus = event.target.closest('[data-qty-minus]');
      const remove = event.target.closest('[data-remove-id]');
      if (plus) changeQty(plus.dataset.qtyPlus, 1);
      if (minus) changeQty(minus.dataset.qtyMinus, -1);
      if (remove) removeFromCart(remove.dataset.removeId);
    });
  }

  if (ui.checkoutForm) {
    ui.checkoutForm.addEventListener('submit', onCheckoutSubmit);
  }
}

function hydrateCategoryOptions() {
  if (!ui.category) return;
  const categories = Array.from(new Set(state.products.map((p) => p.category))).sort();
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = localizeCategoryPL(category);
    ui.category.appendChild(option);
  });
}

function applyFilters() {
  const q = (ui.search?.value || '').trim().toLowerCase();
  const cat = ui.category?.value || 'all';
  const source = ui.source?.value || 'all';
  const sort = ui.sort?.value || 'relevance';
  const tab = state.tabCategory || 'all';

  let list = state.products.filter((product) => {
    const inQuery = !q
      || product.title.toLowerCase().includes(q)
      || (product.sku || '').toLowerCase().includes(q)
      || product.category.toLowerCase().includes(q);

    const inCategory = cat === 'all' || product.category === cat;
    const inSource = source === 'all' || product.source === source;
    const inTab = matchesTabCategory(product, tab);

    return inQuery && inCategory && inSource && inTab;
  });

  if (sort === 'priceAsc') list.sort((a, b) => a.priceFrom - b.priceFrom);
  if (sort === 'priceDesc') list.sort((a, b) => b.priceFrom - a.priceFrom);
  if (sort === 'nameAsc') list.sort((a, b) => a.title.localeCompare(b.title));

  state.filtered = list;
  renderGrid();
}

function activateTab(tab) {
  const nextTab = normalizeTab(tab);
  if (state.tabCategory === nextTab) return;
  state.tabCategory = nextTab;
  state.visibleCount = 12;
  saveTabCategory();
  syncTabButtons();
  applyFilters();
}

function onCategoryTrigger(trigger) {
  const tab = trigger.dataset.catTab || 'all';
  activateTab(tab);
  const shopSection = document.getElementById('sklep');
  if (shopSection) {
    shopSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function syncTabButtons() {
  const activeTab = normalizeTab(state.tabCategory);
  ui.tabButtons.forEach((button) => {
    const isActive = (button.dataset.shopTab || 'all') === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function matchesTabCategory(product, tab) {
  if (tab === 'all') return true;

  const title = String(product.title || '').toLowerCase();
  const category = String(product.category || '').toLowerCase();

  if (tab === 'coilover') {
    return category === 'coilovers' || title.includes('coilover') || title.includes('gwint');
  }
  if (tab === 'offroad') {
    return category === 'off-road' || title.includes('off-road') || title.includes('offroad') || title.includes('lift');
  }
  if (tab === 'arm') {
    return category === 'chassis' || title.includes('arm') || title.includes('wahacz') || title.includes('track bar') || title.includes('sway bar');
  }
  if (tab === 'shock') {
    return title.includes('shock') || title.includes('amortyzator');
  }
  return true;
}

function readTabFromLocation() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('tab');
    if (fromQuery) return normalizeTab(fromQuery);
  } catch {}
  return normalizeTab(state.tabCategory);
}

function normalizeTab(tab) {
  const allowed = new Set(['all', 'coilover', 'offroad', 'arm', 'shock']);
  const value = String(tab || 'all').toLowerCase().trim();
  return allowed.has(value) ? value : 'all';
}

function renderGrid() {
  if (!ui.grid) return;

  const showAllRows = state.viewMode === 'rows';
  const visible = showAllRows
    ? state.filtered
    : state.filtered.slice(0, state.visibleCount);
  ui.grid.innerHTML = visible.map(renderProductCard).join('');
  applyViewMode();

  if (ui.results) {
    ui.results.textContent = `Wyniki: ${state.filtered.length} produktow. Widoczne: ${visible.length}.`;
  }

  if (ui.loadMore) {
    const hasMore = !showAllRows && state.filtered.length > visible.length;
    ui.loadMore.hidden = !hasMore;
  }
}

function setViewMode(mode) {
  state.viewMode = ['grid', 'list', 'rows'].includes(mode) ? mode : 'grid';
  saveViewMode();
  applyViewMode();
}

function applyViewMode() {
  if (!ui.grid) return;
  const isList = state.viewMode === 'list';
  const isRows = state.viewMode === 'rows';
  ui.grid.classList.toggle('list-view', isList);
  ui.grid.classList.toggle('rows-view', isRows);
  if (ui.viewGridBtn) {
    const active = !isList && !isRows;
    ui.viewGridBtn.classList.toggle('is-active', active);
    ui.viewGridBtn.setAttribute('aria-pressed', String(active));
  }
  if (ui.viewListBtn) {
    ui.viewListBtn.classList.toggle('is-active', isList);
    ui.viewListBtn.setAttribute('aria-pressed', String(isList));
  }
  if (ui.viewRowsBtn) {
    ui.viewRowsBtn.classList.toggle('is-active', isRows);
    ui.viewRowsBtn.setAttribute('aria-pressed', String(isRows));
  }
}

function renderProductCard(product) {
  const image = escapeHtml(product.image || '');
  const localizedTitle = localizeProductTitlePL(product.title || 'Brak nazwy');
  const title = escapeHtml(localizedTitle);
  const sku = escapeHtml(product.sku || 'BRAK SKU');
  const category = escapeHtml(localizeCategoryPL(product.category || 'Performance'));
  const source = product.source === 'fapomoto' ? 'FAPOMOTO' : 'ALIBABA';
  const price = formatPriceRange(product.priceFrom, product.priceTo);
  const productUrl = escapeHtml(product.url || '#');

  return `
    <article class="product-card">
      <img class="product-media" loading="lazy" src="${image}" alt="${title}" />
      <div class="product-body">
        <h3 class="product-title">
          <a href="${productUrl}" target="_blank" rel="noopener noreferrer">${title}</a>
        </h3>
        <div class="product-meta-line">
          <span class="tag">${category}</span>
          <span class="tag">${sku}</span>
          <span class="tag">${source}</span>
        </div>
        <p class="price">${price}</p>
        <div class="product-actions">
          <button class="btn btn-primary" type="button" data-add-id="${product.id}">Dodaj do koszyka</button>
          <a class="btn btn-ghost" href="${productUrl}" target="_blank" rel="noopener noreferrer">Szczegoly</a>
        </div>
      </div>
    </article>
  `;
}

function localizeCategoryPL(category) {
  const map = {
    Coilovers: 'Zawieszenie gwintowane',
    'Off-Road': 'Off-road',
    Exhaust: 'Układ wydechowy',
    Turbo: 'Układ turbo',
    Chassis: 'Podwozie',
    Performance: 'Performance',
  };
  return map[category] || category;
}

function localizeProductTitlePL(title) {
  if (!title) return '';
  let t = String(title);

  const rules = [
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
    [/Downpipe/gi, 'downpipe'],
    [/Turbo manifold/gi, 'kolektor turbo'],
    [/Turbo charger|Turbocharger|Turbo/gi, 'turbosprężarka'],
    [/Intercooler/gi, 'intercooler'],
    [/Charge pipe/gi, 'rura dolotowa'],
    [/Muffler delete pipe kit/gi, 'zestaw rury zastępującej tłumik'],
    [/For /gi, 'Do '],
    [/Compatible with/gi, 'Kompatybilne z'],
  ];

  for (const [pattern, replacement] of rules) {
    t = t.replace(pattern, replacement);
  }

  return capitalizeFirstLetter(t);
}

function capitalizeFirstLetter(text) {
  if (!text) return text;
  return text.replace(/^(\s*)([a-ząćęłńóśźż])/i, (m, lead, ch) => `${lead}${ch.toUpperCase()}`);
}

function addToCart(productId) {
  if (!state.cart[productId]) state.cart[productId] = 0;
  state.cart[productId] += 1;
  saveCart();
  renderCart();
  openCart();
}

function changeQty(productId, delta) {
  if (!state.cart[productId]) return;
  state.cart[productId] += delta;
  if (state.cart[productId] <= 0) delete state.cart[productId];
  saveCart();
  renderCart();
}

function removeFromCart(productId) {
  delete state.cart[productId];
  saveCart();
  renderCart();
}

function renderCart() {
  if (!ui.cartItems) return;

  const entries = Object.entries(state.cart);
  if (!entries.length) {
    ui.cartItems.innerHTML = '<p>Koszyk jest pusty.</p>';
  } else {
    ui.cartItems.innerHTML = entries.map(([id, qty]) => {
      const product = state.products.find((p) => p.id === id);
      if (!product) return '';
      const title = escapeHtml(localizeProductTitlePL(product.title));
      const unit = product.priceFrom;
      const lineTotal = unit * qty;
      return `
        <article class="cart-item">
          <h4>${title}</h4>
          <p>${formatMoney(unit)} / szt.</p>
          <div class="qty-row">
            <button type="button" data-qty-minus="${id}">-</button>
            <span>${qty}</span>
            <button type="button" data-qty-plus="${id}">+</button>
            <strong>${formatMoney(lineTotal)}</strong>
            <button type="button" data-remove-id="${id}">Usun</button>
          </div>
        </article>
      `;
    }).join('');
  }

  const total = entries.reduce((sum, [id, qty]) => {
    const product = state.products.find((p) => p.id === id);
    return sum + ((product?.priceFrom || 0) * qty);
  }, 0);

  if (ui.cartTotal) ui.cartTotal.textContent = formatMoney(total);
  if (ui.cartCount) ui.cartCount.textContent = String(entries.reduce((n, [, qty]) => n + qty, 0));
}

function openCart() {
  if (!ui.cartDrawer || !ui.cartBackdrop) return;
  ui.cartDrawer.classList.add('open');
  ui.cartDrawer.setAttribute('aria-hidden', 'false');
  ui.cartBackdrop.hidden = false;
}

function closeCart() {
  if (!ui.cartDrawer || !ui.cartBackdrop) return;
  ui.cartDrawer.classList.remove('open');
  ui.cartDrawer.setAttribute('aria-hidden', 'true');
  ui.cartBackdrop.hidden = true;
}

function onCheckoutSubmit(event) {
  event.preventDefault();
  const entries = Object.entries(state.cart);
  if (!entries.length) {
    alert('Dodaj produkty do koszyka przed zlozeniem zamowienia.');
    return;
  }

  const formData = new FormData(ui.checkoutForm);
  const customerName = formData.get('customerName') || '';
  const customerEmail = formData.get('customerEmail') || '';
  const customerPhone = formData.get('customerPhone') || '';
  const customerAddress = formData.get('customerAddress') || '';
  const customerNote = formData.get('customerNote') || '';

  const lines = entries.map(([id, qty], idx) => {
    const product = state.products.find((p) => p.id === id);
    const title = localizeProductTitlePL(product?.title || id);
    const price = product?.priceFrom || 0;
    return `${idx + 1}. ${title} | ilosc: ${qty} | cena od: ${price} PLN`;
  });

  const total = entries.reduce((sum, [id, qty]) => {
    const product = state.products.find((p) => p.id === id);
    return sum + ((product?.priceFrom || 0) * qty);
  }, 0);

  const message = [
    'Nowe zamowienie ze sklepu FAPO Polska',
    '',
    `Klient: ${customerName}`,
    `Email: ${customerEmail}`,
    `Telefon: ${customerPhone}`,
    `Adres: ${customerAddress}`,
    `Uwagi: ${customerNote}`,
    '',
    'Pozycje:',
    ...lines,
    '',
    `Wartosc orientacyjna: ${total} PLN`,
  ].join('\n');

  const mailto = `mailto:sales@fapomoto.com?subject=${encodeURIComponent('Zamowienie - sklep FAPO Polska')}&body=${encodeURIComponent(message)}`;
  window.location.href = mailto;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(message).catch(() => {});
  }

  alert('Wiadomosc zamowienia zostala przygotowana. Sprawdz otwarty klient poczty.');
  ui.checkoutForm.reset();
}

function loadCart() {
  try {
    const raw = localStorage.getItem('fapo_cart_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem('fapo_cart_v1', JSON.stringify(state.cart));
}

function loadViewMode() {
  try {
    const mode = localStorage.getItem('fapo_shop_view_mode');
    return ['grid', 'list', 'rows'].includes(mode) ? mode : 'grid';
  } catch {
    return 'grid';
  }
}

function saveViewMode() {
  localStorage.setItem('fapo_shop_view_mode', state.viewMode);
}

function loadTabCategory() {
  try {
    return normalizeTab(localStorage.getItem('fapo_shop_tab_category'));
  } catch {
    return 'all';
  }
}

function saveTabCategory() {
  localStorage.setItem('fapo_shop_tab_category', normalizeTab(state.tabCategory));
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} PLN`;
}

function formatPriceRange(min, max) {
  const a = formatMoney(min);
  const b = formatMoney(max);
  return min === max ? a : `${a} - ${b}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
