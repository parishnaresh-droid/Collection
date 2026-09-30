/**
 * wardrobe.js — the vocabulary the stylist speaks in.
 *
 * Garments are described by what they *do* to a silhouette, not by brand or
 * trend, so the engine can reason about them: every piece carries a fit, a
 * volume cost, where its hem lands, and which occasions it survives.
 */

/** Occasions, ordered from most relaxed to most formal. */
export const OCCASIONS = [
  { id: 'everyday', label: 'Everyday', blurb: 'Errands, campus, coffee, nothing to prove', formality: 1 },
  { id: 'friends', label: 'Seeing people', blurb: 'Meeting friends, casual plans', formality: 2 },
  { id: 'date', label: 'A date', blurb: 'You want to look like you tried, not like you panicked', formality: 3 },
  { id: 'work', label: 'Work', blurb: 'Office, presentation, meeting people who matter', formality: 4 },
  { id: 'night', label: 'Night out', blurb: 'Dinner, bar, somewhere with a door policy', formality: 4 },
  { id: 'event', label: 'Something formal', blurb: 'Wedding, ceremony, an occasion with a dress code', formality: 5 },
];

/**
 * Style archetypes. `weight` biases automatic selection; `formality` is the
 * range each one covers, so the engine never puts streetwear in a wedding.
 */
