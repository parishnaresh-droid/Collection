/* ============================================================
   Garment renderer — studio product-shot treatment in SVG.
   Real construction detail: ribbed collar, shoulder seams,
   drop shoulders on oversized cuts, fabric shading, fold lines.
   Original artwork, no external assets.
   ============================================================ */

let __gradSeq = 0;

function shadeSet(hex, id) {
  return `
    <linearGradient id="fab${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${hex}" stop-opacity="1"/>
      <stop offset="46%"  stop-color="${hex}" stop-opacity="0.965"/>
      <stop offset="100%" stop-color="${hex}" stop-opacity="0.80"/>
    </linearGradient>
    <linearGradient id="lit${id}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.20"/>
      <stop offset="55%"  stop-color="#FFFFFF" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.13"/>
    </linearGradient>`;
}

function garmentTee(hex, fit) {
  const id = ++__gradSeq;
  const wide = /boxy|relaxed|oversized|baggy/i.test(fit || '');
  const bodyW = wide ? 150 : 128;
  const shoulder = wide ? 20 : 12;
  const cx = 110;
  const half = bodyW / 2;
  const sleeveEnd = wide ? 104 : 92;
  const hemY = wide ? 214 : 206;

  return `<svg viewBox="0 0 220 250" class="garment" role="img" aria-label="tee">
    <defs>${shadeSet(hex, id)}</defs>
    <path d="M${cx - half + 4} 46 L${cx - half - 30} ${68 + shoulder} L${cx - half - 22} ${sleeveEnd} L${cx - half + 10} ${sleeveEnd - 6} L${cx - half + 6} 70 Z" fill="url(#fab${id})"/>
    <path d="M${cx + half - 4} 46 L${cx + half + 30} ${68 + shoulder} L${cx + half + 22} ${sleeveEnd} L${cx + half - 10} ${sleeveEnd - 6} L${cx + half - 6} 70 Z" fill="url(#fab${id})"/>
    <path d="M${cx - half + 4} 46 Q${cx} 34 ${cx + half - 4} 46 L${cx + half - 2} ${hemY} Q${cx} ${hemY + 10} ${cx - half + 2} ${hemY} Z" fill="url(#fab${id})"/>
    <path d="M${cx - half + 4} 46 Q${cx} 34 ${cx + half - 4} 46 L${cx + half - 2} ${hemY} Q${cx} ${hemY + 10} ${cx - half + 2} ${hemY} Z" fill="url(#lit${id})"/>
    <path d="M${cx - 34} 96 Q${cx - 30} 150 ${cx - 36} ${hemY - 12}" fill="none" stroke="#000" stroke-opacity="0.055" stroke-width="7" stroke-linecap="round"/>
    <path d="M${cx + 32} 104 Q${cx + 38} 152 ${cx + 30} ${hemY - 16}" fill="none" stroke="#000" stroke-opacity="0.045" stroke-width="6" stroke-linecap="round"/>
    <path d="M${cx - half + 12} ${hemY - 34} Q${cx} ${hemY - 22} ${cx + half - 12} ${hemY - 34}" fill="none" stroke="#000" stroke-opacity="0.05" stroke-width="5" stroke-linecap="round"/>
    <path d="M${cx - half + 5} 47 L${cx - half + 9} 71" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="1.4"/>
    <path d="M${cx + half - 5} 47 L${cx + half - 9} 71" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="1.4"/>
    <path d="M${cx - half - 22} ${sleeveEnd} L${cx - half + 10} ${sleeveEnd - 6}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="2.2"/>
    <path d="M${cx + half + 22} ${sleeveEnd} L${cx + half - 10} ${sleeveEnd - 6}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="2.2"/>
    <path d="M${cx - 30} 44 Q${cx} 30 ${cx + 30} 44 Q${cx} 62 ${cx - 30} 44 Z" fill="${hex}" stroke="#000" stroke-opacity="0.20" stroke-width="1.6"/>
    <path d="M${cx - 24} 45 Q${cx} 36 ${cx + 24} 45" fill="none" stroke="#000" stroke-opacity="0.13" stroke-width="1.2"/>
    <path d="M${cx - 30} 44 Q${cx} 56 ${cx + 30} 44" fill="none" stroke="#FFF" stroke-opacity="0.16" stroke-width="1.2"/>
    <path d="M${cx - half + 2} ${hemY} Q${cx} ${hemY + 10} ${cx + half - 2} ${hemY}" fill="none" stroke="#000" stroke-opacity="0.15" stroke-width="2"/>
  </svg>`;
}

