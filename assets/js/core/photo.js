/**
 * photo.js — reading a person's colouring out of a photograph, on their own
 * device. Nothing here uploads anything; the image goes into a canvas in the
 * page and the only thing that survives is two hex values.
 *
 * Three problems have to be solved in order:
 *   1. the camera lied about the colour       -> illuminant correction
 *   2. which pixels are actually skin         -> YCbCr skin mask
 *   3. which pixels are actually hair         -> darkest cluster above the face
 *
 * Every stage can be overridden by dragging the sample points, because
 * automatic detection is right most of the time and confidently wrong the rest,
 * and the person can see their own face better than any heuristic can.
 */

export const MAX_EDGE = 1400;

/* ------------------------------------------------------- loading an image */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error('That file is not an image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be opened.')); };
    img.src = url;
  });
}

export function toCanvas(img, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/* ------------------------------------------------ 1. illuminant correction
 *
 * A photo taken under warm indoor light is orange everywhere, and an undertone
 * read off it will say "warm" no matter who is in the frame. The Shades of
 * Grey method estimates the light source by taking a Minkowski mean of each
 * channel and assuming the scene averages to neutral, then divides it out.
 * p=6 sits between the grey-world assumption (p=1) and max-RGB (p=infinity),
 * and is the value that tends to win in the literature.
 */
export function estimateIlluminant(imageData, p = 6) {
  const d = imageData.data;
  let sr = 0, sg = 0, sb = 0, n = 0;
  // Every 4th pixel is plenty and keeps this instant on a phone.
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 200) continue;
    sr += Math.pow(d[i], p);
    sg += Math.pow(d[i + 1], p);
    sb += Math.pow(d[i + 2], p);
    n++;
  }
  if (!n) return { r: 1, g: 1, b: 1, strength: 0 };
  const r = Math.pow(sr / n, 1 / p);
  const g = Math.pow(sg / n, 1 / p);
  const b = Math.pow(sb / n, 1 / p);
  const mean = (r + g + b) / 3;
  const gains = { r: mean / (r || 1), g: mean / (g || 1), b: mean / (b || 1) };
  // How far from neutral the light was, as a single number for the interface.
  const strength = Math.max(
    Math.abs(gains.r - 1), Math.abs(gains.g - 1), Math.abs(gains.b - 1)
  );
  return { ...gains, strength };
}

/**
 * Apply the gains, partially and with a ceiling.
 *
 * The grey-world assumption is that a scene averages to neutral. Plenty of
 * photographs politely decline to do that — a red jumper against a brick wall,
 * or, in the photo this was built against, a courtyard full of orange
 * marigolds. Left unclamped the correction "fixes" the flowers and ruins the
 * face. So each gain is capped: ordinary indoor warmth gets corrected, a
 * genuinely colourful scene is left alone.
 */
export const MAX_GAIN = 1.18;
export const MIN_GAIN = 0.85;

export function correctIlluminant(imageData, gains, amount = 0.8) {
  const out = new ImageData(
    new Uint8ClampedArray(imageData.data), imageData.width, imageData.height
  );
  const d = out.data;
  const cap = (g) => Math.max(MIN_GAIN, Math.min(MAX_GAIN, g));
  const gr = 1 + (cap(gains.r) - 1) * amount;
  const gg = 1 + (cap(gains.g) - 1) * amount;
  const gb = 1 + (cap(gains.b) - 1) * amount;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * gr);
    d[i + 1] = Math.min(255, d[i + 1] * gg);
    d[i + 2] = Math.min(255, d[i + 2] * gb);
  }
  return out;
}

/* ------------------------------------------------------- 2. the skin mask */

/** The classical YCbCr skin envelope. Crude, fast, and works across the whole
 *  range of human skin because chrominance varies far less than luminance. */
export function isSkin(r, g, b) {
  const cr = 128 + (0.5 * r - 0.418688 * g - 0.081312 * b);
  const cb = 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b);
  return cr >= 133 && cr <= 180 && cb >= 77 && cb <= 130;
}

/**
 * A stricter test, used only for *finding* the face rather than sampling it.
 *
 * The plain YCbCr envelope is generous by design, which is the right call when
 * you already know where the face is and wrong when you are searching a whole
 * photograph — terracotta, timber, and in the photo this was built against, a
 * wall of orange marigolds, all sit inside it. Skin has two extra properties
 * those materials mostly do not: red above green above blue in that order, and
 * a saturation that stays in a narrow band. Flowers and paint are far more
 * saturated than a person.
 */
