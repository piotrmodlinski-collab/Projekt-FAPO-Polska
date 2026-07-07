const reveals = document.querySelectorAll('.reveal');

const revealItems = Array.from(reveals);
const revealImmediately = (element) => {
  if (element.id === 'product-detail' || element.classList.contains('product-detail-page')) {
    return true;
  }
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.95 && rect.bottom > 0;
};
const pendingReveals = [];

revealItems.forEach((element) => {
  if (revealImmediately(element)) {
    element.classList.add('show');
  } else {
    pendingReveals.push(element);
  }
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('show');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  pendingReveals.forEach((el) => observer.observe(el));
} else {
  pendingReveals.forEach((el) => el.classList.add('show'));
}

initHeroStats();

function initHeroStats() {
  const statsWrap = document.querySelector('.automotive-stats');
  if (!statsWrap) return;

  const cards = Array.from(statsWrap.querySelectorAll('.stat-card'));
  const counters = Array.from(statsWrap.querySelectorAll('[data-count-to]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const startStats = () => {
    cards.forEach((card, index) => {
      const delay = reduceMotion ? 0 : index * 120;
      setTimeout(() => {
        card.classList.add('is-live');
      }, delay);
    });

    counters.forEach((counter, index) => {
      const delay = reduceMotion ? 0 : index * 120;
      setTimeout(() => {
        animateStatCounter(counter, reduceMotion);
      }, delay);
    });
  };

  if (reduceMotion) {
    startStats();
    return;
  }

  let started = false;
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!started && entry.isIntersecting) {
        started = true;
        startStats();
        statsObserver.disconnect();
      }
    });
  }, { threshold: 0.35 });

  statsObserver.observe(statsWrap);
}

