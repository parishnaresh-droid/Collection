/**
 * figure3d.js — the fitting room.
 *
 * There are bought 3D clothing models you can drop into a scene, and they look
 * good, but they are one fixed body wearing one fixed outfit. The whole point
 * of this product is that the body is *yours* and the clothes are chosen for
 * it, so the figure is generated from the same measurements the rest of the
 * engine uses: height, chest, waist, hip. Change the numbers and the mannequin
 * changes shape. Change the outfit and the garments re-drape over it.
 *
 * How it is built
 *   - Cross-sections are solved from real circumferences. Given a measured
 *     chest of 100cm and a width-to-depth ratio, the ellipse that has that
 *     circumference is found numerically (Ramanujan's approximation), so the
 *     mannequin's chest really is 100cm around.
 *   - Those sections are lofted into one continuous surface. No spheres stuck
 *     onto cylinders — that is what made the previous attempt look like a toy.
 *   - Garments are offset shells over the same sections, expanded by an amount
 *     that comes from the fit the engine chose. "Relaxed" is 3cm of ease;
 *     "oversized" is 9cm and a dropped shoulder.
 *   - Lighting is a three-point studio rig over an image-based environment,
 *     with filmic tone mapping. Cloth is matte with a sheen term, which is the
 *     property that separates fabric from plastic.
 */

const THREE_URL = '../../vendor/three/three.module.js';
const ORBIT_URL = '../../vendor/three/jsm/OrbitControls.js';
const ROOM_URL = '../../vendor/three/jsm/RoomEnvironment.js';

let THREE = null;
let OrbitControls = null;
let RoomEnvironment = null;

/** three.js is 2MB. It loads when someone opens the fitting room, not before. */
export async function loadThree() {
  if (THREE) return THREE;
  const [core, orbit, room] = await Promise.all([
    import(/* @vite-ignore */ new URL(THREE_URL, import.meta.url).href),
    import(/* @vite-ignore */ new URL(ORBIT_URL, import.meta.url).href),
    import(/* @vite-ignore */ new URL(ROOM_URL, import.meta.url).href),
  ]);
  THREE = core;
  OrbitControls = orbit.OrbitControls;
  RoomEnvironment = room.RoomEnvironment;
  return THREE;
}

/* ====================================================== body construction == */

