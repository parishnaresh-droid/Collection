/**
 * palette.js — turns one skin reading into a wearable palette.
 *
 * The usual approach sorts people into twelve fixed "seasons" and hands out a
 * pre-drawn swatch card, which is why two people with the same label get the
 * same colours. This builds the palette from the person's own measured
 * numbers, in LCh, so a shift of a few degrees in hue angle or a few points of
 * chroma produces a visibly different wardrobe.
 *
 * Four quantities do all the work:
 *   hue angle h   — where their colouring sits on the warm/cool axis
 *   lightness L*  — what value range reads as contrast rather than mush
 *   chroma C*     — how much saturation their colouring can carry
 *   contrast ΔL*  — how far their hair sits from their skin
 *
 * Every neutral is derived from the person's own hue rather than picked from a
 * lookup table, because a three-entry lookup is exactly how everyone ends up
 * with the same greys.
 */

import {
  lchToHex, fitToGamut, hexToLch, nameColour, harmony, contrastInk, deltaE2000, hexToLab,
} from './colour.js';

/* How much chroma a person's own colouring can stand next to it. */
const CHROMA_CEILING = { muted: 28, balanced: 36, clear: 46 };

const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const wrap = (h) => ((h % 360) + 360) % 360;

/**
 * Real dye chemistry cannot hold high saturation at high lightness — past a
 * point you get fluorescence, not clothing.
 */
function wearableChroma(L, want, ceiling) {
  const headroom = L > 62 ? Math.max(0.2, 1 - (L - 62) / 36) : 1;
  return Math.min(want, ceiling) * headroom;
}

function pickSpreadLevels(usable, n, skinL, contrastLevel) {
  const sorted = [...usable].sort((a, b) => {
    if (contrastLevel === 'low') return Math.abs(a - skinL) - Math.abs(b - skinL);
    return Math.abs(b - skinL) - Math.abs(a - skinL);
  });
  const picked = [sorted[0]];
  const minGap = contrastLevel === 'low' ? 10 : 15;
  for (const L of sorted.slice(1)) {
    if (picked.length === n) break;
    if (picked.every((p) => Math.abs(p - L) >= minGap)) picked.push(L);
  }
  for (const L of sorted) {
    if (picked.length === n) break;
    if (!picked.includes(L)) picked.push(L);
  }
  return picked.sort((a, b) => a - b);
}

function swatch(L, C, h, role, note) {
  const [fL, fC, fh] = fitToGamut(L, C, wrap(h));
  const hex = lchToHex(fL, fC, fh);
  const named = nameColour(hex);
  return {
    hex, role, note,
    name: named.name,
    family: named.family,
    ink: contrastInk(hex),
    lch: { L: round(fL), C: round(fC), h: round(fh) },
  };
}

/* ------------------------------------------------------ the neutral axis --
 *
 * Neutrals are not grey. The ones that look expensive carry a few points of
 * chroma in a direction that agrees with the wearer, which is the entire
 * difference between "stone" and "grey". Both the direction and the amount are
 * derived here rather than looked up, so they move with the person.
 */
function neutralAxis(reading) {
  const { lch, undertone, chroma } = reading;
  const skinH = lch.h;

  let hue;
  if (undertone === 'warm') {
    // Sit just off the skin's own hue: sand, stone, taupe, espresso.
    hue = skinH + 8;
  } else if (undertone === 'cool') {
    // Cross to the blue-grey side, but keep a trace of where they started so
    // two cool readings do not land on the same grey.
    hue = 232 + (skinH - 35) * 1.1;
  } else {
    // Neutral colouring gets a greige: the skin's hue, pulled well toward the
    // axis and rotated a little away from literal skin colour.
    hue = skinH + 22;
  }

  // Neutral chroma scales with the person's own, and scales hard. High-chroma
  // colouring looks underdressed next to a dead grey, low-chroma colouring is
  // overwhelmed by a saturated one, and a weak coupling here is what makes
  // every palette come out the same shade of taupe.
  const base = Math.max(2, Math.min(17, chroma * 0.4));
  return { hue: wrap(hue), chroma: base };
}

