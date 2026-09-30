/**
 * anatomy.js — the body half of the engine.
 *
 * Two different things get called "body type" and they are not the same:
 *
 *   Horizontal shape — the relationship between chest, waist and hip. Decides
 *   where a garment needs room and where it needs to follow the body.
 *
 *   Vertical proportion — where your own landmarks sit along your height.
 *   Decides where hems, waistbands and breaks should land.
 *
 * Almost all styling advice online is about the first and silently assumes the
 * second. This module computes both, from the person's own numbers, and is
 * explicit about which parts are measured and which are population defaults.
 *
 * Skeletal landmark heights as a fraction of stature come from the standard
 * body-segment parameters used in biomechanics (Drillis & Contini, 1966).
 * They are population averages — the module says so wherever it leans on them.
 */

/* Fractions of total stature. */
export const LANDMARKS = {
  shoulder: 0.818, // acromion — the top of the clothed silhouette
  chest: 0.720,
  waist: 0.600, // natural waist, roughly navel level
  hip: 0.530, // greater trochanter — where low-rise trousers sit
  crotch: 0.470,
  knee: 0.285,
  ankle: 0.039,
};

/** Population median leg-to-height ratio (inseam / stature) for adults. */
export const MEDIAN_LEG_RATIO = 0.465;

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Size charts measure body length from the high point of the shoulder, flat,
 * along the fabric. That is not the same as the vertical drop from the
 * acromion to a point on the body: the neck point sits higher than the
 * shoulder tip, and cloth takes a longer path over the chest than a plumb line
 * does. The difference is consistently around 6–7cm on adult menswear, which
 * is what this constant carries. It is an approximation, and the interface
 * says so rather than pretending to millimetres.
 */
export const GARMENT_ALLOWANCE = 6.5;

const toBodyLength = (shoulderCm, targetFloorCm) =>
  r1(shoulderCm - targetFloorCm + GARMENT_ALLOWANCE);

/* ------------------------------------------------------- horizontal shape */

/**
 * Classify the torso from three tape-measure numbers. Thresholds are
 * proportional rather than absolute so they hold at every size.
 */
export function classifyShape(chest, waist, hip) {
  const c = Number(chest), w = Number(waist), h = Number(hip);
  if (![c, w, h].every((v) => Number.isFinite(v) && v > 0)) return null;

  const chestMinusHip = c - h;
  const dropChest = (c - w) / c; // how much the waist comes in from the chest
  const dropHip = (h - w) / h;
  const close = (a, b, pct = 0.05) => Math.abs(a - b) <= pct * Math.max(a, b);

  let shape, reason;
  if (close(c, h) && dropChest > 0.12 && dropHip > 0.12) {
    shape = 'hourglass';
    reason = 'chest and hip are close in width and the waist comes in clearly from both';
  } else if (chestMinusHip / c > 0.08) {
    shape = 'inverted triangle';
    reason = 'chest and shoulders are noticeably wider than the hip';
  } else if (-chestMinusHip / h > 0.08) {
    shape = 'triangle';
    reason = 'the hip is noticeably wider than the chest and shoulders';
  } else if (w > c && w > h) {
    shape = 'oval';
    reason = 'the waist is the widest point of the three';
  } else {
    shape = 'rectangle';
    reason = 'chest, waist and hip sit within a similar range, with little taper';
  }

  return {
    shape,
    reason,
    measurements: { chest: c, waist: w, hip: h },
    // "Drop" is the tailoring trade's own number: chest minus waist. A drop of
    // 6 is a regular cut, 8 is athletic, 4 or less is a fuller cut. Knowing it
    // is the difference between guessing a size and choosing one.
    drop: r1(c - w),
    dropClass: c - w >= 17 ? 'athletic' : c - w >= 11 ? 'regular' : 'straight',
    waistToChest: r1((w / c) * 100),
    hipToChest: r1((h / c) * 100),
  };
}