/** Ramanujan's approximation to the perimeter of an ellipse. */
function ellipsePerimeter(a, b) {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * Find the ellipse with a given circumference and width-to-depth ratio.
 * Bisection, because the perimeter is monotone in scale and twenty iterations
 * put us well inside a millimetre.
 */
function ellipseFromCircumference(circumference, ratio) {
  let lo = 0.001, hi = 1.5;
  for (let i = 0; i < 40; i++) {
    const a = (lo + hi) / 2;
    const b = a / ratio;
    if (ellipsePerimeter(a, b) < circumference) lo = a; else hi = a;
  }
  const a = (lo + hi) / 2;
  return { rx: a, rz: a / ratio };
}

/** Fractions of stature, matching the landmarks the rest of the app uses. */
const Y = {
  ankle: 0.039, calf: 0.14, knee: 0.285, thigh: 0.40, crotch: 0.47,
  hip: 0.53, waist: 0.60, lowChest: 0.66, chest: 0.72, upChest: 0.775,
  shoulder: 0.818, neck: 0.845, chin: 0.872, headTop: 1.0,
};

/**
 * Build the set of horizontal cross-sections that define the torso.
 * Everything is in metres.
 */
export function buildBodyProfile({ heightCm = 175, chest = null, waist = null, hip = null } = {}) {
  const H = heightCm / 100;

  // Where measurements are missing, fall back to proportions of stature. The
  // interface says when it is doing this rather than implying it measured.
  const chestC = (chest ?? heightCm * 0.545) / 100;
  const waistC = (waist ?? heightCm * 0.47) / 100;
  const hipC = (hip ?? heightCm * 0.535) / 100;

  const sec = (yFrac, circumference, ratio) => ({
    y: H * yFrac,
    ...ellipseFromCircumference(circumference, ratio),
  });

  const shoulderHalf = (H * 0.259) / 2;

  const torso = [
    sec(Y.crotch, hipC * 0.97, 1.30),
    sec(Y.hip, hipC, 1.38),
    sec(Y.waist + 0.02, waistC * 1.03, 1.30),
    sec(Y.waist + 0.045, waistC, 1.28),
    sec(Y.lowChest, (waistC + chestC) / 2, 1.30),
    sec(Y.chest, chestC, 1.33),
    sec(Y.upChest, chestC * 0.97, 1.36),
    { y: H * (Y.shoulder - 0.028), rx: shoulderHalf * 0.80,
      rz: ellipseFromCircumference(chestC * 0.94, 1.34).rz },
    { y: H * (Y.shoulder - 0.006), rx: shoulderHalf * 0.72,
      rz: ellipseFromCircumference(chestC * 0.84, 1.24).rz },
    { y: H * (Y.shoulder + 0.014), rx: shoulderHalf * 0.56,
      rz: ellipseFromCircumference(chestC * 0.66, 1.15).rz },
    { y: H * (Y.shoulder + 0.028), rx: shoulderHalf * 0.40,
      rz: ellipseFromCircumference(chestC * 0.5, 1.1).rz },
    sec(Y.neck, chestC * 0.38, 1.06),
    sec(Y.chin - 0.004, chestC * 0.36, 1.06),
  ];

  // Limbs are scaled from the torso rather than guessed independently, so a
  // broader chest comes with a thicker arm.
  const armTop = ellipseFromCircumference(chestC * 0.33, 1.05);
  const armWrist = ellipseFromCircumference(chestC * 0.175, 1.1);
  const thighR = ellipseFromCircumference(hipC * 0.585, 1.08);
  const kneeR = ellipseFromCircumference(hipC * 0.40, 1.05);
  const calfR = ellipseFromCircumference(hipC * 0.375, 1.06);
  const ankleR = ellipseFromCircumference(hipC * 0.225, 1.12);

  const hipX = ellipseFromCircumference(hipC, 1.38).rx;

  return {
    H, heightCm, torso, shoulderHalf,
    chestC, waistC, hipC,
    measured: Boolean(chest && waist && hip),
    arm: {
      // Shoulder joint, then a slight outward hang, then in at the wrist.
      spine: [
        { x: shoulderHalf * 0.66, y: H * (Y.shoulder - 0.004), z: 0 },
        { x: shoulderHalf * 0.80, y: H * (Y.shoulder - 0.035), z: 0 },
        { x: shoulderHalf * 0.86, y: H * (Y.shoulder - 0.085), z: 0.005 },
        { x: shoulderHalf * 1.02, y: H * 0.63, z: 0.012 },
        { x: shoulderHalf * 0.98, y: H * 0.545, z: 0.004 },
        { x: shoulderHalf * 0.93, y: H * 0.47, z: -0.008 },
      ],
      radii: [
        { rx: armTop.rx * 1.05, rz: armTop.rz * 1.08 },
        { rx: armTop.rx * 1.12, rz: armTop.rz * 1.1 },
        armTop,
        { rx: armTop.rx * 0.82, rz: armTop.rz * 0.82 },
        { rx: armWrist.rx * 1.18, rz: armWrist.rz * 1.18 },
        armWrist,
      ],
    },
    leg: {
      spine: [
        { x: hipX * 0.46, y: H * (Y.crotch + 0.02), z: 0 },
        { x: hipX * 0.47, y: H * Y.thigh, z: 0.002 },
        { x: hipX * 0.46, y: H * Y.knee, z: 0 },
        { x: hipX * 0.44, y: H * Y.calf, z: -0.006 },
        { x: hipX * 0.42, y: H * Y.ankle, z: -0.002 },
      ],
      radii: [thighR, { rx: thighR.rx * 0.86, rz: thighR.rz * 0.86 }, kneeR, calfR, ankleR],
    },
    head: {
      cy: H * 0.935,
      rx: H * 0.047,
      ry: H * 0.065,
      rz: H * 0.056,
    },
  };
}

/* ========================================================== mesh building == */

/**
 * Loft a set of elliptical cross-sections into one smooth surface.
 *
 * `arc` lets a garment be generated over part of the circumference only, which
 * is how an open jacket gets an opening instead of a seam drawn on a closed
 * tube.
 */
function loft(sections, { radial = 64, arcStart = 0, arcLength = Math.PI * 2, capTop = false, capBottom = false, inflate = 0 } = {}) {
  const closed = Math.abs(arcLength - Math.PI * 2) < 1e-6;
  const ringCount = closed ? radial : radial + 1;
  const positions = [];
  const indices = [];
  const uvs = [];

  for (let s = 0; s < sections.length; s++) {
    const { y, rx, rz, offsetZ = 0 } = sections[s];
    for (let i = 0; i < ringCount; i++) {
      const t = i / radial;
      const a = arcStart + t * arcLength;
      positions.push(
        Math.cos(a) * (rx + inflate),
        y,
        Math.sin(a) * (rz + inflate) + offsetZ
      );
      uvs.push(t, s / (sections.length - 1));
    }
  }

  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < radial; i++) {
      const a = s * ringCount + i;
      const b = s * ringCount + ((i + 1) % ringCount);
      const c = (s + 1) * ringCount + ((i + 1) % ringCount);
      const d = (s + 1) * ringCount + i;
      // Wound so the normals point *outward*. Reversed, every lofted garment
      // renders inside-out: the near face is culled, you see straight through
      // to the body, and the only thing left on screen is the inside of the
      // far wall. It looks almost right in isolation, which is what made it
      // take a while to spot.
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  if (capTop || capBottom) {
    // Caps are a simple fan to the section's centre. Only ever seen at a hem
    // or a cuff, where a flat disc is exactly right.
    const extra = [];
    const addCap = (sectionIndex, flip) => {
      const base = positions.length / 3 + extra.length / 3;
      const { y } = sections[sectionIndex];
      extra.push(0, y, 0);
      const centre = base;
      for (let i = 0; i < ringCount; i++) {
        const idx = sectionIndex * ringCount + i;
        const j = (i + 1) % ringCount;
        const idx2 = sectionIndex * ringCount + j;
        if (flip) indices.push(centre, idx, idx2);
        else indices.push(centre, idx2, idx);
      }
    };
    const posArr = Array.from(geo.attributes.position.array);
    if (capBottom) addCap(0, true);
    if (capTop) addCap(sections.length - 1, false);
    const merged = posArr.concat(extra);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(merged, 3));
    const uvArr = Array.from(geo.attributes.uv.array);
    for (let i = 0; i < extra.length / 3; i++) uvArr.push(0.5, 0.5);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    geo.setIndex(indices);
  }

  geo.computeVertexNormals();
  return geo;
}

