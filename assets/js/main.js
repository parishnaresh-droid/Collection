/**
 * main.js — page chrome and boot.
 *
 * The fitting room lives in ui/fitting.js. Everything here is the page around
 * it: reveals, the nav, the hero field, the two live demonstrations, and the
 * wiring that lets a reading repaint the whole document.
 */

import { hexToLch, harmony, distance, hexToRgb, nameColour } from './core/colour.js';
import { STYLES } from './core/wardrobe.js';
import { createHero } from './ui/hero.js';
import { drawFigure } from './ui/figure.js';
import { initFitting } from './ui/fitting.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- reveals */
/* Browsers with scroll-driven animations handle this in CSS and never need the
   observer. This is the progressive-enhancement fallback for the rest. */
const supportsScrollTimeline = CSS.supports?.('animation-timeline: view()');
if (!supportsScrollTimeline || reduced) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  document.querySelectorAll('.reveal, .reveal-lines').forEach((el) => io.observe(el));
} else {
  // The headline is above the fold, so its line reveal has no scroll to ride.
  document.querySelectorAll('.reveal-lines').forEach((el) => el.classList.add('is-in'));
}

/* ------------------------------------------------------------------- nav */
const nav = $('nav');
const progress = $('navProgress');
const onScroll = () => {
  nav.classList.toggle('is-stuck', window.scrollY > 12);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.setProperty('--progress', max > 0 ? (window.scrollY / max).toFixed(4) : 0);
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* -------------------------------------------------- pointer-aware surfaces */
/* One listener for every card that wants to know where the cursor is, rather
   than one per element. */
if (matchMedia('(hover: hover)').matches && !reduced) {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest('.tilt, .style-card, .btn');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--tx', (x - 0.5).toFixed(3));
    el.style.setProperty('--ty', (y - 0.5).toFixed(3));
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }, { passive: true });
}

/* ------------------------------------------------------------------ hero */
const hero = createHero($('heroCanvas'));

/** A reading repaints the nav dot, the marquee dots and the hero field. */
function applyPaletteToPage(palette) {
  const root = document.documentElement.style;
  const picks = [...palette.foundation.slice(0, 2), ...palette.grounding.slice(0, 1), palette.accent[0]];
  root.setProperty('--p-1', palette.foundation[0].hex);
  root.setProperty('--p-2', palette.grounding[0].hex);
  root.setProperty('--p-3', palette.grounding[1].hex);
  root.setProperty('--p-4', palette.foundation[3].hex);
  root.setProperty('--p-accent', palette.accent[0].hex);
  root.setProperty('--palette-ready', '1');
  hero.setPalette([
    palette.accent[0].hex,
    palette.grounding[0].hex,
    palette.grounding[2].hex,
    palette.foundation[3].hex,
  ]);
}

/* ------------------------------------------------------- the colour demo */
const demoA = $('demoA');
const demoB = $('demoB');

function renderDemo() {
  const a = demoA.value.toUpperCase();
  const b = demoB.value.toUpperCase();
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  const rgbDist = Math.hypot(ra - rb, ga - gb, ba - bb);
  const de = distance(a, b);
  const h = harmony(a, b);
  const [La, Ca, ha] = hexToLch(a);
  const [Lb, Cb, hb] = hexToLch(b);

  const verdict =
    de < 2.3 ? 'the eye cannot separate these' :
    de < 10 ? 'the same colour family' :
    de < 25 ? 'clearly different, still related' : 'a real contrast';

  $('demoOut').innerHTML = [
    ['RGB distance', rgbDist.toFixed(1), 'the naive answer'],
    ['ΔE 2000', de.toFixed(2), verdict],
    ['Hue gap', `${h.hueGap}°`, h.relation],
    ['Lightness gap', `${h.deltaL}`, `L* ${La.toFixed(0)} vs ${Lb.toFixed(0)}`],
    ['Harmony', `${h.score}`, `chroma ${Ca.toFixed(0)} vs ${Cb.toFixed(0)}`],
    ['Nearest names', esc(nameColour(a).name), `and ${nameColour(b).name}`],
  ].map(([dt, dd, sub]) =>
    `<div class="metric"><dt>${dt}</dt><dd>${dd}<small>${esc(sub)}</small></dd></div>`
  ).join('');
}
demoA.addEventListener('input', renderDemo);
demoB.addEventListener('input', renderDemo);
renderDemo();

/* --------------------------------------------------- the proportion lab */
const figHeight = $('figHeight');

function renderFigure() {
  const h = parseInt(figHeight.value, 10);
  $('figHeightOut').textContent = `${h}cm`;
  const { svg, data } = drawFigure(h);
  $('figure').innerHTML = svg;

  $('figOut').innerHTML = [
    ['Halving line', `${data.halvingLine}cm`, 'from the floor'],
    ['On a size chart', `${data.halvingBodyLength}cm`, 'body length to avoid'],
    ['Aim for', `${data.hemTargets[0].bodyLengthCm}cm`, data.hemTargets[0].name],
    ['Long layers', `${data.hemTargets[2].bodyLengthCm}cm`, data.hemTargets[2].name],
  ].map(([dt, dd, sub]) =>
    `<div class="metric"><dt>${dt}</dt><dd>${dd}<small>${esc(sub)}</small></dd></div>`
  ).join('');

  $('figNote').textContent =
    `At ${h}cm, the gap between a top that works and one that halves you is about ` +
    `${Math.abs(data.halvingBodyLength - data.hemTargets[0].bodyLengthCm).toFixed(0)}cm of body length. ` +
    `That is usually one size. It is also why the same t-shirt looks considered on one person and borrowed on another.`;
}
figHeight.addEventListener('input', renderFigure);
renderFigure();

/* ------------------------------------------------------------ style grid */
$('styleGrid').innerHTML = Object.entries(STYLES).map(([id, s], i) => `
  <article class="style-card reveal" data-delay="${i % 3}">
    <h4>${esc(s.name)}</h4>
    <p class="small" style="color: var(--ink-2)">${esc(s.line)}</p>
    <p class="caption">${esc(s.description)}</p>
    <div class="style-card__pills">
      ${[s.tops[0], s.bottoms[0], s.shoes[0]].map((t) => `<span>${esc(t)}</span>`).join('')}
    </div>
    <p class="caption" style="margin-top: auto">
      Default silhouette: ${esc(s.defaultFit.top)} over ${esc(s.defaultFit.bottom)}
    </p>
  </article>`).join('');

if (!supportsScrollTimeline || reduced) {
  const io2 = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io2.unobserve(e.target); } });
  }, { threshold: 0.08 });
  document.querySelectorAll('#styleGrid .reveal').forEach((el) => io2.observe(el));
}

/* ------------------------------------------------------------------ boot */
initFitting({ onPalette: applyPaletteToPage });

// Announce the rendering path once, quietly. Useful when someone opens the
// console to find out whether the hero is a shader or a fallback.
console.info(`[Tone] hero: ${hero.mode}; scroll-driven animations: ${supportsScrollTimeline ? 'native' : 'observer fallback'}`);
