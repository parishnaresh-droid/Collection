/**
 * fitting.js — the tool itself: photo in, outfits out.
 */

import { readSkin, nameColour, contrastInk, harmony } from '../core/colour.js';
import { buildPalette, buildCombinations } from '../core/palette.js';
import { classifyShape, verticalProportions, volumeBudget } from '../core/anatomy.js';
import { buildLooks } from '../core/outfit.js';
import { OCCASIONS } from '../core/wardrobe.js';
import * as photo from '../core/photo.js';
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
      placeMarkers();

      const notes = [];
      notes.push(result.face.weak
        ? 'No face found with confidence, so the sample points are a guess — drag them onto your cheek and hair.'
        : `Face located by ${result.face.source}.`);
      if (result.lightCorrected) {
        notes.push(`The light was ${Math.round(result.illuminant.strength * 100)}% off neutral, so it has been corrected before measuring.`);
      }
      notes.push('Both points are draggable.');
      $('detectNote').textContent = notes.join(' ');

      applyReading();
    } catch (err) {
      showError(err.message || 'That photo could not be read.');
    } finally {
      dropzone.style.opacity = '';
    }
  }

  /* ----------------------------------------------------------- markers -- */

  const markers = { skin: $('markerSkin'), hair: $('markerHair') };

  function placeMarkers() {
    if (!state.analysis) return;
    const { points } = state.analysis;
    for (const key of ['skin', 'hair']) {
      const el = markers[key];
      el.style.left = `${(points[key].x / view.width) * 100}%`;
      el.style.top = `${(points[key].y / view.height) * 100}%`;
      el.style.setProperty('--sw', key === 'skin' ? state.skinHex : state.hairHex);
    }
  }

  for (const key of ['skin', 'hair']) {
    const el = markers[key];
    let dragging = false;

    const move = (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * view.width;
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) * view.height;
      state.analysis.points[key] = { x, y };
      const read = photo.readPoints(
        state.analysis.imageData,
        state.analysis.points.skin,
        state.analysis.points.hair,
        state.analysis.radius
      );
      if (read.skinHex) state.skinHex = read.skinHex;
      if (read.hairHex) state.hairHex = read.hairHex;
      placeMarkers();
      applyReading();
    };

    el.addEventListener('pointerdown', (e) => {
      if (!state.analysis) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX, e.clientY); });
    el.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('pointercancel', () => { dragging = false; });

    // Keyboard nudging, because a draggable dot is useless to anyone not using
    // a pointer.
    el.addEventListener('keydown', (e) => {
      if (!state.analysis) return;
      const step = e.shiftKey ? 12 : 4;
      const p = state.analysis.points[key];
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!map[e.key]) return;
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      move(rect.left + ((p.x + map[e.key][0]) / view.width) * rect.width,
           rect.top + ((p.y + map[e.key][1]) / view.height) * rect.height);
    });
  }

  /* ----------------------------------------------------------- reading -- */

  function applyReading(note) {
    state.reading = readSkin(state.skinHex, state.hairHex || undefined);
    const palette = buildPalette(state.reading);
    state.palette = palette;

    renderReading(state.reading, palette, note);
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

  updateFrame();
  return state;
}
