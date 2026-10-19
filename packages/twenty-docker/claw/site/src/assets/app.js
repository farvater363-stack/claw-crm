(() => {
  const { lang, copy, contactPhone, designArt, priceHoldDays } = window.PROFMET;
  // Set in the CRM; known once the catalog arrives, and no offer is shown until then.
  let offerPercent = 0;
  const METALS = ['ROD', 'PROFILE', 'REBAR'];
  const POPULAR_METAL = 'PROFILE';
  const SIZE_LIMITS = { min: 20, max: 600 };
  const PROJECTION_LIMITS = { min: 1, max: 100 };
  const MAX_QUANTITY = 50;
  const EXAMPLE_WINDOW_SQUARE_METERS = 1.4 * 1.5;
  const CALCULATING_STEP_MS = 450;
  const MONTHS = copy['js.months'].split(',');

  const escapeHtml = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    );

  // `text` is for textContent; `t` is the same string escaped for innerHTML.
  const text = (key, values = {}) =>
    (copy[key] ?? key).replace(/\{(\w+)\}/g, (match, name) =>
      name in values ? values[name] : name === 'percent' ? offerPercent : match,
    );
  const t = (key, values = {}) => escapeHtml(text(key, values));

  const formatAmount = (amount) => new Intl.NumberFormat('ru-RU').format(amount);
  const roundToThousand = (amount) => Math.round(amount / 1000) * 1000;
  const withOffer = (amount) => Math.round((amount * (100 - offerPercent)) / 100);
  const formatDate = (date) => text('js.date', { day: date.getDate(), month: MONTHS[date.getMonth()] });
  const digitsOf = (value) => String(value).replace(/\D/g, '');
  const formatPhone = (digits) =>
    [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const icon = (path, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" aria-hidden="true">${path}</svg>`;
  const CHECK_ICON = icon('<path d="m5 12 5 5 9-10"/>');
  const LOCK_ICON = icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const METAL_ART = {
    ROD: icon('<path d="M10 4v32M20 4v32M30 4v32"/><circle cx="10" cy="20" r="3"/><circle cx="20" cy="20" r="3"/><circle cx="30" cy="20" r="3"/>', '0 0 40 40'),
    PROFILE: icon('<rect x="5" y="5" width="30" height="30" rx="1"/><rect x="11" y="11" width="18" height="18" rx="1"/>', '0 0 40 40'),
    REBAR: icon('<path d="M20 3v34"/><path d="m13 7 14 4M13 14l14 4M13 21l14 4M13 28l14 4"/>', '0 0 40 40'),
  };

  const offerEndDate = () => {
    const today = new Date();

    return new Date(today.getFullYear(), today.getMonth() + 1, 0);
  };

  const priceHoldDate = () => {
    const date = new Date();

    date.setDate(date.getDate() + priceHoldDays);

    return date;
  };

  const renderOffer = () => {
    const hasOffer = offerPercent > 0;

    document.querySelectorAll('[data-offer]').forEach((element) => {
      element.textContent = text('js.offer.text', { until: text('js.offer.until', { date: formatDate(offerEndDate()) }) });
      element.hidden = !hasOffer;
    });
    document.querySelectorAll('[data-offer-badge]').forEach((element) => {
      element.textContent = `−${offerPercent}%`;
      element.hidden = !hasOffer;
    });
    document.querySelectorAll('[data-offer-faq]').forEach((element) => {
      element.querySelector('[data-offer-faq-answer]').textContent = text('js.faq.discount');
      element.hidden = !hasOffer;
    });
  };

  document.querySelectorAll('[data-language]').forEach((link) =>
    link.addEventListener('click', () => {
      try {
        localStorage.setItem('profmet-lang', link.dataset.language);
      } catch (error) {}
    }),
  );

  // The sticky button shows only while neither the hero button nor the closing block is on screen.
  const stickyBar = document.querySelector('[data-sticky-cta]');
  const visibleTargets = new Set();
  const stickyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) =>
      entry.isIntersecting ? visibleTargets.add(entry.target) : visibleTargets.delete(entry.target),
    );
    stickyBar.classList.toggle('is-visible', visibleTargets.size === 0);
  });

  stickyObserver.observe(document.querySelector('.hero__content .button'));
  stickyObserver.observe(document.querySelector('.final'));

  // One request serves both the price block and the wizard; the route sends a 5-minute cache header.
  let catalogRequest = null;
  const loadCatalog = () => {
    catalogRequest ??= fetch('/api/website/catalog').then((response) => {
      if (!response.ok) throw new Error(String(response.status));

      return response.json();
    });

    return catalogRequest;
  };

  const lowestPrice = (prices) => {
    const values = METALS.map((metal) => prices?.[metal]).filter((price) => typeof price === 'number' && price > 0);

    return values.length > 0 ? Math.min(...values) : null;
  };

  const renderPriceBlock = (catalog) => {
    const section = document.querySelector('[data-price-section]');
    const prices = catalog.defaultPrices;
    const exampleRate = prices[POPULAR_METAL] ?? lowestPrice(prices);

    if (!exampleRate) {
      section.querySelector('.price__main').hidden = true;

      return;
    }

    const listPrice = roundToThousand(EXAMPLE_WINDOW_SQUARE_METERS * exampleRate);

    section.querySelector('[data-price-example]').textContent = formatAmount(withOffer(listPrice));

    if (offerPercent > 0) {
      section.querySelector('[data-price-example-list]').textContent = `${formatAmount(listPrice)} ${text('js.result.currency')}`;
      section.querySelector('[data-price-offer-label]').textContent = text('js.price.withOffer');
      section.querySelector('[data-price-list-row]').hidden = false;
    }

    section.querySelector('[data-price-metals]').innerHTML = METALS.filter((metal) => prices[metal])
      .map(
        (metal) =>
          `<li>${t(`js.metal.${metal}.name`)} · <b>${t('js.metal.price', { price: formatAmount(prices[metal]) })}</b></li>`,
      )
      .join('');
  };

  loadCatalog()
    .then((catalog) => {
      offerPercent = catalog.offerPercent ?? 0;
      renderOffer();
      renderPriceBlock(catalog);
    })
    .catch(() => {
      document.querySelector('[data-price-section] .price__main').hidden = true;
    });

  const dialog = document.querySelector('[data-wizard]');
  const body = document.querySelector('[data-wizard-body]');
  const progress = document.querySelector('[data-wizard-progress]');
  const backButton = document.querySelector('[data-wizard-back]');

  const state = {
    catalog: null,
    catalogStatus: 'idle',
    stepIndex: 0,
    designId: undefined,
    metal: null,
    shape: 'flat',
    widthCm: '',
    heightCm: '',
    projectionCm: '',
    quantity: 1,
    name: '',
    phoneDigits: '',
    error: '',
    calculatingStep: null,
    result: null,
  };

  const steps = () => [...((state.catalog?.designs.length ?? 0) > 0 ? ['design'] : []), 'metal', 'size', 'contact'];

  const currentStep = () => {
    if (state.result) return 'result';
    if (state.calculatingStep !== null) return 'calculating';

    return steps()[state.stepIndex];
  };

  const selectedDesign = () => state.catalog?.designs.find((design) => design.id === state.designId) ?? null;
  const designName = (design, index) => design.name || text('js.design.fallbackName', { number: index + 1 });
  const pricesForSelection = () => selectedDesign()?.prices ?? state.catalog?.defaultPrices ?? {};

  const ensureCatalog = async () => {
    if (state.catalogStatus === 'ready' || state.catalogStatus === 'loading') return;

    state.catalogStatus = 'loading';
    render();

    try {
      state.catalog = await loadCatalog();
      state.catalogStatus = 'ready';
    } catch (error) {
      catalogRequest = null;
      state.catalogStatus = 'error';
    }

    render();
  };

  const openWizard = () => {
    if (!dialog.open) dialog.showModal();
    // Lets the phone's back button close the wizard instead of leaving the site.
    if (!history.state?.wizard) history.pushState({ wizard: true }, '');
    if (state.catalogStatus === 'ready') render();
    else ensureCatalog();
  };

  window.addEventListener('popstate', () => {
    if (dialog.open) dialog.close();
  });

  dialog.addEventListener('close', () => {
    if (history.state?.wizard) history.back();
  });

  document.querySelectorAll('[data-open-estimate]').forEach((button) => button.addEventListener('click', openWizard));
  document.querySelector('[data-wizard-close]').addEventListener('click', () => dialog.close());

  backButton.addEventListener('click', () => {
    if (state.stepIndex === 0 || state.result) {
      dialog.close();

      return;
    }
    state.stepIndex -= 1;
    state.error = '';
    render();
  });

  const scrollWizardTop = () => body.querySelector('.wizard__content')?.scrollTo(0, 0);

  const goNext = () => {
    state.error = '';
    state.stepIndex += 1;
    render();
    scrollWizardTop();
  };

  const header = (titleKey, hintKey) =>
    `<p class="wizard__step-label">${t('js.step', { current: state.stepIndex + 1, total: steps().length })}</p>` +
    `<h2 class="display wizard__title">${t(titleKey)}</h2>` +
    (hintKey ? `<p class="wizard__hint">${t(hintKey)}</p>` : '');

  const footer = (label, { disabled = false } = {}) =>
    `<div class="wizard__footer"><p class="wizard__error" role="alert">${escapeHtml(state.error)}</p>` +
    `<button class="button button--primary button--block" type="submit"${disabled ? ' disabled' : ''}>${label}</button></div>`;

  const renderDesign = () => {
    const cards = state.catalog.designs
      .map((design, index) => {
        const from = lowestPrice(design.prices);

        return (
          `<label class="choice"><input type="radio" name="design" value="${escapeHtml(design.id)}"${state.designId === design.id ? ' checked' : ''} />` +
          `<span class="choice__card"><span class="design-card__image">${designArt[index % designArt.length]}</span>` +
          `<span class="design-card__name">${escapeHtml(designName(design, index))}</span>` +
          (from ? `<span class="design-card__price">${t('js.metal.price', { price: formatAmount(from) })}</span>` : '') +
          `</span></label>`
        );
      })
      .join('');
    const unsure =
      `<label class="choice design-card--unsure"><input type="radio" name="design" value=""${state.designId === null ? ' checked' : ''} />` +
      `<span class="choice__card"><span class="design-card__image">?</span>` +
      `<span class="design-card__name">${t('js.design.unsure')}</span></span></label>`;

    return (
      `<div class="wizard__content">${header('js.design.title', 'js.design.hint')}<div class="design-grid">${cards}${unsure}</div></div>` +
      footer(t('js.next'), { disabled: state.designId === undefined })
    );
  };

  const renderMetal = () => {
    const prices = pricesForSelection();
    const options = METALS.map((metal) => {
      const price = prices[metal];

      return (
        `<label class="choice"><input type="radio" name="metal" value="${metal}"${state.metal === metal ? ' checked' : ''} />` +
        `<span class="choice__card option"><span class="option__art">${METAL_ART[metal]}</span><span class="option__text">` +
        `<span class="option__name">${t(`js.metal.${metal}.name`)}` +
        (metal === POPULAR_METAL ? `<span class="option__badge">${t('js.metal.popular')}</span>` : '') +
        `</span><span class="option__description">${t(`js.metal.${metal}.text`)}</span>` +
        (price ? `<span class="option__price">${t('js.metal.price', { price: formatAmount(price) })}</span>` : '') +
        `</span><span class="option__radio"></span></span></label>`
      );
    }).join('');

    return (
      `<div class="wizard__content">${header('js.metal.title')}<div class="option-list">${options}</div></div>` +
      footer(t('js.next'), { disabled: state.metal === null })
    );
  };

  const FLAT_ICON = icon('<rect x="8" y="4" width="40" height="32" rx="2"/><path d="M18 4v32M28 4v32M38 4v32"/>', '0 0 56 40');
  const CONVEX_ICON = icon(
    '<path d="M8 4h40v32H8Z"/><path d="M8 36 2 30V10l6-6M48 36l6-6V10l-6-6"/><path d="M18 4v32M28 4v32M38 4v32"/>',
    '0 0 56 40',
  );

  const numberField = (name, labelKey, value, extraClass = '') =>
    `<label class="field ${extraClass}"><span class="field__label">${t(labelKey)}</span>` +
    `<input class="input" name="${name}" inputmode="numeric" autocomplete="off" maxlength="3" value="${escapeHtml(value)}" /></label>`;

  const renderSize = () => {
    const shapes = [
      ['flat', 'js.size.flat', FLAT_ICON],
      ['convex', 'js.size.convex', CONVEX_ICON],
    ]
      .map(
        ([value, labelKey, art]) =>
          `<label class="choice"><input type="radio" name="shape" value="${value}"${state.shape === value ? ' checked' : ''} />` +
          `<span class="choice__card">${art}${t(labelKey)}</span></label>`,
      )
      .join('');

    return (
      `<div class="wizard__content">${header('js.size.title', 'js.size.hint')}` +
      `<div class="segmented">${shapes}</div><div class="fields">` +
      numberField('widthCm', 'js.size.width', state.widthCm) +
      numberField('heightCm', 'js.size.height', state.heightCm) +
      (state.shape === 'convex' ? numberField('projectionCm', 'js.size.projection', state.projectionCm, 'field--wide') : '') +
      `<div class="field field--wide"><span class="field__label">${t('js.size.quantity')}</span>` +
      `<div class="stepper"><button type="button" data-quantity="-1" aria-label="−">−</button>` +
      `<output aria-live="polite">${state.quantity}</output>` +
      `<button type="button" data-quantity="1" aria-label="+">+</button></div></div>` +
      `</div></div>` +
      footer(t('js.next'))
    );
  };

  const renderContact = () =>
    `<div class="wizard__content">${header('js.contact.title')}` +
    `<ul class="chips">` +
    ['js.contact.chip.spam', 'js.contact.chip.callback', 'js.contact.chip.hold'].map((key) => `<li>${CHECK_ICON}${t(key)}</li>`).join('') +
    `</ul><div class="fields">` +
    `<label class="field field--wide"><span class="field__label">${t('js.contact.name')}</span>` +
    `<input class="input" name="name" autocomplete="name" maxlength="60" value="${escapeHtml(state.name)}" /></label>` +
    `<label class="field field--wide"><span class="field__label">${t('js.contact.phone')}</span>` +
    `<span class="phone-input"><span class="phone-input__prefix">+998</span>` +
    `<input class="input" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="90 123 45 67" value="${formatPhone(state.phoneDigits)}" /></span></label>` +
    `</div>` +
    // Off-screen field only bots fill in.
    `<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px" />` +
    `</div>` +
    footer(t('js.contact.submit'));

  const renderCalculating = () => {
    const lines = ['js.calc.area', 'js.calc.price', ...(offerPercent > 0 ? ['js.calc.offer'] : [])];

    return (
      `<div class="wizard__content"><h2 class="display wizard__title">${t('js.contact.sending')}</h2><ul class="calculating">` +
      lines
        .map((key, index) => `<li class="${index < state.calculatingStep ? 'is-done' : ''}">${CHECK_ICON}${t(key)}</li>`)
        .join('') +
      `</ul></div>`
    );
  };

  const renderResult = () => {
    const { result } = state;
    const design = selectedDesign();
    const designIndex = state.catalog?.designs.indexOf(design) ?? -1;
    const sizeText =
      [state.widthCm, state.heightCm, ...(state.shape === 'convex' ? [state.projectionCm] : [])].join(' × ') +
      ` ${text('js.result.centimeters')}`;
    const rows = [
      ...((state.catalog?.designs.length ?? 0) > 0
        ? [['js.result.design', design ? designName(design, designIndex) : text('js.result.unsureDesign')]]
        : []),
      ['js.result.metal', text(`js.metal.${state.metal}.name`)],
      ['js.result.size', sizeText],
      ['js.result.quantity', `${state.quantity} ${text('js.result.pieces')}`],
      ['js.result.area', `${String(result.areaSquareMeters).replace('.', ',')} ${text('js.result.squareMeters')}`],
    ]
      .map(([labelKey, value]) => `<div><dt>${t(labelKey)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join('');
    const currency = t('js.result.currency');
    const hasDiscount = result.offerPercent > 0;

    const price =
      result.estimate === null
        ? `<p class="result__no-price">${t('js.result.noPrice')}</p>`
        : `<div class="receipt">` +
          (hasDiscount
            ? `<div><span>${t('js.result.list')}</span><s>${formatAmount(result.estimate)} ${currency}</s></div>` +
              `<div class="receipt__discount"><span>${t('js.result.discount', { percent: result.offerPercent })}</span><span>−${formatAmount(result.estimate - result.discountedEstimate)} ${currency}</span></div>`
            : '') +
          `<div class="receipt__total"><span>${t('js.result.total')}</span><strong>≈ ${formatAmount(result.discountedEstimate)} <small>${currency}</small></strong></div>` +
          `</div><p class="result__hold">${LOCK_ICON}${t('js.result.hold', { date: formatDate(priceHoldDate()) })}</p>`;

    return (
      `<div class="wizard__content">` +
      `<div class="result__header"><h2 class="display result__title">${t('js.result.title')}</h2>${price}</div>` +
      `<div class="personal"><h3>${t('js.result.personalTitle')}</h3><p>${t('js.result.personalText')}</p></div>` +
      `<dl class="summary">${rows}</dl>` +
      `<p class="result__exact">${t('js.result.exact')}</p>` +
      `<ul class="guarantees">` +
      ['js.guarantee.warranty', 'js.guarantee.measure', 'js.guarantee.city'].map((key) => `<li>${CHECK_ICON}${t(key)}</li>`).join('') +
      `</ul></div>` +
      footer(t('js.result.done'))
    );
  };

  const renderProgress = () => {
    const allSteps = steps();
    const done = state.result || state.calculatingStep !== null ? allSteps.length : state.stepIndex + 1;

    progress.innerHTML = allSteps.map((_, index) => `<span class="${index < done ? 'is-done' : ''}"></span>`).join('');
  };

  const render = () => {
    renderProgress();
    backButton.style.visibility = state.result || state.calculatingStep !== null ? 'hidden' : 'visible';

    if (state.catalogStatus === 'loading' || state.catalogStatus === 'idle') {
      body.innerHTML = `<div class="wizard__content"><p class="loading">${t('js.loading')}</p></div>`;

      return;
    }

    if (state.catalogStatus === 'error') {
      const phoneLink = `<a href="tel:${escapeHtml(contactPhone.replace(/\s/g, ''))}">${escapeHtml(contactPhone)}</a>`;

      body.innerHTML = `<div class="wizard__content"><p class="loading">${t('js.catalogError', { phone: '%PHONE%' }).replace('%PHONE%', phoneLink)}</p></div>`;

      return;
    }

    const renderers = {
      design: renderDesign,
      metal: renderMetal,
      size: renderSize,
      contact: renderContact,
      calculating: renderCalculating,
      result: renderResult,
    };

    body.innerHTML = renderers[currentStep()]();
  };

  const setFieldInvalid = (name, isInvalid) => {
    const input = body.querySelector(`[name="${name}"]`);
    const target = name === 'phone' ? input.closest('.phone-input') : input;

    target.setAttribute('aria-invalid', String(isInvalid));
  };

  const showError = (message) => {
    state.error = message;
    body.querySelector('.wizard__error').textContent = message;
  };

  const isWithin = (value, { min, max }) => {
    const number = Number(value);

    return value !== '' && Number.isFinite(number) && number >= min && number <= max;
  };

  const validateSize = () => {
    const sizeValid = isWithin(state.widthCm, SIZE_LIMITS) && isWithin(state.heightCm, SIZE_LIMITS);
    const projectionValid = state.shape === 'flat' || isWithin(state.projectionCm, PROJECTION_LIMITS);

    setFieldInvalid('widthCm', !isWithin(state.widthCm, SIZE_LIMITS));
    setFieldInvalid('heightCm', !isWithin(state.heightCm, SIZE_LIMITS));
    if (state.shape === 'convex') setFieldInvalid('projectionCm', !projectionValid);

    if (!sizeValid) showError(text('js.size.error'));
    else if (!projectionValid) showError(text('js.size.projectionError'));

    return sizeValid && projectionValid;
  };

  // A short visible "counting" moment, so the price reads as calculated for this window.
  const playCalculating = async () => {
    const lineCount = offerPercent > 0 ? 3 : 2;


    for (let step = 0; step <= lineCount; step += 1) {
      state.calculatingStep = step;
      render();
      await wait(CALCULATING_STEP_MS);
    }
  };

  const backToContact = (message, invalidField) => {
    state.calculatingStep = null;
    render();
    if (invalidField) setFieldInvalid(invalidField, true);
    showError(message);
  };

  const submitEstimate = async () => {
    const nameValid = state.name.trim() !== '';
    const phoneValid = state.phoneDigits.length === 9;

    setFieldInvalid('name', !nameValid);
    setFieldInvalid('phone', !phoneValid);

    if (!nameValid) return showError(text('js.contact.nameError'));
    if (!phoneValid) return showError(text('js.contact.phoneError'));

    const website = body.querySelector('[name="website"]')?.value ?? '';

    state.error = '';

    const request = fetch('/api/website/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        designId: state.designId ?? null,
        metal: state.metal,
        widthCm: Number(state.widthCm),
        heightCm: Number(state.heightCm),
        projectionCm: state.shape === 'convex' ? Number(state.projectionCm) : 0,
        quantity: state.quantity,
        name: state.name.trim(),
        phone: state.phoneDigits,
        language: lang,
        website,
      }),
    }).then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }));

    try {
      const [{ response, payload }] = await Promise.all([request, playCalculating()]);

      if (response.ok) {
        state.calculatingStep = null;
        state.result = payload;
        render();
        scrollWizardTop();

        return;
      }

      if (response.status === 429) backToContact(text('js.error.tooMany'));
      else if (payload.error === 'INVALID_PHONE') backToContact(text('js.contact.phoneError'), 'phone');
      else if (payload.error === 'INVALID_NAME') backToContact(text('js.contact.nameError'), 'name');
      else backToContact(text('js.error.network'));
    } catch (error) {
      backToContact(text('js.error.network'));
    }
  };

  // Keeps name and phone so a second window is quicker to price.
  const startOver = () => {
    Object.assign(state, {
      stepIndex: 0,
      designId: undefined,
      metal: null,
      shape: 'flat',
      widthCm: '',
      heightCm: '',
      projectionCm: '',
      quantity: 1,
      error: '',
      result: null,
    });
    dialog.close();
  };

  // Single-choice steps move on by themselves, like a quiz; the button stays for people who wait.
  const advanceSoon = (fromStep) => setTimeout(() => currentStep() === fromStep && goNext(), 220);

  body.addEventListener('change', (event) => {
    const { name, value } = event.target;

    if (name === 'design') {
      state.designId = value === '' ? null : value;
      render();
      advanceSoon('design');
    } else if (name === 'metal') {
      state.metal = value;
      render();
      advanceSoon('metal');
    } else if (name === 'shape') {
      state.shape = value;
      render();
      if (value === 'convex') body.querySelector('[name="projectionCm"]')?.focus();
    }
  });

  body.addEventListener('input', (event) => {
    const { name } = event.target;

    if (state.error !== '') showError('');

    if (['widthCm', 'heightCm', 'projectionCm'].includes(name)) {
      event.target.value = digitsOf(event.target.value).slice(0, 3);
      state[name] = event.target.value;
      event.target.removeAttribute('aria-invalid');
    } else if (name === 'name') {
      state.name = event.target.value;
      event.target.removeAttribute('aria-invalid');
    } else if (name === 'phone') {
      let digits = digitsOf(event.target.value);

      if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
      state.phoneDigits = digits.slice(0, 9);
      event.target.value = formatPhone(state.phoneDigits);
      event.target.closest('.phone-input').removeAttribute('aria-invalid');
    }
  });

  body.addEventListener('click', (event) => {
    const quantityButton = event.target.closest('[data-quantity]');

    if (!quantityButton) return;

    state.quantity = Math.min(MAX_QUANTITY, Math.max(1, state.quantity + Number(quantityButton.dataset.quantity)));
    body.querySelector('.stepper output').textContent = String(state.quantity);
  });

  body.addEventListener('submit', (event) => {
    event.preventDefault();
    const step = currentStep();

    if (step === 'result') startOver();
    else if (step === 'design' && state.designId !== undefined) goNext();
    else if (step === 'metal' && state.metal !== null) goNext();
    else if (step === 'size' && validateSize()) goNext();
    else if (step === 'contact') submitEstimate();
  });
})();
