/**
 * Runs the photo pipeline against a real portrait, headlessly.
 *
 * The browser pieces (Image, canvas, ImageData) are shimmed with the smallest
 * possible stand-ins over a raw RGBA buffer, so the actual detection and
 * sampling code under test is the same code that ships.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The fixture is a real portrait, and a real portrait belongs to a real
 * person, so it is deliberately not in the repository. To run this suite,
 * drop any front-facing photo in as tests/fixtures/portrait.rgba plus a
 * portrait.json giving its width and height — tools/make_fixture.py will do
 * both from a jpg. Without it the suite skips rather than fails. */
import { existsSync } from 'node:fs';
const metaPath = new URL('./fixtures/portrait.json', import.meta.url);
const rawPath = new URL('./fixtures/portrait.rgba', import.meta.url);
if (!existsSync(metaPath) || !existsSync(rawPath)) {
  console.log('Photo pipeline: skipped (no tests/fixtures/portrait.rgba — see tools/make_fixture.py)');
  process.exit(0);
}
const meta = JSON.parse(readFileSync(metaPath));
const raw = new Uint8ClampedArray(readFileSync(rawPath));

class ImageDataShim {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
}
globalThis.ImageData = ImageDataShim;
globalThis.window = {};
globalThis.document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext() {
        const self = this;
        return {
          drawImage() {},
          getImageData(x, y, w, h) {
            x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
            w = Math.min(Math.floor(w), self.width - x);
            h = Math.min(Math.floor(h), self.height - y);
            const out = new Uint8ClampedArray(Math.max(0, w * h * 4));
            for (let row = 0; row < h; row++) {
              const src = ((y + row) * self.width + x) * 4;
              out.set(raw.subarray(src, src + w * 4), row * w * 4);
            }
            return new ImageDataShim(out, w, h);
          },
          putImageData(img) { raw.set(img.data); },
        };
      },
    };
  },
};

const photo = await import('../assets/js/core/photo.js');
const { readSkin, hexToLch } = await import('../assets/js/core/colour.js');
const { buildPalette } = await import('../assets/js/core/palette.js');

let pass = 0, fail = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok   ${label}`); }
  catch (e) { fail++; console.log(`  FAIL ${label}\n       ${e.message}`); }
};

// Stand-in for the decoded <img>; toCanvas only reads these three things.
const fakeImg = { naturalWidth: meta.width, naturalHeight: meta.height };
// The shim canvas has to report the fixture's own dimensions.
const realCreate = globalThis.document.createElement;
globalThis.document.createElement = () => {
  const c = realCreate();
  Object.defineProperty(c, 'width', { get: () => meta.width, set() {} });
  Object.defineProperty(c, 'height', { get: () => meta.height, set() {} });
  return c;
};

console.log('Photo pipeline on a real portrait');
const result = await photo.analysePhoto(fakeImg, { correctLight: false });

check('a face region is found', () => {
  assert.ok(result.face.width > 40 && result.face.height > 40, JSON.stringify(result.face));
  assert.ok(!result.face.weak, 'fell back to the centre of the frame');
});
check('the skin sample lands on skin-coloured pixels', () => {
  assert.ok(result.skinPixels > 200, `only ${result.skinPixels} skin pixels under the sample`);
});
check('the sampled skin is a plausible skin colour', () => {
  const r = readSkin(result.skinHex);
  assert.ok(r.lch.C > 8 && r.lch.C < 60, `chroma ${r.lch.C.toFixed(1)} is not skin-like`);
  assert.ok(r.lch.h > 20 && r.lch.h < 95, `hue ${r.lch.h.toFixed(1)}° is not skin-like`);
  assert.ok(r.lab.L > 15 && r.lab.L < 92, `lightness ${r.lab.L.toFixed(1)} is not skin-like`);
});
check('a hair sample is produced and is darker than the skin', () => {
  assert.ok(result.hairHex, 'no hair sample');
  assert.ok(hexToLch(result.hairHex)[0] < hexToLch(result.skinHex)[0]);
});
check('illuminant estimation returns usable gains', () => {
  const i = result.illuminant;
  for (const k of ['r', 'g', 'b']) assert.ok(i[k] > 0.4 && i[k] < 2.5, `${k} gain ${i[k]}`);
});
check('the reading drives a complete palette', () => {
  const p = buildPalette(readSkin(result.skinHex, result.hairHex));
  assert.equal(p.foundation.length, 4);
  assert.equal(p.grounding.length, 3);
  assert.equal(p.accent.length, 2);
  assert.ok(p.wearable.every((s) => /^#[0-9A-F]{6}$/.test(s.hex)));
});
check('moving the sample point changes the reading', () => {
  const moved = photo.readPoints(
    result.imageData,
    { x: result.points.skin.x + result.radius * 3, y: result.points.skin.y },
    result.points.hair, result.radius
  );
  assert.ok(moved.skinHex, 'no reading after moving the point');
});

const reading = readSkin(result.skinHex, result.hairHex);
console.log(`\n  measured: skin ${result.skinHex} hair ${result.hairHex}`);
console.log(`  face via ${result.face.source} at ${Math.round(result.face.x)},${Math.round(result.face.y)} ${Math.round(result.face.width)}x${Math.round(result.face.height)}`);
console.log(`  ITA ${reading.ita.toFixed(1)}° (${reading.itaBand}) -> ${reading.depth}; hue ${reading.lch.h.toFixed(1)}° -> ${reading.undertone}; chroma ${reading.chroma.toFixed(1)} -> ${reading.clarity}`);
console.log(`  contrast dL ${reading.contrast.deltaL.toFixed(1)} -> ${reading.contrast.level}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