export function isSkinStrict(r, g, b) {
  if (!isSkin(r, g, b)) return false;
  if (!(r > g && g >= b)) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 32 || max > 250) return false;
  const sat = (max - min) / max;
  // The floor matters as much as the ceiling: below it sits concrete, plaster
  // and pale timber, which are neutral enough to pass a hue test and are
  // usually the largest surface in the frame.
  if (sat < 0.16 || sat > 0.56) return false;
  return r - b >= 16;
}

/**
 * Find the face without loading a neural network.
 *
 * Uses the browser's own face detector where it exists, and otherwise falls
 * back to the skin mask plus a prior: in a photo someone took to be looked at,
 * the face is near the horizontal centre and in the upper half. That prior is
 * doing real work — it is what stops a bare forearm winning.
 */
export async function findFace(canvas) {
  if ('FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(canvas);
      if (faces && faces.length) {
        const { x, y, width, height } = faces[0].boundingBox;
        return { x, y, width, height, source: 'browser face detector' };
      }
    } catch { /* falls through to the heuristic */ }
  }

  return findFaceByRegion(canvas);
}

/**
 * Find the face as a *region* rather than a centroid.
 *
 * A centroid over every skin-coloured pixel in the frame is the obvious
 * approach and it fails badly the moment the background contains anything
 * warm, because it averages the face together with the wall behind it. Grouping
 * the mask into connected blobs first and then judging each blob on its own
 * merits — size, how close it is to square, how solidly it fills its own
 * bounding box, and where it sits in the frame — survives that.
 */
export function findFaceByRegion(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;

  // Work on a small grid. A face is thousands of pixels; a hundred is plenty
  // to find it, and this keeps the whole search well under a frame's budget.
  const gw = 160;
  const gh = Math.max(1, Math.round((H / W) * gw));
  const sx = W / gw, sy = H / gh;
  const full = ctx.getImageData(0, 0, W, H).data;

  const mask = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const px = Math.min(W - 1, Math.floor(x * sx + sx / 2));
      const py = Math.min(H - 1, Math.floor(y * sy + sy / 2));
      const i = (py * W + px) * 4;
      mask[y * gw + x] = isSkinStrict(full[i], full[i + 1], full[i + 2]) ? 1 : 0;
    }
  }

  // Flood fill each blob with an explicit stack; recursion would blow up on a
  // full-frame match and this runs on phones.
  const label = new Int32Array(gw * gh).fill(-1);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = blobs.length;
    const blob = { id, area: 0, minX: gw, minY: gh, maxX: 0, maxY: 0, sumX: 0, sumY: 0 };
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % gw, y = (p / gw) | 0;
      blob.area++; blob.sumX += x; blob.sumY += y;
      if (x < blob.minX) blob.minX = x; if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y; if (y > blob.maxY) blob.maxY = y;
      if (x > 0 && mask[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1); }
      if (x < gw - 1 && mask[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && mask[p - gw] && label[p - gw] === -1) { label[p - gw] = id; stack.push(p - gw); }
      if (y < gh - 1 && mask[p + gw] && label[p + gw] === -1) { label[p + gw] = id; stack.push(p + gw); }
    }
    blobs.push(blob);
  }

  const total = gw * gh;
  const candidates = [];
  for (const b of blobs) {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    if (b.area < 24 || bw < 5 || bh < 5) continue;

    // A head is roughly as wide as it is tall, give or take the neck.
    const aspect = bw / bh;
    const aspectScore = Math.exp(-Math.pow((aspect - 0.82) / 0.42, 2));
    // And it is a solid lump, unlike a string of flowers or a patterned wall.
    const fill = b.area / (bw * bh);
    const fillScore = Math.min(1, fill / 0.55);
    // Photographs of people put the person near the middle and the head high.
    const cx = b.sumX / b.area / gw;
    const cy = b.sumY / b.area / gh;
    const placeScore = Math.exp(-Math.pow((cx - 0.5) / 0.32, 2)) *
                       Math.exp(-Math.pow((cy - 0.34) / 0.26, 2));
    // Size is a band, not a maximum. A face occupies a few per cent of a
    // photograph; something covering a fifth of the frame is a wall.
    const frac = b.area / total;
    const areaScore = Math.exp(-Math.pow((Math.log(frac / 0.035)) / 1.15, 2));
    // A face clipped at the very edge of the frame is possible but unusual,
    // and a background surface running off the edge is the common case.
    const edge = (b.minX === 0 ? 0.75 : 1) * (b.maxX === gw - 1 ? 0.75 : 1) *
                 (b.maxY === gh - 1 ? 0.7 : 1);

    candidates.push({
      ...b, bw, bh, aspect, fill,
      prelim: areaScore * aspectScore * fillScore * placeScore * edge,
    });
  }

  // Texture is the discriminator that settles the close calls. A face has eyes,
  // nostrils, a mouth and a hairline, so its luminance varies sharply over
  // short distances. Pavement, plaster and skin-coloured walls are flat. This
  // is only computed for the handful of blobs still in contention, because it
  // reads full-resolution pixels.
  candidates.sort((a, b) => b.prelim - a.prelim);
  let best = null;
  for (const c of candidates.slice(0, 6)) {
    const texture = localVariance(full, W, H,
      c.minX * sx, c.minY * sy, c.bw * sx, c.bh * sy);
    const textureScore = Math.min(1, texture / 16);
    const score = c.prelim * (0.35 + 0.65 * textureScore);
    if (!best || score > best.score) best = { ...c, score, texture };
  }

  if (!best || best.score < 0.04) {
    return {
      x: W * 0.33, y: H * 0.16, width: W * 0.34, height: H * 0.3,
      source: 'centre of frame', weak: true,
    };
  }

  // The blob covers face plus neck. Keep the upper portion, which is the part
  // with cheeks in it.
  const x = best.minX * sx;
  const y = best.minY * sy;
  const width = best.bw * sx;
  const height = Math.min(best.bh * sy, width * 1.35);

  return { x, y, width, height, source: 'skin-region search', score: best.score };
}

