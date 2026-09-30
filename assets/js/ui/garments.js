/**
 * garments.js — draws each recommended piece.
 *
 * Real product photography is out: every image of a garment on the internet
 * belongs to whoever shot it, and a styling tool that hotlinks other people's
 * lookbooks is a lawsuit with a colour picker attached. So the pieces are drawn
 * as vector flat-lays in the exact colour the engine chose — which is actually
 * more honest, because the swatch on screen is the recommendation rather than
 * an approximation of it.
 *
 * Shading is computed in LCh, so a garment gets lighter by raising lightness
 * rather than by mixing in white, and dark colours keep their hue instead of
 * drifting grey.
 */

import { hexToLch, lchToHex, contrastInk } from '../core/colour.js';

const shade = (hex, dL, dC = 0) => {
  const [L, C, h] = hexToLch(hex);
  return lchToHex(Math.max(0, Math.min(100, L + dL)), Math.max(0, C + dC), h);
};

/**
 * Detail lines — seams, laces, stitching — shifted *away* from the garment in
 * whichever direction has room. Always darkening loses every detail on a black
 * boot; always lightening loses them on a white sneaker.
 */
const detail = (hex, amount = 20) => {
  const [L] = hexToLch(hex);
  return shade(hex, L > 55 ? -amount : amount);
};

/** Work out what we are drawing from the words the engine used. */
export function categorise(name = '', slot = '') {
  const n = name.toLowerCase();
  if (/shoe|sneaker|loafer|boot|derby|chukka|trainer|runner|high-top|low-top|chelsea/.test(n)) {
    if (/boot|chelsea|chukka/.test(n)) return 'boot';
    if (/loafer|derby/.test(n)) return 'loafer';
    return 'sneaker';
  }
  if (/trouser|jean|chino|pant|cargo|slack/.test(n)) return 'trousers';
  if (/blazer|jacket|coat|bomber|trucker|shell|harrington|liner|vest|overcoat|topcoat/.test(n)) return 'jacket';
  if (/overshirt|chore/.test(n)) return 'overshirt';
  if (/shirt|oxford|poplin|camp collar/.test(n)) return 'shirt';
  if (/knit|sweater|crewneck|cashmere|merino|polo|waffle|half-zip/.test(n)) return 'knit';
  if (/hoodie|sweat/.test(n)) return 'sweat';
  if (/tee|t-shirt|long sleeve|jersey/.test(n)) return 'tee';
  if (slot === 'Bottom') return 'trousers';
  if (slot === 'Shoes') return 'sneaker';
  if (slot === 'Layer') return 'jacket';
  return 'tee';
}

/** How much wider a garment gets with each step up in fit. */
const FIT_SPREAD = { fitted: -6, straight: 0, relaxed: 7, wide: 13, oversized: 15, 'n/a': 0 };

function defs(id, hex) {
  const light = shade(hex, 7);
  const dark = shade(hex, -9);
  const deeper = shade(hex, -17);
  return `
  <defs>
    <linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="0.52" stop-color="${hex}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="s-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${deeper}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <radialGradient id="sh-${id}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="rgba(11,11,12,0.20)"/>
      <stop offset="1" stop-color="rgba(11,11,12,0)"/>
    </radialGradient>
  </defs>`;
}

const ground = (id, cy = 214, rx = 66) =>
  `<ellipse cx="100" cy="${cy}" rx="${rx}" ry="9" fill="url(#sh-${id})"/>`;

/* ------------------------------------------------------------- the pieces */

