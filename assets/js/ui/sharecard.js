/**
 * sharecard.js — renders the reading into one image worth posting.
 *
 * Composed on a 2D canvas rather than screenshotted, so the type is crisp at
 * any density and the layout does not depend on what the viewport happened to
 * be. Everything is drawn from the same values the page shows; nothing is
 * fetched and nothing is uploaded.
 */

import { contrastInk } from '../core/colour.js';

const W = 1080;
const H = 1350;

const INK = '#F4F2EF';
const INK_DIM = 'rgba(244, 242, 239, 0.58)';
const PAPER = '#0B0B0C';

/** Wrap text to a width, returning the lines. */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {object} opts
 * @param {object} opts.reading   colour.readSkin() output
 * @param {object} opts.palette   palette.buildPalette() output
 * @param {object} opts.look      the chosen look
 * @param {string|null} opts.figure  data URL of the 3D view, if it is open
 * @param {string} opts.url
 */
export async function buildShareCard({ reading, palette, look, figure = null, url = '' }) {
  // Webfonts have to be resolved before anything is measured, or the layout is
  // computed in a fallback face and then drawn in the real one.
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  const pad = 72;

  /* ---- the figure, if the fitting room was open ------------------------- */
  let figureBottom = pad + 40;
  if (figure) {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = figure;
    }).catch(() => null);
    if (img) {
      const boxH = 620;
      const scale = Math.min((W - pad * 2) / img.width, boxH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, pad + 20, dw, dh);
      figureBottom = pad + 20 + dh;
    }
  }

  /* ---- headline --------------------------------------------------------- */
  // Without a figure the card has a lot of air; starting lower splits it
  // evenly top and bottom instead of leaving a hole under the footer.
  let y = figure ? Math.max(figureBottom + 64, 340) : 430;

  ctx.fillStyle = INK_DIM;
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.letterSpacing = '3px';
  ctx.fillText('MEASURED, NOT GUESSED', pad, y);
  ctx.letterSpacing = '0px';

  y += 58;
  ctx.fillStyle = INK;
  ctx.font = '400 74px "Instrument Serif", serif';
  const headline = `${reading.undertone}, ${reading.depth}, ${reading.clarity}`;
  ctx.fillText(headline.charAt(0).toUpperCase() + headline.slice(1), pad, y);

  y += 44;
  ctx.fillStyle = INK_DIM;
  ctx.font = '400 26px Inter, sans-serif';
  const sub = `Hue ${reading.lch.h.toFixed(0)}°  ·  ITA ${reading.ita.toFixed(0)}°  ·  chroma ${reading.chroma.toFixed(0)}` +
    (reading.contrast ? `  ·  ${reading.contrast.level} contrast` : '');
  ctx.fillText(sub, pad, y);

  /* ---- the palette strip ------------------------------------------------ */
  y += 56;
  const swatches = palette.wearable;
  const sw = (W - pad * 2) / swatches.length;
  swatches.forEach((s, i) => {
    ctx.fillStyle = s.hex;
    ctx.fillRect(pad + i * sw, y, sw + 0.5, 110);
  });
  y += 110;

  /* ---- black and white -------------------------------------------------- */
  y += 56;
  const anchors = [palette.black, palette.white];
  const colW = (W - pad * 2 - 32) / 2;
  anchors.forEach((a, i) => {
    const x = pad + i * (colW + 32);
    ctx.fillStyle = a.hex;
    roundRect(ctx, x, y, 72, 92, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,242,239,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = INK_DIM;
    ctx.font = '500 17px "JetBrains Mono", monospace';
    ctx.letterSpacing = '2px';
    ctx.fillText(i === 0 ? 'YOUR BLACK' : 'YOUR WHITE', x + 92, y + 22);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = INK;
    ctx.font = '560 30px Inter, sans-serif';
    const name = a.name.charAt(0).toUpperCase() + a.name.slice(1);
    ctx.fillText(name, x + 92, y + 58);

    ctx.fillStyle = INK_DIM;
    ctx.font = '400 20px "JetBrains Mono", monospace';
    ctx.fillText(a.hex, x + 92, y + 84);
  });
  y += 92;

  /* ---- the look --------------------------------------------------------- */
  if (look) {
    y += 56;
    ctx.fillStyle = INK_DIM;
    ctx.font = '500 17px "JetBrains Mono", monospace';
    ctx.letterSpacing = '2px';
    ctx.fillText(`${String(look.label).toUpperCase()} · ${String(look.style?.name ?? '').toUpperCase()}`, pad, y);
    ctx.letterSpacing = '0px';

    y += 36;
    ctx.font = '400 24px Inter, sans-serif';
    const pieces = [look.top, look.bottom, look.shoes].filter(Boolean);
    pieces.forEach((pc) => {
      ctx.fillStyle = pc.colour.hex;
      roundRect(ctx, pad, y - 17, 22, 22, 3);
      ctx.fill();
      ctx.fillStyle = INK;
      const label = `${pc.fit && pc.fit !== 'n/a' ? `${pc.fit} ` : ''}${pc.name}`;
      ctx.fillText(label.charAt(0).toUpperCase() + label.slice(1), pad + 38, y);
      ctx.fillStyle = INK_DIM;
      ctx.fillText(pc.colour.name, pad + 38 + ctx.measureText(label).width + 20, y);
      y += 40;
    });
  }

  /* ---- footer ----------------------------------------------------------- */
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(pad + 9, H - pad - 9, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '400 38px "Instrument Serif", serif';
  ctx.fillText('Tone', pad + 30, H - pad);

  ctx.fillStyle = INK_DIM;
  ctx.font = '400 21px Inter, sans-serif';
  const urlText = url.replace(/^https?:\/\//, '');
  ctx.fillText(urlText, W - pad - ctx.measureText(urlText).width, H - pad);

  return canvas.toDataURL('image/png');
}

/** Trigger a download of a data URL. */
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
