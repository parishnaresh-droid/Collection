/**
 * colour.js — the colour science layer.
 *
 * Everything here is deliberately first-principles rather than pulled from a
 * library, because the whole product rests on it being right.
 *
 * Pipeline:  sRGB -> linear RGB -> CIE XYZ (D65) -> CIE L*a*b* -> CIE LCh
 *
 * Why not just compare RGB values? Because RGB distance is perceptually wrong.
 * Two pairs of colours can be the same numeric distance apart in RGB and look
 * nothing alike. CIELAB was built so that equal numeric distance is roughly
 * equal *perceived* difference, and CIEDE2000 corrects the places where even
 * LAB gets it wrong (notably blues and near-neutrals).
 *
 * References
 *   Sharma, Wu & Dalal (2005) — the CIEDE2000 test data this is validated on
 *   Chardon et al. (1991), Del Bino et al. (2013) — Individual Typology Angle
 */

/* ------------------------------------------------------------------ basics */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/* ------------------------------------------------------------- conversions */

// The sRGB transfer function. Displays are non-linear on purpose (it matches
// how our eyes allocate precision), so this has to be undone before any
// physically meaningful maths happens.
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(Math.round(c * 255), 0, 255);
}

export function rgbToXyz(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  return [
    (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100,
    (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100,
    (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100,
  ];
}

const WHITE = [95.047, 100.0, 108.883]; // D65, 2° observer

export function xyzToLab(x, y, z) {
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (Math.pow(t, 3) > 0.008856 ? Math.pow(t, 3) : (t - 16 / 116) / 7.787);
  return [inv(fx) * WHITE[0], inv(fy) * WHITE[1], inv(fz) * WHITE[2]];
}

export function rgbToLab(r, g, b) { return xyzToLab(...rgbToXyz(r, g, b)); }
export function hexToLab(hex) { return rgbToLab(...hexToRgb(hex)); }

export function labToRgb(L, a, b) {
  const [x, y, z] = labToXyz(L, a, b).map((v) => v / 100);
  const R = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const G = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
  const B = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

export function labToHex(L, a, b) { return rgbToHex(...labToRgb(L, a, b)); }

/* LCh is LAB in polar form: same space, but hue becomes an angle you can
 * rotate. Every harmony rule in this app is a rotation in this space. */
export function labToLch(L, a, b) {
  const C = Math.sqrt(a * a + b * b);
  let h = deg(Math.atan2(b, a));
  if (h < 0) h += 360;
  return [L, C, h];
}

export function lchToLab(L, C, h) {
  return [L, C * Math.cos(rad(h)), C * Math.sin(rad(h))];
}

export function lchToHex(L, C, h) { return labToHex(...lchToLab(L, C, h)); }
export function hexToLch(hex) { return labToLch(...hexToLab(hex)); }

/* Does this LCh colour survive the trip back to sRGB, or does it clip?
 * Rotating hue at constant chroma often lands outside what a screen can show,
 * and silently clipped colours are how palettes end up looking muddy. */
export function inGamut(L, C, h) {
  const [r, g, b] = lchToLab(L, C, h);
  const [x, y, z] = labToXyz(r, g, b).map((v) => v / 100);
  const lin = [
    x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
    x * -0.9692660 + y * 1.8760108 + z * 0.0415560,
    x * 0.0556434 + y * -0.2040259 + z * 1.0572252,
  ];
  return lin.every((v) => v >= -0.0005 && v <= 1.0005);
}

/** Pull chroma down until the colour is displayable. Keeps hue and lightness,
 *  which are the two things carrying the meaning. */
export function fitToGamut(L, C, h) {
  let c = C;
  while (c > 0 && !inGamut(L, c, h)) c -= 0.5;
  return [L, Math.max(c, 0), h];
}

/* -------------------------------------------------------------- CIEDE2000 */

/**
 * CIEDE2000 colour difference.
 * Rule of thumb: dE < 1 is invisible, < 2.3 is the "just noticeable
 * difference", < 10 reads as the same colour family, > 30 reads as contrast.
 */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;

  const pow7 = (v) => Math.pow(v, 7);
  const G = avgC > 0 ? 0.5 * (1 - Math.sqrt(pow7(avgC) / (pow7(avgC) + pow7(25)))) : 0;

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;

  const hp = (ap, bp) => {
    if (ap === 0 && bp === 0) return 0;
    const h = deg(Math.atan2(bp, ap));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);

  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  let avgHp;
  if (C1p * C2p === 0) avgHp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) avgHp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) avgHp = (h1p + h2p + 360) / 2;
  else avgHp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(avgHp - 30)) +
    0.24 * Math.cos(rad(2 * avgHp)) +
    0.32 * Math.cos(rad(3 * avgHp + 6)) -
    0.2 * Math.cos(rad(4 * avgHp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const Rc = avgCp > 0 ? 2 * Math.sqrt(pow7(avgCp) / (pow7(avgCp) + pow7(25))) : 0;
  const Sl = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh)
  );
}

