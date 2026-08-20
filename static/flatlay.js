// ============================================================
//  Flat-lay outfit renderer
//  Draws real garment silhouettes in the actual recommended colours.
//  Original SVG paths - no external assets, no licensing concerns.
// ============================================================

function garmentTee(hex, fit) {
  const wide = /boxy|relaxed|oversized|baggy/i.test(fit || '');
  const w = wide ? 96 : 82;
  const x = (120 - w) / 2;
  return `<svg viewBox="0 0 120 130" class="garment" role="img" aria-label="top">
    <path d="M${x + 22} 14 L${x + 6} 22 L${x - 2} 48 L${x + 14} 54 L${x + 14} 118
             Q${x + 14} 124 ${x + 20} 124 L${x + w - 20} 124 Q${x + w - 14} 124 ${x + w - 14} 118
             L${x + w - 14} 54 L${x + w + 2} 48 L${x + w - 6} 22 L${x + w - 22} 14
             Q${x + w / 2} 30 ${x + 22} 14 Z"
          fill="${hex}" stroke="rgba(0,0,0,0.16)" stroke-width="1.2"/>
    <path d="M${x + 22} 14 Q${x + w / 2} 30 ${x + w - 22} 14"
          fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="1.2"/>
  </svg>`;
}

function garmentTrousers(hex, fit) {
  const wide = /wide|relaxed|baggy|straight/i.test(fit || '');
  const legW = wide ? 34 : 26;
  return `<svg viewBox="0 0 120 160" class="garment" role="img" aria-label="bottom">
    <path d="M28 8 L92 8 L96 30 L${60 + legW / 2} 152 L${60 + 2} 152 L60 66
             L58 152 L${60 - legW / 2 - 2} 152 L24 30 Z"
          fill="${hex}" stroke="rgba(0,0,0,0.16)" stroke-width="1.2"/>
    <line x1="28" y1="18" x2="92" y2="18" stroke="rgba(0,0,0,0.18)" stroke-width="1.2"/>
  </svg>`;
}

function garmentShoe(hex) {
  return `<svg viewBox="0 0 120 60" class="garment" role="img" aria-label="shoes">
    <path d="M14 44 Q14 24 34 22 L54 20 Q66 20 74 28 L98 38 Q108 42 108 48
             L108 50 Q108 52 104 52 L20 52 Q14 52 14 46 Z"
          fill="${hex}" stroke="rgba(0,0,0,0.18)" stroke-width="1.2"/>
    <path d="M14 46 L108 48" stroke="rgba(0,0,0,0.25)" stroke-width="2.4"/>
  </svg>`;
}

function garmentLayer(hex) {
  return `<svg viewBox="0 0 120 130" class="garment" role="img" aria-label="layer">
    <path d="M30 14 L10 24 L4 52 L20 58 L20 120 L52 120 L56 26 Z"
          fill="${hex}" stroke="rgba(0,0,0,0.18)" stroke-width="1.2"/>
    <path d="M90 14 L110 24 L116 52 L100 58 L100 120 L68 120 L64 26 Z"
          fill="${hex}" stroke="rgba(0,0,0,0.18)" stroke-width="1.2"/>
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
      <div class="flatlay-item">${garmentTee(combo.top.hex, combo.top.fit)}</div>
      <div class="flatlay-item">${garmentTrousers(combo.bottom.hex, combo.bottom.fit)}</div>
      <div class="flatlay-item shoe-item">${garmentShoe(combo.shoes.hex)}</div>
    </div>

    <dl class="combo-specs">
      <div><dt>Top</dt><dd>${escapeHtml(combo.top.colour)} ${escapeHtml(combo.top.garment)}<span class="spec-fit">${escapeHtml(combo.top.fit)}</span></dd></div>
      <div><dt>Bottom</dt><dd>${escapeHtml(combo.bottom.colour)} ${escapeHtml(combo.bottom.garment)}<span class="spec-fit">${escapeHtml(combo.bottom.fit)}</span></dd></div>
      <div><dt>Shoes</dt><dd>${escapeHtml(combo.shoes.colour)} ${escapeHtml(combo.shoes.garment)}</dd></div>
      ${combo.layer ? `<div><dt>Layer</dt><dd>${escapeHtml(combo.layer.garment)}</dd></div>` : ''}
    </dl>

    <p class="combo-why">${escapeHtml(combo.why)}</p>
  </article>`;
}