export const STYLES = {
  minimal: {
    name: 'Modern Minimal',
    line: 'Few pieces, good ones, nothing shouting.',
    description:
      'The lowest-risk way to look deliberate. Clean lines, a small number of colours, and quality doing the work that print and logos do elsewhere.',
    formality: [1, 4],
    defaultFit: { top: 'straight', bottom: 'straight' },
    tops: ['heavyweight crew tee', 'fine-gauge knit', 'plain overshirt', 'straight-cut oxford'],
    bottoms: ['straight-leg trouser', 'straight jean', 'pleated trouser'],
    shoes: ['minimal leather sneaker', 'suede derby', 'clean canvas low-top'],
    layers: ['unstructured blazer', 'zip overshirt', 'crew sweat'],
    accessories: ['leather strap watch', 'plain belt matched to the shoe'],
    palettePreference: ['foundation', 'foundation', 'grounding'],
  },
  smart_casual: {
    name: 'Smart Casual',
    line: 'Tailoring loosened up, not dressed down.',
    description:
      'The register most of adult life runs in. One tailored element, everything else relaxed, so it reads as effort without reading as a costume.',
    formality: [2, 5],
    defaultFit: { top: 'straight', bottom: 'straight' },
    tops: ['knit polo', 'oxford shirt', 'merino crewneck', 'camp collar shirt'],
    bottoms: ['tapered chino', 'wool trouser', 'dark straight jean'],
    shoes: ['leather loafer', 'suede chukka', 'clean low-profile sneaker'],
    layers: ['unstructured blazer', 'suede overshirt', 'harrington jacket'],
    accessories: ['leather belt', 'simple watch'],
    palettePreference: ['foundation', 'grounding', 'foundation'],
  },
  relaxed_90s: {
    name: '90s Relaxed',
    line: 'Boxy on top, room below, nothing tight.',
    description:
      'Built on proportion rather than logos. A boxy top with real width, straight or wide denim, and footwear with some visual weight to anchor it.',
    formality: [1, 3],
    defaultFit: { top: 'relaxed', bottom: 'wide' },
    tops: ['boxy heavyweight tee', 'oversized sweatshirt', 'flannel overshirt'],
    bottoms: ['relaxed straight jean', 'wide-leg jean', 'carpenter trouser'],
    shoes: ['retro runner', 'chunky leather sneaker', 'suede skate shoe'],
    layers: ['denim trucker jacket', 'coach jacket', 'zip hoodie'],
    accessories: ['webbing belt', 'cap'],
    palettePreference: ['grounding', 'foundation', 'accent'],
  },
  street: {
    name: 'Streetwear',
    line: 'Proportion first, volume used on purpose.',
    description:
      'Oversized as a decision rather than a size error. Works when exactly one garment carries the volume and everything else stays disciplined.',
    formality: [1, 3],
    defaultFit: { top: 'oversized', bottom: 'straight' },
    tops: ['oversized tee', 'heavy hoodie', 'graphic long sleeve'],
    bottoms: ['relaxed cargo', 'wide trouser', 'straight jean'],
    shoes: ['bulky sneaker', 'retro runner', 'leather high-top'],
    layers: ['puffer vest', 'work jacket', 'oversized bomber'],
    accessories: ['crossbody bag', 'beanie'],
    palettePreference: ['foundation', 'foundation', 'accent'],
  },
  workwear: {
    name: 'Workwear',
    line: 'Built for use, worn for the shape.',
    description:
      'Hard-wearing cloth, straight cuts and utility detail. Ages well, hides wear, and carries volume without looking sloppy.',
    formality: [1, 3],
    defaultFit: { top: 'straight', bottom: 'straight' },
    tops: ['heavy pocket tee', 'chore shirt', 'waffle knit'],
    bottoms: ['double-knee trouser', 'straight canvas pant', 'carpenter jean'],
    shoes: ['leather boot', 'service shoe', 'canvas high-top'],
    layers: ['chore jacket', 'quilted liner', 'denim jacket'],
    accessories: ['tooled leather belt', 'field watch'],
    palettePreference: ['grounding', 'foundation', 'grounding'],
  },
  quiet_luxury: {
    name: 'Quiet Luxury',
    line: 'Expensive-looking without a single logo.',
    description:
      'Soft fabrics, deep neutrals, and cuts that skim. Nothing here is loud, which is why it reads as money rather than as effort.',
    formality: [3, 5],
    defaultFit: { top: 'straight', bottom: 'straight' },
    tops: ['cashmere crewneck', 'silk-blend shirt', 'fine knit polo'],
    bottoms: ['wool wide trouser', 'pressed chino', 'flat-front trouser'],
    shoes: ['leather loafer', 'suede boot', 'minimal leather sneaker'],
    layers: ['soft-shouldered blazer', 'long overcoat', 'suede bomber'],
    accessories: ['slim leather belt', 'gold-tone watch'],
    palettePreference: ['foundation', 'foundation', 'grounding'],
  },
  soft_tailoring: {
    name: 'Soft Tailoring',
    line: 'A jacket without the armour.',
    description:
      'Tailoring with the padding taken out. Reads formal enough for most rooms while moving like knitwear.',
    formality: [3, 5],
    defaultFit: { top: 'straight', bottom: 'straight' },
    tops: ['fine merino crew', 'poplin shirt', 'knit polo'],
    bottoms: ['pleated wool trouser', 'tapered trouser'],
    shoes: ['leather loafer', 'suede derby', 'chelsea boot'],
    layers: ['unlined blazer', 'overshirt in wool', 'topcoat'],
    accessories: ['leather belt', 'dress watch'],
    palettePreference: ['foundation', 'grounding', 'foundation'],
  },
  sport_relaxed: {
    name: 'Soft Sportswear',
    line: 'Technical pieces, dressed like clothes.',
    description:
      'Sports fabrics used for the way they hang rather than for the gym. Comfortable without looking like you gave up.',
    formality: [1, 2],
    defaultFit: { top: 'relaxed', bottom: 'relaxed' },
    tops: ['boxy jersey tee', 'half-zip knit', 'crew sweat'],
    bottoms: ['tapered track pant', 'relaxed nylon trouser', 'straight jersey pant'],
    shoes: ['retro runner', 'minimal trainer'],
    layers: ['coach jacket', 'zip-through knit', 'light shell'],
    accessories: ['cap', 'nylon crossbody'],
    palettePreference: ['foundation', 'foundation', 'grounding'],
  },
};

export const STYLE_IDS = Object.keys(STYLES);

/** Rough fit vocabulary per garment word, for the volume arithmetic. */
export function fitForGarment(name, fallback) {
  const n = name.toLowerCase();
  if (/oversized|boxy|heavy hoodie|wide/.test(n)) return /wide/.test(n) ? 'wide' : 'oversized';
  if (/relaxed|baggy|carpenter|chore|double-knee/.test(n)) return 'relaxed';
  if (/tapered|slim|fine|silk|poplin|dress/.test(n)) return 'fitted';
  if (/straight|pleated|flat-front|pressed/.test(n)) return 'straight';
  return fallback;
}
