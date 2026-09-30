/**
 * Validates the colour maths two ways:
 *   1. CIEDE2000 against the published Sharma/Wu/Dalal test vectors — the
 *      standard set used to certify implementations of the formula.
 *   2. The whole sRGB->LAB pipeline against the Python reference module that
 *      produced the original readings, so the browser port is provably the
 *      same maths and not a lookalike.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deltaE2000, rgbToLab, hexToLab, labToHex, labToLch, ita, itaBand,
  undertoneFromHue, harmony, nameColour, fitToGamut, inGamut, lchToHex,
} from '../assets/js/core/colour.js';

let pass = 0, fail = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok   ${label}`); }
  catch (e) { fail++; console.log(`  FAIL ${label}\n       ${e.message}`); }
};

/* -- 1. CIEDE2000 certification vectors (Sharma et al. 2005, table 1) ------ */
// [L1,a1,b1, L2,a2,b2, expected dE00]
const SHARMA = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
];

console.log('CIEDE2000 — Sharma et al. certification vectors');
SHARMA.forEach((row, i) => {
  const got = deltaE2000([row[0], row[1], row[2]], [row[3], row[4], row[5]]);
  check(`vector ${String(i + 1).padStart(2)} expects ${row[6].toFixed(4)}`, () => {
    assert.ok(Math.abs(got - row[6]) < 1e-4, `got ${got.toFixed(4)}`);
  });
});

/* -- 2. parity with the Python reference implementation -------------------- */
console.log('\nParity with tools/reference/colour.py');
const vectors = JSON.parse(readFileSync(new URL('./parity-vectors.json', import.meta.url)));
let maxLabDrift = 0, maxDeDrift = 0;
for (const v of vectors) {
  const lab = rgbToLab(...v.rgb);
  maxLabDrift = Math.max(maxLabDrift, ...lab.map((x, i) => Math.abs(x - v.lab[i])));
  maxDeDrift = Math.max(maxDeDrift, Math.abs(deltaE2000(lab, hexToLab(v.against)) - v.deltaE));
}
check(`LAB agrees across ${vectors.length} colours (max drift ${maxLabDrift.toExponential(2)})`,
  () => assert.ok(maxLabDrift < 1e-9));
check(`CIEDE2000 agrees across ${vectors.length} pairs (max drift ${maxDeDrift.toExponential(2)})`,
  () => assert.ok(maxDeDrift < 1e-9));

/* -- 3. round trips and invariants ---------------------------------------- */
console.log('\nRound trips and invariants');
check('LAB -> hex -> LAB is stable within quantisation', () => {
  for (const hex of ['#9D684E', '#2C3A4F', '#C1502E', '#FFFFFF', '#000000', '#556B2F']) {
    const lab = hexToLab(hex);
    assert.equal(labToHex(...lab), hex.toUpperCase());
  }
});
check('ITA of a mid grey is undefined-ish but finite', () => {
  assert.ok(Number.isFinite(ita(50, 0)));
});
check('ITA bands cover the whole line without gaps', () => {
  for (const a of [90, 55, 54.9, 41, 28, 10, -30, -60]) {
    assert.ok(typeof itaBand(a) === 'string');
  }
});
check('a lighter skin reading gives a higher ITA than a deeper one', () => {
  const light = hexToLab('#F0D5C2'), deep = hexToLab('#4B2E23');
  assert.ok(ita(light[0], light[2]) > ita(deep[0], deep[2]));
});
check('gamut fitting always returns a displayable colour', () => {
  for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const [L, C, hh] = fitToGamut(55, 140, h);
    assert.ok(inGamut(L, C, hh), `hue ${h} still out of gamut at C=${C}`);
  }
});
check('identical colours score no perceptual difference', () => {
  assert.ok(deltaE2000(hexToLab('#123456'), hexToLab('#123456')) < 1e-12);
});

/* -- 4. behaviour the product depends on ---------------------------------- */
console.log('\nProduct-level behaviour');
check('the near-miss hue zone scores below both tonal and analogous', () => {
  // Build three colours at the same lightness and chroma so hue is the only
  // thing that varies: 0 apart (tonal), 25 apart (near-miss), 45 (analogous).
  const base = lchToHex(48, 32, 40);
  const tonal = harmony(base, lchToHex(60, 32, 40)).parts.hue;
  const nearMiss = harmony(base, lchToHex(60, 32, 65)).parts.hue;
  const analogous = harmony(base, lchToHex(60, 32, 85)).parts.hue;
  assert.ok(nearMiss < tonal, `near-miss ${nearMiss} not below tonal ${tonal}`);
  assert.ok(nearMiss < analogous, `near-miss ${nearMiss} not below analogous ${analogous}`);
});
check('two colours at the same lightness are penalised', () => {
  const merged = harmony('#7A6A55', '#6A7A55');
  assert.ok(merged.parts.light < 0.75, `light term ${merged.parts.light}`);
});
check('neutrals partner with anything', () => {
  for (const c of ['#C1502E', '#556B2F', '#2C3A4F', '#C99A2E']) {
    assert.ok(harmony('#0A0A0B', c).score >= 70, `${c} scored ${harmony('#0A0A0B', c).score}`);
  }
});
check('undertone thresholds are ordered', () => {
  assert.equal(undertoneFromHue(70), 'warm');
  assert.equal(undertoneFromHue(51), 'neutral');
  assert.equal(undertoneFromHue(40), 'cool');
});
check('nearest-name finds the obvious answers', () => {
  assert.equal(nameColour('#000000').name, 'black');
  assert.equal(nameColour('#FFFFFF').name, 'white');
  assert.equal(nameColour('#556B2F').name, 'olive');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