/** What each shape is actually asking the clothes to do. */
export const SHAPE_STRATEGY = {
  hourglass: {
    goal: 'keep the taper visible',
    top: 'anything that follows the body through the waist, or a boxy top worn tucked',
    bottom: 'straight or slightly tapered, sitting on the natural waist',
    layer: 'belted or single-breasted, worn closed',
    avoid: 'boxy oversized head to toe — it hides the one thing worth showing',
    volume: 2,
  },
  'inverted triangle': {
    goal: 'let the lower half catch up with the shoulders',
    top: 'soft shoulders, open collars and V-necks; nothing structured across the chest',
    bottom: 'straight or wide leg — volume down here balances the top',
    layer: 'unstructured, no shoulder padding, worn open for a vertical line',
    avoid: 'shoulder padding, epaulettes and chest-width stripes — they widen what is already wide',
    volume: 3,
  },
  triangle: {
    goal: 'build the shoulder line up to meet the hip',
    top: 'structured shoulders, horizontal detail across the chest, lighter colours up top',
    bottom: 'straight leg in a darker shade, no detail at the hip',
    layer: 'a jacket with a defined shoulder does most of the work here',
    avoid: 'skinny bottoms under a loose top, and cargo pockets at hip height',
    volume: 2,
  },
  oval: {
    goal: 'draw one long vertical line rather than a horizontal one',
    top: 'straight-cut, skimming rather than clinging, ending at the hip bone',
    bottom: 'straight leg, mid rise, no break at the shoe',
    layer: 'worn open — the two vertical edges are the most useful line you own',
    avoid: 'tucked fitted shirts and wide belts; both draw a line across the widest point',
    volume: 2,
  },
  rectangle: {
    goal: 'create the shape the frame does not have on its own',
    top: 'boxy and relaxed genuinely works here, and layering builds depth',
    bottom: 'relaxed or wide — the straight frame carries volume better than most',
    layer: 'an open overshirt or jacket adds the edges that make a shape read',
    avoid: 'nothing structural — this is the frame oversized cuts were drawn for',
    volume: 4,
  },
};

/* ------------------------------------------------- vertical proportion --- */

/**
 * Where everything sits on a person of this height, and — the useful part —
 * where the line is that cuts them exactly in half.
 *
 * Sources disagree on which uneven ratio is "ideal" (some say a third, some
 * two thirds, some invoke the golden section). They agree on the negative:
 * splitting the silhouette into two equal halves is the one that reliably
 * looks wrong. So this computes that line honestly and recommends landmarks
 * rather than inventing a precision nobody has.
 *
 * @param {number} heightCm
 * @param {number|null} inseamCm  measured inside leg; optional
 */
export function verticalProportions(heightCm, inseamCm = null) {
  const H = Number(heightCm);
  if (!Number.isFinite(H) || H < 120 || H > 230) return null;

  const at = (frac) => r1(H * frac);
  const landmarks = {
    shoulder: at(LANDMARKS.shoulder),
    waist: at(LANDMARKS.waist),
    hip: at(LANDMARKS.hip),
    crotch: at(LANDMARKS.crotch),
    knee: at(LANDMARKS.knee),
    ankle: at(LANDMARKS.ankle),
  };

  // The clothed silhouette runs shoulder to ankle. Its midpoint is the line to
  // keep a hem away from.
  const top = landmarks.shoulder;
  const bottom = landmarks.ankle;
  const halving = r1((top + bottom) / 2);

  const measured = Number.isFinite(Number(inseamCm)) && Number(inseamCm) > 0;
  const legRatio = measured ? Number(inseamCm) / H : MEDIAN_LEG_RATIO;
  const delta = legRatio - MEDIAN_LEG_RATIO;

  let build, buildNote;
  if (!measured) {
    build = 'assumed average';
    buildNote =
      'Working from average proportions for your height. Measure your inside leg and this gets personal instead of statistical.';
  } else if (delta > 0.018) {
    build = 'longer legs';
    buildNote =
      'Your legs are long relative to your torso. You can carry a longer top and a lower rise than most people, and cropped trousers work on you where they shorten others.';
  } else if (delta < -0.018) {
    build = 'longer torso';
    buildNote =
      'Your torso is long relative to your legs. Raising the visual waistline is the single biggest change available to you: a higher rise, a shorter or tucked top, and no long layers ending at mid-thigh.';
  } else {
    build = 'balanced';
    buildNote =
      'Your torso and legs are close to evenly matched, which means most proportions will work. Use that freedom on the pieces, not on the lengths.';
  }

  return {
    heightCm: H,
    landmarks,
    halvingLine: halving,
    // Translated into the number printed on size charts, so it can be checked
    // before buying rather than regretted afterwards. See GARMENT_ALLOWANCE.
    halvingBodyLength: toBodyLength(top, halving),
    deadZone: [toBodyLength(top, halving) - 4, toBodyLength(top, halving) + 4],
    hemTargets: [
      {
        name: 'just past the seat',
        floorCm: landmarks.crotch,
        bodyLengthCm: toBodyLength(top, landmarks.crotch),
        use: 'tees, shirts worn out, knitwear — the default that always reads clean',
      },
      {
        name: 'at the hip bone',
        floorCm: landmarks.hip,
        bodyLengthCm: toBodyLength(top, landmarks.hip),
        use: 'boxy and cropped cuts, bombers, anything worn tucked or half-tucked',
      },
      {
        name: 'above the knee',
        floorCm: r1(H * 0.325),
        bodyLengthCm: toBodyLength(top, H * 0.325),
        use: 'long overshirts and coats — the other proportion that reads deliberate',
      },
    ],
    legRatio: r1(legRatio * 1000) / 10,
    measured,
    build,
    buildNote,
    riseAdvice:
      build === 'longer torso'
        ? 'Mid to high rise. A low rise stacks even more length into an already long torso.'
        : build === 'longer legs'
        ? 'Mid to low rise. You have leg length to spend, and a low rise spends it well.'
        : 'Mid rise. It is the most flexible starting point and you have no reason to avoid it.',
  };
}

