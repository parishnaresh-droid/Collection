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

import { rgbToLab, labToRgb, labToHex, deltaE2000 } from './colour.js';
import { detectFaces, locatePupils, faceRegions, hairRegion } from './face.js';

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
 * Mean absolute difference between neighbouring samples inside a rectangle — a
 * cheap stand-in for "how much detail is in here". Faces score high, flat
 * surfaces score near zero. Used by the fallback region search to tell a face
 * from a wall when both are skin-coloured.
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


/* ============================================================ measurement ==
 *
 * Facial skin is not one colour, so the reading is not one sample.
 *
 * Five regions are measured separately, their pixels pooled, and the pool
 * clustered in CIELAB. The biggest cluster that still looks like skin is the
 * answer — "the major colour you could find on the face", which is exactly the
 * right way to put it. Beard shadow, a specular highlight on the nose and the
 * shaded side of a face all form their own smaller clusters and are left out
 * of the result rather than averaged into it.
 */

const median = (arr) => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };

export const hex = (r, g, b) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Collect the skin-coloured pixels inside one circular region. */
export function collectRegion(imageData, region, { skinOnly = true, stride = 1 } = {}) {
  const { width: W, height: H, data } = imageData;
  const { x: cx, y: cy, radius } = region;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  const out = [];

  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (skinOnly && !isSkin(r, g, b)) continue;
      out.push([r, g, b]);
    }
  }
  return out;
}

/**
 * Weighted k-means in CIELAB.
 *
 * LAB rather than RGB because the clusters have to mean something
 * perceptually: a shadow on one cheek should land in a different cluster from
 * the lit cheek only if a person would call them different colours.
 *
 * Seeded deterministically along the lightness axis, because a reading that
 * changes between runs of the same photo is not a measurement.
 */
export function kmeansLab(points, k = 3, iterations = 14) {
  if (!points.length) return [];
  const labs = points.map((p) => ({ lab: rgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]), w: p.weight ?? 1, rgb: p.rgb }));
  const Ls = labs.map((p) => p.lab[0]).sort((a, b) => a - b);
  const centroids = [];
  for (let i = 0; i < k; i++) {
    const q = Ls[Math.min(Ls.length - 1, Math.floor(((i + 0.5) / k) * Ls.length))];
    const seed = labs.find((p) => p.lab[0] === q) ?? labs[0];
    centroids.push([...seed.lab]);
  }

  const assign = new Array(labs.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < labs.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = deltaE2000(labs[i].lab, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; moved = true; }
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < labs.length; i++) {
      const s = sums[assign[i]], w = labs[i].w;
      s[0] += labs[i].lab[0] * w; s[1] += labs[i].lab[1] * w; s[2] += labs[i].lab[2] * w; s[3] += w;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
    if (!moved && it > 1) break;
  }

  const clusters = centroids.map((lab) => ({ lab, mass: 0, count: 0 }));
  for (let i = 0; i < labs.length; i++) {
    clusters[assign[i]].mass += labs[i].w;
    clusters[assign[i]].count++;
  }
  return clusters
    .filter((c) => c.count > 0)
    .map((c) => ({ ...c, hex: labToHex(c.lab[0], c.lab[1], c.lab[2]) }))
    .sort((a, b) => b.mass - a.mass);
}

/**
 * The whole facial measurement: per-region colours, the dominant colour across
 * them, and how much the face varies.
 */
/** Two cluster centroids closer than this describe the same colour under
 *  different light, not two colours. */
export const CLUSTER_MERGE_DE = 10;

/** A facial region further than this from the dominant colour is not skin. */
export const OUTLIER_DE = 15;

export function mergeClusters(clusters, threshold = CLUSTER_MERGE_DE) {
  const out = [];
  for (const c of clusters) {
    const near = out.find((o) => deltaE2000(o.lab, c.lab) < threshold);
    if (!near) { out.push({ ...c, lab: [...c.lab], merged: 1 }); continue; }
    const total = near.mass + c.mass;
    near.lab = near.lab.map((v, i) => (v * near.mass + c.lab[i] * c.mass) / total);
    near.mass = total;
    near.count += c.count;
    near.merged++;
    near.hex = labToHex(near.lab[0], near.lab[1], near.lab[2]);
  }
  return out.sort((a, b) => b.mass - a.mass);
}

