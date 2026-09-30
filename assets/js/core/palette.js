/**
 * palette.js — turns one skin reading into a wearable palette.
 *
 * The usual approach is to sort people into twelve fixed "seasons" and hand
 * out a pre-drawn swatch card. This does the opposite: it builds the palette
 * from the person's own measured numbers, in LCh, so two people who both read
 * "warm, medium" still get different colours if their hue angle differs.
 *
 * Three quantities do all the work:
 *   hue angle h   — where their colouring sits on the warm/cool axis
 *   lightness L*  — what value range will read as contrast rather than mush
 *   chroma C*     — how much saturation their colouring can carry before the
 *                   clothes start wearing them
 */

import {
  lchToHex, fitToGamut, hexToLch, nameColour, harmony, hueGap, contrastInk,
} from './colour.js';

/* How much chroma a person's own colouring can stand next to it. Someone with
 * low-chroma colouring next to a fully saturated garment reads as the garment
 * being the subject and the person being the background. */
const CHROMA_CEILING = { muted: 30, balanced: 40, clear: 54 };

/* Neutral hue anchors. Neutrals are not actually grey — the ones that look
 * expensive carry a few points of chroma in a direction that agrees with the
 * wearer, which is the entire difference between "stone" and "grey". */
const NEUTRAL_HUE = { warm: 74, neutral: 60, cool: 255 };
const NEUTRAL_CHROMA = { warm: 7, neutral: 3, cool: 5 };

const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
/**
 * Real dye chemistry cannot hold high saturation at high lightness — past a
 * point you get fluorescence, not clothing. Pastels are pale *because* they
 * are desaturated. This ceiling keeps generated colours inside the space
 * fabric actually occupies.
 */
function wearableChroma(L, want, ceiling) {
  const headroom = L > 62 ? Math.max(0.2, 1 - (L - 62) / 36) : 1;
  return Math.min(want, ceiling) * headroom;
}

/**
 * Choose n lightness levels that stay far apart from one another. High
 * contrast colouring is served by the ends of the ladder, low contrast by its
 * middle — which is the palette obeying the same advice it gives.
 */
function pickSpreadLevels(usable, n, skinL, contrastLevel) {
  const sorted = [...usable].sort((a, b) => {
    if (contrastLevel === 'low') return Math.abs(a - skinL) - Math.abs(b - skinL);
    return Math.abs(b - skinL) - Math.abs(a - skinL);
  });
  const picked = [sorted[0]];
  const minGap = contrastLevel === 'low' ? 10 : 16;
  for (const L of sorted.slice(1)) {
    if (picked.length === n) break;
    if (picked.every((p) => Math.abs(p - L) >= minGap)) picked.push(L);
  }
  // Top up if the ladder was too crowded to satisfy the gap.
  for (const L of sorted) {
    if (picked.length === n) break;
    if (!picked.includes(L)) picked.push(L);
  }
  return picked.sort((a, b) => a - b);
}

function swatch(L, C, h, role, note) {
  const [fL, fC, fh] = fitToGamut(L, C, h);
  const hex = lchToHex(fL, fC, fh);
  const named = nameColour(hex);
  return {
    hex,
    role,
    note,
    name: named.name,
    family: named.family,
    ink: contrastInk(hex),
    lch: { L: round(fL), C: round(fC), h: round(fh) },
  };
}

/**
 * Build the palette.
 * @param {object} reading  output of colour.readSkin()
 */
