/**
 * outfit.js — where colour and anatomy become an actual outfit.
 *
 * The product promise is that you do not have to know anything about clothes.
 * So this module chooses the style rather than asking, and every choice it
 * makes comes back with the reason attached — because a recommendation you
 * cannot interrogate is just a guess wearing a confident font.
 */

import { harmony, distance } from './colour.js';
import { STYLES, STYLE_IDS, OCCASIONS, fitForGarment } from './wardrobe.js';
import { SHAPE_STRATEGY, FITS, checkSilhouette } from './anatomy.js';

const pick = (arr, i) => arr[i % arr.length];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------- choosing a style */

/**
 * Rank the archetypes for this person and this occasion. The user never has to
 * answer "what's your aesthetic?", which is the question they came here
 * precisely because they cannot answer.
 */
export function rankStyles({ occasion, budget, shape, preferred = [] }) {
  const occ = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];

  return STYLE_IDS
    .map((id) => {
      const s = STYLES[id];
      let score = 50;
      const why = [];

      // Does it belong at this occasion at all?
      if (occ.formality < s.formality[0] || occ.formality > s.formality[1]) {
        score -= 45;
      } else {
        const centre = (s.formality[0] + s.formality[1]) / 2;
        score += 22 - Math.abs(centre - occ.formality) * 7;
        why.push(`sits right for ${occ.label.toLowerCase()}`);
      }

      // Does its natural silhouette fit inside the frame's volume budget?
      const sil = checkSilhouette(s.defaultFit.top, s.defaultFit.bottom, budget);
      if (sil.ok) { score += 16; why.push('its default proportions suit your frame'); }
      else score -= 14;

      // Does it do what this body shape needs?
      const strat = SHAPE_STRATEGY[shape];
      if (strat) {
        const wantsVolume = strat.volume >= 3;
        const isVoluminous = sil.spend >= 5;
        if (wantsVolume === isVoluminous) { score += 10; why.push('matches what your shape asks for'); }
      }

      if (preferred.includes(id)) { score += 30; why.push('you picked it'); }

      return { id, ...s, score, why };
    })
    .sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------ building the looks */

/**
 * Each register names the exact palette slot every garment draws from, rather
 * than "a neutral" — otherwise all three looks quietly converge on the same
 * safest colour and the variety is a lie.
 * Slots are [group, index]; index is clamped, so short groups still work.
 */
const REGISTERS = [
  {
    id: 'easiest',
    label: 'Easiest',
    blurb: 'If you only wear one of these, wear this one.',
    slots: { top: ['foundation', 2], bottom: ['foundation', 0], shoes: ['foundation', 1], layer: ['foundation', 3] },
  },
  {
    id: 'sharper',
    label: 'Sharper',
    blurb: 'Same amount of effort, reads more deliberate.',
    slots: { top: ['grounding', 1], bottom: ['foundation', 1], shoes: ['foundation', 0], layer: ['foundation', 2] },
  },
  {
    id: 'bolder',
    label: 'Bolder',
    blurb: 'One piece doing the talking. Everything else stays quiet.',
    slots: { top: ['accent', 0], bottom: ['foundation', 0], shoes: ['foundation', 1], layer: ['grounding', 2] },
  },
];

const slotColour = (palette, [group, i]) => {
  const pool = palette[group]?.length ? palette[group] : palette.foundation;
  return pool[Math.min(i, pool.length - 1)];
};

/** Occasion gate. Above a certain formality some garments simply do not belong,
 *  whatever the colour maths says about them. */
const TOO_CASUAL = /jean|sneaker|runner|hoodie|sweat|cargo|track|canvas|graphic|tee\b|cap|beanie|jersey/i;

function garmentsFor(list, formality) {
  if (formality < 5) return list;
  const allowed = list.filter((g) => !TOO_CASUAL.test(g));
  return allowed.length ? allowed : list;
}

/**
 * Trim a style's default fits until they fit inside the frame's volume budget.
 * Volume comes out of the garment that can afford to lose it, which is always
 * the one the style cares about least.
 */