export function measureFace(imageData, regions) {
  const pool = [];
  const perRegion = [];

  for (const region of regions) {
    let px = collectRegion(imageData, region, { skinOnly: true });
    // A region that is mostly beard or mostly hair will not pass the skin
    // mask. Rather than forcing it, that region is reported as unread.
    if (px.length < 25) {
      perRegion.push({ ...region, read: false, pixels: px.length });
      continue;
    }
    // Trim the extremes before taking the region's own median: the darkest
    // pixels are shadow and stubble, the brightest are specular highlights,
    // and neither is skin colour.
    const lum = px.map((p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]);
    const order = px.map((_, i) => i).sort((a, b) => lum[a] - lum[b]);
    const keep = order.slice(Math.floor(order.length * 0.18), Math.floor(order.length * 0.93)).map((i) => px[i]);
    const use = keep.length > 15 ? keep : px;

    const med = [0, 1, 2].map((ch) => median(use.map((p) => p[ch])));
    perRegion.push({
      ...region,
      read: true,
      pixels: use.length,
      hex: hex(med[0], med[1], med[2]),
      lab: rgbToLab(med[0], med[1], med[2]),
    });

    // Feed the pool at a stride, so a large region does not simply outvote a
    // small one beyond its stated weight.
    const step = Math.max(1, Math.round(use.length / 900));
    for (let i = 0; i < use.length; i += step) pool.push({ rgb: use[i], weight: region.weight ?? 1 });
  }

  if (pool.length < 40) return null;

  // Lighting splits one skin colour into several clusters — a lit cheek and a
  // shaded one are the same skin. Clusters closer together than the threshold
  // are merged by mass before anything is called dominant, otherwise the
  // winner is decided by which side of the face the light happened to be on.
  const clusters = mergeClusters(kmeansLab(pool, 3), CLUSTER_MERGE_DE);

  // Then prefer the largest cluster that still passes the stricter skin test:
  // a dominant cluster of beard is dominant but wrong.
  const skinLike = clusters.filter((c) => {
    const [r, g, b] = labToRgb(c.lab[0], c.lab[1], c.lab[2]);
    return isSkinStrict(r, g, b);
  });
  const dominant = skinLike[0] ?? clusters[0];

  // Mark which regions belong to the same surface as the dominant colour.
  // A beard passes every skin test going — it is dark brown, which is a skin
  // colour — so the test that works is distance from the rest of the face.
  // Anything this far from the dominant cluster is hair, shadow or a shaved
  // jaw, and describing it as skin variation would describe the beard.
  for (const r of perRegion) {
    if (!r.read) { r.isSkin = false; r.outlier = true; continue; }
    r.dE = deltaE2000(r.lab, dominant.lab);
    r.isSkin = r.dE <= OUTLIER_DE;
    r.outlier = !r.isSkin;
  }

  const skinRegions = perRegion.filter((r) => r.read && r.isSkin);
  let spread = 0;
  for (let i = 0; i < skinRegions.length; i++) {
    for (let j = i + 1; j < skinRegions.length; j++) {
      spread = Math.max(spread, deltaE2000(skinRegions[i].lab, skinRegions[j].lab));
    }
  }

  return {
    hex: dominant.hex,
    lab: dominant.lab,
    share: dominant.mass / clusters.reduce((s, c) => s + c.mass, 0),
    clusters,
    regions: perRegion.map((r) => ({
      ...r,
      deltaE: r.read ? Math.round(deltaE2000(r.lab, dominant.lab) * 10) / 10 : null,
    })),
    spread: Math.round(spread * 10) / 10,
    sampled: pool.length,
  };
}