function animateStatCounter(element, instant = false) {
  const target = Number(element.dataset.countTo || 0);
  const suffix = element.dataset.suffix || '';
  const prefix = element.dataset.prefix || '';
  const decimals = Number(element.dataset.decimals || 0);
  const duration = Number(element.dataset.duration || 1400);

  const formatValue = (value) => Number(value).toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (instant) {
    element.textContent = `${prefix}${formatValue(target)}${suffix}`;
    return;
  }

  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const nextValue = target * eased;
    const rounded = decimals > 0
      ? Number(nextValue.toFixed(decimals))
      : Math.round(nextValue);

    element.textContent = `${prefix}${formatValue(rounded)}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.textContent = `${prefix}${formatValue(target)}${suffix}`;
    }
  };

  requestAnimationFrame(tick);
}

const contactForm = document.querySelector('.contact-form');
const contactEndpoint = '/api/contact';
const fallbackRecipients = ['office@fapomoto.pl'];
const currentScriptSrc = document.currentScript?.getAttribute('src') || '';
const assetBase = window.FAPO_ASSET_BASE || (currentScriptSrc.startsWith('../') ? '../' : '');

initProductLanguage();
initProductGallery();

if (contactForm) {
  contactForm.addEventListener('submit', handleContactSubmit);
}

function initProductLanguage() {
  const root = document.querySelector('[data-product-lang-root]');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const language = params.get('lang') === 'en' ? 'en' : 'pl';
  document.documentElement.lang = language;

  const title = root.getAttribute(`data-product-title-${language}`);
  if (title) document.title = title;

  const description = root.getAttribute(`data-product-description-${language}`);
  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (description && descriptionMeta) {
    descriptionMeta.setAttribute('content', description);
  }

  document.querySelectorAll('[data-lang-panel]').forEach((element) => {
    element.hidden = element.dataset.langPanel !== language;
  });

  document.querySelectorAll('[data-lang-text]').forEach((element) => {
    const value = element.getAttribute(`data-lang-${language}`);
    if (value) element.textContent = value;
  });

  document.querySelectorAll('[data-product-lang-link]').forEach((link) => {
    const active = link.dataset.productLangLink === language;
    link.classList.toggle('active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function initProductGallery() {
  const media = document.querySelector('[data-product-gallery]');
  if (!media) return;

  const mainImage = media.querySelector('.product-main-image');
  const thumbs = Array.from(media.querySelectorAll('[data-gallery-src]'));
  if (!mainImage || !thumbs.length) return;

  const counter = media.querySelector('[data-gallery-counter]');
  const prevButton = media.querySelector('[data-gallery-prev]');
  const nextButton = media.querySelector('[data-gallery-next]');
  let activeIndex = Math.max(0, thumbs.findIndex((thumb) => thumb.classList.contains('active')));

  const setActiveImage = (index, shouldScroll = true) => {
    const nextIndex = (index + thumbs.length) % thumbs.length;
    const button = thumbs[nextIndex];
    const nextSrc = button.dataset.gallerySrc;
    if (!nextSrc) return;

    mainImage.src = nextSrc;
    const thumbImage = button.querySelector('img');
    if (thumbImage?.alt) mainImage.alt = thumbImage.alt;

    thumbs.forEach((thumb, thumbIndex) => {
      const isActive = thumbIndex === nextIndex;
      thumb.classList.toggle('active', isActive);
      thumb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (counter) {
      counter.textContent = `${nextIndex + 1} / ${thumbs.length}`;
    }

    if (shouldScroll) {
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    activeIndex = nextIndex;
  };

  thumbs.forEach((button) => {
    button.addEventListener('click', () => {
      const nextIndex = Number(button.dataset.galleryIndex || thumbs.indexOf(button));
      setActiveImage(Number.isFinite(nextIndex) ? nextIndex : thumbs.indexOf(button));
    });
  });

  prevButton?.addEventListener('click', () => setActiveImage(activeIndex - 1));
  nextButton?.addEventListener('click', () => setActiveImage(activeIndex + 1));

  media.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActiveImage(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });

  setActiveImage(activeIndex, false);
}

async function handleContactSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton?.textContent || '';
  const language = document.documentElement.lang === 'en' ? 'en' : 'pl';
  const labels = getContactLabels(language);

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = buildContactPayload(form, language);
  if (!payload.message) {
    setFormStatus(form, labels.missingMessage, 'error');
    return;
  }

  setSubmitState(submitButton, true, labels.sending);
  setFormStatus(form, labels.sendingLong, 'info');

  try {
    await sendContactPayload(payload);
    form.reset();
    setFormStatus(form, labels.success, 'success');
  } catch (error) {
    console.error('Contact form send failed', error);
    openContactMailFallback(payload, language);
    setFormStatus(form, labels.fallback, 'warning');
  } finally {
    setSubmitState(submitButton, false, originalLabel);
  }
}

function buildContactPayload(form, language) {
  const data = new FormData(form);
  return {
    kind: 'contact',
    language,
    page: window.location.href,
    name: String(data.get('name') || '').trim(),
    email: String(data.get('email') || '').trim(),
    type: String(data.get('type') || '').trim(),
    message: String(data.get('message') || '').trim(),
  };
}

async function sendContactPayload(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(contactEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Contact endpoint returned ${response.status}`);
    }

    const result = await response.json().catch(() => ({}));
    if (result.ok === false) {
      throw new Error(result.message || 'Contact endpoint rejected the message');
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function openContactMailFallback(payload, language) {
  const subject = language === 'en'
    ? `FAPO Poland inquiry - ${payload.name || payload.email}`
    : `Zapytanie FAPO Polska - ${payload.name || payload.email}`;
  const body = [
    language === 'en' ? 'New FAPO Poland inquiry' : 'Nowe zapytanie FAPO Polska',
    '',
    `${language === 'en' ? 'Company / name' : 'Firma / imię'}: ${payload.name}`,
    `E-mail: ${payload.email}`,
    `${language === 'en' ? 'Partnership profile' : 'Profil współpracy'}: ${payload.type}`,
    `${language === 'en' ? 'Page' : 'Strona'}: ${payload.page}`,
    '',
    language === 'en' ? 'Message:' : 'Wiadomość:',
    payload.message,
  ].join('\n');

  window.location.href = `mailto:${fallbackRecipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function setSubmitState(button, disabled, label) {
  if (!button) return;
  button.disabled = disabled;
  if (label) button.textContent = label;
}

function setFormStatus(form, message, type) {
  const status = getFormStatusElement(form);
  status.textContent = message;
  status.dataset.status = type;
}

function getFormStatusElement(form) {
  let status = form.querySelector('[data-form-status]');
  if (status) return status;

  status = document.createElement('p');
  status.className = 'form-status';
  status.dataset.formStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.append(status);
  return status;
}

function getContactLabels(language) {
  if (language === 'en') {
    return {
      sending: 'Sending...',
      sendingLong: 'Sending your inquiry...',
      success: 'Message sent. Thank you for your inquiry.',
      missingMessage: 'Add a message before sending.',
      fallback: 'Automatic sending is unavailable. Your e-mail client has been opened with a prepared message.',
    };
  }

  return {
    sending: 'Wysyłanie...',
    sendingLong: 'Wysyłamy Twoje zapytanie...',
    success: 'Wiadomość wysłana. Dziękujemy za kontakt.',
    missingMessage: 'Dodaj treść wiadomości przed wysłaniem.',
    fallback: 'Automatyczna wysyłka jest niedostępna. Otworzyliśmy program pocztowy z przygotowaną wiadomością.',
  };
}

function assetPath(path) {
  return `${assetBase}${path}`;
}

const state = {
  products: [],
  filtered: [],
  visibleCount: 12,
  cart: loadCart(),
  viewMode: loadViewMode(),
  tabCategory: loadTabCategory(),
  vehicleFilters: {
    year: 'all',
    make: 'all',
    model: 'all',
  },
  productVideos: { products: {} },
  shorts: [],
};

const ui = {
  search: document.getElementById('shop-search'),
  category: document.getElementById('shop-category'),
  source: document.getElementById('shop-source'),
  vehicleYear: document.getElementById('vehicle-year'),
  vehicleMake: document.getElementById('vehicle-make'),
  vehicleModel: document.getElementById('vehicle-model'),
  vehicleSearch: document.getElementById('vehicle-search'),
  vehicleReset: document.getElementById('vehicle-reset'),
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
  productDetail: document.getElementById('product-detail'),
  shortsGrid: document.getElementById('shorts-grid'),
  shortsCount: document.getElementById('shorts-count'),
  shortsPrev: document.getElementById('shorts-prev'),
  shortsNext: document.getElementById('shorts-next'),
  shortsModal: document.getElementById('shorts-modal'),
  shortsModalBackdrop: document.getElementById('shorts-modal-backdrop'),
  shortsModalClose: document.getElementById('shorts-modal-close'),
  shortsModalVideo: document.getElementById('shorts-modal-video'),
  shortsModalSource: document.getElementById('shorts-modal-source'),
  shortsModalTitle: document.getElementById('shorts-modal-title'),
};

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
const vehicleAliasList = [];
VEHICLE_MAKE_ALIASES.forEach((entry) => {
  entry.aliases.forEach((alias) => {
    VEHICLE_ALIAS_TO_MAKE.set(alias.toLowerCase(), entry.canonical);
    vehicleAliasList.push(alias);
  });
});

const VEHICLE_MAKE_PATTERN = new RegExp(
  `\\b(${vehicleAliasList
    .sort((a, b) => b.length - a.length)
    .map((alias) => escapeRegExp(alias))
    .join('|')})\\b`,
  'gi',
);

const MODEL_SKIP_TOKENS = new Set([
  'for', 'and', 'or', 'with', 'without', 'fit', 'fits', 'compatible', 'suitable',
  'the', 'new', 'old', 'road', 'off', 'off-road', 'front', 'rear', 'left', 'right',
  'upper', 'lower', 'fronts', 'rears', 'series', 'gen', 'generation', 'stage',
  'level', 'levels', 'damping', 'adj', 'adjustable', 'height', 'in', 'inch', 'inches',
  'lift', 'lifts', 'set', 'full', 'shock', 'shocks', 'strut', 'struts', 'coilover',
  'coilovers', 'suspension', 'arm', 'arms', 'control', 'link', 'links', 'bar',
  'stabilizer', 'fapo', 'p1', 'p3', 'p5', 'p7', '2wd', '4wd', 'awd', 'fwd', 'rwd',
  'sedan', 'coupe', 'hatchback', 'hatch', 'wagon', 'convertible', 'pickup', 'truck',
  '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th',
  '12th', '13th', '14th', '15th',
]);

const MODEL_BREAK_TOKENS = new Set([
  'for', 'and', 'or', 'with', 'without', 'compatible', 'fit', 'fits',
]);

const MODEL_TRIM_TOKENS = new Set([
  'si', 'ex', 'lx', 'dx', 'se', 'le', 'xle', 'xse', 'gt', 'gti', 'type-r', 'type',
  'sport', 'touring', 'limited', 'premium', 'srt', 'srt-8', 'st', 'rs',
]);

initShop().catch(() => {
  if (ui.results) {
    ui.results.textContent = 'Nie udalo sie zaladowac katalogu produktow.';
  }
});

async function initShop() {
  if (!ui.grid && !ui.productDetail && !ui.cartDrawer) return;

  const [products, productVideosData, shortsData] = await Promise.all([
    fetchJsonSafe(assetPath('assets/data/products.json'), []),
    fetchJsonSafe(assetPath('assets/data/product-videos.json'), { products: {} }),
    fetchJsonSafe(assetPath('assets/data/youtube-shorts.json'), { videos: [] }),
  ]);

  state.products = normalizeProducts(Array.isArray(products) ? products : []);
  state.productVideos = productVideosData && typeof productVideosData === 'object'
    ? productVideosData
    : { products: {} };
  state.shorts = Array.isArray(shortsData?.videos) ? shortsData.videos : [];

  if (ui.grid) {
    const initialTab = readTabFromLocation();
    if (initialTab) {
      state.tabCategory = initialTab;
      saveTabCategory();
    }

    hydrateCategoryOptions();
    hydrateVehicleYearOptions();
    hydrateVehicleMakeOptions();
    hydrateVehicleModelOptions();
    syncTabButtons();

    applyFilters();
  }

  bindShopEvents();

  if (ui.productDetail) {
    hydrateProductDetail();
  }

  renderCart();
  renderShortsZone();
}

async function fetchJsonSafe(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
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

  if (ui.vehicleYear) {
    const onYearChange = () => {
      hydrateVehicleMakeOptions();
      hydrateVehicleModelOptions();
    };
    ui.vehicleYear.addEventListener('input', onYearChange);
    ui.vehicleYear.addEventListener('change', onYearChange);
  }

  if (ui.vehicleMake) {
    const onMakeChange = () => {
      hydrateVehicleModelOptions();
    };
    ui.vehicleMake.addEventListener('input', onMakeChange);
    ui.vehicleMake.addEventListener('change', onMakeChange);
  }

  if (ui.vehicleSearch) {
    ui.vehicleSearch.addEventListener('click', () => {
      state.vehicleFilters.year = ui.vehicleYear?.value || 'all';
      state.vehicleFilters.make = ui.vehicleMake?.value || 'all';
      state.vehicleFilters.model = ui.vehicleModel?.value || 'all';
      state.visibleCount = 12;
      applyFilters();
    });
  }

  if (ui.vehicleReset) {
    ui.vehicleReset.addEventListener('click', () => {
      if (ui.vehicleYear) ui.vehicleYear.value = 'all';
      hydrateVehicleMakeOptions();
      if (ui.vehicleMake) ui.vehicleMake.value = 'all';
      hydrateVehicleModelOptions();
      if (ui.vehicleModel) ui.vehicleModel.value = 'all';
      state.vehicleFilters = { year: 'all', make: 'all', model: 'all' };
      state.visibleCount = 12;
      applyFilters();
    });
  }

  if (ui.loadMore) {
    ui.loadMore.addEventListener('click', () => {
      if (!isStandaloneShopPage()) {
        goToShopPage();
        return;
      }
      state.visibleCount += 12;
      renderGrid();
    });
  }

  if (ui.shortsPrev) {
    ui.shortsPrev.addEventListener('click', () => {
      scrollShortsBy(-1);
    });
  }

  if (ui.shortsNext) {
    ui.shortsNext.addEventListener('click', () => {
      scrollShortsBy(1);
    });
  }

  if (ui.shortsGrid) {
    ui.shortsGrid.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-open-short]');
      if (!trigger) return;
      openShortModalById(trigger.dataset.openShort || '');
    });

    ui.shortsGrid.addEventListener('scroll', () => {
      updateShortsNavState();
    }, { passive: true });
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

  if (ui.productDetail) {
    ui.productDetail.addEventListener('click', (event) => {
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

  if (ui.shortsModalClose) ui.shortsModalClose.addEventListener('click', closeShortModal);
  if (ui.shortsModalBackdrop) ui.shortsModalBackdrop.addEventListener('click', closeShortModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeShortModal();
    }
  });

  window.addEventListener('resize', () => {
    updateShortsNavState();
  });
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

function hydrateVehicleYearOptions() {
  if (!ui.vehicleYear) return;

  const selected = ui.vehicleYear.value || 'all';
  const years = new Set();
  state.products.forEach((product) => {
    const vehicle = getVehicleMeta(product);
    vehicle.years.forEach((year) => years.add(year));
  });

  const sorted = Array.from(years)
    .sort((a, b) => b - a);

  ui.vehicleYear.innerHTML = '<option value="all">Select Year</option>';
  sorted.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    ui.vehicleYear.appendChild(option);
  });

  ui.vehicleYear.value = sorted.includes(Number(selected)) ? String(selected) : 'all';
}

function hydrateVehicleMakeOptions() {
  if (!ui.vehicleMake) return;

  const selected = ui.vehicleMake.value || 'all';
  const selectedYear = ui.vehicleYear?.value || 'all';
  const yearsFilter = selectedYear === 'all' ? null : Number(selectedYear);
  const makes = new Set();

  state.products.forEach((product) => {
    const vehicle = getVehicleMeta(product);
    if (yearsFilter !== null && !vehicle.years.includes(yearsFilter)) return;
    vehicle.makes.forEach((make) => makes.add(make));
  });

  const sorted = Array.from(makes).sort((a, b) => a.localeCompare(b, 'pl', {
    sensitivity: 'base',
    numeric: true,
  }));

  ui.vehicleMake.innerHTML = '<option value="all">Select Make</option>';
  sorted.forEach((make) => {
    const option = document.createElement('option');
    option.value = make;
    option.textContent = make;
    ui.vehicleMake.appendChild(option);
  });

  ui.vehicleMake.value = sorted.includes(selected) ? selected : 'all';
}

function hydrateVehicleModelOptions() {
  if (!ui.vehicleModel) return;

  const selected = ui.vehicleModel.value || 'all';
  const selectedYear = ui.vehicleYear?.value || 'all';
  const selectedMake = ui.vehicleMake?.value || 'all';
  const yearsFilter = selectedYear === 'all' ? null : Number(selectedYear);
  const models = new Set();

  state.products.forEach((product) => {
    const vehicle = getVehicleMeta(product);
    if (yearsFilter !== null && !vehicle.years.includes(yearsFilter)) return;
    if (selectedMake !== 'all' && !vehicle.makes.includes(selectedMake)) return;
    vehicle.models.forEach((model) => {
      if (model) models.add(model);
    });
  });

  const sorted = Array.from(models).sort((a, b) => a.localeCompare(b, 'pl', {
    sensitivity: 'base',
    numeric: true,
  }));

  ui.vehicleModel.innerHTML = '<option value="all">Select Model</option>';
  sorted.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    ui.vehicleModel.appendChild(option);
  });

  ui.vehicleModel.value = sorted.includes(selected) ? selected : 'all';
}

function applyFilters() {
  const q = (ui.search?.value || '').trim().toLowerCase();
  const cat = ui.category?.value || 'all';
  const source = ui.source?.value || 'all';
  const year = state.vehicleFilters.year || 'all';
  const make = state.vehicleFilters.make || 'all';
  const model = state.vehicleFilters.model || 'all';
  const sort = ui.sort?.value || 'relevance';
  const tab = state.tabCategory || 'all';

  let list = state.products.filter((product) => {
    const vehicle = getVehicleMeta(product);
    const inQuery = !q
      || product.title.toLowerCase().includes(q)
      || (product.sku || '').toLowerCase().includes(q)
      || product.category.toLowerCase().includes(q)
      || vehicle.makes.some((item) => item.toLowerCase().includes(q))
      || vehicle.models.some((item) => item.toLowerCase().includes(q));

    const inCategory = cat === 'all' || product.category === cat;
    const inSource = source === 'all' || product.source === source;
    const inYear = year === 'all' || vehicle.years.includes(Number(year));
    const inMake = make === 'all' || vehicle.makes.includes(make);
    const inModel = model === 'all' || vehicle.models.includes(model);
    const inTab = matchesTabCategory(product, tab);

    return inQuery && inCategory && inSource && inYear && inMake && inModel && inTab;
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

function isStandaloneShopPage() {
  const path = String(window.location.pathname || '').toLowerCase();
  return path.endsWith('/sklep.html') || path.endsWith('sklep.html');
}

function goToShopPage() {
  const targetUrl = new URL('sklep.html', window.location.href);
  const activeTab = normalizeTab(state.tabCategory);
  if (activeTab !== 'all') {
    targetUrl.searchParams.set('tab', activeTab);
  }
  window.location.href = targetUrl.toString();
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
  if (tab === 'exhaust') {
    return category === 'exhaust' || title.includes('exhaust') || title.includes('wydech') || title.includes('header') || title.includes('manifold') || title.includes('downpipe') || title.includes('muffler');
  }
  if (tab === 'turbo') {
    return category === 'turbo' || title.includes('turbo') || title.includes('intercooler') || title.includes('charge pipe') || title.includes('bov') || title.includes('blow off');
  }
  if (tab === 'performance') {
    return category === 'performance' || title.includes('spring') || title.includes('sprężyn') || title.includes('open box') || title.includes('replacement');
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
  const allowed = new Set(['all', 'coilover', 'offroad', 'arm', 'shock', 'exhaust', 'turbo', 'performance']);
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

function renderShortsZone() {
  if (!ui.shortsGrid) return;

  const allShorts = Array.isArray(state.shorts) ? state.shorts : [];
  ui.shortsGrid.innerHTML = allShorts.map(renderShortCard).join('');

  if (ui.shortsCount) {
    ui.shortsCount.textContent = `Shorts: ${allShorts.length}`;
  }

  requestAnimationFrame(updateShortsNavState);
}

function renderShortCard(video) {
  const rawId = video.id || '';
  const title = escapeHtml(video.title || 'Short FAPO');
  const poster = escapeHtml(video.thumbnail || '');
  const duration = formatDuration(video.duration || 0);
  const hasPlayableSource = Boolean(video.local_file);
  if (!hasPlayableSource) return '';

  return `
    <article class="short-card" role="listitem">
      <button class="short-card-open" type="button" data-open-short="${escapeHtml(rawId)}" aria-label="Otwórz film: ${title}">
        <span class="short-thumb-wrap">
          ${poster ? `<img class="short-media" loading="lazy" src="${poster}" alt="${title}" />` : '<span class="short-media short-media-fallback"></span>'}
          <span class="short-play" aria-hidden="true">▶</span>
          <span class="short-duration">${duration}</span>
        </span>
        <span class="short-card-body">
          <span class="short-title">${title}</span>
          <span class="short-meta">Kliknij, aby odtworzyć</span>
        </span>
      </button>
    </article>
  `;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function scrollShortsBy(direction) {
  if (!ui.shortsGrid) return;
  const step = Math.max(220, Math.floor(ui.shortsGrid.clientWidth * 0.72));
  ui.shortsGrid.scrollBy({
    left: step * direction,
    behavior: 'smooth',
  });
}

function updateShortsNavState() {
  if (!ui.shortsGrid) return;

  const maxScroll = Math.max(0, ui.shortsGrid.scrollWidth - ui.shortsGrid.clientWidth);
  const current = Math.max(0, ui.shortsGrid.scrollLeft);
  const hasScrollable = maxScroll > 4;
  const atStart = current <= 2;
  const atEnd = current >= maxScroll - 2;

  if (ui.shortsPrev) {
    ui.shortsPrev.disabled = !hasScrollable || atStart;
    ui.shortsPrev.hidden = !hasScrollable;
  }
  if (ui.shortsNext) {
    ui.shortsNext.disabled = !hasScrollable || atEnd;
    ui.shortsNext.hidden = !hasScrollable;
  }
}

function openShortModalById(shortId) {
  const id = String(shortId || '').trim();
  if (!id || !ui.shortsModal || !ui.shortsModalVideo || !ui.shortsModalSource) return;

  const short = state.shorts.find((video) => String(video.id) === id);
  if (!short || !short.local_file) return;

  const title = short.title || 'Short FAPO';

  ui.shortsModalSource.src = short.local_file;
  ui.shortsModalVideo.poster = short.thumbnail || '';
  ui.shortsModalVideo.title = title;
  ui.shortsModalVideo.load();

  if (ui.shortsModalTitle) {
    ui.shortsModalTitle.textContent = title;
  }

  ui.shortsModal.hidden = false;
  ui.shortsModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('shorts-modal-open');
  const playPromise = ui.shortsModalVideo.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {});
  }
}

function closeShortModal() {
  if (!ui.shortsModal || ui.shortsModal.hidden) return;

  if (ui.shortsModalVideo) {
    ui.shortsModalVideo.pause();
    ui.shortsModalVideo.removeAttribute('poster');
  }
  if (ui.shortsModalSource) {
    ui.shortsModalSource.removeAttribute('src');
    if (ui.shortsModalVideo) {
      ui.shortsModalVideo.load();
    }
  }

  ui.shortsModal.hidden = true;
  ui.shortsModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('shorts-modal-open');
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

function getProductVideos(productId) {
  const map = state.productVideos?.products;
  if (!map || typeof map !== 'object') return [];
  const list = map[productId];
  return Array.isArray(list) ? list : [];
}

function renderProductCard(product) {
  const image = escapeHtml(product.image || '');
  const localizedTitle = localizeProductTitlePL(product.title || 'Brak nazwy');
  const title = escapeHtml(localizedTitle);
  const sku = escapeHtml(product.sku || 'BRAK SKU');
  const category = escapeHtml(localizeCategoryPL(product.category || 'Performance'));
  const source = escapeHtml(getProductAvailabilityLabel(product));
  const price = formatPriceRange(product.priceFrom, product.priceTo);
  const productUrl = escapeHtml(getProductPageUrl(product));
  const vehicle = getVehicleMeta(product);
  const fitmentTag = formatFitmentTag(product, vehicle);
  const videos = getProductVideos(product.id);
  const firstVideo = videos[0];
  const videoTag = videos.length ? `<span class="tag tag-video">Filmy: ${videos.length}</span>` : '';
  const firstVideoUrl = firstVideo?.local_file || '';
  const videoButton = firstVideoUrl
    ? `<a class="btn btn-ghost" href="${escapeHtml(firstVideoUrl)}" target="_blank" rel="noopener noreferrer">Film</a>`
    : '';

  return `
    <article class="product-card">
      <img class="product-media" loading="lazy" src="${image}" alt="${title}" />
      <div class="product-body">
        <h3 class="product-title">
          <a href="${productUrl}">${title}</a>
        </h3>
        <div class="product-meta-line">
          <span class="tag">${category}</span>
          <span class="tag">${sku}</span>
          ${fitmentTag}
          <span class="tag">${source}</span>
          ${videoTag}
        </div>
        <p class="price">${price}</p>
        <div class="product-actions">
          <button class="btn btn-primary" type="button" data-add-id="${product.id}">Dodaj do koszyka</button>
          ${videoButton}
          <a class="btn btn-ghost" href="${productUrl}">Szczegoly</a>
        </div>
      </div>
    </article>
  `;
}

function getProductPageUrl(product) {
  const url = String(product?.url || '').trim();
  if (url) return url;

  const sku = String(product?.sku || product?.id || 'produkt').trim();
  const slug = slugify(`${product?.id || ''}-${sku}-${product?.title || ''}`);
  return `produkty/${slug || product?.id || 'produkt'}.html`;
}

function getProductAvailabilityLabel(product) {
  if (product?.source === 'fapomoto') return 'Oferta FAPO Polska';
  return 'Na zamówienie';
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function hydrateProductDetail() {
  const productId = ui.productDetail?.dataset.productId || '';
  if (!productId) return;

  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  ui.productDetail.querySelectorAll('[data-add-id]').forEach((button) => {
    button.dataset.addId = product.id;
  });
}

function normalizeProducts(products) {
  return products.map((product) => ({
    ...product,
    vehicle: getVehicleMeta(product),
  }));
}

function getVehicleMeta(product) {
  if (!product) return { makes: [], models: [], years: [] };
  if (
    product.vehicle
    && Array.isArray(product.vehicle.makes)
    && Array.isArray(product.vehicle.models)
    && Array.isArray(product.vehicle.years)
  ) {
    return product.vehicle;
  }
  return extractVehicleMetaFromProduct(product);
}

function extractVehicleMetaFromProduct(product) {
  return extractVehicleMeta(product?.title || '');
}

function formatFitmentTag(product, vehicle) {
  const fitmentLabels = {
    universal: 'Uniwersalny',
    swap: 'Swap/custom',
    engine: 'Silnik',
  };

  if (product?.fitmentType && fitmentLabels[product.fitmentType]) {
    return `<span class="tag">${fitmentLabels[product.fitmentType]}</span>`;
  }

  const yearLabel = formatVehicleYears(vehicle?.years || []);
  if (yearLabel) {
    return `<span class="tag">${escapeHtml(yearLabel)}</span>`;
  }

  const makeLabel = (vehicle?.makes || []).slice(0, 2).join(' / ');
  return makeLabel ? `<span class="tag">${escapeHtml(makeLabel)}</span>` : '';
}

function formatVehicleYears(years) {
  const sorted = Array.from(new Set((years || [])
    .map((year) => Number(year))
    .filter(isReasonableYear)))
    .sort((a, b) => a - b);
  if (!sorted.length) return '';

  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (const year of sorted.slice(1)) {
    if (year === end + 1) {
      end = year;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = year;
    end = year;
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);

  return ranges.slice(0, 3).join(', ');
}

function extractVehicleMeta(title) {
  const text = String(title || '').replace(/[|,;()]/g, ' ');
  const makes = [];
  const models = [];
  const years = extractYearsFromText(text);

  VEHICLE_MAKE_PATTERN.lastIndex = 0;
  let match;
  while ((match = VEHICLE_MAKE_PATTERN.exec(text)) !== null) {
    const alias = String(match[1] || '').toLowerCase();
    const canonicalMake = VEHICLE_ALIAS_TO_MAKE.get(alias);
    if (!canonicalMake) continue;

    if (!makes.includes(canonicalMake)) {
      makes.push(canonicalMake);
    }

    const tail = text.slice(match.index + match[0].length);
    const model = extractModelFromTail(tail);
    if (!model) continue;
    if (model.toLowerCase() === canonicalMake.toLowerCase()) continue;
    if (!models.includes(model)) {
      models.push(model);
    }
  }

  return { makes, models, years };
}

function extractModelFromTail(tail) {
  const tokens = String(tail || '').match(/[A-Za-z0-9][A-Za-z0-9+./-]*/g) || [];
  if (!tokens.length) return '';

  const modelTokens = [];
  for (const rawToken of tokens.slice(0, 14)) {
    const token = rawToken.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!token) continue;

    const lower = token.toLowerCase();
    if (/^(19|20)\d{2}$/.test(token)) break;
    if (/^[A-Z]{2,}\d{3,}$/.test(token)) break;

    if (MODEL_BREAK_TOKENS.has(lower) && modelTokens.length) break;
    if (MODEL_SKIP_TOKENS.has(lower)) continue;
    if (MODEL_TRIM_TOKENS.has(lower) && modelTokens.length) break;

    modelTokens.push(token);
    if (modelTokens.length >= 3) break;
  }

  while (modelTokens.length && MODEL_SKIP_TOKENS.has(modelTokens[modelTokens.length - 1].toLowerCase())) {
    modelTokens.pop();
  }

  if (!modelTokens.length) return '';
  return normalizeModelLabel(modelTokens.join(' '));
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

function extractYearsFromText(text) {
  const source = String(text || '');
  const years = new Set();

  const rangeRegex = /\b(19\d{2}|20\d{2})\s*[-/]\s*(19\d{2}|20\d{2})\b/g;
  let range;
  while ((range = rangeRegex.exec(source)) !== null) {
    addYearRange(years, Number(range[1]), Number(range[2]));
  }

  const shortRangeRegex = /\b(\d{2})\s*[-/]\s*(\d{2})\b/g;
  while ((range = shortRangeRegex.exec(source)) !== null) {
    addYearRange(years, expandTwoDigitYear(range[1]), expandTwoDigitYear(range[2]));
  }

  const openRangeRegex = /\b(19\d{2}|20\d{2})\s*\+/g;
  while ((range = openRangeRegex.exec(source)) !== null) {
    addYearRange(years, Number(range[1]), 2030);
  }

  const singleRegex = /\b(19\d{2}|20\d{2})\b/g;
  let single;
  while ((single = singleRegex.exec(source)) !== null) {
    const year = Number(single[1]);
    if (isReasonableYear(year)) {
      years.add(year);
    }
  }

  return Array.from(years).sort((a, b) => a - b);
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

function isReasonableYear(year) {
  return Number.isInteger(year) && year >= 1960 && year <= 2030;
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
            <button class="cart-qty-button" type="button" data-qty-minus="${id}">-</button>
            <span>${qty}</span>
            <button class="cart-qty-button" type="button" data-qty-plus="${id}">+</button>
            <strong class="cart-line-total">${formatMoney(lineTotal)}</strong>
            <button class="cart-remove-button" type="button" data-remove-id="${id}" aria-label="Usuń z koszyka">Usuń</button>
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
    setFormStatus(ui.checkoutForm, 'Dodaj produkty do koszyka przed złożeniem zamówienia.', 'error');
    return;
  }

  if (!ui.checkoutForm.checkValidity()) {
    ui.checkoutForm.reportValidity();
    return;
  }

  const submitButton = ui.checkoutForm.querySelector('button[type="submit"]');
  const originalLabel = submitButton?.textContent || '';
  const payload = buildCheckoutPayload(entries);

  setSubmitState(submitButton, true, 'Wysyłanie...');
  setFormStatus(ui.checkoutForm, 'Wysyłamy zamówienie do obsługi FAPO Polska...', 'info');

  sendCheckoutPayload(payload)
    .then((result) => {
      state.cart = {};
      saveCart();
      renderCart();
      ui.checkoutForm.reset();
      setFormStatus(ui.checkoutForm, `Zamówienie wysłane. Numer zgłoszenia: ${result.orderId || payload.orderId}.`, 'success');
    })
    .catch((error) => {
      console.error('Checkout send failed', error);
      openCheckoutMailFallback(payload);
      setFormStatus(ui.checkoutForm, 'Automatyczna wysyłka jest niedostępna. Otworzyliśmy program pocztowy z przygotowanym zamówieniem.', 'warning');
    })
    .finally(() => {
      setSubmitState(submitButton, false, originalLabel);
    });
}

function buildCheckoutPayload(entries) {
  const formData = new FormData(ui.checkoutForm);
  const items = entries.map(([id, qty]) => {
    const product = state.products.find((p) => p.id === id);
    const priceFrom = Number(product?.priceFrom || 0);
    const quantity = Number(qty || 1);

    return {
      id,
      title: localizeProductTitlePL(product?.title || id),
      sku: product?.sku || '',
      category: localizeCategoryPL(product?.category || ''),
      source: product?.source || '',
      url: getProductPageUrl(product),
      qty: quantity,
      priceFrom,
      lineTotal: priceFrom * quantity,
    };
  });

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    kind: 'order',
    orderId: createClientOrderId(),
    page: window.location.href,
    customerName: String(formData.get('customerName') || '').trim(),
    customerEmail: String(formData.get('customerEmail') || '').trim(),
    customerPhone: String(formData.get('customerPhone') || '').trim(),
    customerAddress: String(formData.get('customerAddress') || '').trim(),
    customerNote: String(formData.get('customerNote') || '').trim(),
    termsAccepted: formData.get('termsAccepted') === 'yes',
    policiesVersion: '20260707-policy-compliance',
    items,
    total,
  };
}

function createClientOrderId() {
  const stamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `FAPO-${stamp}-${suffix}`;
}

async function sendCheckoutPayload(payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(contactEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Order endpoint returned ${response.status}`);
    }

    const result = await response.json().catch(() => ({}));
    if (result.ok === false) {
      throw new Error(result.message || 'Order endpoint rejected the message');
    }

    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

