// ---------- tabs ----------
const tabs = document.querySelectorAll('.tab');
const views = { new: document.getElementById('view-new'), saved: document.getElementById('view-saved'), compare: document.getElementById('view-compare') };

tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
  t.classList.add('active'); t.setAttribute('aria-selected', 'true');
  Object.values(views).forEach(v => v.hidden = true);
  views[t.dataset.view].hidden = false;
  if (t.dataset.view === 'saved') loadSavedProfiles();
  if (t.dataset.view === 'compare') loadComparePickers();
}));

// ---------- helpers ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- pill groups (single-select) ----------
document.querySelectorAll('.pill-group[data-single="true"]').forEach(group => {
  const hidden = document.getElementById(group.dataset.name + '_input');
  group.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      group.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      hidden.value = pill.dataset.value;
    });
  });
});

// ---------- style grid (multi-select) ----------
const selectedStyles = new Set();
async function loadStyleGrid() {
  const grid = document.getElementById('style-grid');
  try {
    const res = await fetch('/api/styles');
    const list = await res.json();
    grid.innerHTML = list.map(s => `
      <button type="button" class="style-card" data-key="${s.key}">
        <p class="sc-name">${escapeHtml(s.label)}</p>
        <p class="sc-desc">${escapeHtml(s.description)}</p>
      </button>
    `).join('');
    grid.querySelectorAll('.style-card').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.key;
        if (selectedStyles.has(key)) { selectedStyles.delete(key); card.classList.remove('selected'); }
        else { selectedStyles.add(key); card.classList.add('selected'); }
      });
    });
  } catch { grid.innerHTML = '<p class="empty-state">Could not load styles.</p>'; }
}
loadStyleGrid();

// ---------- wizard navigation ----------
const steps = Array.from(document.querySelectorAll('.wizard-step'));
const progressSteps = Array.from(document.querySelectorAll('.wp-step'));
let currentStep = 1;
const totalSteps = steps.length;

function showStep(n) {
  steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
  progressSteps.forEach(p => {
    const s = Number(p.dataset.step);
    p.classList.toggle('active', s === n);
    p.classList.toggle('done', s < n);
  });
  document.getElementById('wiz-back').hidden = n === 1;
  document.getElementById('wiz-next').hidden = n === totalSteps;
  document.getElementById('submit-btn').hidden = n !== totalSteps;
  currentStep = n;
}

function validateStep(n) {
  const step = steps.find(s => Number(s.dataset.step) === n);
  const inputs = step.querySelectorAll('input[required]');
  for (const inp of inputs) {
    if (!inp.value) { inp.reportValidity(); return false; }
  }
  return true;
}

document.getElementById('wiz-next').addEventListener('click', () => {
  if (!validateStep(currentStep)) return;
  if (currentStep < totalSteps) showStep(currentStep + 1);
});
document.getElementById('wiz-back').addEventListener('click', () => {
  if (currentStep > 1) showStep(currentStep - 1);
});

// ---------- style profile + outfit rendering ----------
function outfitCardHtml(o) {
  const tpl = document.getElementById('outfit-card-template').content.cloneNode(true);
  const card = tpl.querySelector('.outfit-card');
  card.style.setProperty('--swatch-color', o.top_hex);
  tpl.querySelector('.outfit-swatch').style.background = o.top_hex;
  tpl.querySelector('.top-color').textContent = `${o.top_color} top`;
  tpl.querySelector('.pairing').textContent = `${o.bottom} \u00b7 ${o.shoes}`;
  const rp = tpl.querySelector('.real-products');
  if (o.real_products && o.real_products.length) {
    rp.innerHTML = o.real_products.map(p => `
      <a class="real-product" href="${p.url}" target="_blank" rel="noopener">
        ${p.image_url
          ? `<img class="rp-thumb" src="${p.image_url}" alt="" loading="lazy">`
          : `<span class="rp-thumb-placeholder" style="--swatch-color:${o.top_hex}"></span>`}
        <span class="rp-body">
          <span class="rp-title"><span class="stock-dot ${p.available ? 'in' : 'out'}"></span>${escapeHtml(p.title)}</span>
        </span>
        <span class="rp-price">${p.price ? '$' + p.price.toFixed(2) : ''}</span>
      </a>
    `).join('');
  } else {
    rp.innerHTML = `<p class="no-real-products">No live stock cached yet for this color \u2014 try "Check real stock" above</p>`;
  }
  return card;
}

