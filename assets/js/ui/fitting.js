/**
 * fitting.js — the tool itself: photo in, outfits out.
 */

import { readSkin, nameColour, contrastInk, harmony } from '../core/colour.js';
import { buildPalette, buildCombinations } from '../core/palette.js';
import { classifyShape, verticalProportions, volumeBudget } from '../core/anatomy.js';
import { buildLooks } from '../core/outfit.js';
import { OCCASIONS } from '../core/wardrobe.js';
import * as photo from '../core/photo.js';
import { createFittingRoom } from './figure3d.js';
import { buildShareCard, downloadDataUrl } from './sharecard.js';
import { drawLook } from './garments.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** A reading to fall back on so the page can be tried without a photo. */
const SAMPLE = { skinHex: '#AE765C', hairHex: '#212225' };

export function initFitting({ onPalette } = {}) {
  const state = {
    analysis: null,
    skinHex: null,
    hairHex: null,
    reading: null,
    occasion: 'everyday',
  };

  /* ------------------------------------------------------------- photo -- */

  const dropzone = $('dropzone');
  const fileInput = $('fileInput');
  const stageWrap = $('stageWrap');
  const stage = $('stage');
  const view = $('photoCanvas');
  const errorBox = $('photoError');

  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.classList.remove('u-hidden');
  };
  const clearError = () => errorBox.classList.add('u-hidden');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((t) =>
    dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) =>
    dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.remove('is-over'); }));
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
  });

  $('useSample').addEventListener('click', () => {
    clearError();
    stageWrap.classList.add('u-hidden');
    $('photoGrid').classList.remove('has-photo');
    state.analysis = null;
    state.skinHex = SAMPLE.skinHex;
    state.hairHex = SAMPLE.hairHex;
    applyReading('Using a sample reading. Drop in a photo whenever you want your own.');
  });

  async function handleFile(file) {
    clearError();
    dropzone.style.opacity = '0.5';
    try {
      const img = await photo.loadImageFromFile(file);
      const result = await photo.analysePhoto(img, { correctLight: true });
      if (!result.skinHex) throw new Error('No skin-coloured area was found in that photo.');

      state.analysis = result;
      state.skinHex = result.skinHex;
      state.hairHex = result.hairHex;

      // Draw exactly the pixels that were measured, correction included.
      view.width = result.canvas.width;
      view.height = result.canvas.height;
      view.getContext('2d').putImageData(result.imageData, 0, 0);
      stageWrap.classList.remove('u-hidden');
      $('photoGrid').classList.add('has-photo');
      drawOverlay();

      const notes = [];
      if (result.detector === 'cascade') {
        notes.push(`Face found by the cascade${result.pupils ? ', eyes located' : ''}.`);
        if (result.pupils) {
          const tilt = Math.abs(result.pupils.angle * 180 / Math.PI);
          if (tilt > 3) notes.push(`Head tilted ${tilt.toFixed(0)}°, so the sample points are rotated to match.`);
        }
      } else if (result.detector === 'none') {
        notes.push('No face found with confidence — drag the circle onto your face.');
      } else {
        notes.push('Found by skin-region search rather than the face model; check the circles.');
      }
      if (result.lightCorrected) {
        notes.push(`Light was ${Math.round(result.illuminant.strength * 100)}% off neutral and has been corrected before measuring.`);
      }
      notes.push('Drag the large circle to move the face frame, the small one for hair.');
      $('detectNote').textContent = notes.join(' ');

      applyReading();
    } catch (err) {
      showError(err.message || 'That photo could not be read.');
      console.error('[photo]', err);
    } finally {
      dropzone.style.opacity = '';
    }
  }

  /* ------------------------------------------------- the sampling overlay -
   *
   * Five regions get measured, but five draggable handles would be a fiddly
   * mess. So the regions are drawn as a read-only overlay — you can see
   * exactly what was sampled — and two handles move them: one for the whole
   * face frame, one for the hair.
   */

  const markers = { skin: $('markerSkin'), hair: $('markerHair') };

  function faceCentre() {
    const r = state.analysis.regions;
    return {
      x: r.reduce((s, q) => s + q.x, 0) / r.length,
      y: r.reduce((s, q) => s + q.y, 0) / r.length,
    };
  }

  function drawOverlay() {
    const a = state.analysis;
    if (!a) return;
    const pct = (v, total) => `${(v / total) * 100}%`;

    let layer = stage.querySelector('.sample-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'sample-layer';
      stage.insertBefore(layer, markers.skin);
    }
    layer.innerHTML = a.regions.map((r) => `
      <span class="sample-dot${r.outlier === true ? ' is-out' : ''}"
        style="left:${pct(r.x, view.width)};top:${pct(r.y, view.height)};
               width:${pct(r.radius * 2, view.width)};aspect-ratio:1"
        title="${esc(r.label)}"></span>`).join('');

    const c = faceCentre();
    markers.skin.style.left = pct(c.x, view.width);
    markers.skin.style.top = pct(c.y, view.height);
    markers.skin.style.setProperty('--sw', state.skinHex ?? 'transparent');
    markers.hair.style.left = pct(a.hairRegion.x, view.width);
    markers.hair.style.top = pct(a.hairRegion.y, view.height);
    markers.hair.style.setProperty('--sw', state.hairHex ?? 'transparent');
  }

  function moveBy(which, dx, dy) {
    const a = state.analysis;
    if (!a) return;
    if (which === 'skin') {
      a.regions = a.regions.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
      a.face = { ...a.face, x: a.face.x + dx, y: a.face.y + dy };
    } else {
      a.hairRegion = { ...a.hairRegion, x: a.hairRegion.x + dx, y: a.hairRegion.y + dy };
    }
    const next = photo.remeasure(a.imageData, a.regions, a.hairRegion);
    if (next.skinHex) state.skinHex = next.skinHex;
    if (next.hairHex) state.hairHex = next.hairHex;
    a.measurement = next.measurement ?? a.measurement;
    drawOverlay();
    applyReading();
  }

  for (const key of ['skin', 'hair']) {
    const el = markers[key];
    let dragging = false;
    let last = null;

    const toCanvas = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * view.width,
        y: ((clientY - rect.top) / rect.height) * view.height,
      };
    };

    el.addEventListener('pointerdown', (e) => {
      if (!state.analysis) return;
      dragging = true;
      last = toCanvas(e.clientX, e.clientY);
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const now = toCanvas(e.clientX, e.clientY);
      moveBy(key, now.x - last.x, now.y - last.y);
      last = now;
    });
    const stop = () => { dragging = false; };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);

    el.addEventListener('keydown', (e) => {
      if (!state.analysis) return;
      const step = (e.shiftKey ? 14 : 5) * (view.width / 800);
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!map[e.key]) return;
      e.preventDefault();
      moveBy(key, map[e.key][0], map[e.key][1]);
    });
  }

  /* ----------------------------------------------------------- reading -- */

  function applyReading(note) {
    state.reading = readSkin(state.skinHex, state.hairHex || undefined);
    const palette = buildPalette(state.reading);
    state.palette = palette;

    renderReading(state.reading, palette, note);
    renderRegions();
    renderTryOn(palette);
    onPalette?.(palette);
    $('buildHint').textContent = 'Set your height, then build.';
    $('buildBtn').removeAttribute('disabled');
    updateFrame();
  }

  function renderReading(reading, palette, note) {
    $('readingBlock').classList.remove('u-hidden');

    $('paletteBar').innerHTML = palette.wearable
      .map((s) => `<span style="background:${s.hex}" title="${esc(s.name)} ${s.hex}"></span>`)
      .join('');

    const named = nameColour(reading.hex);
    const metrics = [
      ['Skin', `<span style="display:inline-block;width:.8em;height:.8em;border-radius:2px;background:${reading.hex};box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)"></span> ${esc(named.name)}`, reading.hex],
      ['Undertone', esc(reading.undertone), `hue ${reading.lch.h.toFixed(1)}°`],
      ['Depth', esc(reading.depth), `ITA ${reading.ita.toFixed(1)}° · ${esc(reading.itaBand)}`],
      ['Clarity', esc(reading.clarity), `chroma ${reading.chroma.toFixed(1)}`],
    ];
    if (reading.contrast) {
      metrics.push(['Contrast', esc(reading.contrast.level), `ΔL* ${reading.contrast.deltaL.toFixed(0)} vs hair`]);
    }

    $('readingGrid').innerHTML = metrics.map(([dt, dd, sub]) =>
      `<div class="metric"><dt>${dt}</dt><dd>${dd}<small>${esc(sub)}</small></dd></div>`
    ).join('');

    if (note) $('detectNote').textContent = note;
  }

  /* ------------------------------------------------------------- frame -- */

  const heightRange = $('heightRange');
  const heightOut = $('heightOut');
  const numbers = ['height', 'inseam', 'chest', 'waist', 'hip'];

  heightRange.addEventListener('input', () => {
    $('height').value = heightRange.value;
    heightOut.textContent = `${heightRange.value}cm`;
    updateFrame();
  });
  numbers.forEach((id) => $(id).addEventListener('input', updateFrame));

  function readFrame() {
    const val = (id) => {
      const v = parseFloat($(id).value);
      return Number.isFinite(v) ? v : null;
    };
    const height = val('height') ?? 175;
    const shapeInfo = classifyShape(val('chest'), val('waist'), val('hip'));
    const proportions = verticalProportions(height, val('inseam'));
    const budget = volumeBudget({
      heightCm: height,
      shape: shapeInfo?.shape ?? 'rectangle',
      drop: shapeInfo?.drop,
    });
    return { height, shapeInfo, proportions, budget };
  }

  function updateFrame() {
    const { shapeInfo, proportions, budget } = readFrame();
    const rows = [];

    if (proportions) {
      rows.push(`<div><p class="tag">Proportion</p>
        <p class="small" style="margin-top:.35rem">${esc(proportions.buildNote)}</p></div>`);
      rows.push(`<div><p class="tag">The length to avoid</p>
        <p class="small" style="margin-top:.35rem">A top hem <strong>${proportions.halvingLine}cm</strong> off the floor
        splits you into two equal halves. On a size chart that is a body length near
        <strong>${proportions.halvingBodyLength}cm</strong> — aim for about
        <strong>${proportions.hemTargets[0].bodyLengthCm}cm</strong> instead.</p></div>`);
    }
    if (shapeInfo) {
      rows.push(`<div><p class="tag">Shape</p>
        <p class="small" style="margin-top:.35rem"><strong>${cap(shapeInfo.shape)}</strong> — ${esc(shapeInfo.reason)}.
        Drop of ${shapeInfo.drop}cm, a ${esc(shapeInfo.dropClass)} cut.</p></div>`);
    } else {
      rows.push(`<div><p class="tag">Shape</p>
        <p class="small muted" style="margin-top:.35rem">Add a chest, waist and hip measurement and this becomes
        a real classification rather than an assumption.</p></div>`);
    }
    rows.push(`<div><p class="tag">Volume budget — ${budget.budget} of 6</p>
      <p class="small" style="margin-top:.35rem">${esc(budget.verdict)}${
        budget.reasons.length ? ` <span class="muted">(${esc(budget.reasons.join('; '))})</span>` : ''
      }</p></div>`);

    $('frameRead').innerHTML = rows.join('');
  }

  /* ---------------------------------------------------------- occasion -- */

  $('occasions').innerHTML = OCCASIONS.map((o) =>
    `<button class="chip" type="button" data-occ="${o.id}" aria-pressed="${o.id === state.occasion}">
      ${esc(o.label)}<small>${esc(o.blurb)}</small>
    </button>`).join('');

  $('occasions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-occ]');
    if (!btn) return;
    state.occasion = btn.dataset.occ;
    [...$('occasions').children].forEach((c) =>
      c.setAttribute('aria-pressed', String(c === btn)));
    if (!$('results').classList.contains('u-hidden')) build();
  });

  /* ------------------------------------------------------------- build -- */

  $('buildBtn').setAttribute('disabled', '');
  $('buildBtn').addEventListener('click', build);

  function build() {
    if (!state.reading) {
      $('buildHint').textContent = 'Add a photo first, or use the sample reading.';
      return;
    }
    const { shapeInfo, proportions, budget } = readFrame();
    const result = buildLooks({
      reading: state.reading,
      palette: state.palette,
      shapeInfo,
      proportions,
      budget,
      occasion: state.occasion,
    });

    renderPalette(state.palette);
    renderLooks(result, proportions);
    $('results').classList.remove('u-hidden');
    $('buildHint').textContent = 'Change the occasion or your numbers and it rebuilds.';
    requestAnimationFrame(() => {
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      animateBars();
    });
  }

  function swatchHtml(s, extra = '', label) {
    return `<div class="swatch ${extra}" style="--sw:${s.hex};--sw-ink:${contrastInk(s.hex)}">
      <span class="swatch__name">${esc(label ?? s.name)}</span>
      <span class="swatch__hex">${s.hex}</span>
      <span class="swatch__note">${esc(s.note)}</span>
    </div>`;
  }

  function renderPalette(palette) {
    $('swFoundation').innerHTML = palette.foundation.map((s) => swatchHtml(s)).join('');
    $('swGrounding').innerHTML = palette.grounding.map((s) => swatchHtml(s)).join('');
    $('swAccent').innerHTML = palette.accent.map((s) => swatchHtml(s)).join('');
    // Both of these often land on the same nearest colour name, which reads as
    // a duplicate. Label them by what they do instead.
    const avoidLabels = ['Almost exactly your skin', 'A near-miss of your skin'];
    $('swAvoid').innerHTML = palette.avoid
      .map((s, i) => swatchHtml(s, 'swatch--avoid', avoidLabels[i] ?? s.name)).join('');

    renderAnchors(palette);
    $('contrastHead').textContent = palette.contrast.headline;
    $('contrastBody').textContent = palette.contrast.body;

    $('combos').innerHTML = buildCombinations(palette).map((c) => `
      <div class="panel" style="padding: var(--s-3) var(--s-4)">
        <div class="between">
          <div class="row" style="gap:var(--s-3)">
            <span class="piece__sw" style="background:${c.a.hex}"></span>
            <span class="piece__sw" style="background:${c.b.hex}"></span>
            <span class="small" style="text-transform:capitalize">${esc(c.a.name)} + ${esc(c.b.name)}</span>
          </div>
          <span class="mono">${c.score}</span>
        </div>
        <p class="caption" style="margin-top:.4rem">${esc(c.label)} · ${esc(c.relation)}, ${c.hueGap}° apart, ΔL* ${c.deltaL}. ${esc(c.blurb)}</p>
      </div>`).join('');

    $('paletteHeading').textContent =
      `${cap(state.reading.undertone)}, ${state.reading.depth}, ${state.reading.clarity} — so this is your palette.`;
  }

  function renderLooks({ looks, occasion }, proportions) {
    $('looksLead').textContent =
      `Built for ${occasion.label.toLowerCase()}. Each one stays inside your volume budget, and every colour comes out of the palette above.`;

    $('looks').innerHTML = looks.map((look) => `
      <article class="look">
        <div class="look__stage">
          <span class="look__badge">${esc(look.label)}</span>
          <span class="look__score"><b>${look.score.overall}</b><span>match</span></span>
          <div class="flatlay">${drawLook(look, { size: 132 })}</div>
        </div>
        <div class="look__body">
          <div class="look__title">
            <p class="tag">${esc(look.style.name)}</p>
            <h3>${esc(look.blurb)}</h3>
            <p class="caption">${esc(look.silhouette)} · ${esc(look.harmony.relation === 'neutral pairing' ? 'neutral' : look.harmony.relation)} colour pairing</p>
          </div>
          <div class="pieces">
            ${look.pieces.map((p) => `
              <div class="piece">
                <span class="piece__sw" style="background:${p.colour.hex}"></span>
                <span class="piece__name"><span class="piece__label">${esc(p.name)}</span>${p.optional ? ' <em>· optional</em>' : ''}
                  <br><span class="caption">${esc(cap(p.colour.name))} · ${esc(cap(p.detail))}</span></span>
                <span class="piece__fit">${p.fit === 'n/a' ? '' : esc(p.fit)}</span>
              </div>`).join('')}
          </div>
          <div class="bars">
            ${look.score.parts.map((part) => `
              <div class="bar"><span>${esc(part.label)}</span><span class="mono">${part.value}</span>
                <span class="bar__track"><span class="bar__fill" data-v="${part.value / 100}"></span></span>
              </div>`).join('')}
          </div>
          <p class="caption">${esc(look.score.caveat)}</p>
        </div>
      </article>`).join('');

    setupFittingRoom(looks);

    // The explanations belong to the first look; the others differ only in the
    // pieces, and repeating five paragraphs three times helps nobody.
    $('why').innerHTML = looks[0].why.map((w, i) => `
      <details class="acc" ${i === 0 ? 'open' : ''}>
        <summary class="acc__q">${esc(w.q)} <span class="acc__sign" aria-hidden="true"></span></summary>
        <p class="acc__a">${esc(w.a)}</p>
      </details>`).join('');

    if (proportions && !proportions.measured) {
      $('why').insertAdjacentHTML('beforeend', `
        <p class="callout" style="margin-top: var(--s-5)">
          The length advice above uses average proportions for ${proportions.heightCm}cm.
          Measure your inside leg and add it above — it is the single field that changes
          the most.
        </p>`);
    }
  }

  function animateBars() {
    document.querySelectorAll('.bar__fill').forEach((el, i) => {
      el.style.setProperty('--v', 0);
      setTimeout(() => el.style.setProperty('--v', el.dataset.v), 60 + i * 45);
    });
  }


  /* --------------------------------------------- facial region readout -- */

  function renderRegions() {
    const grid = $('regionGrid');
    const m = state.analysis?.measurement;
    if (!m) {
      grid.innerHTML = `<p class="caption">Using a sample reading, so there is nothing to measure across. Drop in a photo and this fills with your own face.</p>`;
      return;
    }
    grid.innerHTML = m.regions.map((r) => {
      if (!r.read) {
        return `<div class="region is-out">
          <span class="region__chip" style="background:repeating-linear-gradient(45deg,#ddd 0 4px,#eee 4px 8px)"></span>
          <span class="region__name">${esc(r.label)}<small>not enough skin visible here</small></span>
          <span class="region__de"></span><span class="region__flag">skipped</span></div>`;
      }
      return `<div class="region${r.outlier ? ' is-out' : ''}">
        <span class="region__chip" style="background:${r.hex}"></span>
        <span class="region__name">${esc(r.label)}<small>${esc(r.note)}</small></span>
        <span class="region__de">ΔE ${r.deltaE}</span>
        <span class="region__flag">${r.outlier ? 'excluded' : 'counted'}</span>
      </div>`;
    }).join('') + `<p class="caption" style="margin-top:var(--s-3)">
      Across the regions that read as skin, your face varies by ΔE ${m.spread} — ${
        m.spread < 4 ? 'very even' : m.spread < 8 ? 'normal variation' : 'quite uneven, usually one-sided light'
      }. The dominant cluster covers ${Math.round(m.share * 100)}% of the sampled pixels.</p>`;
  }

  /* ------------------------------------------- your face against a colour */

  function renderTryOn(palette) {
    const stage = $('tryOnStage');
    const canvas = $('faceCrop');
    const swatches = $('tryOnSwatches');
    const a = state.analysis;

    if (!a?.face) {
      $('tryOn').classList.add('u-hidden');
      return;
    }
    $('tryOn').classList.remove('u-hidden');

    // Crop the face out of the already-corrected pixels. Nothing is uploaded;
    // this is the same canvas the measurement came from.
    const pad = a.face.size * 0.72;
    const sx = Math.max(0, a.face.x - pad);
    const sy = Math.max(0, a.face.y - pad * 1.12);
    const sw = Math.min(a.canvas.width - sx, pad * 2);
    const sh = Math.min(a.canvas.height - sy, pad * 2.1);
    const size = 320;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(a.canvas, sx, sy, sw, sh, 0, 0, size, size);

    const options = [
      ...palette.foundation.slice(0, 2).map((c) => ({ ...c, bad: false })),
      palette.white, palette.black,
      ...palette.grounding.slice(0, 2).map((c) => ({ ...c, bad: false })),
      palette.accent[0],
      ...palette.avoid.map((c) => ({ ...c, bad: true })),
    ];

    swatches.innerHTML = options.map((c, i) =>
      `<button class="tryon__sw${c.bad ? ' is-avoid' : ''}" type="button"
        style="--sw:${c.hex}" data-hex="${c.hex}" aria-pressed="${i === 0}"
        title="${esc(c.name)}${c.bad ? ' — one to avoid' : ''}"></button>`).join('');

    stage.style.setProperty('--try', options[0].hex);
    swatches.onclick = (e) => {
      const btn = e.target.closest('[data-hex]');
      if (!btn) return;
      stage.style.setProperty('--try', btn.dataset.hex);
      [...swatches.children].forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
    };
  }

  /* ------------------------------------------------- black and white ---- */

  function renderAnchors(palette) {
    const anchorHtml = (a, heading) => `
      <div class="anchor">
        <span class="anchor__chip" style="background:${a.hex}"></span>
        <div>
          <span class="anchor__verdict">${esc(heading)}</span>
          <div class="anchor__name">${esc(a.name)} <span class="mono" style="color:var(--ink-4)">${a.hex}</span></div>
          <p class="anchor__body">${esc(a.body)}</p>
          <div class="anchor__alts">
            ${a.alternatives.map((alt) =>
              `<span style="--sw:${alt.hex}"><i></i>${esc(alt.name)}</span>`).join('')}
          </div>
        </div>
      </div>`;
    $('anchors').innerHTML =
      anchorHtml(palette.black, palette.black.verdict) +
      anchorHtml(palette.white, palette.white.verdict);
  }

  /* -------------------------------------------------- the fitting room -- */

  let room = null;
  let roomLooks = [];
  let roomIndex = 0;
  let layerOn = true;

  function setupFittingRoom(looks) {
    roomLooks = looks;
    const controls = $('fitroomControls');
    controls.innerHTML = looks.map((l, i) =>
      `<button class="chip" type="button" data-look="${i}" aria-pressed="${i === roomIndex}">${esc(l.label)}</button>`).join('')
      + `<button class="chip" type="button" id="layerToggle" aria-pressed="${layerOn}">Layer on</button>`
      + `<button class="chip" type="button" id="saveCard">Save as image</button>`;

    controls.onclick = (e) => {
      const look = e.target.closest('[data-look]');
      if (look) {
        roomIndex = Number(look.dataset.look);
        [...controls.querySelectorAll('[data-look]')].forEach((c) =>
          c.setAttribute('aria-pressed', String(c === look)));
        dress();
        return;
      }
      if (e.target.closest('#saveCard')) {
        saveCard(e.target.closest('#saveCard'));
        return;
      }
      const toggle = e.target.closest('#layerToggle');
      if (toggle) {
        layerOn = !layerOn;
        toggle.setAttribute('aria-pressed', String(layerOn));
        toggle.textContent = layerOn ? 'Layer on' : 'Layer off';
        dress();
      }
    };

    renderFitroomSpecs();
    if (room) { room.setMeasurements(measurementsForRoom()); dress(); }
  }

  function measurementsForRoom() {
    const val = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
    return { heightCm: val('height') ?? 175, chest: val('chest'), waist: val('waist'), hip: val('hip') };
  }

  function renderFitroomSpecs() {
    const m = measurementsForRoom();
    const look = roomLooks[roomIndex];
    const rows = [
      ['Height', `${m.heightCm}cm`, 'the figure is built to it'],
      ['Chest', m.chest ? `${m.chest}cm` : '—', m.chest ? 'measured' : 'proportional estimate'],
      ['Waist', m.waist ? `${m.waist}cm` : '—', m.waist ? 'measured' : 'proportional estimate'],
      ['Ease', look ? `${Math.round((look.top?.fit === 'oversized' ? 5.8 : look.top?.fit === 'relaxed' ? 3.4 : look.top?.fit === 'wide' ? 5 : look.top?.fit === 'fitted' ? 1.2 : 2.2) * 10) / 10}cm` : '—', 'added by the top\u2019s fit'],
    ];
    $('fitroomSpecs').innerHTML = rows.map(([dt, dd, sub]) =>
      `<div class="metric"><dt>${dt}</dt><dd>${dd}<small>${esc(sub)}</small></dd></div>`).join('');
  }

  async function saveCard(btn) {
    const label = btn.textContent;
    btn.textContent = 'Rendering…';
    btn.disabled = true;
    try {
      const dataUrl = await buildShareCard({
        reading: state.reading,
        palette: state.palette,
        look: roomLooks[roomIndex],
        figure: room ? room.snapshot() : null,
        url: location.origin + location.pathname,
      });
      downloadDataUrl(dataUrl, 'tone-reading.png');
    } catch (err) {
      console.error('[share card]', err);
      btn.textContent = 'Could not render';
      setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2200);
      return;
    }
    btn.textContent = label;
    btn.disabled = false;
  }

  function dress() {
    if (!room) return;
    const look = roomLooks[roomIndex];
    if (!look) return;
    room.dressIn({ ...look, layerOn });
    renderFitroomSpecs();
  }

  $('fitroomStart').addEventListener('click', async () => {
    const stage = $('fitroomStage');
    if (room) return;
    stage.classList.add('is-loading');
    $('fitroomStart').innerHTML = 'Loading the renderer <span class="spinner" aria-hidden="true"></span>';
    try {
      room = await createFittingRoom(stage);
      room.setMeasurements(measurementsForRoom());
      dress();
      stage.classList.add('is-live');
    } catch (err) {
      stage.classList.remove('is-loading');
      $('fitroomNote').textContent = `The 3D view could not start: ${err.message}. Everything else on this page still works.`;
      console.error('[fitting room]', err);
    }
  });

  // Keep the figure in step with the measurements as they change.
  ['height', 'chest', 'waist', 'hip'].forEach((id) =>
    $(id).addEventListener('change', () => {
      if (room) room.setMeasurements(measurementsForRoom());
      renderFitroomSpecs();
    }));
  heightRange.addEventListener('change', () => {
    if (room) room.setMeasurements(measurementsForRoom());
    renderFitroomSpecs();
  });

  updateFrame();
  return state;
}
