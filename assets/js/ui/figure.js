/**
 * figure.js — the proportion diagram.
 *
 * Draws a person at whatever height you give it, with their own landmark
 * heights marked and the halving band called out. The silhouette is
 * deliberately abstract: this is a diagram of ratios, not a picture of anybody.
 */

import { verticalProportions, LANDMARKS } from '../core/anatomy.js';

const VB = { w: 300, h: 460, pad: 34 };

export function drawFigure(heightCm) {
  const p = verticalProportions(heightCm);
  if (!p) return { svg: '', data: null };

  const floorY = VB.h - VB.pad;
  const topY = VB.pad;
  const scale = (floorY - topY) / heightCm; // px per cm
  const y = (cm) => floorY - cm * scale;
  const cx = 104;

  const shoulderY = y(p.landmarks.shoulder);
  const waistY = y(p.landmarks.waist);
  const hipY = y(p.landmarks.hip);
  const crotchY = y(p.landmarks.crotch);
  const kneeY = y(p.landmarks.knee);
  const halveY = y(p.halvingLine);
  const headR = (heightCm * 0.0625) * scale; // ~1/8 of stature, the usual canon

  const tick = (yy, label, value, opts = {}) => `
    <g class="fig-tick${opts.strong ? ' is-strong' : ''}">
      <line x1="${VB.pad - 14}" y1="${yy}" x2="196" y2="${yy}"
        stroke="currentColor" stroke-width="${opts.strong ? 1.2 : 0.7}"
        stroke-dasharray="${opts.strong ? '' : '2 4'}" opacity="${opts.strong ? 0.9 : 0.42}"/>
      <text x="202" y="${yy - 3}" font-size="10.5" fill="currentColor" opacity="0.92"
        font-family="var(--font-sans)">${label}</text>
      <text x="202" y="${yy + 9}" font-size="9" fill="currentColor" opacity="0.5"
        font-family="var(--font-mono)">${value}</text>
    </g>`;

  const svg = `
  <svg viewBox="0 0 ${VB.w} ${VB.h}" role="img"
       aria-label="A figure ${heightCm} centimetres tall, with the shoulder, waist, hip and knee heights marked, and the band that would cut the silhouette in half highlighted.">
    <defs>
      <linearGradient id="figBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.16"/>
        <stop offset="1" stop-color="currentColor" stop-opacity="0.07"/>
      </linearGradient>
    </defs>

    <!-- the band to keep a hem out of -->
    <rect x="${VB.pad - 14}" y="${y(p.deadZoneFloor?.[1] ?? p.halvingLine + 4)}"
      width="${210 - VB.pad}" height="${Math.abs(y(p.halvingLine - 4) - y(p.halvingLine + 4))}"
      fill="#C8452D" opacity="0.14"/>

    <!-- figure -->
    <circle cx="${cx}" cy="${topY + headR}" r="${headR}" fill="url(#figBody)"
      stroke="currentColor" stroke-width="0.9" stroke-opacity="0.5"/>
    <path d="M${cx} ${shoulderY - headR * 0.55}
      C ${cx - headR * 0.5} ${shoulderY - headR * 0.5} ${cx - 26} ${shoulderY} ${cx - 30} ${shoulderY + 4}
      L ${cx - 24} ${waistY} L ${cx - 27} ${hipY} L ${cx - 25} ${crotchY}
      L ${cx - 20} ${kneeY} L ${cx - 17} ${floorY}
      L ${cx - 3} ${floorY} L ${cx - 5} ${kneeY} L ${cx} ${crotchY + 4}
      L ${cx + 5} ${kneeY} L ${cx + 3} ${floorY}
      L ${cx + 17} ${floorY} L ${cx + 20} ${kneeY} L ${cx + 25} ${crotchY}
      L ${cx + 27} ${hipY} L ${cx + 24} ${waistY} L ${cx + 30} ${shoulderY + 4}
      C ${cx + 26} ${shoulderY} ${cx + headR * 0.5} ${shoulderY - headR * 0.5} ${cx} ${shoulderY - headR * 0.55} Z"
      fill="url(#figBody)" stroke="currentColor" stroke-width="0.9" stroke-opacity="0.5"
      stroke-linejoin="round"/>

    ${tick(shoulderY, 'Shoulder', `${p.landmarks.shoulder}cm`)}
    ${tick(waistY, 'Natural waist', `${p.landmarks.waist}cm`)}
    ${tick(hipY, 'Hip bone', `${p.landmarks.hip}cm`)}
    ${tick(halveY, 'Cuts you in half', `${p.halvingLine}cm · avoid`, { strong: true })}
    ${tick(kneeY, 'Knee', `${p.landmarks.knee}cm`)}

    <line x1="${VB.pad - 22}" y1="${shoulderY}" x2="${VB.pad - 22}" y2="${floorY}"
      stroke="currentColor" stroke-width="0.7" opacity="0.4"/>
    <text x="${VB.pad - 26}" y="${(shoulderY + floorY) / 2}" font-size="9"
      fill="currentColor" opacity="0.55" text-anchor="middle" font-family="var(--font-mono)"
      transform="rotate(-90 ${VB.pad - 26} ${(shoulderY + floorY) / 2})">silhouette</text>
  </svg>`;

  return { svg, data: p };
}

export { LANDMARKS };