function styleProfileHtml(sp) {
  if (!sp) return '';
  return `
    <div class="style-profile" style="--sp-color:${sp.top.hex}">
      <p class="sp-eyebrow">Your style profile</p>
      <h2 class="sp-title">${escapeHtml(sp.style_label)}</h2>
      <p class="sp-silhouette">${escapeHtml(sp.silhouette)} &middot; ${escapeHtml(sp.recommended_fit)} fit</p>
      <div class="sp-grid">
        <div class="sp-piece top">
          <p class="sp-piece-label">Top</p>
          <p class="sp-piece-value">${escapeHtml(sp.top.garment)}, ${escapeHtml(sp.top.colour)}</p>
        </div>
        <div class="sp-piece">
          <p class="sp-piece-label">Bottom</p>
          <p class="sp-piece-value">${escapeHtml(sp.bottom.garment)}</p>
        </div>
        <div class="sp-piece">
          <p class="sp-piece-label">Shoes</p>
          <p class="sp-piece-value">${escapeHtml(sp.shoes.garment)}</p>
        </div>
        ${sp.layer ? `<div class="sp-piece"><p class="sp-piece-label">Layer</p><p class="sp-piece-value">${escapeHtml(sp.layer)}</p></div>` : ''}
      </div>
      <p class="sp-why">${escapeHtml(sp.why)}</p>
    </div>
  `;
}

function paletteBandHtml(outfits) {
  return `<div class="palette-showcase"><div class="palette-band">${outfits.map(o => `
    <div class="palette-band-swatch" style="background:${o.top_hex}">
      <span class="pb-name">${escapeHtml(o.top_color)}</span>
    </div>
  `).join('')}</div></div>`;
}

function renderProfileResult(container, data, isCompare) {
  const combos = (data.style_profile && data.style_profile.combos) || [];
  container.innerHTML = `
    ${styleProfileHtml(data.style_profile)}
    ${combos.length && !isCompare ? showroomHtml(combos) : ''}
    ${combos.length ? `<div class="result-block chapter">
      <div class="chapter-head"><span class="chapter-num">Ch. 02</span><div>
        <h2 class="chapter-title">Every look, flat</h2>
        <p class="chapter-lede">The same combinations laid out as garments, so you can scan colour relationships at a glance.</p>
      </div></div>
      <p class="meta">Every pairing chosen by measured colour distance, not guesswork.</p>
      <div class="combo-grid">${combos.map((c,i)=>comboCardHtml(c,i)).join('')}</div>
    </div>` : ''}
    <div class="result-block chapter">
      <div class="chapter-head"><span class="chapter-num">Ch. 03</span><div>
        <h2 class="chapter-title">${escapeHtml(data.name)}&rsquo;s palette</h2>
        <p class="chapter-lede">Sampled from your photo, converted to CIE L*a*b*, matched against a 70-colour reference set.</p>
      </div></div>
      <div class="skin-row">
        <span class="skin-swatch" style="background:${data.skin.hex}"></span>
        <div>
          <p class="hex mono">${data.skin.hex}</p>
          <p class="meta">${data.skin.undertone} undertone &middot; ${data.skin.depth} depth${data.skin.nearest_name ? ` &middot; closest named colour: ${escapeHtml(data.skin.nearest_name)}` : ''}</p>
          ${data.skin.lab ? `<dl class="lab-readout">
            <div class="lab-item"><dt>L*</dt><dd>${data.skin.lab.L}</dd></div>
            <div class="lab-item"><dt>a*</dt><dd>${data.skin.lab.a}</dd></div>
            <div class="lab-item"><dt>b*</dt><dd>${data.skin.lab.b}</dd></div>
            ${data.skin.nearest_delta_e !== undefined ? `<div class="lab-item"><dt>&Delta;E</dt><dd>${data.skin.nearest_delta_e}</dd></div>` : ''}
          </dl>` : ''}
        </div>
      </div>
      ${paletteBandHtml(data.outfits)}
    </div>
    <div class="result-block chapter">
      <div class="chapter-head"><span class="chapter-num">Ch. 04</span><div>
        <h2 class="chapter-title">Body shape</h2>
        <p class="chapter-lede">Classified from chest, waist and hip ratios &mdash; the same measurements a tailor takes.</p>
      </div></div>
      <p class="shape-name">${data.shape.shape}</p>
      <p class="meta">${data.shape.reason}</p>
      <div class="works-avoid">
        <div><p class="label works">Works</p><ul>${data.style_works.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>
        <div><p class="label avoid">Avoid</p><ul>${data.style_avoid.map(a => `<li>${escapeHtml(a)}</li>`).join('')}</ul></div>
      </div>
    </div>
    <div class="result-block chapter">
      <div class="chapter-head"><span class="chapter-num">Ch. 05</span><div>
        <h2 class="chapter-title">All outfit options</h2>
      </div></div>
      <p class="meta">Palette match: ${data.palette_label}</p>
      <div class="fan-deck" id="outfit-cards-${data.id}"></div>
    </div>
  `;
  const deck = container.querySelector(`#outfit-cards-${data.id}`);
  data.outfits.forEach(o => deck.appendChild(outfitCardHtml(o)));
  if (combos.length) initShowroom(combos, container);
}