function resolveFits(style, budget) {
  let top = style.defaultFit.top;
  let bottom = style.defaultFit.bottom;
  const order = ['oversized', 'wide', 'relaxed', 'straight', 'fitted'];
  const down = (f) => order[Math.min(order.indexOf(f) + 1, order.length - 1)];

  let guard = 0;
  while (!checkSilhouette(top, bottom, budget).ok && guard++ < 6) {
    const tv = FITS[top]?.volume ?? 2;
    const bv = FITS[bottom]?.volume ?? 2;
    if (bv >= tv) bottom = down(bottom);
    else top = down(top);
  }
  return { top, bottom, check: checkSilhouette(top, bottom, budget) };
}

/**
 * The whole recommendation.
 */
export function buildLooks({
  reading, palette, shapeInfo, proportions, budget, occasion = 'everyday', preferred = [],
}) {
  const ranked = rankStyles({ occasion, budget, shape: shapeInfo?.shape, preferred });
  const occ = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];
  const strat = SHAPE_STRATEGY[shapeInfo?.shape] ?? SHAPE_STRATEGY.rectangle;
  const hemTarget = proportions?.hemTargets?.[0];

  const looks = REGISTERS.map((reg, idx) => {
    const style = ranked[Math.min(idx, ranked.length - 1)];
    const fits = resolveFits(style, budget);

    // Colours come from named palette slots so the three looks stay genuinely
    // different rather than all drifting to the safest neutral.
    let topColour = slotColour(palette, reg.slots.top);
    let bottomColour = slotColour(palette, reg.slots.bottom);
    const shoeColour = slotColour(palette, reg.slots.shoes);
    const layerColour = slotColour(palette, reg.slots.layer);

    // Deep colouring is framed by a lighter piece at the neckline, light
    // colouring by a darker one. If the register's top lands on the wrong side
    // of the face, swap it with the bottom rather than overriding the palette.
    const wantLightTop = reading.lch.L < 52;
    if (
      reg.id !== 'bolder' &&
      ((wantLightTop && topColour.lch.L < bottomColour.lch.L) ||
        (!wantLightTop && topColour.lch.L > bottomColour.lch.L))
    ) {
      [topColour, bottomColour] = [bottomColour, topColour];
    }

    const pair = harmony(topColour.hex, bottomColour.hex);

    const tops = garmentsFor(style.tops, occ.formality);
    const bottoms = garmentsFor(style.bottoms, occ.formality);
    const shoeList = garmentsFor(style.shoes, occ.formality);

    const topName = pick(tops, idx);
    const bottomName = pick(bottoms, idx);

    const top = {
      slot: 'Top',
      name: topName,
      fit: fitForGarment(topName, fits.top),
      colour: topColour,
      detail: hemTarget
        ? `Hem should land ${hemTarget.name} — about a ${hemTarget.bodyLengthCm}cm body length on a size chart.`
        : 'Hem at the top of the seat.',
    };
    const bottom = {
      slot: 'Bottom',
      name: bottomName,
      fit: fitForGarment(bottomName, fits.bottom),
      colour: bottomColour,
      detail: `${proportions?.riseAdvice?.split('.')[0] ?? 'Mid rise'}. No break at the shoe keeps the leg line unbroken.`,
    };
    const shoes = {
      slot: 'Shoes',
      name: pick(shoeList, idx),
      fit: 'n/a',
      colour: shoeColour,
      detail:
        shoeColour.lch.L < bottomColour.lch.L
          ? 'Darker than the trouser, so the eye stops at the hem rather than at the floor.'
          : 'Lighter than the trouser, which lifts the whole silhouette upward.',
    };
    const layer = {
      slot: 'Layer',
      name: pick(style.layers, idx),
      fit: fits.top === 'oversized' ? 'straight' : 'relaxed',
      colour: layerColour,
      detail: strat.layer,
      optional: true,
    };

    const score = scoreLook({ top, bottom, shoes, pair, fits, budget, style, occ });

    return {
      ...reg,
      style: { id: style.id, name: style.name, line: style.line, description: style.description },
      pieces: [top, bottom, shoes, layer],
      top, bottom, shoes, layer,
      accessories: style.accessories,
      silhouette: `${cap(top.fit)} top over ${bottom.fit} bottom`,
      volume: fits.check,
      harmony: pair,
      score,
      why: explain({ reading, palette, shapeInfo, proportions, strat, top, bottom, shoes, pair, fits, occ, style }),
    };
  });

  return { ranked, looks, occasion: occ };
}

