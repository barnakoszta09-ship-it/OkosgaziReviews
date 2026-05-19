// ─────────────────────────────────────────────────────────────────────────────
// build.js  —  OkosgazdiReviews build rendszer
//
// Használat:
//   node build.js reviews/data/[slug].json
//
// Mit csinál:
//   1. JSON adatfájl + _template.html → reviews/[slug].html
//   2. index.html: kártya frissítése / hozzáadása
//   3. sitemap.xml: URL hozzáadása ha még nincs benne
//   4. Kiírja a hero stats javasolt értékét
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = __dirname;
const TEMPLATE     = path.join(ROOT, 'reviews', '_template.html');
const REVIEWS_DIR  = path.join(ROOT, 'reviews');
const DATA_DIR     = path.join(ROOT, 'reviews', 'data');
const INDEX_PATH   = path.join(ROOT, 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Csillag HTML egy pontszámból (pl. 4.5 → "★★★★½") */
function stars(score) {
  const s    = parseFloat(score);
  const full = Math.floor(s);
  const half = s - full >= 0.45;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}

/** Progress-bar szélesség %  (5.0 → 100, 3.0 → 60) */
function barPct(score) { return Math.round(parseFloat(score) * 20); }

/** Magyar ezres-elválasztós formátum: 21990 → "21.990" */
function fmtHuf(n) {
  const s = String(Math.round(Number(n)));
  if (s.length <= 3) return s;
  if (s.length <= 6) return s.slice(0, -3) + '.' + s.slice(-3);
  return s.slice(0, -6) + '.' + s.slice(-6, -3) + '.' + s.slice(-3);
}

/** Napi etetési költség */
function dailyCost(pkgPerKg, factor) { return Math.round(pkgPerKg * factor); }

/** Automatikus tápérték tag */
function nutTag(type, value) {
  const v = parseFloat(value);
  const map = {
    protein: v >= 28 ? ['tag-ok','✅ Kiváló'] : v >= 22 ? ['tag-ok','✅ Jó'] : ['tag-warn','⚠️ Közepes'],
    fat:     v >= 10 ? ['tag-ok','✅ Jó']     : v >= 7  ? ['tag-ok','✅ Jó'] : ['tag-warn','⚠️ Alacsony'],
    ash:     v <=  8 ? ['tag-ok','✅ Jó']     : v <= 10 ? ['tag-warn','⚠️ Közepes'] : ['tag-warn','⚠️ Magas'],
    fiber:   v >=  2 ? ['tag-ok','✅ Jó']     : ['tag-warn','⚠️ Alacsony'],
  };
  return map[type] || ['tag-ok','✅ Jó'];
}

// ── Review HTML generálása ────────────────────────────────────────────────────

function buildHtml(d) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');

  const pkgPerKg = d.price_per_kg || Math.round(d.price_huf / d.weight_kg);
  const date     = d.date_published || new Date().toISOString().slice(0, 10);

  const [proteinCls, proteinTag] = d.protein_tag_class
    ? [d.protein_tag_class, d.protein_tag]
    : nutTag('protein', d.protein_pct);
  const [fatCls,     fatTag]     = nutTag('fat',   d.fat_pct);
  const [ashCls,     ashTag]     = d.ash_tag_class
    ? [d.ash_tag_class, d.ash_tag]
    : nutTag('ash', d.ash_pct);
  const [fiberCls,   fiberTag]   = nutTag('fiber', d.fiber_pct);

  const metaDesc  = d.meta_description  ||
    `${d.product_name} teszt és értékelés — ${d.editorial_score}/5 szerkesztői pontszám, ${d.community_count} vásárlói vélemény | OkosgazdiReviews.hu`;
  const ogDesc    = d.og_description    ||
    `${d.product_name} — ${d.editorial_score}/5 szerkesztői, ${d.community_score}/5 közösségi (${d.community_count} értékelés).`;
  const schemaBody= d.schema_review_body||
    `${d.product_name} részletes tápanyag-elemzése. Szerkesztői pontszám: ${d.editorial_score}/5.`;

  const metaTags = (d.hero_meta_tags || [])
    .map(t => `<span class="meta-tag">${t}</span>`)
    .join('\n        ');

  const rev = i => d.reviews?.[i] || { name:'', stars:5, text:'', date:'' };
  const faq = i => d.faq?.[i]     || { q:'', a:'' };

  // Pros/cons: a sablonban HTML-kommentként szerepelnek → lecseréljük <li>-re
  const pro = i => d.pros?.[i] ? `<li>${d.pros[i]}</li>` : '';
  const con = i => d.cons?.[i] ? `<li>${d.cons[i]}</li>` : '';

  const pairs = [
    // meta
    ['{{META_DESCRIPTION}}',   metaDesc],
    ['{{META_KEYWORDS}}',      d.meta_keywords || `${d.product_name}, kutyatáp review, ${d.brand} teszt`],
    ['{{OG_DESCRIPTION}}',     ogDesc],
    ['{{SCHEMA_REVIEW_BODY}}', schemaBody],
    // azonosítók
    ['{{PRODUCT_NAME}}',    d.product_name],
    ['{{PRODUCT_NAME_HU}}', d.product_name_hu],
    ['{{BRAND}}',           d.brand],
    ['{{CATEGORY}}',        d.category],
    ['{{FILE_SLUG}}',       d.slug],
    ['{{UTM_CAMPAIGN}}',    d.utm_campaign],
    ['{{PRODUCT_URL}}',     d.okosgazdi_url],
    ['{{DATE_PUBLISHED}}',  date],
    // ár
    ['{{PRICE_HUF}}',     fmtHuf(d.price_huf)],
    ['{{PRICE_HUF_RAW}}', String(d.price_huf)],
    ['{{WEIGHT_KG}}',     String(d.weight_kg)],
    ['{{PRICE_PER_KG}}',  String(pkgPerKg)],
    // tápérték
    ['{{PROTEIN_PCT}}', String(d.protein_pct)],
    ['{{FAT_PCT}}',     String(d.fat_pct)],
    ['{{ASH_PCT}}',     String(d.ash_pct)],
    ['{{FIBER_PCT}}',   String(d.fiber_pct)],
    ['{{INGREDIENTS_LIST}}', d.ingredients],
    // tápérték tagek
    ['{{PROTEIN_TAG_CLASS}}', proteinCls], ['{{PROTEIN_TAG}}', proteinTag], ['{{PROTEIN_NOTE}}', d.protein_note || ''],
    ['{{FAT_TAG_CLASS}}',     fatCls],     ['{{FAT_TAG}}',     fatTag],     ['{{FAT_NOTE}}',     d.fat_note     || ''],
    ['{{ASH_TAG_CLASS}}',     ashCls],     ['{{ASH_TAG}}',     ashTag],     ['{{ASH_NOTE}}',     d.ash_note     || ''],
    ['{{FIBER_TAG_CLASS}}',   fiberCls],   ['{{FIBER_TAG}}',   fiberTag],   ['{{FIBER_NOTE}}',   d.fiber_note   || ''],
    // pontszámok
    ['{{EDITORIAL_SCORE}}',  String(d.editorial_score)],
    ['{{EDITORIAL_STARS}}',  stars(d.editorial_score)],
    ['{{COMMUNITY_SCORE}}',  String(d.community_score)],
    ['{{COMMUNITY_COUNT}}',  String(d.community_count)],
    ['{{COMMUNITY_STARS}}',  stars(d.community_score)],
    ['{{SCORE_PROTEIN}}',     String(d.score_protein)],  ['{{SCORE_PROTEIN_PCT}}', String(barPct(d.score_protein))],
    ['{{SCORE_TASTE}}',       String(d.score_taste)],    ['{{SCORE_TASTE_PCT}}',   String(barPct(d.score_taste))],
    ['{{SCORE_DIGEST}}',      String(d.score_digest)],   ['{{SCORE_DIGEST_PCT}}',  String(barPct(d.score_digest))],
    ['{{SCORE_VALUE}}',       String(d.score_value)],    ['{{SCORE_VALUE_PCT}}',   String(barPct(d.score_value))],
    ['{{SCORE_QUALITY}}',     String(d.score_quality)],  ['{{SCORE_QUALITY_PCT}}', String(barPct(d.score_quality))],
    ['{{SCORE_VALUE_STARS}}', stars(d.score_value)],
    // gyors adatok
    ['{{MAIN_INGREDIENT}}', d.main_ingredient],
    ['{{CHICKEN_FREE}}',    d.chicken_free ? '✅ Igen' : '❌ Nem'],
    // hero
    ['{{HERO_BADGE}}',     d.hero_badge],
    ['{{HERO_H1_LINE1}}',  d.hero_h1_line1],
    ['{{HERO_H1_LINE2}}',  d.hero_h1_line2],
    ['{{HERO_SUBTITLE}}',  d.hero_subtitle],
    ['{{HERO_META_TAGS}}', metaTags],
    ['{{SUMMARY_EMOJI}}',  d.summary_emoji || '📋'],
    ['{{WHO_FOR}}',        d.who_for],
    // pros / cons (HTML komment cserék)
    ['<!-- {{PRO_1}} -->', pro(0)], ['<!-- {{PRO_2}} -->', pro(1)], ['<!-- {{PRO_3}} -->', pro(2)],
    ['<!-- {{PRO_4}} -->', pro(3)], ['<!-- {{PRO_5}} -->', pro(4)],
    ['<!-- {{CON_1}} -->', con(0)], ['<!-- {{CON_2}} -->', con(1)],
    ['<!-- {{CON_3}} -->', con(2)], ['<!-- {{CON_4}} -->', con(3)],
    // reviews 1–4
    ...([0,1,2,3].flatMap(i => {
      const r = rev(i); const n = i + 1;
      return [
        [`{{R${n}_NAME}}`,  r.name],
        [`{{R${n}_STARS}}`, '★'.repeat(r.stars || 5)],
        [`{{R${n}_TEXT}}`,  r.text],
        [`{{R${n}_DATE}}`,  r.date],
      ];
    })),
    // FAQ (3. és 5. hardcoded a sablonban)
    ['{{FAQ1_Q}}', faq(0).q], ['{{FAQ1_A}}', faq(0).a],
    ['{{FAQ2_Q}}', faq(1).q], ['{{FAQ2_A}}', faq(1).a],
    ['{{FAQ4_Q}}', faq(3).q], ['{{FAQ4_A}}', faq(3).a],
    // napi költség
    ['{{DAILY_COST_5KG}}',  String(dailyCost(pkgPerKg, 0.148))],
    ['{{DAILY_COST_15KG}}', String(dailyCost(pkgPerKg, 0.336))],
    ['{{DAILY_COST_25KG}}', String(dailyCost(pkgPerKg, 0.485))],
    ['{{DAILY_COST_35KG}}', String(dailyCost(pkgPerKg, 0.625))],
    // CTA + ár elemzés
    ['{{PRODUCT_IMAGE_URL}}', d.product_image_url || ''],
    ['{{CTA_TITLE}}',         d.cta_title],
    ['{{CTA_SUBTITLE}}',      d.cta_subtitle],
    ['{{PRICE_ANALYSIS_P2}}', d.price_analysis_p2 || ''],
    ['{{PRICE_ANALYSIS_P3}}', d.price_analysis_p3 || ''],
  ];

  let html = tpl;
  for (const [from, to] of pairs) {
    html = html.split(from).join(String(to ?? ''));
  }

  // Ha nincs termékkép URL → teljes kép-blokk eltávolítása
  if (!d.product_image_url) {
    html = html.replace(/\s*<!-- IF_IMAGE_START -->[\s\S]*?<!-- IF_IMAGE_END -->/g, '');
  } else {
    html = html.replace(/<!-- IF_IMAGE_START -->\n\s*/g, '').replace(/\s*<!-- IF_IMAGE_END -->/g, '');
  }

  return html;
}