/** A limb: elliptical sections swept along a spine, mirrored to both sides. */
function limb(spine, radii, { radial = 36, inflate = 0, side = 1, taperEnd = true } = {}) {
  const sections = spine.map((p, i) => ({
    y: p.y,
    rx: radii[i].rx + inflate,
    rz: radii[i].rz + inflate,
    cx: p.x * side,
    cz: p.z,
  }));

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    for (let i = 0; i < radial; i++) {
      const t = i / radial;
      const a = t * Math.PI * 2;
      positions.push(sec.cx + Math.cos(a) * sec.rx, sec.y, sec.cz + Math.sin(a) * sec.rz);
      uvs.push(t, s / (sections.length - 1));
    }
  }
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < radial; i++) {
      const a = s * radial + i;
      const b = s * radial + ((i + 1) % radial);
      const c = (s + 1) * radial + ((i + 1) % radial);
      const d = (s + 1) * radial + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  // Round off the free end rather than leaving a hole.
  if (taperEnd) {
    const last = sections[sections.length - 1];
    const centre = positions.length / 3;
    positions.push(last.cx, last.y - last.rx * 0.8, last.cz);
    uvs.push(0.5, 1);
    for (let i = 0; i < radial; i++) {
      const a = (sections.length - 1) * radial + i;
      const b = (sections.length - 1) * radial + ((i + 1) % radial);
      indices.push(centre, b, a);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Sections of the torso between two heights, resampled so garments drape smoothly. */
function torsoSlice(profile, yFrom, yTo, steps = 14) {
  const t = profile.torso;
  const at = (y) => {
    if (y <= t[0].y) return { ...t[0], y };
    if (y >= t[t.length - 1].y) return { ...t[t.length - 1], y };
    for (let i = 0; i < t.length - 1; i++) {
      if (y >= t[i].y && y <= t[i + 1].y) {
        const k = (y - t[i].y) / (t[i + 1].y - t[i].y);
        // Smoothstep rather than linear: a straight interpolation between
        // waist and chest gives the silhouette a visible crease.
        const e = k * k * (3 - 2 * k);
        return { y, rx: t[i].rx + (t[i + 1].rx - t[i].rx) * e, rz: t[i].rz + (t[i + 1].rz - t[i].rz) * e };
      }
    }
    return { ...t[t.length - 1], y };
  };
  if (steps <= 0) return [at(yFrom)];
  const out = [];
  for (let i = 0; i <= steps; i++) out.push(at(yFrom + ((yTo - yFrom) * i) / steps));
  return out;
}

/* ============================================================= materials == */

/** Lighten or darken a hex by a lightness step, kept in sRGB for simplicity —
 *  this only ever shifts soles and laces relative to the upper. */
function shadeHex(hex, step) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + step / 100)));
  return `#${c.getHexString()}`;
}

/** A fine woven texture, generated rather than downloaded. */
function fabricNormalMap(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // A simple plain weave: alternating warp and weft, softened.
      const weave = Math.sin(x * 1.6) * Math.cos(y * 1.6) * 0.5 + 0.5;
      const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const n = weave * 0.7 + Math.abs(grain) * 0.3;
      img.data[i] = 128 + (n - 0.5) * 26;
      img.data[i + 1] = 128 + (n - 0.5) * 26;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 14);
  return tex;
}

let sharedNormal = null;

function fabricMaterial(hex, { sheen = 0.5, rough = 0.88 } = {}) {
  if (!sharedNormal) sharedNormal = fabricNormalMap();
  const colour = new THREE.Color(hex);
  const sheenColour = colour.clone().lerp(new THREE.Color('#ffffff'), 0.55);
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: rough,
    metalness: 0,
    sheen,
    sheenRoughness: 0.42,
    sheenColor: sheenColour,
    normalMap: sharedNormal,
    normalScale: new THREE.Vector2(0.22, 0.22),
    envMapIntensity: 0.65,
  });
}

function leatherMaterial(hex) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.9,
  });
}

function mannequinMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d8d4cd'),
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.75,
  });
}

/* =============================================================== garments == */