/* --------------------------------------------------------- 3. sampling --- */

/**
 * Median colour of a disc, optionally restricted to skin-coloured pixels.
 * Median rather than mean: a single specular highlight on the nose or one
 * dark eyelash pixel would drag a mean several points, and a median does not
 * care.
 */
export function sampleDisc(imageData, cx, cy, radius, { skinOnly = false } = {}) {
  const { width: W, height: H, data } = imageData;
  const rs = [], gs = [], bs = [];
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (skinOnly && !isSkin(r, g, b)) continue;
      rs.push(r); gs.push(g); bs.push(b);
    }
  }
  if (rs.length < 12) {
    if (skinOnly) return sampleDisc(imageData, cx, cy, radius, { skinOnly: false });
    return null;
  }
  const med = (a) => { a.sort((m, n) => m - n); return a[a.length >> 1]; };
  return { r: med(rs), g: med(gs), b: med(bs), count: rs.length };
}

const median = (arr) => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };

/**
 * Mean absolute difference between neighbouring samples inside a rectangle —
 * a cheap stand-in for "how much detail is in here". Faces score high, flat
 * surfaces score near zero, and it costs one pass over a coarse grid.
 */
function localVariance(data, W, H, x, y, w, h) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W - 1, Math.round(x + w));
  const y1 = Math.min(H - 1, Math.round(y + h));
  const step = Math.max(2, Math.round(Math.min(x1 - x0, y1 - y0) / 28));
  if (x1 - x0 < step * 3 || y1 - y0 < step * 3) return 0;

  const lum = (px, py) => {
    const i = (py * W + px) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };

  let sum = 0, n = 0;
  for (let py = y0; py + step <= y1; py += step) {
    for (let px = x0; px + step <= x1; px += step) {
      sum += Math.abs(lum(px, py) - lum(px + step, py));
      sum += Math.abs(lum(px, py) - lum(px, py + step));
      n += 2;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Read the skin from the whole face at once rather than from a single point.
 *
 * Sampling one spot is fragile in exactly the ways faces are varied: a beard,
 * a shadow down one side, a highlight on the nose. So this takes every
 * skin-masked pixel in the middle of the face box, throws away the darkest
 * quarter (beard, shadow, nostril, the shaded side of the nose) and the
 * brightest tenth (specular highlight), and takes the median of what is left.
 * The marker the interface shows sits at the centroid of the pixels that
 * actually survived, so it points at what was really measured.
 */
export function sampleFace(imageData, face) {
  const { width: W, height: H, data } = imageData;
  const x0 = Math.max(0, Math.round(face.x + face.width * 0.16));
  const x1 = Math.min(W - 1, Math.round(face.x + face.width * 0.84));
  // Skip the hairline at the top and the beard/jaw at the bottom.
  const y0 = Math.max(0, Math.round(face.y + face.height * 0.16));
  const y1 = Math.min(H - 1, Math.round(face.y + face.height * 0.70));

  const px = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!isSkinStrict(r, g, b)) continue;
      px.push({ x, y, r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b });
    }
  }
  if (px.length < 60) return null;

  px.sort((a, b) => a.lum - b.lum);
  const keep = px.slice(Math.floor(px.length * 0.25), Math.floor(px.length * 0.90));
  const use = keep.length > 30 ? keep : px;

  const cx = use.reduce((s, p) => s + p.x, 0) / use.length;
  const cy = use.reduce((s, p) => s + p.y, 0) / use.length;
  return {
    r: median(use.map((p) => p.r)),
    g: median(use.map((p) => p.g)),
    b: median(use.map((p) => p.b)),
    count: use.length,
    point: { x: cx, y: cy },
  };
}