// ── Index kártya HTML ─────────────────────────────────────────────────────────

function buildCard(d) {
  const pkg  = d.price_per_kg || Math.round(d.price_huf / d.weight_kg);
  const name = d.product_name.replace(/&/g, '&amp;');
  return `        <a href="reviews/${d.slug}.html" class="upcoming-card" style="display:block; text-decoration:none;">
          <div class="upcoming-soon-badge" style="background:#e6f7ed; color:#1a6b3a; border-color:#b8e8c8;">Szerkesztői: ${d.editorial_score} · Közösségi: ${d.community_score}</div>
          <div class="upcoming-emoji">${d.index_emoji}</div>
          <div class="upcoming-brand">${d.brand}</div>
          <h3 class="upcoming-name">${name}</h3>
          <p class="upcoming-desc">${d.index_desc}</p>
          <div class="upcoming-price">${fmtHuf(d.price_huf)} Ft <span>/ ${d.weight_kg} kg • ${fmtHuf(pkg)} Ft/kg</span></div>
        </a>`;
}

// ── index.html frissítése ─────────────────────────────────────────────────────

function updateIndex(d) {
  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  const card = buildCard(d);

  // Ha létezik már kártya ehhez a slug-hoz → cseréljük
  const existing = new RegExp(
    `        <a href="reviews/${d.slug}\\.html"[\\s\\S]*?        </a>`,
    'g'
  );
  if (existing.test(html)) {
    html = html.replace(existing, card);
    console.log(`  ✅ index.html — kártya frissítve`);
  } else {
    // Nincs még kártya → szúrjuk be a "Hamarosan" kártya elé
    const insertBefore = `        <div class="upcoming-card">\n          <div class="upcoming-soon-badge">⏳ Hamarosan</div>`;
    if (html.includes(insertBefore)) {
      html = html.replace(insertBefore, `${card}\n\n${insertBefore}`);
      console.log(`  ✅ index.html — új kártya hozzáadva`);
    } else {
      console.warn(`  ⚠️  index.html — nem találtam helyet; add hozzá manuálisan`);
    }
  }

  fs.writeFileSync(INDEX_PATH, html, 'utf8');
}