/**
 * Ease by fit name, in metres of **circumference** — which is how pattern
 * cutting states it, and how a size chart states it. Getting this wrong was
 * the bug that made every oversized garment render as a cape: adding 6cm to a
 * radius adds 38cm to the way round, so "oversized" came out as a tent.
 */
export const EASE = {
  fitted: 0.06, straight: 0.12, relaxed: 0.20, wide: 0.28, oversized: 0.34, 'n/a': 0.10,
};

/** Circumference ease -> the radius to add to a cross-section. */
export const toRadial = (circumference) => circumference / (2 * Math.PI);
export const radialEase = (fit) => toRadial(EASE[fit] ?? EASE.straight);

/** How much a trouser leg opens up between the thigh and the hem. */
const LEG_FLARE = { fitted: -0.35, straight: 0.12, relaxed: 0.3, wide: 0.5, oversized: 0.5 };

/**
 * A sleeve's ease is nothing like the body's. An oversized tee might be 34cm
 * bigger than the chest and still only 8cm bigger round the bicep — sleeves
 * are cut close even when bodies are not. Using the body figure for both is
 * what turned an oversized tee into a poncho.
 */
const SLEEVE_SHARE = 0.35;

const HEM_BY_LENGTH = {
  // Fractions of stature, matching the hem targets in anatomy.js.
  cropped: 0.53, standard: 0.47, long: 0.325,
};

function garmentKind(name = '', slot = '') {
  const n = name.toLowerCase();
  if (/boot|chelsea|chukka/.test(n)) return 'boot';
  if (/loafer|derby/.test(n)) return 'loafer';
  if (/shoe|sneaker|trainer|runner|high-top|low-top/.test(n)) return 'sneaker';
  if (/trouser|jean|chino|pant|cargo|slack/.test(n)) return 'trousers';
  if (/blazer|coat|bomber|trucker|jacket|shell|harrington|liner|overshirt|chore/.test(n)) return 'layer';
  if (/hoodie|sweat|knit|sweater|crewneck|cashmere|merino|polo|waffle|half-zip/.test(n)) return 'knit';
  if (/shirt|oxford|poplin|camp collar/.test(n)) return 'shirt';
  if (slot === 'Bottom') return 'trousers';
  if (slot === 'Shoes') return 'sneaker';
  if (slot === 'Layer') return 'layer';
  return 'tee';
}

/**
 * Cut the arm spine off at a fraction of its length, interpolating the final
 * section so a short sleeve ends mid-bicep rather than at whichever control
 * point happens to be nearest.
 */
function armTo(profile, fraction) {
  const spine = profile.arm.spine;
  const radii = profile.arm.radii;
  const n = spine.length - 1;
  const t = Math.max(0.15, Math.min(1, fraction)) * n;
  const whole = Math.floor(t);
  const frac = t - whole;
  const outS = spine.slice(0, whole + 1);
  const outR = radii.slice(0, whole + 1);
  if (frac > 0.02 && whole < n) {
    const a = spine[whole], b = spine[whole + 1];
    const ra = radii[whole], rb = radii[whole + 1];
    outS.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, z: a.z + (b.z - a.z) * frac });
    outR.push({ rx: ra.rx + (rb.rx - ra.rx) * frac, rz: ra.rz + (rb.rz - ra.rz) * frac });
  }
  return { spine: outS, radii: outR };
}

/**
 * Add a yoke: two extra rings above the chest that pull in from the shoulder
 * to the neck. Without them a lofted top ends in a flat horizontal cut and
 * reads as a boat-neck sack.
 */
function withYoke(sections, profile, ease, dropped) {
  const H = profile.H;
  const shoulderY = H * Y.shoulder;
  const neck = profile.torso[profile.torso.length - 1];
  // The shoulder only takes a share of the ease. Adding all of it puts a
  // 110cm shoulder line on a 45cm frame.
  const shoulderRx = profile.shoulderHalf * (dropped ? 1.0 : 0.86) + ease * 0.5;
  const shoulderRz = sections[sections.length - 1].rz;
  return [
    ...sections,
    { y: shoulderY - H * 0.014, rx: shoulderRx * 0.98, rz: shoulderRz * 0.99 },
    { y: shoulderY, rx: shoulderRx, rz: shoulderRz },
    { y: shoulderY + H * 0.009, rx: shoulderRx * 0.70, rz: shoulderRz * 0.84 },
    { y: shoulderY + H * 0.019, rx: neck.rx * 1.38, rz: neck.rz * 1.32 },
    { y: shoulderY + H * 0.027, rx: neck.rx * 1.14, rz: neck.rz * 1.12 },
  ];
}