/* ------------------------------------------------- black and white -------
 *
 * Asked for explicitly, and worth doing properly: these are the two colours
 * everybody already owns, so "which black" and "which white" is more useful
 * advice than any amount of palette theory.
 *
 * True black suits deep, cool-to-neutral, high-contrast colouring: the
 * colouring that can meet it. On light, warm or low-contrast colouring it wins
 * — the eye goes to the garment, the face falls back, and shadows under the
 * eyes get a helping hand. The alternatives are not consolation prizes; they
 * are the same idea at a depth the person can carry.
 */
const BLACKS = {
  'true black': { L: 8, C: 1, dh: 0,
    why: 'Full-strength black. It takes high contrast and real depth to meet it, and you have both.' },
  'ink navy': { L: 17, C: 14, dh: null, hue: 265,
    why: 'Navy this deep reads as black from across a room but keeps a trace of colour, which stops it flattening you.' },
  charcoal: { L: 24, C: 3, dh: 0,
    why: 'A step up from black in lightness, so it still anchors an outfit without out-contrasting your face.' },
  'soft black': { L: 18, C: 4, dh: 0,
    why: 'Washed or faded black rather than jet. The sharpness comes off and it stops competing with you.' },
  espresso: { L: 19, C: 14, dh: 5,
    why: 'Deep and warm. You get the weight of black with none of the coldness fighting your undertone.' },
};

function blackVerdict(reading) {
  const { undertone, depth, clarity, contrast, lch } = reading;
  const level = contrast?.level ?? 'medium';
  const deep = depth === 'deep' || depth === 'medium-deep';

  let key;
  if (level === 'high' && deep && undertone !== 'warm' && clarity !== 'muted') key = 'true black';
  else if (level === 'high' && deep && undertone === 'warm') key = 'espresso';
  else if (undertone === 'warm') key = 'espresso';
  else if (clarity === 'muted' || level === 'low') key = 'soft black';
  else if (level === 'high') key = 'ink navy';
  else key = 'charcoal';

  const spec = BLACKS[key];
  const hue = spec.hue ?? wrap(lch.h + spec.dh);
  const sw = swatch(spec.L, spec.C, hue, 'anchor', spec.why);
  sw.name = key;

  const wearsTrueBlack = key === 'true black';
  return {
    ...sw,
    verdict: wearsTrueBlack ? 'Yes — true black is yours' : `Not true black — ${key} instead`,
    body: wearsTrueBlack
      ? `${spec.why} Wear it anywhere, including right against your face.`
      : `${spec.why} If you already own black, keep it below the waist and put one of your own colours near your collar — the problem is black next to your face, not black in the outfit.`,
    alternatives: Object.entries(BLACKS)
      .filter(([k]) => k !== key)
      .slice(0, 3)
      .map(([k, v]) => {
        const alt = swatch(v.L, v.C, v.hue ?? wrap(lch.h + v.dh), 'anchor', v.why);
        alt.name = k;
        return alt;
      }),
  };
}

/**
 * White is the same question in reverse. Optic white is a cold, slightly blue
 * white; ivory and cream are warm; ecru and oyster sit between. Warm skin
 * under optic white reads yellow and tired; cool skin in cream reads sallow.
 */
const WHITES = {
  'optic white': { L: 97, C: 2, hue: 250,
    why: 'The coldest, cleanest white there is. Cool, high-contrast colouring is the only colouring it does not drain.' },
  'soft white': { L: 94, C: 3, hue: 240,
    why: 'Cool, but a step back from optic. It gives you the crispness without the glare.' },
  oyster: { L: 91, C: 5, dh: 20,
    why: 'Greyed rather than warm or cold, so it stays out of the argument your undertone is having.' },
  ivory: { L: 94, C: 9, dh: 2,
    why: 'Warm and light. It sits with your undertone instead of against it, and it is gentler at the collar than any true white.' },
  cream: { L: 90, C: 14, dh: 4,
    why: 'Deeper and warmer than ivory, which is what warm colouring with real depth needs from a white.' },
};