// ── sitemap.xml frissítése ────────────────────────────────────────────────────

function updateSitemap(d) {
  let xml  = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const url = `https://okosgazdireviews.hu/reviews/${d.slug}`;

  if (xml.includes(`<loc>${url}</loc>`)) {
    console.log(`  ✅ sitemap.xml — URL már szerepel`);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>`;
  xml = xml.replace('</urlset>', `${entry}\n</urlset>`);
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
  console.log(`  ✅ sitemap.xml — URL hozzáadva`);
}

// ── Hero stats javaslat ───────────────────────────────────────────────────────

function heroStatsSuggestion() {
  if (!fs.existsSync(DATA_DIR)) return;
  const files  = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const total  = files.reduce((sum, f) => {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    return sum + (parseInt(data.community_count) || 0);
  }, 0);
  console.log(`\n📊 Hero stats (JSON alapú termékek):`);
  console.log(`   Termékek: ${files.length}  |  Értékelések: ${total}`);
  console.log(`   (Adj hozzá a nem-JSON termékek számát ha szükséges)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dataFile = process.argv[2];
if (!dataFile) {
  console.error('\nHasználat: node build.js reviews/data/[slug].json\n');
  process.exit(1);
}
if (!fs.existsSync(dataFile)) {
  console.error(`\nNem találom: ${dataFile}\n`);
  process.exit(1);
}

const d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
console.log(`\n🔨 Building: ${d.product_name}`);

// 1. HTML
const html    = buildHtml(d);
const outPath = path.join(REVIEWS_DIR, `${d.slug}.html`);
fs.writeFileSync(outPath, html, 'utf8');
console.log(`  ✅ reviews/${d.slug}.html  (${Math.round(html.length / 1024)} KB)`);

// 2. Index
updateIndex(d);

// 3. Sitemap
updateSitemap(d);

// 4. Stats suggestion
heroStatsSuggestion();

console.log(`\n🚀 Kész! Commit:\n  git add reviews/${d.slug}.html index.html sitemap.xml && git commit -m "Add ${d.product_name} review" && git push\n`);