/** Perceptual distance between two hex colours. */
export function distance(hexA, hexB) {
  return deltaE2000(hexToLab(hexA), hexToLab(hexB));
}

/* ------------------------------------------------- Individual Typology Angle
 *
 * ITA° is the measure dermatology uses to classify skin depth objectively.
 * It is the angle of the skin's position on the lightness-yellowness plane,
 * meaning how light the skin is set against how yellow it is. That separates
 * melanin depth far more cleanly than lightness on its own.
 *
 *   ITA° = arctan((L* - 50) / b*) x 180/pi
 *
 * Thresholds: Chardon et al. 1991, extended by Del Bino et al. 2013.
 */
export const ITA_BANDS = [
  { name: 'very light', min: 55, max: Infinity },
  { name: 'light', min: 41, max: 55 },
  { name: 'intermediate', min: 28, max: 41 },
  { name: 'tan', min: 10, max: 28 },
  { name: 'brown', min: -30, max: 10 },
  { name: 'deep', min: -Infinity, max: -30 },
];

export function ita(L, b) {
  if (b === 0) return L > 50 ? 90 : -90;
  return deg(Math.atan((L - 50) / b));
}

export function itaBand(angle) {
  return (ITA_BANDS.find((band) => angle >= band.min && angle < band.max) || ITA_BANDS[2]).name;
}

/* ------------------------------------------------------------ skin reading */

/**
 * Undertone from hue angle, not from subtracting RGB channels.
 *
 * There is real physiology underneath this. Skin colour is driven by two
 * pigments pulling in different directions in LAB: melanin pushes b* up
 * (yellow-brown), haemoglobin pushes a* up (red). The hue angle
 * h = atan2(b*, a*) is exactly the balance between them, so a high angle is
 * melanin-led (golden, warm) and a low angle is haemoglobin-led (rosy, cool).
 *
 * Thresholds calibrated against measured skin patches across the full ITA
 * range — see tools/calibrate_skin.mjs.
 */
export const UNDERTONE_WARM_H = 54.5;
export const UNDERTONE_COOL_H = 47.5;

/** Below this chroma the hue angle is numerically unstable — a colour that
 *  close to the neutral axis has no meaningful undertone to report, and
 *  claiming one anyway is how these tools embarrass themselves. */
export const UNDERTONE_MIN_CHROMA = 8;

export function undertoneFromHue(h, chroma = Infinity) {
  if (chroma < UNDERTONE_MIN_CHROMA) return 'neutral';
  if (h >= UNDERTONE_WARM_H) return 'warm';
  if (h <= UNDERTONE_COOL_H) return 'cool';
  return 'neutral';
}

/** ITA bands are dermatological terms. These are the same six steps said the
 *  way a person would want to hear them described. */
const DEPTH_LABEL = {
  'very light': 'light',
  light: 'light',
  intermediate: 'light-medium',
  tan: 'medium',
  brown: 'medium-deep',
  deep: 'deep',
};

/**
 * Turn a sampled skin pixel into the full reading everything else keys off.
 * `hairHex` is optional; when present it gives the value-contrast axis, which
 * is what decides whether an outfit should be high-contrast or tonal.
 */
export function readSkin(skinHex, hairHex = null) {
  const [L, a, b] = hexToLab(skinHex);
  const [, C, h] = labToLch(L, a, b);
  const angle = ita(L, b);

  const reading = {
    hex: skinHex.toUpperCase(),
    lab: { L, a, b },
    lch: { L, C, h },
    ita: angle,
    itaBand: itaBand(angle),
    depth: DEPTH_LABEL[itaBand(angle)],
    undertone: undertoneFromHue(h, C),
    // Chroma tells you how much colour the skin itself carries. Higher-chroma
    // colouring holds saturated clothing; lower-chroma colouring gets
    // overpowered by it and looks better in muted shades.
    chroma: C,
    clarity: C >= 24 ? 'clear' : C >= 16 ? 'balanced' : 'muted',
  };

  if (hairHex) {
    const [hairL] = hexToLab(hairHex);
    const dL = Math.abs(L - hairL);
    reading.hair = { hex: hairHex.toUpperCase(), L: hairL };
    reading.contrast = {
      deltaL: dL,
      level: dL >= 38 ? 'high' : dL >= 20 ? 'medium' : 'low',
    };
  }

  return reading;
}