function buildTop(profile, piece, kind) {
  const H = profile.H;
  const ease = radialEase(piece.fit);
  const dropped = (EASE[piece.fit] ?? 0) >= 0.28;
  const group = new THREE.Group();
  const mat = fabricMaterial(piece.colour.hex, { sheen: kind === 'knit' ? 0.62 : 0.45 });

  // Hem length comes from the same place the written advice does: the hem
  // target for this frame, not a number picked to look right.
  const hemFrac = piece.hemFraction ?? (dropped ? 0.49 : 0.47);
  const chestY = H * Y.upChest;
  const body = torsoSlice(profile, H * hemFrac, chestY, 14).map((sec, i, arr) => {
    const t = i / (arr.length - 1);
    // Cloth hangs: it does not follow the waist all the way in, and it flares
    // a little at the hem. A quarter of the ease is enough — any more and a
    // t-shirt turns into a smock.
    const hang = (1 - t) * ease * 0.28;
    const slack = Math.max(0, 0.4 - Math.abs(t - 0.45)) * ease * 0.5;
    return { y: sec.y, rx: sec.rx + ease + hang + slack, rz: sec.rz + ease + hang + slack };
  });

  group.add(new THREE.Mesh(loft(withYoke(body, profile, ease, dropped), { radial: 72 }), mat));

  // Sleeve length by garment, not by guesswork: a tee stops at mid-bicep, a
  // knit or a shirt runs to the wrist.
  // Short sleeves are the exception, not the rule: a tee and a jersey. A
  // chore shirt classified as a layer kind was coming out short-sleeved.
  const shortSleeved = (kind === 'tee' || /jersey|polo/.test(piece.name ?? ''))
    && !/long sleeve/.test(piece.name ?? '');
  const isLong = !shortSleeved;
  const reach = isLong ? 1 : (dropped ? 0.46 : 0.34);
  // A sleeve wider than it is long is a cape, so the inflation is capped
  // against the length of the upper arm rather than left to grow with the ease.
  const upperArm = Math.abs(profile.arm.spine[0].y - profile.arm.spine[2].y);
  const sleeveInflate = Math.min(ease * SLEEVE_SHARE, upperArm * 0.22);
  const { spine, radii } = armTo(profile, reach);
  // Start the sleeve inside the body rather than at the joint, so the two
  // surfaces interpenetrate and read as one garment. A sleeve that begins
  // exactly at the shoulder leaves a visible gap at every angle.
  const rooted = [
    { x: spine[0].x * 0.52, y: spine[0].y + H * 0.01, z: spine[0].z },
    ...spine,
  ];
  const rootedR = [{ rx: radii[0].rx * 1.3, rz: radii[0].rz * 1.3 }, ...radii];
  for (const side of [-1, 1]) {
    const geo = limb(rooted, rootedR, {
      inflate: sleeveInflate, side, taperEnd: false, radial: 40,
    });
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}

function buildTrousers(profile, piece) {
  const H = profile.H;
  const ease = radialEase(piece.fit) * 0.7 + 0.006;
  const group = new THREE.Group();
  const mat = fabricMaterial(piece.colour.hex, { rough: 0.9, sheen: 0.32 });

  // Seat and waistband: a short loft over the hip.
  const seat = torsoSlice(profile, H * 0.425, H * 0.615, 10).map((s) => ({
    y: s.y, rx: s.rx + ease, rz: s.rz + ease,
  }));
  group.add(new THREE.Mesh(loft(seat, { radial: 64 }), mat));

  // Legs. Wide fits keep their width all the way down; tapered ones narrow.
  const flare = LEG_FLARE[piece.fit] ?? 0.2;
  for (const side of [-1, 1]) {
    const radii = profile.leg.radii.map((r, i) => {
      const t = i / (profile.leg.radii.length - 1);
      const extra = ease * (1 + t * flare);
      return { rx: r.rx + extra, rz: r.rz + extra };
    });
    const spine = profile.leg.spine.map((p, i) => ({
      ...p,
      y: i === profile.leg.spine.length - 1 ? H * 0.058 : p.y,
    }));
    group.add(new THREE.Mesh(limb(spine, radii, { side, taperEnd: false, radial: 40 }), mat));
  }
  return group;
}

function buildLayer(profile, piece, underEase = 0.022, underDropped = false) {
  const H = profile.H;
  // An outer layer has to clear whatever is under it. The engine can pick an
  // oversized top with a merely relaxed jacket, and taking the jacket's own
  // ease at face value then renders it *inside* the shirt.
  const ease = Math.max(radialEase(piece.fit) + 0.013, underEase + 0.016);
  const group = new THREE.Group();
  const base = fabricMaterial(piece.colour.hex, { rough: 0.85, sheen: 0.4 });
  // An open coat is seen from inside as well as out, so it cannot be
  // single-sided.
  const mat = base.clone();
  mat.side = THREE.DoubleSide;

  const isCoat = /coat|topcoat|overcoat/.test(piece.name ?? '');
  const hemFrac = isCoat ? 0.34 : 0.478;
  const body = torsoSlice(profile, H * hemFrac, H * Y.upChest, 16).map((sec, i, arr) => {
    const t = i / (arr.length - 1);
    const hang = (1 - t) * ease * 0.2;
    return { y: sec.y, rx: sec.rx + ease + hang, rz: sec.rz + ease + hang };
  });

  // Worn open: the shell is generated over most of the circumference with a
  // gap at the front, so the pieces underneath stay visible. That is also how
  // the layer earns its place in the recommendation — you can see what it is
  // layered over.
  const gap = 0.52;
  group.add(new THREE.Mesh(
    // The yoke has to clear the shoulder of whatever is underneath, or a
    // dropped-shoulder tee pokes through the jacket it is supposed to be under.
    loft(withYoke(body, profile, ease, underDropped), {
      radial: 64, arcStart: Math.PI / 2 + gap / 2, arcLength: Math.PI * 2 - gap,
    }),
    mat
  ));

  // Lapels only on things that have them. A chore jacket or a bomber does not.
  if (/blazer|coat|topcoat|overcoat|tailor/.test(piece.name ?? '')) {
    group.add(buildLapels(profile, piece, ease, gap));
  }

  const { spine, radii } = armTo(profile, 1);
  const rooted = [{ x: spine[0].x * 0.5, y: spine[0].y + H * 0.012, z: spine[0].z }, ...spine];
  const rootedR = [{ rx: radii[0].rx * 1.35, rz: radii[0].rz * 1.35 }, ...radii];
  // The sleeve under this one is inflated by the top's own ease, and an
  // oversized tee inflates by more than its body does. Clear that too, or the
  // tee's shoulder pokes out of the jacket like a shoulder pad.
  const underSleeve = underEase * SLEEVE_SHARE;
  const sleeveInflate = Math.max(ease * 0.45, underSleeve + 0.010);
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(
      limb(rooted, rootedR, { inflate: sleeveInflate, side, taperEnd: false, radial: 40 }),
      base
    ));
  }
  return group;
}

