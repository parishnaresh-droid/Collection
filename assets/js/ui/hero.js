/**
 * hero.js — the moving field behind the headline.
 *
 * A single full-screen fragment shader rather than a 3D scene. It renders in
 * one draw call, costs a few kilobytes, and — the reason it exists — it takes
 * the palette as four uniforms, so the moment a reading appears the whole top
 * of the page drifts from grey into the person's own colours.
 *
 * If WebGL is missing or the person prefers reduced motion, a static CSS
 * gradient built from the same four colours takes its place.
 */

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_c0, u_c1, u_c2, u_c3;
uniform float u_mix;      // 0 = grey, 1 = fully in the palette
uniform vec2  u_pointer;

// Value noise. Cheap, and at this scale indistinguishable from anything
// fancier once it has been through three octaves of fbm.
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 q = uv;
  q.x *= u_res.x / u_res.y;

  float t = u_time * 0.035;
  vec2 drift = vec2(fbm(q * 1.6 + t), fbm(q * 1.6 - t + 4.7));
  // The pointer nudges the field rather than driving it, so the motion still
  // reads as its own thing when nobody is touching the page.
  vec2 warp = q + drift * 0.55 + (u_pointer - 0.5) * 0.12;

  float n1 = fbm(warp * 2.1 + t * 1.4);
  float n2 = fbm(warp * 1.2 - t * 0.9 + 12.0);
  float band = smoothstep(0.25, 0.85, n1);
  float band2 = smoothstep(0.30, 0.78, n2);

  vec3 grey = mix(vec3(0.965), vec3(0.80), band);
  grey = mix(grey, vec3(0.90), band2 * 0.6);

  vec3 col = mix(u_c3, u_c2, band);
  col = mix(col, u_c1, band2 * 0.68);
  col = mix(col, u_c0, smoothstep(0.55, 0.98, n1 * n2 * 2.3) * 0.5);

  vec3 outc = mix(grey, col, u_mix);

  // A little grain. Flat gradients on a big screen band visibly; noise at
  // about one part in 200 hides it and costs nothing.
  float g = (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.016;
  gl_FragColor = vec4(outc + g, 1.0);
}
`;

const toVec = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

export function createHero(canvas) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
      || canvas.getContext('experimental-webgl');
  } catch { gl = null; }

  let colours = ['#2B2B2E', '#55555C', '#8C8C95', '#F3F2F0'];
  let mixTarget = 0, mix = 0;
  const pointer = { x: 0.5, y: 0.5 };

  /* ---- the fallback: same colours, no shader ---------------------------- */
  const paint = () => {
    canvas.style.background =
      `radial-gradient(90% 70% at 22% 18%, ${colours[3]} 0%, transparent 60%),
       radial-gradient(70% 60% at 78% 32%, ${colours[2]} 0%, transparent 62%),
       linear-gradient(150deg, ${colours[1]}, ${colours[0]})`;
    canvas.style.opacity = mixTarget ? '0.55' : '0.2';
  };

  if (!gl || reduced) {
    paint();
    return {
      setPalette(next) { colours = next; mixTarget = 1; paint(); },
      destroy() {},
      mode: gl ? 'static (reduced motion)' : 'static (no WebGL)',
    };
  }

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader failed to compile');
    }
    return s;
  };

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'program failed to link');
    }
  } catch (err) {
    console.warn('[hero] falling back to a static gradient:', err.message);
    paint();
    return { setPalette(n) { colours = n; mixTarget = 1; paint(); }, destroy() {}, mode: 'static (shader error)' };
  }

  gl.useProgram(program);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  for (const name of ['u_res', 'u_time', 'u_c0', 'u_c1', 'u_c2', 'u_c3', 'u_mix', 'u_pointer']) {
    U[name] = gl.getUniformLocation(program, name);
  }

  const resize = () => {
    // Half resolution is plenty for something this soft, and it keeps the
    // shader off the critical path on a phone.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * 0.72));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * 0.72));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  let raf = 0, running = true;
  const start = performance.now();

  const frame = () => {
    if (!running) return;
    resize();
    mix += (mixTarget - mix) * 0.022;
    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform1f(U.u_time, (performance.now() - start) / 1000);
    gl.uniform1f(U.u_mix, mix);
    gl.uniform2f(U.u_pointer, pointer.x, pointer.y);
    colours.forEach((hex, i) => gl.uniform3fv(U[`u_c${i}`], toVec(hex)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  frame();

  const onPointer = (e) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = 1 - e.clientY / window.innerHeight;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  // Stop drawing once the hero has scrolled away. A shader running behind
  // three screens of content is pure battery drain.
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) { running = true; frame(); }
    else if (!entry.isIntersecting) { running = false; cancelAnimationFrame(raf); }
  }, { threshold: 0 });
  io.observe(canvas);

  return {
    setPalette(next) { colours = next; mixTarget = 1; },
    destroy() {
      running = false; cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener('pointermove', onPointer);
    },
    mode: 'webgl',
  };
}