/* --------------------------------------------------------------- harmony
 *
 * "Do these two colours go together" is not one question, it is three, and
 * they are measured on three different axes. This follows the structure Ou &
 * Luo used in their two-colour harmony work: judge hue relationship,
 * lightness separation and chroma agreement separately, then combine.
 *
 * Every term returns 0..1 and the weights are stated openly rather than
 * hidden, because this is a judgement call dressed in arithmetic, not a law
 * of physics.
 */

/** Smallest angular gap between two hues, 0..180. */
export function hueGap(h1, h2) {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Hue relationships that the eye reads as deliberate rather than accidental.
 * Near-misses are the problem: 25 degrees apart looks like you tried to match
 * and failed. Either commit to the same hue or clearly leave it.
 */
function hueTerm(gap) {
  if (gap <= 12) return 1.0;            // same hue — tonal dressing
  if (gap <= 30) return 0.45;           // the near-miss dead zone
  if (gap <= 55) return 0.88;           // analogous, the safest step out
  if (gap <= 95) return 0.62;           // awkward middle distance
  if (gap <= 140) return 0.86;          // split-complementary
  return 0.95;                          // complementary — high drama, works
}

/** Value separation. Garments that sit at the same lightness merge into one
 *  block and the outfit loses its structure. */
function lightnessTerm(dL) {
  if (dL < 8) return 0.35;
  if (dL < 18) return 0.72;
  if (dL < 55) return 1.0;
  return 0.88;
}

/** Saturation agreement. A muted olive next to a fluorescent orange reads as
 *  two garments from two different wardrobes. */
function chromaTerm(c1, c2) {
  const d = Math.abs(c1 - c2);
  const anyNeutral = Math.min(c1, c2) < 8; // neutrals partner with anything
  if (anyNeutral) return 1.0;
  if (d < 12) return 1.0;
  if (d < 25) return 0.8;
  return 0.55;
}

/**
 * Overall harmony 0..100 for a pair of hex colours, with the reasoning kept
 * alongside the number so the interface can explain itself.
 */
export function harmony(hexA, hexB) {
  const [L1, C1, h1] = hexToLch(hexA);
  const [L2, C2, h2] = hexToLch(hexB);
  const gap = hueGap(h1, h2);
  const dL = Math.abs(L1 - L2);

  const bothNeutral = C1 < 8 && C2 < 8;
  const hue = bothNeutral ? 1 : hueTerm(gap);
  const light = lightnessTerm(dL);
  const chroma = chromaTerm(C1, C2);

  const score = 100 * (0.4 * hue + 0.38 * light + 0.22 * chroma);

  let relation = 'unrelated';
  if (bothNeutral) relation = 'neutral pairing';
  else if (gap <= 12) relation = 'tonal';
  else if (gap <= 55) relation = 'analogous';
  else if (gap <= 140) relation = 'split complementary';
  else relation = 'complementary';

  return {
    score: Math.round(score),
    relation,
    hueGap: Math.round(gap),
    deltaL: Math.round(dL),
    deltaE: Math.round(distance(hexA, hexB) * 10) / 10,
    parts: { hue, light, chroma },
  };
}

/* ------------------------------------------------------- named colours */

export const NAMED_COLOURS = [
  ['black', '#000000', 'neutral'], ['jet', '#1A1A1A', 'neutral'],
  ['charcoal', '#36454F', 'neutral'], ['graphite', '#4B4B4B', 'neutral'],
  ['slate grey', '#708090', 'neutral'], ['ash grey', '#B2BEB5', 'neutral'],
  ['silver', '#C0C0C0', 'neutral'], ['light grey', '#D3D3D3', 'neutral'],
  ['off white', '#F5F5F0', 'neutral'], ['ivory', '#FFFFF0', 'neutral'],
  ['cream', '#FFFDD0', 'neutral'], ['bone', '#E3DAC9', 'neutral'],
  ['white', '#FFFFFF', 'neutral'],
  ['espresso', '#3C2415', 'brown'], ['chocolate', '#4A2E1D', 'brown'],
  ['coffee', '#6F4E37', 'brown'], ['chestnut', '#954535', 'brown'],
  ['cognac', '#9A463D', 'brown'], ['tan', '#D2B48C', 'brown'],
  ['camel', '#C19A6B', 'brown'], ['sand', '#E2CA9B', 'brown'],
  ['beige', '#F5F5DC', 'brown'], ['taupe', '#8A7A6B', 'brown'],
  ['khaki', '#C3B091', 'brown'], ['stone', '#ADA587', 'brown'],
  ['burgundy', '#7B2D26', 'red'], ['oxblood', '#4A0404', 'red'],
  ['maroon', '#800000', 'red'], ['wine', '#722F37', 'red'],
  ['brick', '#8B3A2E', 'red'], ['true red', '#B0201E', 'red'],
  ['crimson', '#DC143C', 'red'], ['cherry', '#DE3163', 'red'],
  ['rust', '#C1502E', 'orange'], ['terracotta', '#B85C38', 'orange'],
  ['burnt orange', '#CC5500', 'orange'], ['clay', '#B66A50', 'orange'],
  ['apricot', '#FBCEB1', 'orange'], ['peach', '#F0A875', 'orange'],
  ['coral', '#E8724C', 'orange'],
  ['mustard', '#C99A2E', 'yellow'], ['ochre', '#CC7722', 'yellow'],
  ['gold', '#D4AF37', 'yellow'], ['golden yellow', '#E3B23C', 'yellow'],
  ['butter', '#F3E5AB', 'yellow'], ['lemon', '#FFF44F', 'yellow'],
  ['olive', '#556B2F', 'green'], ['moss', '#8A9A5B', 'green'],
  ['sage', '#9CAF88', 'green'], ['forest', '#228B22', 'green'],
  ['hunter green', '#355E3B', 'green'], ['emerald', '#0F6B4E', 'green'],
  ['mint', '#98FF98', 'green'], ['military green', '#4B5320', 'green'],
  ['deep teal', '#1B4D4A', 'blue'], ['teal', '#008080', 'blue'],
  ['cyan', '#00B7EB', 'blue'], ['sky blue', '#87CEEB', 'blue'],
  ['cobalt', '#0047AB', 'blue'], ['sapphire', '#1B4F91', 'blue'],
  ['navy', '#2C3A4F', 'blue'], ['midnight navy', '#191970', 'blue'],
  ['denim blue', '#6F8FAF', 'blue'], ['washed blue', '#A2B5CD', 'blue'],
  ['powder blue', '#B0E0E6', 'blue'],
  ['deep purple', '#4A2C5E', 'purple'], ['plum', '#8E4585', 'purple'],
  ['aubergine', '#3D2B3D', 'purple'], ['lavender', '#9B8CB5', 'purple'],
  ['mauve', '#E0B0FF', 'purple'], ['rose', '#C97D8E', 'pink'],
  ['dusty rose', '#C4A0A0', 'pink'], ['blush', '#DE5D83', 'pink'],
  ['powder pink', '#E3B8C4', 'pink'],
];

const NAMED_LAB = NAMED_COLOURS.map(([name, hex, family]) => ({
  name, hex, family, lab: hexToLab(hex),
}));

/** Nearest named colour by perceptual distance. */
export function nameColour(hex, topN = 1) {
  const lab = hexToLab(hex);
  const scored = NAMED_LAB
    .map((c) => ({ ...c, deltaE: deltaE2000(lab, c.lab) }))
    .sort((x, y) => x.deltaE - y.deltaE)
    .slice(0, topN)
    .map(({ name, hex: h, family, deltaE }) => ({
      name, hex: h, family, deltaE: Math.round(deltaE * 10) / 10,
    }));
  return topN === 1 ? scored[0] : scored;
}

/** WCAG relative luminance. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(hexA, hexB) {
  const a = luminance(hexA), b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Readable text colour for a given background.
 *
 * A luminance threshold gets this wrong for saturated mid-tones — a strong
 * teal sits just under the usual cut-off and gets white text at about 3.4:1.
 * Computing both ratios and taking the winner costs nothing and is simply
 * correct.
 */
export function contrastInk(hex) {
  return contrastRatio(hex, '#FFFFFF') > contrastRatio(hex, '#0A0A0B') ? '#FFFFFF' : '#0A0A0B';
}