/**
 * The hair sample: a narrow window just above the face box, centred, taking
 * the median of its darker half. Hair is not always dark, but it is reliably
 * darker than the scalp line and the sky behind it, and keeping the window
 * tight to the top of the head is what stops a doorway winning.
 */
export function sampleHair(imageData, face) {
  const { width: W, height: H, data } = imageData;
  const x0 = Math.max(0, Math.round(face.x + face.width * 0.32));
  const x1 = Math.min(W - 1, Math.round(face.x + face.width * 0.68));
  const y0 = Math.max(0, Math.round(face.y - face.height * 0.26));
  const y1 = Math.max(0, Math.round(face.y - face.height * 0.02));
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;

  const px = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      px.push({ x, y, r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b });
    }
  }
  if (px.length < 20) return null;
  px.sort((a, b) => a.lum - b.lum);
  const use = px.slice(0, Math.max(10, Math.floor(px.length * 0.5)));
  return {
    r: median(use.map((p) => p.r)),
    g: median(use.map((p) => p.g)),
    b: median(use.map((p) => p.b)),
    count: use.length,
    point: {
      x: use.reduce((s, p) => s + p.x, 0) / use.length,
      y: use.reduce((s, p) => s + p.y, 0) / use.length,
    },
  };
}

export const hex = (r, g, b) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/**
 * The whole pipeline. Returns the corrected image data (so the page can draw
 * exactly what was measured), the two sample points, and their hex values.
 */
export async function analysePhoto(img, { correctLight = true } = {}) {
  const canvas = toCanvas(img);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let data = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Find the face on the original pixels, *before* touching the colour.
  // Correction is about measuring the skin accurately; it should have no say
  // in where the skin is, and letting it vote made the detector chase flowers.
  const face = await findFace(canvas);

  const illuminant = estimateIlluminant(data);
  if (correctLight && illuminant.strength > 0.02) {
    data = correctIlluminant(data, illuminant);
    ctx.putImageData(data, 0, 0);
  }

  const radius = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * 0.022));

  const skin = sampleFace(data, face);
  const hair = sampleHair(data, face);

  const skinPoint = skin?.point ?? {
    x: face.x + face.width * 0.5,
    y: face.y + face.height * 0.5,
  };
  const hairPoint = hair?.point ?? {
    x: face.x + face.width * 0.5,
    y: Math.max(2, face.y - face.height * 0.12),
  };

  return {
    canvas,
    imageData: data,
    face,
    radius,
    illuminant,
    lightCorrected: correctLight && illuminant.strength > 0.02,
    points: { skin: skinPoint, hair: hairPoint },
    skinHex: skin ? hex(skin.r, skin.g, skin.b) : null,
    hairHex: hair ? hex(hair.r, hair.g, hair.b) : null,
    skinPixels: skin?.count ?? 0,
    // Whether the automatic read should be trusted without the user checking it.
    confident: Boolean(skin && skin.count > 400 && !face.weak),
  };
}

/** Re-read both hex values after a point has moved. */
export function readPoints(imageData, skinPoint, hairPoint, radius) {
  const skin = sampleDisc(imageData, skinPoint.x, skinPoint.y, radius, { skinOnly: true });
  const hair = sampleDisc(imageData, hairPoint.x, hairPoint.y, radius * 0.8);
  return {
    skinHex: skin ? hex(skin.r, skin.g, skin.b) : null,
    hairHex: hair ? hex(hair.r, hair.g, hair.b) : null,
    skinPixels: skin?.count ?? 0,
  };
}