// ---------- form submit ----------
const form = document.getElementById('analyze-form');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const results = document.getElementById('results');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Reading...';
  startAnalysingAnimation();
  try {
    const fd = new FormData(form);
    selectedStyles.forEach(k => fd.append('style_preference', k));
    const res = await fetch('/api/analyze', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { errorMsg.textContent = data.error || 'Something went wrong'; return; }
    await finishAnalysingAnimation();
    renderProfileResult(results, data);
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth' });
    refreshSavedCount();
  } catch (err) {
    errorMsg.textContent = 'Could not reach the server. Try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Read my fit';
  }
});

// ---------- catalog status ----------
async function checkCatalogStatus() {
  try {
    const res = await fetch('/api/catalog-status');
    const data = await res.json();
    const meta = document.getElementById('catalog-meta');
    if (data.n > 0) {
      meta.textContent = `${data.n} live products cached \u00b7 last checked ${new Date(data.last_fetched).toLocaleString()}`;
    } else {
      meta.textContent = 'No live stock checked yet \u2014 outfits will show style guidance only until you run a check';
    }
  } catch { /* non-fatal */ }
}

document.getElementById('refresh-catalog-btn').addEventListener('click', async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = 'Checking stores...';
  try {
    const res = await fetch('/api/refresh-catalog', { method: 'POST' });
    const data = await res.json();
    if (data.error) {
      document.getElementById('catalog-meta').textContent = `Check failed: ${data.error}`;
    } else {
      document.getElementById('catalog-meta').textContent = `${data.matched} live products found across ${data.stores.length} stores, just now`;
    }
  } catch {
    document.getElementById('catalog-meta').textContent = 'Could not reach the server to check stock';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check real stock';
  }
});
checkCatalogStatus();

// ---------- saved profiles ----------
async function refreshSavedCount() {
  try {
    const res = await fetch('/api/profiles');
    const data = await res.json();
    document.getElementById('saved-count').textContent = data.length || '';
  } catch { /* non-fatal */ }
}

async function loadSavedProfiles() {
  const list = document.getElementById('saved-list');
  const empty = document.getElementById('saved-empty');
  const res = await fetch('/api/profiles');
  const profiles = await res.json();
  if (!profiles.length) { list.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;
  list.innerHTML = profiles.map(p => `
    <button class="profile-card" data-id="${p.id}">
      <span class="skin-swatch" style="background:${p.skin_hex}"></span>
      <p class="p-name">${escapeHtml(p.name)}</p>
      <p class="p-shape">${p.shape}</p>
    </button>
  `).join('');
  list.querySelectorAll('.profile-card').forEach(el => el.addEventListener('click', async () => {
    const res = await fetch(`/api/profiles/${el.dataset.id}`);
    const data = await res.json();
    const existing = document.getElementById('profile-detail');
    if (existing) existing.remove();
    const container = document.createElement('div');
    container.className = 'card';
    container.id = 'profile-detail';
    document.getElementById('view-saved').appendChild(container);
    renderProfileResult(container, data);
    container.scrollIntoView({ behavior: 'smooth' });
  }));
}

// ---------- compare ----------
async function loadComparePickers() {
  const res = await fetch('/api/profiles');
  const profiles = await res.json();
  const opts = profiles.map(p => `<option value="${p.id}">${escapeHtml(p.name)} \u2014 ${p.shape}</option>`).join('');
  document.getElementById('compare-a').innerHTML = '<option value="">Choose a person...</option>' + opts;
  document.getElementById('compare-b').innerHTML = '<option value="">Choose a person...</option>' + opts;
}

async function tryCompare() {
  const a = document.getElementById('compare-a').value;
  const b = document.getElementById('compare-b').value;
  const empty = document.getElementById('compare-empty');
  const resultEl = document.getElementById('compare-result');
  if (!a || !b) { empty.hidden = false; resultEl.hidden = true; return; }
  const res = await fetch(`/api/compare?a=${a}&b=${b}`);
  const data = await res.json();
  if (!res.ok) { empty.hidden = false; empty.textContent = data.error; return; }
  empty.hidden = true;
  resultEl.hidden = false;
  resultEl.innerHTML = '<div class="compare-col" id="compare-col-a"></div><div class="compare-col" id="compare-col-b"></div>';
  renderProfileResult(document.getElementById('compare-col-a'), data.a, true);
  renderProfileResult(document.getElementById('compare-col-b'), data.b, true);
}

document.getElementById('compare-a').addEventListener('change', tryCompare);
document.getElementById('compare-b').addEventListener('change', tryCompare);

refreshSavedCount();


// ---------- analysis transition ----------
const ANALYSIS_STEPS = [
  'Detecting face region\u2026',
  'Sampling skin pixels\u2026',
  'Converting to CIE L*a*b*\u2026',
  'Matching palette by \u0394E\u2026',
  'Building your looks\u2026',
];
let analysisTimer = null;

function startAnalysingAnimation() {
  const results = document.getElementById('results');
  results.hidden = false;
  results.innerHTML = `<div class="analysing">
      <div class="analysing-ring"></div>
      <p class="analysing-step" id="analysing-step">${ANALYSIS_STEPS[0]}</p>
    </div>`;
  results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  let i = 0;
  analysisTimer = setInterval(() => {
    i = (i + 1) % ANALYSIS_STEPS.length;
    const el = document.getElementById('analysing-step');
    if (el) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      el.textContent = ANALYSIS_STEPS[i];
    }
  }, 620);
}