function tee(id, hex, spread, { sleeve = 'short', collar = 'crew' } = {}) {
  const w = 44 + spread;          // half body width
  const sl = sleeve === 'long' ? 74 : 40; // sleeve length
  const drop = spread > 8 ? 14 : 8;       // dropped shoulder for bigger fits
  const hem = 178 + (spread > 8 ? 8 : 0);
  const stroke = shade(hex, -20);
  return `
    ${ground(id)}
    <path d="M100 42
      C ${100 - 16} 42 ${100 - 24} 46 ${100 - 30} 50
      L ${100 - 30 - sl * 0.55} ${58 + drop}
      L ${100 - 30 - sl * 0.62} ${96 + drop}
      L ${100 - w} ${104 + drop * 0.5}
      L ${100 - w} ${hem}
      L ${100 + w} ${hem}
      L ${100 + w} ${104 + drop * 0.5}
      L ${100 + 30 + sl * 0.62} ${96 + drop}
      L ${100 + 30 + sl * 0.55} ${58 + drop}
      C ${100 + 24} 46 ${100 + 16} 42 100 42 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.8" stroke-linejoin="round"/>
    ${collar === 'crew'
      ? `<path d="M${100 - 17} 44 C ${100 - 10} 54 ${100 + 10} 54 ${100 + 17} 44
          C ${100 + 10} 49 ${100 - 10} 49 ${100 - 17} 44 Z" fill="url(#s-${id})"/>`
      : `<path d="M${100 - 15} 44 L100 66 L${100 + 15} 44" fill="none" stroke="${stroke}" stroke-width="2.4"/>`}
    <path d="M${100 - w + 3} ${hem - 9} L${100 + w - 3} ${hem - 9}" stroke="${shade(hex, -14)}" stroke-width="1.1" opacity="0.65"/>
    <path d="M${100 - 30 - sl * 0.58} ${88 + drop} l ${sl * 0.1} 4" stroke="${shade(hex, -14)}" stroke-width="1" opacity="0.6"/>
    <path d="M${100 + 30 + sl * 0.58} ${88 + drop} l ${-sl * 0.1} 4" stroke="${shade(hex, -14)}" stroke-width="1" opacity="0.6"/>
    <path d="M${100 - w + 10} 120 q 6 26 -1 52" fill="none" stroke="${shade(hex, -6)}" stroke-width="0.9" opacity="0.5"/>
    <path d="M${100 + w - 10} 120 q -6 26 1 52" fill="none" stroke="${shade(hex, -6)}" stroke-width="0.9" opacity="0.5"/>`;
}

function knit(id, hex, spread) {
  const base = tee(id, hex, spread, { sleeve: 'long' });
  const w = 44 + spread;
  const rib = shade(hex, -12);
  return `${base}
    <rect x="${100 - w}" y="170" width="${w * 2}" height="9" fill="${rib}" opacity="0.85"/>
    ${[0, 1, 2, 3, 4, 5].map((i) =>
      `<path d="M${100 - w + 8 + i * ((w * 2 - 16) / 5)} 118 v 48" stroke="${shade(hex, 4)}" stroke-width="0.7" opacity="0.4"/>`
    ).join('')}`;
}

function sweat(id, hex, spread) {
  return `${knit(id, hex, spread + 4)}
    <path d="M${100 - 20} 46 q 20 16 40 0" fill="none" stroke="${shade(hex, -18)}" stroke-width="3"/>`;
}

function shirt(id, hex, spread) {
  const w = 43 + spread;
  const stroke = shade(hex, -20);
  const hem = 182;
  return `
    ${ground(id)}
    <path d="M100 46
      C ${100 - 15} 46 ${100 - 25} 49 ${100 - 32} 54
      L ${100 - 54} 64 L ${100 - 58} 122 L ${100 - w} 120 L ${100 - w} ${hem}
      L ${100 + w} ${hem} L ${100 + w} 120 L ${100 + 58} 122 L ${100 + 54} 64
      L ${100 + 32} 54 C ${100 + 25} 49 ${100 + 15} 46 100 46 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M${100 - 32} 54 L ${100 - 7} 62 L 100 50 L ${100 + 7} 62 L ${100 + 32} 54"
      fill="url(#s-${id})" stroke="${stroke}" stroke-width="0.7"/>
    <rect x="${100 - 6}" y="60" width="12" height="${hem - 62}" fill="${shade(hex, 3)}" stroke="${stroke}" stroke-width="0.6"/>
    ${[78, 100, 122, 144, 166].map((y) => `<circle cx="100" cy="${y}" r="2" fill="${shade(hex, -26)}"/>`).join('')}
    <path d="M${100 - 58} 112 L ${100 - 44} 113 L ${100 - 45} 126 L ${100 - 59} 125 Z"
      fill="${shade(hex, -6)}" stroke="${stroke}" stroke-width="0.7"/>
    <path d="M${100 + 58} 112 L ${100 + 44} 113 L ${100 + 45} 126 L ${100 + 59} 125 Z"
      fill="${shade(hex, -6)}" stroke="${stroke}" stroke-width="0.7"/>`;
}

function overshirt(id, hex, spread) {
  const w = 47 + spread;
  const stroke = shade(hex, -20);
  return `
    ${ground(id)}
    <path d="M100 46 C ${100 - 16} 46 ${100 - 26} 50 ${100 - 34} 56
      L ${100 - 58} 68 L ${100 - 62} 128 L ${100 - w} 126 L ${100 - w} 184
      L ${100 + w} 184 L ${100 + w} 126 L ${100 + 62} 128 L ${100 + 58} 68
      L ${100 + 34} 56 C ${100 + 26} 50 ${100 + 16} 46 100 46 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M${100 - 34} 56 L ${100 - 10} 68 L ${100 - 10} 184" fill="none" stroke="${stroke}" stroke-width="1.2"/>
    <path d="M${100 + 34} 56 L ${100 + 10} 68 L ${100 + 10} 184" fill="none" stroke="${stroke}" stroke-width="1.2"/>
    <path d="M${100 - 34} 56 L 100 52 L ${100 + 34} 56 L 100 74 Z" fill="url(#s-${id})" stroke="${stroke}" stroke-width="0.7"/>
    <rect x="${100 - 44}" y="96" width="20" height="16" fill="${shade(hex, -5)}" stroke="${stroke}" stroke-width="0.7"/>
    <rect x="${100 + 24}" y="96" width="20" height="16" fill="${shade(hex, -5)}" stroke="${stroke}" stroke-width="0.7"/>`;
}

function jacket(id, hex, spread) {
  const w = 49 + spread;
  const stroke = shade(hex, -22);
  return `
    ${ground(id)}
    <path d="M100 44 C ${100 - 18} 44 ${100 - 28} 48 ${100 - 36} 55
      L ${100 - 62} 68 L ${100 - 66} 134 L ${100 - w} 132 L ${100 - w} 180
      L ${100 + w} 180 L ${100 + w} 132 L ${100 + 66} 134 L ${100 + 62} 68
      L ${100 + 36} 55 C ${100 + 28} 48 ${100 + 18} 44 100 44 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M${100 - 36} 55 L ${100 - 14} 74 L ${100 - 6} 180" fill="none" stroke="${stroke}" stroke-width="1.3"/>
    <path d="M${100 + 36} 55 L ${100 + 14} 74 L ${100 + 6} 180" fill="none" stroke="${stroke}" stroke-width="1.3"/>
    <path d="M${100 - 36} 55 L ${100 - 14} 74 L 100 58 Z" fill="url(#s-${id})" stroke="${stroke}" stroke-width="0.7"/>
    <path d="M${100 + 36} 55 L ${100 + 14} 74 L 100 58 Z" fill="url(#s-${id})" stroke="${stroke}" stroke-width="0.7"/>
    <rect x="${100 - w}" y="168" width="${w * 2}" height="12" fill="${shade(hex, -10)}" opacity="0.7"/>`;
}

function trousers(id, hex, spread) {
  // Each leg is drawn as its own closed shape, so the gap between them is a
  // real gap. Drawn as one outline they read as leggings, which is the tell
  // that nobody looked at the result.
  const hip = 36 + spread * 0.55;      // half-width at the seat
  const thigh = 20 + spread * 0.62;    // half-width of one leg at the top
  const hem = 11 + spread * 0.85;      // half-width of one leg at the hem
  const crotch = 104;
  const floor = 212;
  const stroke = shade(hex, -20);
  const inner = 2.5;                    // half the gap between the legs

  const leg = (dir) => {
    const x = (v) => 100 + dir * v;
    return `<path d="M ${x(hip)} 44
      C ${x(hip)} 70 ${x(thigh + 6)} 84 ${x(thigh)} ${crotch - 4}
      L ${x(hem + 4)} ${floor}
      L ${x(inner)} ${floor}
      L ${x(inner)} ${crotch - 6}
      C ${x(inner)} ${crotch - 24} ${x(6)} 62 ${x(10)} 44 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.8" stroke-linejoin="round"/>`;
  };

  return `
    ${ground(id, 222, 52)}
    ${leg(-1)}${leg(1)}
    <path d="M${100 - hip} 44 L ${100 + hip} 44 L ${100 + hip - 1} 58
      C ${100 + 20} 66 ${100 - 20} 66 ${100 - hip + 1} 58 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.8"/>
    <rect x="${100 - hip}" y="30" width="${hip * 2}" height="15" rx="1.5"
      fill="${shade(hex, -8)}" stroke="${stroke}" stroke-width="0.8"/>
    <path d="M100 45 v 26" stroke="${stroke}" stroke-width="1" opacity="0.75"/>
    <rect x="${100 - 7}" y="30" width="14" height="8" rx="1" fill="${shade(hex, -16)}"/>
    <path d="M${100 - hip + 6} 52 h 13 M ${100 + hip - 19} 52 h 13"
      stroke="${shade(hex, -14)}" stroke-width="1" opacity="0.55"/>
    <path d="M${100 - thigh * 0.5} 116 q 2 48 ${-hem * 0.12} 84" fill="none"
      stroke="${shade(hex, 6)}" stroke-width="0.9" opacity="0.45"/>
    <path d="M${100 + thigh * 0.5} 116 q -2 48 ${hem * 0.12} 84" fill="none"
      stroke="${shade(hex, 6)}" stroke-width="0.9" opacity="0.45"/>
    <path d="M${100 - hem - 4} ${floor - 8} L ${100 - inner} ${floor - 8}
             M ${100 + inner} ${floor - 8} L ${100 + hem + 4} ${floor - 8}"
      stroke="${shade(hex, -13)}" stroke-width="1.2"/>`;
}