function openCheckoutMailFallback(payload) {
  const itemLines = payload.items.map((item, index) => [
    `${index + 1}. ${item.title}`,
    `   ID: ${item.id}`,
    `   SKU: ${item.sku || '-'}`,
    `   Ilość: ${item.qty}`,
    `   Cena: ${formatMoney(item.priceFrom)}`,
    `   Suma: ${formatMoney(item.lineTotal)}`,
    item.url ? `   URL: ${item.url}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const body = [
    'Nowe zamówienie ze sklepu FAPO Polska',
    `Numer zamówienia: ${payload.orderId}`,
    '',
    `Klient: ${payload.customerName}`,
    `E-mail: ${payload.customerEmail}`,
    `Telefon: ${payload.customerPhone}`,
    `Adres: ${payload.customerAddress}`,
    payload.customerNote ? `Uwagi: ${payload.customerNote}` : null,
    `Akceptacja warunków: ${payload.termsAccepted ? 'tak' : 'nie'}`,
    payload.policiesVersion ? `Wersja polityk: ${payload.policiesVersion}` : null,
    '',
    'Pozycje:',
    itemLines,
    '',
    `Wartość orientacyjna: ${formatMoney(payload.total)}`,
  ].filter(Boolean).join('\n');

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(body).catch(() => {});
  }

  window.location.href = `mailto:${fallbackRecipients.join(',')}?subject=${encodeURIComponent(`Zamówienie FAPO Polska - ${payload.orderId}`)}&body=${encodeURIComponent(body)}`;
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
  const price = Number(min || max || 0);
  return price ? formatMoney(price) : 'Cena na zapytanie';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
