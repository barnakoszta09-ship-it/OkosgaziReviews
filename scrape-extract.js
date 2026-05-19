// ─────────────────────────────────────────────────────────────────────────────
// scrape-extract.js  —  Okosgazdi termékoldalról adatkinyerés
//
// Hogyan használd:
//   1. Menj az okosgazdi.hu termékoldalra Chrome-ban
//   2. Claude: javascript_tool → másold be ennek a fájlnak a tartalmát
//   3. Kapott JSON-t mentsd: reviews/data/[slug].json
//   4. Töltsd ki a "TODO" mezőket (szerkesztői ítélet, ~10-15 mező)
//   5. node build.js reviews/data/[slug].json
// ─────────────────────────────────────────────────────────────────────────────

(function extractProductData() {

  // ── 1. JSON-LD sémák ────────────────────────────────────────────────────────
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map(n => { try { return JSON.parse(n.textContent); } catch (e) { return null; } })
    .filter(Boolean);

  let product = null, aggregateRating = null, price = null;
  for (const s of schemas) {
    const items = s['@graph'] ? s['@graph'] : [s];
    for (const item of items) {
      if (item['@type'] === 'Product') {
        product = item;
        if (item.aggregateRating) aggregateRating = item.aggregateRating;
        if (item.offers) {
          const o = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          price = o.price || o.lowPrice;
        }
      }
    }
  }

  // ── 2. Alap azonosítók ──────────────────────────────────────────────────────
  const url   = window.location.href.split('?')[0].replace(/\/$/, '');
  const slug  = url.split('/').pop();
  const name  = product?.name
    || document.querySelector('h1')?.innerText?.trim()
    || 'TODO';
  const brand = product?.brand?.name || 'TODO';

  // ── 3. Ár és kiszerelés ─────────────────────────────────────────────────────
  const priceHuf = price ? Math.round(parseFloat(String(price).replace(/[^\d.]/g, ''))) : 0;

  // Keressük a kg értéket az oldalon
  let weightKg = 0;
  const allText = document.body.innerText;
  const weightMatch = allText.match(/(\d+(?:[,\.]\d+)?)\s*kg(?:\s|,|\)|\/|$)/i);
  if (weightMatch) weightKg = parseFloat(weightMatch[1].replace(',', '.'));

  // ── 4. Közösségi értékelés ──────────────────────────────────────────────────
  const commScore = aggregateRating
    ? parseFloat(aggregateRating.ratingValue || 0)
    : 0;
  const commCount = aggregateRating
    ? parseInt(aggregateRating.reviewCount || aggregateRating.ratingCount || 0)
    : 0;

  // ── 5. Tápérték tábla ───────────────────────────────────────────────────────
  const nutrition = { protein: 0, fat: 0, ash: 0, fiber: 0, moisture: 10 };
  for (const row of document.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('td')];
    if (cells.length < 2) continue;
    const label = cells[0].innerText.toLowerCase();
    const val   = parseFloat(cells[1].innerText.replace(',', '.')) || 0;
    if      (label.includes('fehérje'))                  nutrition.protein  = val;
    else if (label.includes('zsír'))                     nutrition.fat      = val;
    else if (label.includes('hamu'))                     nutrition.ash      = val;
    else if (label.includes('rost'))                     nutrition.fiber    = val;
    else if (label.includes('nedvesség'))                nutrition.moisture = val;
  }

  // ── 6. Összetevők ───────────────────────────────────────────────────────────
  let ingredients = 'TODO';
  // Keresünk olyan paragrafust/divot ami % arányokat és húsforrásokat tartalmaz
  const candidates = [...document.querySelectorAll('p, div, li, span')];
  for (const el of candidates) {
    const t = el.innerText?.trim() || '';
    if (t.length > 60 && t.length < 800
        && t.match(/\d+%/)
        && /liszt|lazac|bárány|marha|csirke|sertés|fehérje|meal|salmon|lamb|beef/i.test(t)) {
      ingredients = t;
      break;
    }
  }

  // ── 7. Értékelések ──────────────────────────────────────────────────────────
  const reviews = [];
  // Próbáljuk meg a leggyakoribb review-selector kombinációkat
  const reviewSelectors = [
    '.review-item', '.comment-item', '[class*="review-card"]',
    '[class*="ReviewItem"]', '[data-review]', '.product-review'
  ];
  let reviewEls = [];
  for (const sel of reviewSelectors) {
    const found = [...document.querySelectorAll(sel)];
    if (found.length > 0) { reviewEls = found; break; }
  }

  for (const el of reviewEls.slice(0, 4)) {
    const nameEl = el.querySelector('[class*="name"], [class*="author"], strong, b');
    const textEl = el.querySelector('[class*="text"], [class*="content"], p');
    const starEl = el.querySelector('[class*="star"], [class*="rating"]');
    const dateEl = el.querySelector('[class*="date"], time, [class*="time"]');
    if (!textEl || textEl.innerText.trim().length < 15) continue;

    const starCount = (starEl?.innerText.match(/★/g) || []).length || 5;
    reviews.push({
      name:  nameEl?.innerText?.trim() || 'Vendég',
      stars: starCount,
      text:  textEl.innerText.trim().slice(0, 350),
      date:  dateEl?.innerText?.trim() || ''
    });
  }

  // ── 8. Termékkép URL ────────────────────────────────────────────────────────
  let productImageUrl = '';
  const imgSelectors = [
    '.product-gallery img',
    '.product-image img',
    '.gallery-image img',
    '[class*="product-gallery"] img',
    '[class*="ProductGallery"] img',
    'img[src*="/uimg/"]',
    'img[src*="storage/products"]',
  ];
  for (const sel of imgSelectors) {
    const el = document.querySelector(sel);
    if (el && el.src && !el.src.includes('data:') && el.naturalWidth > 50) {
      productImageUrl = el.src;
      break;
    }
  }

  // ── 9. Automata slug normalizálás ───────────────────────────────────────────
  const utmCampaign = slug
    .replace(/-(?:dog|adult|gf|grain-free|junior|puppy|senior)/gi, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');

  // ── 9. Kimenet ──────────────────────────────────────────────────────────────
  const out = {
    _workflow: `1) Töltsd ki a TODO mezőket  2) node build.js reviews/data/${slug}.json  3) git push`,

    slug,
    utm_campaign:    utmCampaign,
    product_name:    name,
    product_name_hu: 'TODO: pl. "Bárány & Lazac"',
    brand,
    category:        'TODO: pl. "Adult" / "Puppy" / "Senior"',
    okosgazdi_url:      url,
    product_image_url:  productImageUrl,
    date_published:     new Date().toISOString().slice(0, 10),

    price_huf:  priceHuf,
    weight_kg:  weightKg,

    protein_pct:  nutrition.protein,
    fat_pct:      nutrition.fat,
    ash_pct:      nutrition.ash,
    fiber_pct:    nutrition.fiber,
    moisture_pct: nutrition.moisture,

    ingredients,
    main_ingredient: 'TODO: pl. "Sertésliszt 29%"',
    chicken_free: !/csirke|csirkehús|chicken/i.test(ingredients),

    // ── Szerkesztői mezők (Claude tölti ki) ─────────────────────────────────
    editorial_score: 'TODO: 1.0–5.0',
    community_score: commScore || 'TODO',
    community_count: commCount || 'TODO',

    score_protein:  'TODO: 1.0–5.0',
    score_taste:    'TODO: 1.0–5.0',
    score_digest:   'TODO: 1.0–5.0',
    score_value:    'TODO: 1.0–5.0',
    score_quality:  'TODO: 1.0–5.0',

    protein_note: '',
    fat_note:     '',
    ash_note:     '',
    fiber_note:   '',

    hero_badge:      'TODO: pl. "🐑 Érzékeny kutyák kedvence"',
    hero_h1_line1:   name.split(/\s+/).slice(0, 4).join(' '),
    hero_h1_line2:   name.split(/\s+/).slice(4).join(' ') + ' — Review',
    hero_subtitle:   'TODO: 1-2 mondat a termékről',
    hero_meta_tags:  ['🐕 Felnőtt kutyáknak', 'TODO tag', 'TODO tag'],
    summary_emoji:   '📋',

    who_for: 'TODO: kinek ajánlott (1-2 mondat)',

    pros: [
      'TODO ✅ 1. előny',
      'TODO ✅ 2. előny',
      'TODO ✅ 3. előny',
      'TODO ✅ 4. előny'
    ],
    cons: [
      'TODO ❌ 1. hátrány',
      'TODO ❌ 2. hátrány'
    ],

    reviews: reviews.length >= 4
      ? reviews
      : [
          { name: 'TODO', stars: 5, text: 'TODO: vásárlói vélemény', date: 'TODO: pl. "2 hónapja"' },
          { name: 'TODO', stars: 5, text: 'TODO', date: 'TODO' },
          { name: 'TODO', stars: 5, text: 'TODO', date: 'TODO' },
          { name: 'TODO', stars: 4, text: 'TODO', date: 'TODO' }
        ],

    // FAQ: 3. és 5. kérdés hardcoded a sablonban (adagolás + vásárlás helye)
    faq: [
      { q: 'TODO: 1. kérdés', a: 'TODO: 1. válasz' },
      { q: 'TODO: 2. kérdés', a: 'TODO: 2. válasz' },
      {},
      { q: 'TODO: 4. kérdés', a: 'TODO: 4. válasz' }
    ],

    cta_title:        'TODO: CTA főcím',
    cta_subtitle:     'TODO: CTA alcím',
    price_analysis_p2:'TODO: ár összehasonlítás',
    price_analysis_p3:'TODO: napi költség összefoglaló',

    index_emoji: '📋',
    index_desc:  'TODO: 1-2 mondat az index kártyára',

    meta_description:   '',
    meta_keywords:      '',
    og_description:     '',
    schema_review_body: ''
  };

  return JSON.stringify(out, null, 2);

})();