function whiteVerdict(reading) {
  const { undertone, depth, clarity, contrast, lch } = reading;
  const level = contrast?.level ?? 'medium';
  const light = depth === 'light' || depth === 'light-medium';

  let key;
  if (undertone === 'cool' && level === 'high' && clarity !== 'muted') key = 'optic white';
  else if (undertone === 'cool') key = 'soft white';
  else if (undertone === 'warm') key = light ? 'ivory' : 'cream';
  else key = 'oyster';

  const spec = WHITES[key];
  const sw = swatch(spec.L, spec.C, spec.hue ?? wrap(lch.h + spec.dh), 'anchor', spec.why);
  sw.name = key;

  return {
    ...sw,
    verdict: key === 'optic white' ? 'Yes — optic white is yours' : `${key[0].toUpperCase()}${key.slice(1)} over optic white`,
    body: `${spec.why} This is the shirt, the tee and the layer under everything else, so it is worth getting right once.`,
    alternatives: Object.entries(WHITES)
      .filter(([k]) => k !== key)
      .slice(0, 3)
      .map(([k, v]) => {
        const alt = swatch(v.L, v.C, v.hue ?? wrap(lch.h + v.dh), 'anchor', v.why);
        alt.name = k;
        return alt;
      }),
  };
}

/* ------------------------------------------------------------ the palette */

export function buildPalette(reading) {
  const { lch, undertone, clarity, contrast } = reading;
  const skinH = lch.h;
  const skinL = lch.L;
  const ceiling = CHROMA_CEILING[clarity];
  const level = contrast?.level ?? 'medium';

  // Warm colouring is flattered by hues on its own side of the wheel; cool
  // colouring by hues across from it. Neutral colouring is anchored to its own
  // measured hue and simply kept there.
  const anchor = undertone === 'cool' ? wrap(skinH + 180) : skinH;
  const n = neutralAxis(reading);

  const spread = level === 'high' ? 40 : level === 'low' ? 17 : 27;
  const LADDER = [16, 26, 36, 46, 56, 66, 76, 86];
  const deadZone = Math.max(9, spread * 0.4);
  let usable = LADDER.filter((L) => Math.abs(L - skinL) > deadZone);
  if (usable.length < 4) usable = LADDER.slice();

  /* ---- foundation ------------------------------------------------------- */
  // Four values across the range, each carrying the person's own neutral cast.
  const foundation = [
    swatch(14, n.chroma * 0.75 + 1, n.hue, 'foundation',
      'the darkest piece — outerwear, trousers, boots'),
    swatch(32, n.chroma * 1.5, n.hue + 7, 'foundation',
      'mid-dark — the most useful trouser colour you own'),
    swatch(68, n.chroma * 1.15, n.hue - 6, 'foundation',
      'light neutral — shirts and knitwear'),
    swatch(89, n.chroma * 0.6, n.hue + 4, 'foundation',
      'near-white — the clean layer under everything'),
  ];

  /* ---- grounding -------------------------------------------------------- */
  // Four now rather than three, spread wider in hue for deeper and clearer
  // colouring, which can hold more separation without it reading as a clash.
  // Continuous rather than bucketed, so two readings a few points apart in
  // chroma get visibly different spreads instead of landing in the same bin.
  const hueSpread = 0.62 + reading.chroma / 42;
  // A personal rotation driven by the measurements themselves. Without it the
  // hue offsets are the same constants for everybody and two similar readings
  // produce palettes more alike than the faces that made them.
  const rot = (skinH - 50) * 0.55 + (reading.ita / 90) * 11;
  const levels = pickSpreadLevels(usable, 4, skinL, level);
  const groundingPlan = [
    { dh: 24 * hueSpread, c: 0.66, note: 'the everyday colour — works with every foundation piece' },
    { dh: -36 * hueSpread, c: 0.78, note: 'second colour — pairs with the first without matching it' },
    { dh: 62 * hueSpread, c: 0.52, note: 'the soft one — knitwear, overshirts, anything worn open' },
    { dh: -74 * hueSpread, c: 0.44, note: 'the quiet one — good when two pieces already have colour' },
  ];
  const grounding = groundingPlan.map((g, i) =>
    swatch(levels[i], wearableChroma(levels[i], ceiling * g.c, ceiling), anchor + g.dh + rot, 'grounding', g.note));

  /* ---- accent ----------------------------------------------------------- */
  const accentL = skinL > 58 ? [40, 28, 50] : [58, 44, 68];
  const accentPlan = [
    { dh: 155, c: 0.86, note: 'the statement piece — one per outfit, never two' },
    { dh: 238, c: 0.6, note: 'quieter accent — good for a cap, a bag, a shoe' },
    { dh: 118, c: 0.75, note: 'the third option — when the first two feel too familiar' },
  ];
  const accent = accentPlan.map((a, i) =>
    swatch(accentL[i], wearableChroma(accentL[i], ceiling * a.c, ceiling), anchor + a.dh - rot * 0.6, 'accent', a.note));

  /* ---- avoid ------------------------------------------------------------ */
  const avoid = [
    swatch(skinL, Math.min(lch.C * 0.9, ceiling), skinH, 'avoid',
      'almost exactly your skin — worn near the face it erases the edge of it'),
    swatch(skinL + (skinL > 55 ? -6 : 6), Math.min(lch.C * 0.6, ceiling * 0.5), skinH, 'avoid',
      'same hue, barely different lightness — reads as a slightly-off version of you'),
  ];

  /* ---- contrast guidance ------------------------------------------------ */
  const contrastGuide = {
    high: {
      headline: 'Dress in contrast',
      body: 'Your hair and skin sit far apart in lightness, so your face already works in high contrast. Outfits built on a clear light piece against a clear dark piece will look like they belong to you. Tonal head-to-toe dressing tends to look flat on high-contrast colouring.',
    },
    medium: {
      headline: 'Dress in medium contrast',
      body: 'Your colouring sits in the middle, which is the most forgiving place to be — both tonal outfits and light-against-dark ones work. Aim for a visible step between top and bottom without going all the way to black against white.',
    },
    low: {
      headline: 'Dress tonally',
      body: 'Your hair and skin are close in lightness, so hard black-against-white contrast fights your face rather than framing it. Outfits built from two or three neighbouring shades of the same family will look considered rather than accidental.',
    },
  }[level];

  const black = blackVerdict(reading);
  const white = whiteVerdict(reading);

  return {
    foundation,
    grounding,
    accent,
    avoid,
    black,
    white,
    contrast: contrastGuide,
    wearable: [...foundation, ...grounding, ...accent],
    anchorHue: round(anchor),
    neutralHue: round(n.hue),
    ceiling: round(ceiling),
    // How far this palette sits from the one a neighbouring reading would get.
    // Shown in the interface so "everyone gets the same colours" is a claim
    // anyone can check rather than take on trust.
    signature: `${Math.round(skinH)}°/${Math.round(n.hue)}°/${Math.round(ceiling)}`,
  };
}