export function buildPalette(reading) {
  const { lch, undertone, clarity, contrast } = reading;
  const skinH = lch.h;
  const skinL = lch.L;
  const ceiling = CHROMA_CEILING[clarity];

  // Warm colouring is flattered by hues on its own side of the wheel; cool
  // colouring by hues on the other. Neutral colouring can go either way, so it
  // is anchored to its own measured hue and simply kept there.
  const anchor = undertone === 'cool' ? (skinH + 180) % 360 : skinH;
  const nh = NEUTRAL_HUE[undertone];
  const nc = NEUTRAL_CHROMA[undertone];

  /* ---- foundation: the four pieces that should be most of the wardrobe --- */
  const foundation = [
    swatch(15, nc + 2, nh, 'foundation', 'the darkest piece — outerwear, trousers, boots'),
    swatch(34, nc + 3, nh, 'foundation', 'mid-dark — the most useful trouser colour you own'),
    swatch(72, nc + 5, nh, 'foundation', 'light neutral — shirts and knitwear'),
    swatch(92, nc + 2, nh, 'foundation', 'near-white — the clean layer under everything'),
  ];

  /* ---- grounding: the colours that are recognisably *yours* -------------- */
  // Placed a measured distance from the skin's own lightness. How far is not a
  // fixed number — it comes from the person's own hair-to-skin contrast, so
  // low-contrast colouring gets a close, tonal palette and high-contrast
  // colouring gets one that actually separates.
  const spread = contrast?.level === 'high' ? 40 : contrast?.level === 'low' ? 17 : 27;

  // The lightness levels clothing actually gets made in, minus the band around
  // the wearer's own face. Anything inside that band is the washed-out zone.
  const LADDER = [18, 30, 42, 54, 66, 78, 88];
  const deadZone = Math.max(10, spread * 0.42);
  let usable = LADDER.filter((L) => Math.abs(L - skinL) > deadZone);
  if (usable.length < 3) usable = LADDER.slice();

  // Pick levels that are far apart from each other, seeded from the end of the
  // ladder with the most room. High-contrast colouring wants the extremes;
  // low-contrast colouring wants the middle.
  const levels = pickSpreadLevels(usable, 3, skinL, contrast?.level ?? 'medium');

  const grounding = [
    swatch(levels[0], wearableChroma(levels[0], ceiling * 0.66, ceiling), (anchor + 26) % 360,
      'grounding', 'the everyday colour — works with every foundation piece'),
    swatch(levels[1], wearableChroma(levels[1], ceiling * 0.78, ceiling), (anchor - 34 + 360) % 360,
      'grounding', 'second colour — pairs with the first without matching it'),
    swatch(levels[2], wearableChroma(levels[2], ceiling * 0.52, ceiling), (anchor + 62) % 360,
      'grounding', 'the soft one — knitwear, overshirts, anything worn open'),
  ];

  /* ---- accent: one loud thing, used once per outfit ---------------------- */
  // Accents live in the middle of the lightness range, where a colour can
  // actually hold saturation. They are pushed apart in hue as well as value,
  // otherwise gamut clipping quietly collapses them into the same colour.
  const accentL = skinL > 58 ? [40, 28] : [58, 44];
  const accent = [
    swatch(accentL[0], wearableChroma(accentL[0], ceiling, ceiling), (anchor + 155) % 360,
      'accent', 'the statement piece — one per outfit, never two'),
    swatch(accentL[1], wearableChroma(accentL[1], ceiling * 0.6, ceiling), (anchor + 238) % 360,
      'accent', 'quieter accent — good for a cap, a bag, a shoe'),
  ];

  /* ---- avoid: derived, not folklore -------------------------------------- */
  // A colour within a few degrees of your skin's hue *and* within a few points
  // of its lightness has nothing to push against. Worn near the face it reads
  // as an extension of it, which is exactly what people mean when they say a
  // colour "washes you out". This is the one part of colour advice that is
  // genuinely computable, so it is computed.
  const avoid = [
    swatch(skinL, Math.min(lch.C * 0.9, ceiling), skinH, 'avoid',
      'almost exactly your skin — worn near the face it erases the edge of it'),
    swatch(skinL + (skinL > 55 ? -6 : 6), Math.min(lch.C * 0.6, ceiling * 0.5), skinH, 'avoid',
      'same hue, barely different lightness — reads as a slightly-off version of you'),
  ];

  /* ---- contrast guidance ------------------------------------------------- */
  const level = contrast?.level ?? 'medium';
  const contrastGuide = {
    high: {
      headline: 'Dress in contrast',
      body: 'Your hair and skin sit far apart in lightness, so your face already works in high contrast. Outfits built on a clear light piece against a clear dark piece will look like they belong to you. Tonal head-to-toe dressing tends to look flat on high-contrast colouring.',
      spread: 45,
    },
    medium: {
      headline: 'Dress in medium contrast',
      body: 'Your colouring sits in the middle, which is the most forgiving place to be — both tonal outfits and light-against-dark ones work. Aim for a visible step between top and bottom without going all the way to black against white.',
      spread: 28,
    },
    low: {
      headline: 'Dress tonally',
      body: 'Your hair and skin are close in lightness, so hard black-against-white contrast fights your face rather than framing it. Outfits built from two or three neighbouring shades of the same family will look considered rather than accidental.',
      spread: 16,
    },
  }[level];

  return {
    foundation,
    grounding,
    accent,
    avoid,
    contrast: contrastGuide,
    // Everything wearable, for the outfit engine to draw from.
    wearable: [...foundation, ...grounding, ...accent],
    anchorHue: round(anchor),
    ceiling: round(ceiling),
  };
}

/**
 * Three colour combinations, ranked, drawn from the palette. This is the part
 * people actually use: not a swatch card but "these three go together".
 */
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

  // Three *different kinds* of pairing, not three near-copies of the winner.
  // Left to itself the ranking just says "black goes with everything" three
  // times, which is true and useless.
  const roles = (c) => [c.a.role, c.b.role];
  const best = (fn) => all.find(fn);
  const picks = [
    {
      label: 'Safest',
      blurb: 'The pair you can wear anywhere without thinking about it.',
      combo: best((c) => roles(c).every((r) => r === 'foundation')),
    },
    {
      label: 'Yours',
      blurb: 'Reads as a deliberate choice rather than a default.',
      combo: best((c) => roles(c).includes('grounding') && roles(c).includes('foundation')),
    },
    {
      label: 'Boldest',
      blurb: 'One loud piece, everything else quiet around it.',
      combo: best((c) => roles(c).includes('accent')),
    },
  ];

  return picks
    .filter((p) => p.combo)
    .map((p, i) => ({ ...p.combo, label: p.label, blurb: p.blurb, rank: i + 1 }));
}
