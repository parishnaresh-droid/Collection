/**
 * face.js — finding the face, and finding the parts of it worth measuring.
 *
 * The previous version looked for the largest compact blob of skin-coloured
 * pixels. That is a heuristic, and heuristics lose: in the photo this was built
 * against it kept choosing a wall of orange marigolds over an actual person.
 *
 * This uses a real detector — pico.js, a decision-tree cascade in about 200
 * lines, MIT licensed — plus the same author's pupil localiser. Together they
 * cost 240KB and 1.2MB of binary, both served from this origin, both loaded
 * only once a photo exists. No neural network, no CDN, nothing leaves the
 * device.
 *
 * Why pupils matter: inter-pupillary distance is the classic unit of facial
 * anthropometry. With two pupils you get scale *and* roll angle, which means
 * the sample regions can be placed in a frame attached to the face rather than
 * to the photograph. A head tilted thirty degrees still gets measured on its
 * cheeks rather than on its ear.
 */

import pico from '../../vendor/pico.js';
import lploc from '../../vendor/lploc.js';

const CASCADE_URL = new URL('../../data/facefinder.bin', import.meta.url);
const PUPLOC_URL = new URL('../../data/puploc.bin', import.meta.url);

let faceFinder = null;
let faceFinderPromise = null;
let pupilFinder = null;
let pupilFinderPromise = null;

/** Detection quality below this is noise. Empirical, per the cascade's author. */
export const QUALITY_THRESHOLD = 4.5;

export async function loadFaceFinder() {
  if (faceFinder) return faceFinder;
  if (!faceFinderPromise) {
    faceFinderPromise = fetch(CASCADE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`face model failed to load (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => { faceFinder = pico.unpack_cascade(new Int8Array(buf)); return faceFinder; });
  }
  return faceFinderPromise;
}

/** Loaded separately and later: it is five times the size and only refines. */
export async function loadPupilFinder() {
  if (pupilFinder) return pupilFinder;
  if (!pupilFinderPromise) {
    pupilFinderPromise = fetch(PUPLOC_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`pupil model failed to load (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => { pupilFinder = lploc.unpack_localizer(new Uint8Array(buf)); return pupilFinder; })
      .catch(() => null); // refinement is optional; never let it break a reading
  }
  return pupilFinderPromise;
}

/** Luma, at the weights the cascade was trained with. */
export function toGrayscale(rgba, nrows, ncols) {
  const gray = new Uint8Array(nrows * ncols);
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const i = r * 4 * ncols + 4 * c;
      gray[r * ncols + c] = (2 * rgba[i] + 7 * rgba[i + 1] + rgba[i + 2]) / 10;
    }
  }
  return gray;
}

/**
 * Detect faces. Returns them largest-first as {x, y, size, score} in pixels,
 * where x and y are the centre of the detection circle.
 */
export async function detectFaces(imageData, { minSizeFraction = 0.08 } = {}) {
  const classify = await loadFaceFinder();
  const { width: ncols, height: nrows, data } = imageData;

  const image = { pixels: toGrayscale(data, nrows, ncols), nrows, ncols, ldim: ncols };
  const params = {
    shiftfactor: 0.09,
    minsize: Math.max(24, Math.round(Math.min(nrows, ncols) * minSizeFraction)),
    maxsize: Math.round(Math.min(nrows, ncols) * 1.0),
    scalefactor: 1.1,
  };

  const clustered = pico.cluster_detections(pico.run_cascade(image, classify, params), 0.2);
  return clustered
    .filter((d) => d[3] > QUALITY_THRESHOLD)
    .map((d) => ({ y: d[0], x: d[1], size: d[2], score: d[3] }))
    .sort((a, b) => b.size - a.size);
}

/**
 * Refine the eye positions inside a detected face. The localiser is run
 * several times from jittered starting points and the results averaged, which
 * is what its author recommends and what stops a single bad initialisation
 * putting an eye on an eyebrow.
 */