/**
 * A shoe last, lofted along the length of the foot rather than carved out of a
 * box. Each cross-section is a half-ellipse — flat on the ground, rounded over
 * the instep — and the section list is the shape of a shoe seen from the side:
 * tall at the heel, a dip at the throat, a long low taper to the toe.
 */
function shoeLast(len, wide, high, { toe = 'round', radial = 18 } = {}) {
  // z (0 = heel, 1 = toe), half-width, height — all as fractions.
  const SECTIONS = [
    [0.00, 0.30, 0.52],
    [0.05, 0.40, 0.86],
    [0.14, 0.45, 1.00],
    [0.28, 0.47, 0.92],
    [0.45, 0.50, 0.78],
    [0.62, 0.50, 0.60],
    [0.78, 0.46, 0.42],
    [0.90, 0.36, 0.28],
    [0.97, 0.22, 0.17],
    [1.00, 0.08, 0.09],
  ];
  const sharp = toe === 'sharp';

  const positions = [];
  const uvs = [];
  const indices = [];
  const ring = radial + 1;

  SECTIONS.forEach(([zf, wf, hf], si) => {
    const z = zf * len;
    const w = wf * wide * 2 * (sharp && zf > 0.7 ? 0.86 : 1);
    const h = hf * high;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI; // 0 = one side at the ground, PI = the other
      // The exponent flattens the top, which is what stops a shoe looking like
      // half a sausage.
      positions.push(-Math.cos(a) * w, Math.pow(Math.sin(a), 0.78) * h, z);
      uvs.push(i / radial, zf);
    }
  });

  for (let si = 0; si < SECTIONS.length - 1; si++) {
    for (let i = 0; i < radial; i++) {
      const a = si * ring + i;
      const b = si * ring + i + 1;
      const c = (si + 1) * ring + i + 1;
      const d = (si + 1) * ring + i;
      indices.push(a, b, d, b, c, d);
    }
  }

  // Close the underside with a flat strip between the two ground edges.
  for (let si = 0; si < SECTIONS.length - 1; si++) {
    const a = si * ring;              // left ground point
    const b = si * ring + radial;     // right ground point
    const c = (si + 1) * ring + radial;
    const d = (si + 1) * ring;
    indices.push(a, d, b, b, d, c);
  }
  // Cap the heel.
  const heelCentre = positions.length / 3;
  positions.push(0, SECTIONS[0][2] * high * 0.4, 0);
  uvs.push(0.5, 0);
  for (let i = 0; i < radial; i++) indices.push(heelCentre, i + 1, i);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** The sole: the same footprint, extruded a little below the upper. */