/* Footwear is drawn in side profile, toe to the left. A flat-lay of a shoe
 * from above tells you nothing about its silhouette, which is the whole reason
 * the engine picked it. */

function sneaker(id, hex) {
  const light = hexToLch(hex)[0] > 55;
  const stroke = shade(hex, light ? -26 : 18);
  const line = detail(hex, 24);
  const sole = shade(hex, light ? -8 : 32, -8);
  const panel = shade(hex, light ? -9 : 11);
  return `
    ${ground(id, 196, 62)}
    <path d="M24 158
      C 22 140 30 129 48 123
      L 84 113 L 118 103
      C 126 100 130 96 136 94
      L 141 108
      C 148 120 158 124 166 118
      C 172 113 174 106 175 100
      C 182 108 184 132 181 158 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M24 158 C 22 140 30 129 48 123 L 63 119 C 58 132 57 146 59 158 Z"
      fill="${panel}" stroke="${stroke}" stroke-width="0.8"/>
    <path d="M118 103 C 126 100 130 96 136 94 L 141 108 L 124 113 Z"
      fill="${panel}" stroke="${stroke}" stroke-width="0.8"/>
    <path d="M141 110 C 149 122 159 126 167 119" fill="none"
      stroke="${line}" stroke-width="2.2" opacity="0.8" stroke-linecap="round"/>
    <path d="M66 120 L 126 102" fill="none" stroke="${line}" stroke-width="1.1" opacity="0.7"/>
    ${[0, 1, 2, 3].map((i) =>
      `<path d="M${76 + i * 13} ${124 - i * 4} l 14 -5" stroke="${line}"
        stroke-width="2.6" stroke-linecap="round"/>`
    ).join('')}
    <path d="M62 148 C 88 138 112 130 138 126" fill="none" stroke="${line}"
      stroke-width="2.4" opacity="0.5"/>
    <path d="M160 124 C 168 132 172 142 172 158" fill="none" stroke="${line}"
      stroke-width="1.2" opacity="0.55"/>
    <path d="M22 156 L 182 156 C 188 156 190 163 188 171 C 186 179 178 183 168 183
      L 44 183 C 30 183 22 175 21 167 C 20 161 20 156 22 156 Z"
      fill="${sole}" stroke="${stroke}" stroke-width="0.9"/>
    <path d="M21 168 L 189 168" stroke="${detail(sole, 16)}" stroke-width="1.3" opacity="0.5"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) =>
      `<path d="M${40 + i * 21} 173 v 8" stroke="${detail(sole, 14)}" stroke-width="1.2" opacity="0.38"/>`
    ).join('')}`;
}