function garmentTrousers(hex, fit) {
  const id = ++__gradSeq;
  const wide = /wide|relaxed|baggy/i.test(fit || '');
  const straight = /straight/i.test(fit || '');
  const cx = 110;
  const waistHalf = 52;
  const legTop = wide ? 46 : (straight ? 42 : 40);
  const legBot = wide ? 50 : (straight ? 38 : 28);
  const hemY = 300;

  return `<svg viewBox="0 0 220 320" class="garment" role="img" aria-label="trousers">
    <defs>${shadeSet(hex, id)}</defs>
    <path d="M${cx - waistHalf} 26 L${cx - 3} 26 L${cx - 3} ${hemY} L${cx - legBot - 4} ${hemY} L${cx - waistHalf + 2} 120 Z" fill="url(#fab${id})"/>
    <path d="M${cx + waistHalf} 26 L${cx + 3} 26 L${cx + 3} ${hemY} L${cx + legBot + 4} ${hemY} L${cx + waistHalf - 2} 120 Z" fill="url(#fab${id})"/>
    <path d="M${cx - waistHalf} 26 L${cx + waistHalf} 26 L${cx + waistHalf - 2} 118 Q${cx} 150 ${cx - waistHalf + 2} 118 Z" fill="url(#fab${id})"/>
    <path d="M${cx - waistHalf} 26 L${cx + waistHalf} 26 L${cx + legBot + 4} ${hemY} L${cx - legBot - 4} ${hemY} Z" fill="url(#lit${id})"/>
    <rect x="${cx - waistHalf}" y="20" width="${waistHalf * 2}" height="22" rx="2" fill="${hex}" stroke="#000" stroke-opacity="0.18" stroke-width="1.4"/>
    <line x1="${cx - waistHalf + 6}" y1="31" x2="${cx + waistHalf - 6}" y2="31" stroke="#000" stroke-opacity="0.10" stroke-width="1"/>
    <path d="M${cx - 2} 42 Q${cx + 7} 70 ${cx - 1} 106" fill="none" stroke="#000" stroke-opacity="0.17" stroke-width="1.5"/>
    <line x1="${cx}" y1="112" x2="${cx}" y2="${hemY}" stroke="#000" stroke-opacity="0.13" stroke-width="2.5"/>
    <path d="M${cx - legTop + 6} 196 Q${cx - 26} 206 ${cx - 8} 200" fill="none" stroke="#000" stroke-opacity="0.06" stroke-width="6" stroke-linecap="round"/>
    <path d="M${cx + legTop - 6} 204 Q${cx + 26} 214 ${cx + 8} 208" fill="none" stroke="#000" stroke-opacity="0.055" stroke-width="6" stroke-linecap="round"/>
    <line x1="${cx - legBot - 4}" y1="${hemY}" x2="${cx - 3}" y2="${hemY}" stroke="#000" stroke-opacity="0.20" stroke-width="2.4"/>
    <line x1="${cx + 3}" y1="${hemY}" x2="${cx + legBot + 4}" y2="${hemY}" stroke="#000" stroke-opacity="0.20" stroke-width="2.4"/>
  </svg>`;
}

function garmentShoe(hex) {
  const id = ++__gradSeq;
  return `<svg viewBox="0 0 220 110" class="garment" role="img" aria-label="sneaker">
    <defs>${shadeSet(hex, id)}</defs>
    <path d="M24 74 Q22 40 52 33 L96 26 Q118 24 134 38 L176 62 Q196 72 196 82 L196 84 Q196 88 190 88 L32 88 Q24 88 24 78 Z" fill="url(#fab${id})"/>
    <path d="M24 74 Q22 40 52 33 L96 26 Q118 24 134 38 L176 62 Q196 72 196 82 L196 84 Q196 88 190 88 L32 88 Q24 88 24 78 Z" fill="url(#lit${id})"/>
    <path d="M150 48 Q142 68 140 88" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="1.6"/>
    <g stroke="#FFF" stroke-opacity="0.42" stroke-width="2.2" stroke-linecap="round">
      <line x1="72" y1="40" x2="94" y2="50"/>
      <line x1="78" y1="52" x2="100" y2="42"/>
      <line x1="88" y1="34" x2="110" y2="46"/>
    </g>
    <path d="M24 56 Q34 36 54 33" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="2"/>
    <path d="M22 88 L196 86 Q202 86 202 92 L202 96 Q202 100 196 100 L28 100 Q20 100 20 94 Z" fill="#F0F0F2" stroke="#000" stroke-opacity="0.12" stroke-width="1"/>
    <line x1="24" y1="94" x2="198" y2="93" stroke="#000" stroke-opacity="0.09" stroke-width="1"/>
  </svg>`;
}