function soleGeometry(len, wide, thickness) {
  const SECTIONS = [
    [0.00, 0.31], [0.08, 0.42], [0.22, 0.47], [0.45, 0.52],
    [0.68, 0.52], [0.85, 0.45], [0.95, 0.33], [1.00, 0.12],
  ];
  const positions = [];
  const indices = [];
  const uvs = [];
  SECTIONS.forEach(([zf, wf], si) => {
    const z = zf * len;
    const w = wf * wide * 2;
    for (const [x, y] of [[-w, 0], [-w, thickness], [w, thickness], [w, 0]]) {
      positions.push(x, y, z);
      uvs.push(si / (SECTIONS.length - 1), 0);
    }
  });
  for (let si = 0; si < SECTIONS.length - 1; si++) {
    for (let i = 0; i < 4; i++) {
      const a = si * 4 + i;
      const b = si * 4 + ((i + 1) % 4);
      const c = (si + 1) * 4 + ((i + 1) % 4);
      const d = (si + 1) * 4 + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildShoes(profile, piece) {
  const H = profile.H;
  const kind = garmentKind(piece.name, 'Shoes');
  const group = new THREE.Group();
  const mat = kind === 'sneaker'
    ? fabricMaterial(piece.colour.hex, { rough: 0.68, sheen: 0.28 })
    : leatherMaterial(piece.colour.hex);
  const soleHex = kind === 'sneaker'
    ? '#efece6'
    : shadeHex(piece.colour.hex, -22);
  const soleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(soleHex), roughness: 0.88, metalness: 0,
  });

  const len = H * 0.152;
  const wide = H * 0.028;
  const soleH = kind === 'sneaker' ? H * 0.018 : H * 0.011;
  const upperH = (kind === 'boot' ? H * 0.062 : H * 0.047);

  for (const side of [-1, 1]) {
    const foot = new THREE.Group();

    const upper = new THREE.Mesh(
      shoeLast(len, wide, upperH, { toe: kind === 'loafer' ? 'sharp' : 'round' }),
      mat
    );
    upper.position.y = soleH * 0.75;
    foot.add(upper);

    foot.add(new THREE.Mesh(soleGeometry(len * 1.02, wide * 1.06, soleH), soleMat));

    if (kind === 'boot') {
      // The shaft is a short tube standing on the ankle rather than part of
      // the last — boots are two pieces in real life too.
      const ankleR = profile.leg.radii[4];
      const shaft = limb(
        [
          { x: 0, y: upperH * 0.55, z: len * 0.17 },
          { x: 0, y: H * 0.085, z: len * 0.15 },
        ],
        [
          { rx: ankleR.rx * 1.22, rz: ankleR.rz * 1.22 },
          { rx: ankleR.rx * 1.3, rz: ankleR.rz * 1.3 },
        ],
        { radial: 26, taperEnd: false }
      );
      foot.add(new THREE.Mesh(shaft, mat));
    }

    if (kind === 'sneaker') {
      // Lace bars across the throat. Small, but their absence is what makes a
      // rendered sneaker read as a slipper.
      const laceMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(shadeHex(piece.colour.hex, 18)),
        roughness: 0.9, metalness: 0,
      });
      for (let i = 0; i < 4; i++) {
        const t = 0.26 + i * 0.1;
        const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(len * 0.011, len * 0.011, wide * 1.5, 8),
          laceMat
        );
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, upperH * (0.88 - i * 0.12) + soleH * 0.75, len * t);
        foot.add(bar);
      }
    }

    // Place the foot under the ankle, toes forward, with a slight splay.
    foot.position.set(profile.leg.spine[4].x * side, 0, -len * 0.3);
    foot.rotation.y = side * 0.07;
    group.add(foot);
  }
  return group;
}

/**
 * Lapels. A blazer or coat without them reads as a cardigan, and the fold-back
 * is the single detail that tells the eye "this is tailoring".
 */
function buildLapels(profile, piece, ease, gap) {
  const H = profile.H;
  const group = new THREE.Group();
  const mat = fabricMaterial(piece.colour.hex, { rough: 0.82, sheen: 0.48 });
  mat.side = THREE.DoubleSide;

  const topY = H * (Y.shoulder + 0.026);
  const breakY = H * 0.60;

  // A lapel is not a flat panel stuck to the chest — it is the jacket's own
  // front edge rolled back on itself. So it is built as a narrow loft hugging
  // each side of the opening, standing further proud of the body at the neck
  // than at the break. That roll is what the eye reads as tailoring; a flat
  // quad reads as a ribbon, which is exactly how the first attempt looked.
  const steps = 10;
  const sections = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = breakY + (topY - breakY) * t;
    const body = torsoSlice(profile, y, y, 0)[0];
    // Proud of the shell by this much: most at the collar, least at the break.
    const roll = ease * (0.55 + t * 1.25);
    sections.push({ y, rx: body.rx + ease + roll, rz: body.rz + ease + roll });
  }

  // Each lapel is an arc starting at the edge of the opening and sweeping
  // outward across the chest.
  const half = gap / 2;
  const width = 0.62;
  for (const dir of [1, -1]) {
    const startA = Math.PI / 2 + dir * half;
    group.add(new THREE.Mesh(
      loft(sections, { radial: 16, arcStart: dir > 0 ? startA : startA - width, arcLength: width }),
      mat
    ));
  }

  // The collar band, sitting on top of the jacket's own yoke rather than
  // floating above it.
  const neck = profile.torso[profile.torso.length - 1];
  const collar = loft([
    { y: topY - H * 0.006, rx: neck.rx * 1.26 + ease * 0.5, rz: neck.rz * 1.26 + ease * 0.5 },
    { y: topY + H * 0.016, rx: neck.rx * 1.46 + ease * 0.5, rz: neck.rz * 1.46 + ease * 0.5 },
  ], { radial: 40, arcStart: Math.PI / 2 + gap * 0.8, arcLength: Math.PI * 2 - gap * 1.6 });
  group.add(new THREE.Mesh(collar, mat));

  return group;
}