function finishAnalysingAnimation() {
  if (analysisTimer) { clearInterval(analysisTimer); analysisTimer = null; }
  return new Promise(r => setTimeout(r, 260));
}


// ---------- 3D showroom ----------
function showroomHtml(combos) {
  return `
  <div class="chapter-head" style="margin-top:36px"><span class="chapter-num">Ch. 01</span><div><h2 class="chapter-title">The fitting room</h2><p class="chapter-lede">Your looks rendered in real 3D. Drag the model to rotate.</p></div></div>
  <section class="showroom" id="showroom">
    <div class="stage" id="stage">
      <div class="stage-fallback" id="stage-fallback">Preparing the 3D fitting room\u2026</div>
      <span class="stage-hint">Drag to rotate</span>
    </div>
    <div class="showroom-panel">
      <p class="showroom-eyebrow">The fitting room</p>
      <h2 class="showroom-title">See it worn</h2>
      <p class="showroom-sub">Each look rendered in 3D using your actual palette colours. Pick a look to dress the model.</p>
      <div class="look-switcher" id="look-switcher">
        ${combos.map((c, i) => `
          <button class="look-btn ${i === 0 ? 'active' : ''}" data-look="${i}" style="--look-accent:${c.top.hex}">
            <span class="look-btn-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="look-chips">
              <span class="look-chip" style="background:${c.top.hex}"></span>
              <span class="look-chip" style="background:${c.bottom.hex}"></span>
              <span class="look-chip" style="background:${c.shoes.hex}"></span>
            </span>
            <span class="look-btn-label">${escapeHtml(c.name)}</span>
          </button>`).join('')}
      </div>
      <p class="showroom-why" id="showroom-why">${escapeHtml(combos[0].why)}</p>
    </div>
  </section>`;
}

function initShowroom(combos, scope) {
  const rootEl = scope || document;
  const stage = rootEl.querySelector('.stage');
  const fallback = rootEl.querySelector('.stage-fallback');
  if (!stage) return;

  const boot = () => {
    try {
      if (window.Mannequin && window.Mannequin.reset) window.Mannequin.reset();
      const ok = window.Mannequin.init(stage);
      if (ok === false || typeof THREE === 'undefined') {
        fallback.textContent = 'Your browser could not start 3D rendering \u2014 the flat views below show every look.';
        return;
      }
      if (fallback) fallback.remove();
      window.Mannequin.setOutfit(combos[0]);
    } catch (err) {
      console.error('3D fitting room failed:', err);
      fallback.textContent = '3D unavailable (' + (err && err.message ? err.message : 'unknown') + ') \u2014 flat views below show every look.';
    }
  };

  if (typeof THREE === 'undefined') {
    // three.js still loading — wait for it
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (typeof THREE !== 'undefined') { clearInterval(wait); boot(); }
      else if (tries > 60) {
        clearInterval(wait);
        fallback.textContent = 'Could not load the 3D renderer \u2014 the flat views below show every look.';
      }
    }, 100);
  } else boot();

  const switcher = rootEl.querySelector('.look-switcher');
  if (!switcher) return;
  switcher.addEventListener('click', e => {
    const btn = e.target.closest('.look-btn');
    if (!btn) return;
    const idx = Number(btn.dataset.look);
    switcher.querySelectorAll('.look-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.Mannequin.setOutfit(combos[idx]);
    window.Mannequin.resumeAutoRotate();
    const why = rootEl.querySelector('.showroom-why');
    why.style.animation = 'none'; void why.offsetWidth; why.style.animation = '';
    why.textContent = combos[idx].why;
  });
}