function garmentLayer(hex) {
  const id = ++__gradSeq;
  const cx = 110;
  return `<svg viewBox="0 0 220 250" class="garment" role="img" aria-label="jacket">
    <defs>${shadeSet(hex, id)}</defs>
    <path d="M52 50 L20 74 L28 116 L58 110 L58 72 Z" fill="url(#fab${id})"/>
    <path d="M168 50 L200 74 L192 116 L162 110 L162 72 Z" fill="url(#fab${id})"/>
    <path d="M52 50 Q78 38 ${cx - 4} 52 L${cx - 4} 212 L54 212 Z" fill="url(#fab${id})"/>
    <path d="M168 50 Q142 38 ${cx + 4} 52 L${cx + 4} 212 L166 212 Z" fill="url(#fab${id})"/>
    <path d="M52 50 Q110 34 168 50 L166 212 L54 212 Z" fill="url(#lit${id})"/>
    <line x1="${cx}" y1="52" x2="${cx}" y2="212" stroke="#000" stroke-opacity="0.22" stroke-width="3"/>
    <path d="M${cx - 34} 46 L${cx - 4} 54 L${cx - 4} 78 L${cx - 30} 60 Z" fill="${hex}" stroke="#000" stroke-opacity="0.18" stroke-width="1.3"/>
    <path d="M${cx + 34} 46 L${cx + 4} 54 L${cx + 4} 78 L${cx + 30} 60 Z" fill="${hex}" stroke="#000" stroke-opacity="0.18" stroke-width="1.3"/>
    <rect x="${cx - 62}" y="98" width="30" height="24" rx="1.5" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="1.3"/>
    <rect x="${cx + 32}" y="98" width="30" height="24" rx="1.5" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="1.3"/>
    <line x1="54" y1="212" x2="166" y2="212" stroke="#000" stroke-opacity="0.17" stroke-width="2"/>
  </svg>`;
}

function comboCardHtml(combo, index) {
  return `
  <article class="combo-card" style="--combo-accent:${combo.top.hex}; animation-delay:${index * 90}ms">
    <header class="combo-head">
      <span class="combo-index mono">${String(index + 1).padStart(2, '0')}</span>
      <h3 class="combo-name">${escapeHtml(combo.name)}</h3>
    </header>
    <div class="flatlay">
      ${combo.layer ? `<div class="flatlay-item layer-item">${garmentLayer(combo.layer.hex)}</div>` : ''}
      <div class="flatlay-item tee-item">${garmentTee(combo.top.hex, combo.top.fit)}</div>
      <div class="flatlay-item trouser-item">${garmentTrousers(combo.bottom.hex, combo.bottom.fit)}</div>
      <div class="flatlay-item shoe-item">${garmentShoe(combo.shoes.hex)}</div>
    </div>
    <dl class="combo-specs">
      <div><dt>Top</dt><dd>${escapeHtml(combo.top.colour)} ${escapeHtml(combo.top.garment)}<span class="spec-fit">${escapeHtml(combo.top.fit)}</span></dd></div>
      <div><dt>Bottom</dt><dd>${escapeHtml(combo.bottom.colour)} ${escapeHtml(combo.bottom.garment)}<span class="spec-fit">${escapeHtml(combo.bottom.fit)}</span></dd></div>
      <div><dt>Shoes</dt><dd>${escapeHtml(combo.shoes.colour)} ${escapeHtml(combo.shoes.garment)}</dd></div>
      ${combo.layer ? `<div><dt>Layer</dt><dd>${escapeHtml(combo.layer.colour)} ${escapeHtml(combo.layer.garment)}</dd></div>` : ''}
    </dl>
    <p class="combo-why">${escapeHtml(combo.why)}</p>
  </article>`;
}