function loafer(id, hex) {
  const light = hexToLch(hex)[0] > 55;
  const stroke = shade(hex, light ? -28 : 16);
  const line = detail(hex, 20);
  return `
    ${ground(id, 192, 58)}
    <path d="M28 156
      C 26 142 35 131 56 126
      L 100 115 L 132 106
      C 142 103 152 104 158 109
      C 167 116 171 130 171 144
      C 171 152 171 155 170 157 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M56 126 C 84 119 112 111 134 106
      C 140 112 142 120 140 128
      C 112 130 82 138 60 146
      C 55 139 54 131 56 126 Z"
      fill="${shade(hex, light ? -8 : 10)}" stroke="${stroke}" stroke-width="0.8"/>
    <path d="M92 122 q 18 -6 34 -8" stroke="${line}" stroke-width="2.4"
      fill="none" stroke-linecap="round"/>
    <path d="M150 112 C 160 120 164 134 163 156" fill="none" stroke="${line}"
      stroke-width="1.2" opacity="0.6"/>
    <path d="M26 154 L 174 154 C 180 154 181 161 179 168
      C 177 174 170 176 162 176 L 46 176 C 32 176 24 168 24 161 C 24 156 24 154 26 154 Z"
      fill="${shade(hex, light ? -18 : -8, -6)}" stroke="${stroke}" stroke-width="0.9"/>
    <path d="M24 166 L 180 166" stroke="${line}" stroke-width="1" opacity="0.4"/>`;
}

