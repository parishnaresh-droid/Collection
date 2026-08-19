const form = document.getElementById('analyze-form');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const results = document.getElementById('results');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Reading...';

  try {
    const formData = new FormData(form);
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      errorMsg.textContent = data.error || 'Something went wrong';
      return;
    }

    renderResults(data);
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    errorMsg.textContent = 'Could not reach the server. Try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Read my fit';
  }
});

function renderResults(data) {
  document.getElementById('skin-swatch').style.background = data.skin.hex;
  document.getElementById('skin-hex').textContent = data.skin.hex;
  document.getElementById('skin-meta').textContent =
    `${data.skin.undertone} undertone, ${data.skin.depth} depth \u2014 from ${data.skin.pixels_sampled.toLocaleString()} sampled pixels`;

  document.getElementById('shape-name').textContent = data.shape.shape;
  document.getElementById('shape-reason').textContent = data.shape.reason;

  const worksList = document.getElementById('works-list');
  const avoidList = document.getElementById('avoid-list');
  worksList.innerHTML = data.style_works.map(w => `<li>${escapeHtml(w)}</li>`).join('');
  avoidList.innerHTML = data.style_avoid.map(a => `<li>${escapeHtml(a)}</li>`).join('');

  document.getElementById('palette-label').textContent = `Palette match: ${data.palette_label}`;

  const cardsEl = document.getElementById('outfit-cards');
  cardsEl.innerHTML = data.outfits.map(o => `
    <div class="outfit-card" style="--swatch-color: ${o.top_hex}">
      <span class="outfit-swatch" style="background: ${o.top_hex}"></span>
      <div class="outfit-text">
        <span class="top-color">${escapeHtml(o.top_color)} top</span>
        <span class="pairing">${escapeHtml(o.bottom)} &middot; ${escapeHtml(o.shoes)}</span>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