/* ----------------------------------------------------------------- scoring */

/**
 * A confidence figure, presented as one. There is no ground truth for "does
 * this outfit suit him", so this is the model showing its own workings rather
 * than claiming a measurement.
 */
function scoreLook({ top, bottom, shoes, pair, fits, budget, style, occ }) {
  const colour = pair.score;
  const proportion = fits.check.ok
    ? 100 - Math.max(0, (fits.check.spend - budget.budget + 2) * 6)
    : 58;
  const separation = Math.min(100, 55 + distance(bottom.colour.hex, shoes.colour.hex) * 1.6);
  const occasionFit =
    occ.formality >= style.formality[0] && occ.formality <= style.formality[1] ? 96 : 62;

  const overall = Math.round(
    colour * 0.34 + proportion * 0.3 + occasionFit * 0.22 + separation * 0.14
  );

  return {
    overall,
    parts: [
      { label: 'Colour harmony', value: Math.round(colour) },
      { label: 'Proportion', value: Math.round(proportion) },
      { label: 'Right for the occasion', value: Math.round(occasionFit) },
      { label: 'Piece separation', value: Math.round(separation) },
    ],
    caveat:
      'A confidence score from the rules above, not a measurement. It tells you how well this outfit satisfies the constraints — taste is still yours.',
  };
}

/* ------------------------------------------------------------ explanations */

function explain({ reading, shapeInfo, proportions, strat, top, bottom, shoes, pair, fits, occ, style }) {
  const out = [];

  out.push({
    q: 'Why this colour near your face',
    a: `Your skin reads ${reading.undertone} at ${reading.depth} depth, which puts its hue angle at ${reading.lch.h.toFixed(0)}°. ${cap(top.colour.name)} sits at ${top.colour.lch.h}° and a lightness of ${top.colour.lch.L} against your ${reading.lch.L.toFixed(0)} — far enough apart that your face stays the brightest thing in the frame rather than blending into the shirt.`,
  });

  out.push({
    q: 'Why these two colours together',
    a: `${cap(top.colour.name)} and ${bottom.colour.name} are ${pair.hueGap}° apart on the colour wheel — a ${pair.relation === "neutral pairing" ? "neutral" : pair.relation} pairing — with ${pair.deltaL} points of lightness between them. That gap is what stops the outfit reading as one block of colour from a distance.`,
  });

  if (shapeInfo) {
    out.push({
      q: 'Why this cut',
      a: `Your chest-to-waist drop is ${shapeInfo.drop}cm, which classes as a ${shapeInfo.dropClass} cut — ${shapeInfo.reason}. The job for that shape is to ${strat.goal}, so: ${strat.top.toLowerCase()}, and ${strat.bottom.toLowerCase()}.`,
    });
  }

  if (proportions) {
    out.push({
      q: 'Why this length',
      a: `At ${proportions.heightCm}cm, a top hem landing ${proportions.halvingLine}cm off the floor cuts your silhouette into two equal halves, which is the one proportion that consistently looks wrong. On a size chart that is a body length of about ${proportions.halvingBodyLength}cm — so aim nearer ${proportions.hemTargets[0].bodyLengthCm}cm and stay out of ${proportions.deadZone[0]}–${proportions.deadZone[1]}cm. That is usually a single size.`,
    });
  }

  out.push({
    q: 'Why this much room',
    a: `${fits.check.note} ${FITS[fits.top]?.blurb ? `"${cap(fits.top)}" here means ${FITS[fits.top].blurb}.` : ''}`,
  });

  out.push({
    q: 'Why it works for where you are going',
    a: `${style.name} covers ${occ.label.toLowerCase()} without overshooting it. ${style.description}`,
  });

  return out;
}