/* ----------------------------------------------------- volume budget ----- */

/**
 * How much oversizing a frame can carry, and where to spend it.
 *
 * The honest answer to "do baggy clothes suit me" is that volume is a budget,
 * not a yes or no. Almost everyone can wear volume; very few people can wear
 * it everywhere at once, because two voluminous garments stop reading as a
 * silhouette and start reading as a pile.
 *
 * Budget runs 0–6. A fitted piece costs 1, relaxed 2, oversized 3.
 */
const SHAPE_VOLUME_AFFINITY = {
  rectangle: 1, // no taper to lose, so volume costs nothing
  'inverted triangle': 0.5, // volume below the waist is useful here
  oval: 0,
  triangle: -0.5,
  hourglass: -1, // volume hides the one thing this frame has
};

export function volumeBudget({ heightCm, shape, drop }) {
  const H = Number(heightCm) || 175;
  let budget = 3; // the middle of the range, where most people sit
  const reasons = [];

  // Height buys volume. The same jacket that swamps a shorter frame reads as
  // deliberate on a taller one, because there is more vertical line to absorb it.
  if (H >= 188) { budget += 1; reasons.push('your height gives the extra fabric somewhere to go'); }
  else if (H <= 166) { budget -= 1; reasons.push('at your height volume competes with your frame rather than sitting on it'); }

  const affinity = SHAPE_VOLUME_AFFINITY[shape] ?? 0;
  budget += affinity;
  if (affinity > 0) reasons.push('a straight frame carries oversized cuts better than a tapered one');
  if (affinity < 0) reasons.push('you have a taper worth keeping visible');

  // A big chest-to-waist drop means the body already has a shape worth seeing.
  if (Number.isFinite(drop) && drop >= 17) {
    budget -= 0.5;
    reasons.push('your chest-to-waist drop is already doing the shaping');
  }

  budget = Math.max(3, Math.min(6, Math.round(budget)));

  const verdict = {
    6: 'Volume suits you almost anywhere. You can run oversized on both halves, which most people cannot.',
    5: 'You can go oversized on one half and relaxed on the other. Only full volume top and bottom is off the table.',
    4: 'One genuinely oversized piece against one straight piece. Two relaxed pieces also works.',
    3: 'One relaxed piece against one straight piece. That single contrast is the whole trick for your frame.',
  }[budget];

  return { budget, verdict, reasons, cost: { fitted: 1, straight: 1, relaxed: 2, wide: 3, oversized: 3 } };
}

/* --------------------------------------------------------- fit vocabulary */

/** The fit words the app uses, in order of how much room they add. */
export const FITS = {
  fitted: { volume: 1, blurb: 'follows the body with no excess' },
  straight: { volume: 1, blurb: 'falls straight from the widest point, no taper' },
  relaxed: { volume: 2, blurb: 'a clear amount of room without losing the line' },
  wide: { volume: 3, blurb: 'volume as the point of the garment' },
  oversized: { volume: 3, blurb: 'dropped shoulders, long body, deliberate excess' },
};

/**
 * Check a proposed top/bottom pairing against the budget, and say why.
 */
export function checkSilhouette(topFit, bottomFit, budgetInfo) {
  const spend = (FITS[topFit]?.volume ?? 2) + (FITS[bottomFit]?.volume ?? 2);
  const ok = spend <= budgetInfo.budget;
  return {
    spend,
    budget: budgetInfo.budget,
    ok,
    note: ok
      ? `${cap(topFit)} on top with ${bottomFit} below sits inside what your frame carries.`
      : `${cap(topFit)} on top *and* ${bottomFit} below is more volume than your frame holds at once — take it out of one of them.`,
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