export async function locatePupils(imageData, face, { perturbs = 63 } = {}) {
  const locate = await loadPupilFinder();
  if (!locate) return null;

  const { width: ncols, height: nrows, data } = imageData;
  const image = { pixels: toGrayscale(data, nrows, ncols), nrows, ncols, ldim: ncols };

  // The localiser perturbs its starting point and takes the median, which is
  // what makes it robust — but it perturbs with Math.random, so the same photo
  // would read slightly differently every time. A reading that moves when you
  // re-run it is not a measurement, so Math.random is swapped for a seeded
  // generator for the duration of the call and put back afterwards.
  const realRandom = Math.random;
  let seed = 0x2f6e2b1;
  Math.random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };

  const s = face.size;
  let left = null, right = null;
  try {
    // Starting points: where eyes sit inside a pico detection circle.
    const [lr, lc] = locate(face.y - 0.075 * s, face.x - 0.175 * s, 0.35 * s, perturbs, image);
    const [rr, rc] = locate(face.y - 0.075 * s, face.x + 0.175 * s, 0.35 * s, perturbs, image);
    if (Number.isFinite(lr) && Number.isFinite(lc)) left = { x: lc, y: lr };
    if (Number.isFinite(rr) && Number.isFinite(rc)) right = { x: rc, y: rr };
  } finally {
    Math.random = realRandom;
  }
  if (!left || !right) return null;

  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const dist = Math.hypot(dx, dy);
  // Sanity: pupils should be roughly a third of the detection circle apart and
  // roughly level. Anything else means the localiser wandered.
  if (dist < s * 0.2 || dist > s * 0.6 || Math.abs(dy) > dist * 0.6) return null;

  return { left, right, dist, angle: Math.atan2(dy, dx) };
}

/**
 * The regions worth measuring, and why each one.
 *
 * Facial skin is not one colour. The forehead and the cheeks differ in both
 * lightness and redness — cheeks carry more haemoglobin, the forehead catches
 * more light and more sun, the jaw sits in shadow and, on a lot of men, under
 * stubble. Sampling one spot and calling it "your skin tone" is the single
 * biggest source of error in this kind of tool.
 *
 * So five regions get measured separately, and the reading is the dominant
 * colour across all of them rather than any one of them.
 */
export const REGION_SPECS = [
  { id: 'forehead', label: 'Forehead', u: 0.00, v: -0.78, r: 0.46, weight: 1.0,
    note: 'catches the most light, and the most sun' },
  { id: 'cheekL', label: 'Left cheek', u: -0.72, v: 0.52, r: 0.40, weight: 1.25,
    note: 'the most haemoglobin — this is where undertone shows' },
  { id: 'cheekR', label: 'Right cheek', u: 0.72, v: 0.52, r: 0.40, weight: 1.25,
    note: 'paired with the left, so one-sided light can be spotted' },
  { id: 'nose', label: 'Nose bridge', u: 0.00, v: 0.18, r: 0.26, weight: 0.7,
    note: 'often the lightest point, and where highlights land' },
  { id: 'jaw', label: 'Jaw', u: 0.00, v: 1.45, r: 0.34, weight: 0.6,
    note: 'the shaded edge of the face; discounted because of stubble' },
];

/**
 * Place the regions in a coordinate frame attached to the face.
 *
 * With pupils, the frame is built from them: origin at the midpoint, one unit
 * is the inter-pupillary distance, and the axes are rotated with the head, so
 * a tilted face is still measured on its cheeks.
 *
 * Without pupils it falls back to the detection circle, where one unit is
 * 0.37 of the diameter — the ratio of inter-pupillary distance to face width
 * that pico's own training data implies.
 */
export function faceRegions(face, pupils) {
  let ox, oy, unit, cos, sin;

  if (pupils) {
    ox = (pupils.left.x + pupils.right.x) / 2;
    oy = (pupils.left.y + pupils.right.y) / 2;
    unit = pupils.dist;
    cos = Math.cos(pupils.angle);
    sin = Math.sin(pupils.angle);
  } else {
    ox = face.x;
    oy = face.y - face.size * 0.085;
    unit = face.size * 0.37;
    cos = 1; sin = 0;
  }

  return REGION_SPECS.map((spec) => ({
    ...spec,
    // Rotate the (u, v) offset into image space.
    x: ox + (spec.u * cos - spec.v * sin) * unit,
    y: oy + (spec.u * sin + spec.v * cos) * unit,
    radius: spec.r * unit * 0.5,
  }));
}

/** A hair sampling window placed above the forehead, in the same frame. */
export function hairRegion(face, pupils) {
  const unit = pupils ? pupils.dist : face.size * 0.37;
  const ox = pupils ? (pupils.left.x + pupils.right.x) / 2 : face.x;
  const oy = pupils ? (pupils.left.y + pupils.right.y) / 2 : face.y - face.size * 0.085;
  const cos = pupils ? Math.cos(pupils.angle) : 1;
  const sin = pupils ? Math.sin(pupils.angle) : 0;
  const v = -1.55;
  return {
    id: 'hair',
    label: 'Hair',
    x: ox + (0 * cos - v * sin) * unit,
    y: oy + (0 * sin + v * cos) * unit,
    radius: unit * 0.3,
  };
}