function boot(id, hex) {
  const stroke = shade(hex, -24);
  return `
    ${ground(id, 198, 58)}
    <path d="M110 68 L 172 68 L 176 150 C 178 158 178 160 177 164
      L 30 164 C 28 148 34 136 52 129 C 76 120 100 114 108 106 Z"
      fill="url(#g-${id})" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M110 68 L 172 68 L 172 82 L 110 82 Z" fill="${shade(hex, 8)}" stroke="${stroke}" stroke-width="0.7"/>
    ${[0, 1, 2, 3, 4].map((i) =>
      `<path d="M${116 + i * 1.5} ${94 + i * 13} h 30" stroke="${detail(hex, 26)}"
        stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>`
    ).join('')}
    <path d="M108 106 C 100 116 84 122 60 130" fill="none" stroke="${stroke}" stroke-width="1" opacity="0.7"/>
    <path d="M26 162 L 180 162 C 186 162 187 170 184 178 L 44 182
      C 32 182 24 174 24 168 C 24 164 24 162 26 162 Z"
      fill="${shade(hex, -32)}" stroke="${stroke}" stroke-width="0.8"/>
    <path d="M24 172 L 185 172" stroke="${shade(hex, -18)}" stroke-width="1.2" opacity="0.8"/>`;
}

const DRAW = { tee, knit, sweat, shirt, overshirt, jacket, trousers, sneaker, loafer, boot };

let uid = 0;

/**
 * Render one garment.
 * @param {{name:string, fit:string, colour:{hex:string}, slot:string}} piece
 */
export function drawGarment(piece, { size = 200 } = {}) {
  const kind = categorise(piece.name, piece.slot);
  const id = `gm${++uid}`;
  const hex = piece.colour?.hex ?? '#888888';
  const spread = FIT_SPREAD[piece.fit] ?? 0;
  const body = (DRAW[kind] ?? tee)(id, hex, spread);
  return `<svg class="garment" viewBox="0 0 200 240" width="${size}" height="${size * 1.2}"
    role="img" aria-label="${escapeAttr(piece.fit && piece.fit !== 'n/a' ? `${piece.fit} ` : '')}${escapeAttr(piece.name)} in ${escapeAttr(piece.colour?.name ?? hex)}"
    >${defs(id, hex)}${body}</svg>`;
}

/** A stacked flat-lay of a whole look, for the card face. */
export function drawLook(look, { size = 150 } = {}) {
  const order = [look.layer, look.top, look.bottom, look.shoes].filter(Boolean);
  return order.map((p, i) =>
    `<div class="flatlay__item" style="--i:${i}">${drawGarment(p, { size })}</div>`
  ).join('');
}

export function swatchStyle(hex) {
  return `--sw:${hex};--sw-ink:${contrastInk(hex)}`;
}

function escapeAttr(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
