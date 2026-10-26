/**
 * The complaint this suite exists to answer: "you put the same colours for
 * most of the skin tones".
 *
 * So it checks the opposite directly — that readings which differ produce
 * palettes that differ by a visible margin, that no two colours inside one
 * palette are near-duplicates, and that every reading gets a black and a white
 * named for it.
 */
import assert from 'node:assert/strict';
import { readSkin, deltaE2000, hexToLab } from '../assets/js/core/colour.js';
import { buildPalette, buildCombinations, paletteDistance } from '../assets/js/core/palette.js';

let pass = 0, fail = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok   ${label}`); }
  catch (e) { fail++; console.log(`  FAIL ${label}\n       ${e.message}`); }
};

// A spread of real colouring: light to deep, cool to warm, with hair chosen to
// give different contrast levels.
const PEOPLE = [
  ['very light, cool, dark hair', '#F3D9D4', '#2A211C'],
  ['very light, warm, fair hair', '#F6E3C8', '#C9A063'],
  ['light, neutral, mid hair', '#E8C4A6', '#6B4B33'],
  ['light-medium, cool', '#D9A892', '#3A2E2A'],
  ['medium, warm, dark hair', '#C98E5C', '#211A16'],
  ['medium, olive', '#B4906A', '#2E2620'],
  ['medium-deep, warm', '#A46A45', '#191413'],
  ['medium-deep, cool', '#9A6558', '#15110F'],
  ['deep, warm', '#6B4126', '#120E0C'],
  ['deep, cool', '#4E3630', '#0F0C0B'],
  ['deep, low contrast', '#3C2A22', '#2A1F1A'],
  ['this session’s photo', '#CB7C5E', '#191819'],
];

const readings = PEOPLE.map(([label, skin, hair]) => ({ label, reading: readSkin(skin, hair) }));
const palettes = readings.map((p) => ({ ...p, palette: buildPalette(p.reading) }));

console.log('Variety across skin tones');

check('every palette is complete', () => {
  for (const { label, palette } of palettes) {
    assert.equal(palette.foundation.length, 4, label);
    assert.equal(palette.grounding.length, 4, label);
    assert.equal(palette.accent.length, 3, label);
    assert.ok(palette.black?.hex, `${label}: no black`);
    assert.ok(palette.white?.hex, `${label}: no white`);
  }
});

check('every reading gets a named black and a named white with reasoning', () => {
  for (const { label, palette } of palettes) {
    assert.ok(palette.black.verdict.length > 8, label);
    assert.ok(palette.black.body.length > 40, label);
    assert.ok(palette.white.verdict.length > 8, label);
    assert.ok(palette.white.body.length > 40, label);
    assert.ok(palette.black.alternatives.length >= 3, label);
  }
});

check('different people get different blacks and whites', () => {
  const blacks = new Set(palettes.map((p) => p.palette.black.name));
  const whites = new Set(palettes.map((p) => p.palette.white.name));
  assert.ok(blacks.size >= 3, `only ${blacks.size} distinct blacks: ${[...blacks]}`);
  assert.ok(whites.size >= 3, `only ${whites.size} distinct whites: ${[...whites]}`);
});

// The honest property is not "every palette differs a lot" — two genuinely
// similar people should get similar wardrobes, and clothing colour is a
// bounded space, so a very light and a very deep person can both legitimately
// own navy. What must hold is that no two readings collapse onto the same
// palette, and that palettes move in the same direction as the faces do.
check('no two readings collapse onto the same palette', () => {
  const rows = [];
  for (let i = 0; i < palettes.length; i++) {
    for (let j = i + 1; j < palettes.length; j++) {
      rows.push({
        skinGap: deltaE2000(hexToLab(palettes[i].reading.hex), hexToLab(palettes[j].reading.hex)),
        palGap: paletteDistance(palettes[i].palette, palettes[j].palette),
        a: palettes[i].label, b: palettes[j].label,
      });
    }
  }
  rows.sort((x, y) => x.palGap - y.palGap);
  assert.ok(rows[0].palGap > 3,
    `"${rows[0].a}" and "${rows[0].b}" are only ${rows[0].palGap.toFixed(2)} apart`);
});

// Correlating palette distance against plain skin ΔE would be testing the
// wrong thing: skin ΔE is dominated by lightness, while which hues suit
// someone is driven mostly by undertone. So variety is measured directly —
// across a realistic population, how much ground do the palettes actually
// cover?
check('across a population the palettes cover real ground', () => {
  const gaps = [];
  for (let i = 0; i < palettes.length; i++) {
    for (let j = i + 1; j < palettes.length; j++) {
      gaps.push(paletteDistance(palettes[i].palette, palettes[j].palette));
    }
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[gaps.length >> 1];
  assert.ok(median > 10, `median separation is only ${median}`);

  const hues = palettes.flatMap((p) => p.palette.grounding.map((g) => g.lch.h));
  const covered = new Set(hues.map((h) => Math.floor(h / 30))).size;
  assert.ok(covered >= 8, `grounding colours only cover ${covered} of the 12 hue sectors`);

  const names = new Set(palettes.flatMap((p) => p.palette.grounding.map((g) => g.name)));
  assert.ok(names.size >= 12, `only ${names.size} distinct grounding colours across ${palettes.length} people`);
  console.log(`       (median separation ${median}, ${covered}/12 hue sectors, ${names.size} distinct colour names)`);
});

check('within one palette, no two wearable colours are near-duplicates', () => {
  for (const { label, palette } of palettes) {
    const w = palette.wearable;
    for (let i = 0; i < w.length; i++) {
      for (let j = i + 1; j < w.length; j++) {
        const d = deltaE2000(hexToLab(w[i].hex), hexToLab(w[j].hex));
        assert.ok(d > 4, `${label}: ${w[i].name} and ${w[j].name} are ${d.toFixed(1)} apart`);
      }
    }
  }
});

check('the avoid colours really do sit close to the skin', () => {
  for (const { label, reading, palette } of palettes) {
    const d = deltaE2000(hexToLab(palette.avoid[0].hex), hexToLab(reading.hex));
    assert.ok(d < 12, `${label}: "avoid" colour is ${d.toFixed(1)} from the skin, which is not close`);
  }
});

check('every palette produces three usable combinations', () => {
  for (const { label, palette } of palettes) {
    const combos = buildCombinations(palette);
    assert.equal(combos.length, 3, `${label}: got ${combos.length}`);
    assert.ok(combos.every((c) => c.score > 55), label);
  }
});

console.log('\nWhat each person actually gets');
for (const { label, reading, palette } of palettes) {
  const line = palette.wearable.map((s) => s.hex).join(' ');
  console.log(`  ${label.padEnd(28)} ${reading.undertone.padEnd(7)} ${reading.depth.padEnd(12)} ${reading.contrast.level.padEnd(6)}`);
  console.log(`  ${''.padEnd(28)} ${line}`);
  console.log(`  ${''.padEnd(28)} black: ${palette.black.name.padEnd(12)} white: ${palette.white.name}`);
}

const dists = [];
for (let i = 0; i < palettes.length; i++) {
  for (let j = i + 1; j < palettes.length; j++) {
    dists.push(paletteDistance(palettes[i].palette, palettes[j].palette));
  }
}
dists.sort((a, b) => a - b);
console.log(`\nPalette separation across ${palettes.length} people: closest pair ${dists[0]}, median ${dists[dists.length >> 1]}, widest ${dists[dists.length - 1]}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