/** Median of a disc, used for hair and for a manually dragged sample. */
export function sampleDiscMedian(imageData, region, { skinOnly = false, darkHalf = false } = {}) {
  let px = collectRegion(imageData, region, { skinOnly });
  if (px.length < 12) px = collectRegion(imageData, region, { skinOnly: false });
  if (px.length < 8) return null;
  if (darkHalf) {
    const lum = px.map((p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]);
    const order = px.map((_, i) => i).sort((a, b) => lum[a] - lum[b]);
    px = order.slice(0, Math.max(8, Math.floor(order.length * 0.5))).map((i) => px[i]);
  }
  const med = [0, 1, 2].map((ch) => median(px.map((p) => p[ch])));
  return { hex: hex(med[0], med[1], med[2]), count: px.length };
}

/* ================================================================ pipeline = */

/**
 * Load, correct, detect, measure. Everything on the device.
 */
export const DRAFT_EDGE = 900;
export const TARGET_FACE_PX = 300;
export const MAX_WORKING_EDGE = 2200;

export async function analysePhoto(img, { correctLight = true } = {}) {
  // Pass one: find the face cheaply on a small canvas. The cascade is linear
  // in pixel count, so searching a 900px image costs a fraction of searching a
  // 2200px one and gives the same answer about *where* the face is.
  const draft = toCanvas(img, DRAFT_EDGE);
  const draftData = draft.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, draft.width, draft.height);

  let found = null;
  let detector = 'cascade';
  try {
    const faces = await detectFaces(draftData);
    if (faces.length) found = faces[0];
  } catch (err) {
    console.warn('[photo] face model unavailable, falling back:', err.message);
  }

  // Pass two: re-render at whatever resolution puts a useful number of pixels
  // inside the face. In a full-length photo the face can be a tenth of the
  // frame, and measuring skin from two hundred pixels is measuring noise.
  let workingEdge = 1400;
  if (found) {
    const draftEdge = Math.max(draft.width, draft.height);
    const wanted = draftEdge * (TARGET_FACE_PX / found.size);
    workingEdge = Math.round(Math.max(1200, Math.min(MAX_WORKING_EDGE, wanted)));
  }

  const canvas = toCanvas(img, workingEdge);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scaleUp = canvas.width / draft.width;

  let face;
  if (found) {
    face = { x: found.x * scaleUp, y: found.y * scaleUp, size: found.size * scaleUp, score: found.score };
  } else {
    const region = findFaceByRegion(canvas);
    detector = region.weak ? 'none' : 'skin-region fallback';
    face = {
      x: region.x + region.width / 2,
      y: region.y + region.height / 2,
      size: Math.max(region.width, region.height * 0.8),
      score: 0,
      weak: region.weak,
    };
  }

  // Eyes are refined on the working canvas, where there are enough pixels for
  // the localiser to be worth running.
  let pupils = null;
  if (detector === 'cascade') {
    try { pupils = await locatePupils(original, face); } catch { pupils = null; }
  }

  // White balance decides what colour the skin is. It is applied only after
  // detection, because it must never get a say in where the skin is.
  let data = original;
  const illuminant = estimateIlluminant(original);
  const corrected = correctLight && illuminant.strength > 0.02;
  if (corrected) {
    data = correctIlluminant(original, illuminant);
    ctx.putImageData(data, 0, 0);
  }

  const regions = faceRegions(face, pupils);
  const hairSpot = hairRegion(face, pupils);
  const measurement = measureFace(data, regions);
  const hair = sampleDiscMedian(data, hairSpot, { darkHalf: true });

  return {
    canvas,
    imageData: data,
    face,
    pupils,
    detector,
    workingEdge,
    regions,
    hairRegion: hairSpot,
    measurement,
    illuminant,
    lightCorrected: corrected,
    skinHex: measurement?.hex ?? null,
    hairHex: hair?.hex ?? null,
    skinPixels: measurement?.sampled ?? 0,
    confident: Boolean(measurement && detector === 'cascade' && measurement.sampled > 400),
  };
}

/** Re-measure after the user has moved a region or the hair point. */
export function remeasure(imageData, regions, hairSpot) {
  const measurement = measureFace(imageData, regions);
  const hair = sampleDiscMedian(imageData, hairSpot, { darkHalf: true });
  return {
    measurement,
    skinHex: measurement?.hex ?? null,
    hairHex: hair?.hex ?? null,
  };
}