/** Three combinations, each a different kind of pairing. */
export function buildCombinations(palette) {
  const pool = palette.wearable;
  const all = [];
  const seen = new Set();

  for (const a of pool) {
    for (const b of pool) {
      if (a.hex === b.hex) continue;
      const key = [a.hex, b.hex].sort().join();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ a, b, ...harmony(a.hex, b.hex) });
    }
  }
  all.sort((x, y) => y.score - x.score);

  const roles = (c) => [c.a.role, c.b.role];
  const best = (fn) => all.find(fn);
  const picks = [
    { label: 'Safest', blurb: 'The pair you can wear anywhere without thinking about it.',
      combo: best((c) => roles(c).every((r) => r === 'foundation')) },
    { label: 'Yours', blurb: 'Reads as a deliberate choice rather than a default.',
      combo: best((c) => roles(c).includes('grounding') && roles(c).includes('foundation')) },
    { label: 'Boldest', blurb: 'One loud piece, everything else quiet around it.',
      combo: best((c) => roles(c).includes('accent')) },
  ];

  return picks
    .filter((p) => p.combo)
    .map((p, i) => ({ ...p.combo, label: p.label, blurb: p.blurb, rank: i + 1 }));
}

/**
 * How different two palettes are, averaged over their wearable colours. Used
 * by the test suite to prove that different readings really do get different
 * wardrobes rather than the same one with a new label.
 */
export function paletteDistance(a, b) {
  const n = Math.min(a.wearable.length, b.wearable.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += deltaE2000(hexToLab(a.wearable[i].hex), hexToLab(b.wearable[i].hex));
  }
  return round(sum / n, 2);
}