/* ================================================================= scene == */

export async function createFittingRoom(container, { onReady } = {}) {
  await loadThree();

  const scene = new THREE.Scene();
  scene.background = null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0.9, 1.25, 3.1);

  // Image-based lighting. Without an environment, physical materials have
  // nothing to reflect and everything reads as plastic.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.42;

  const key = new THREE.DirectionalLight(0xfff6ec, 1.15);
  key.position.set(2.2, 3.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -1.6;
  key.shadow.camera.right = 1.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -0.4;
  key.shadow.bias = -0.0012;
  key.shadow.radius = 4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xe6edff, 0.35);
  fill.position.set(-2.6, 1.6, 1.4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-0.8, 2.2, -3.0);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d867c, 0.22));

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 64).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.22 })
  );
  floor.receiveShadow = true;
  scene.add(floor);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 5;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.75;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  const root = new THREE.Group();
  scene.add(root);

  let profile = buildBodyProfile({});
  let current = { body: null, garments: null };

  function disposeGroup(g) {
    if (!g) return;
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    root.remove(g);
  }

  function buildBody() {
    disposeGroup(current.body);
    const g = new THREE.Group();
    const mat = mannequinMaterial();

    const torso = new THREE.Mesh(loft(torsoSlice(profile, profile.torso[0].y, profile.torso[profile.torso.length - 1].y, 36), { radial: 72, capBottom: true, capTop: true }), mat);
    g.add(torso);

    for (const side of [-1, 1]) {
      g.add(new THREE.Mesh(limb(profile.arm.spine, profile.arm.radii, { side, radial: 32 }), mat));
      g.add(new THREE.Mesh(limb(profile.leg.spine, profile.leg.radii, { side, radial: 32 }), mat));

      // Hands. A limb that tapers to a rounded stump is the detail your eye
      // reads as "unfinished" before it can say why. Palms face the thighs, so
      // the shape is thin across the body and deep front-to-back.
      const wrist = profile.arm.spine[profile.arm.spine.length - 1];
      const wr = profile.arm.radii[profile.arm.radii.length - 1];
      const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat);
      hand.scale.set(wr.rx * 0.82, profile.H * 0.047, wr.rz * 1.25);
      hand.position.set(wrist.x * side, wrist.y - profile.H * 0.036, wrist.z);
      g.add(hand);
    }

    const neckTop = profile.torso[profile.torso.length - 1];
    const neck = new THREE.Mesh(loft([
      { y: neckTop.y - profile.H * 0.004, rx: neckTop.rx, rz: neckTop.rz },
      { y: profile.head.cy - profile.head.ry * 0.72, rx: neckTop.rx * 0.9, rz: neckTop.rz * 0.9 },
    ], { radial: 48 }), mat);
    g.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), mat);
    head.scale.set(profile.head.rx, profile.head.ry, profile.head.rz);
    head.position.y = profile.head.cy;
    g.add(head);

    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    current.body = g;
    root.add(g);
  }

  function dressIn(look) {
    disposeGroup(current.garments);
    if (!look) { current.garments = null; return; }
    const g = new THREE.Group();

    if (look.bottom) { const m = buildTrousers(profile, look.bottom); m.name = 'bottom'; g.add(m); }
    if (look.top) { const m = buildTop(profile, look.top, garmentKind(look.top.name, 'Top')); m.name = 'top'; g.add(m); }
    if (look.shoes) g.add(buildShoes(profile, look.shoes));
    if (look.layer && look.layerOn !== false) {
      const underEase = radialEase(look.top?.fit);
      g.add(buildLayer(profile, look.layer, underEase, (EASE[look.top?.fit] ?? 0) >= 0.28));
    }

    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    current.garments = g;
    root.add(g);
  }

  function setMeasurements(m) {
    profile = buildBodyProfile(m);
    buildBody();
    frame();
  }

  function frame() {
    const h = profile.H;
    controls.target.set(0, h * 0.54, 0);
    camera.position.set(h * 0.52, h * 0.72, h * 1.78);
    controls.update();
  }

  function resize() {
    const w = container.clientWidth || 1;
    const hgt = container.clientHeight || 1;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }

  let running = true;
  let raf = 0;
  function tick() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // Stop rendering when nobody is looking at it.
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; tick(); }
    else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); }
  }, { threshold: 0 });
  io.observe(container);

  buildBody();
  resize();
  frame();
  tick();
  onReady?.();

  return {
    __scene: scene,
    setMeasurements,
    dressIn,
    resetView() { controls.autoRotate = true; frame(); },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      disposeGroup(current.body); disposeGroup(current.garments);
      controls.dispose(); renderer.dispose();
      container.innerHTML = '';
    },
  };
}
