/* Sanity-check the skin model against published skin-tone scales.
 * Monk Skin Tone Scale (Google, 2022) — 10 published swatches.
 * These are a lightness ladder, so they test ITA banding; the rosy/golden
 * pairs below test the undertone axis. */
import { hexToLab, labToLch, ita, itaBand, undertoneFromHue, readSkin } from '../assets/js/core/colour.js';

const MST = ['#f6ede4','#f3e7db','#f7ead0','#eadaba','#d7bd96','#a07e56','#825c43','#604134','#3a312a','#292420'];
console.log('Monk Skin Tone scale');
console.log('  #   hex       L*     a*     b*     C*    h°      ITA°    band          undertone');
MST.forEach((hex, i) => {
  const [L,a,b] = hexToLab(hex); const [,C,h] = labToLch(L,a,b); const t = ita(L,b);
  console.log(`  ${String(i+1).padStart(2)}  ${hex}  ${L.toFixed(1).padStart(5)} ${a.toFixed(1).padStart(6)} ${b.toFixed(1).padStart(6)} ${C.toFixed(1).padStart(5)} ${h.toFixed(1).padStart(6)}  ${t.toFixed(1).padStart(6)}  ${itaBand(t).padEnd(13)} ${undertoneFromHue(h)}`);
});

console.log('\nUndertone probes (same depth, different pigment balance)');
const probes = [
  ['rosy fair',     '#F2D3CE'], ['golden fair',  '#F2DBB8'],
  ['rosy mid',      '#C48F80'], ['golden mid',   '#C79A5B'],
  ['olive mid',     '#A5895F'], ['rosy deep',    '#6B4038'],
  ['golden deep',   '#6B4A22'], ['session photo','#9D684E'],
];
for (const [label, hex] of probes) {
  const r = readSkin(hex);
  console.log(`  ${label.padEnd(14)} ${hex}  h=${r.lch.h.toFixed(1).padStart(5)}  C=${r.chroma.toFixed(1).padStart(4)}  ITA=${r.ita.toFixed(1).padStart(6)}  ${r.depth.padEnd(12)} ${r.undertone.padEnd(7)} ${r.clarity}`);
}
