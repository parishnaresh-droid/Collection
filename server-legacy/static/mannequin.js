/* ============================================================
   3D Outfit Mannequin — real WebGL via Three.js
   Builds a stylised human form from primitives, then layers
   garment meshes over it coloured from the live combo data.
   Auto-orbits, drag to spin, smooth colour transitions.
   All geometry authored here — no external model assets.
   ============================================================ */

window.Mannequin = (function () {
  let scene, camera, renderer, root, clock;
  let garments = {};           // { top, bottom, shoes, layer }
  let autoRotate = true;
  let dragging = false, lastX = 0, velocity = 0, targetY = 0;
  let mounted = false;
  let rafId = null;

  const SKIN = 0xD6D6DA;   // neutral studio mannequin grey

  function makeMannequin() {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62, metalness: 0.0 });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 40, 30), skinMat);
    head.position.set(0, 2.60, 0.01); head.scale.set(0.90, 1.16, 0.98); head.rotation.x = 0.04;
    head.castShadow = true; g.add(head);

    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 20), skinMat);
    jaw.position.set(0, 2.44, 0.03); jaw.scale.set(0.95, 0.82, 1.0);
    jaw.castShadow = true; g.add(jaw);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.128, 0.26, 24), skinMat);
    neck.position.y = 2.28; neck.castShadow = true; g.add(neck);

    const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.40, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), skinMat);
    yoke.position.y = 2.02; yoke.scale.set(1.28, 0.46, 0.80);
    yoke.castShadow = true; g.add(yoke);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.395, 0.352, 0.74, 32), skinMat);
    chest.position.y = 1.74; chest.scale.set(1.16, 1, 0.70);
    chest.castShadow = true; g.add(chest);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.346, 0.44, 30), skinMat);
    waist.position.y = 1.20; waist.scale.set(1.10, 1, 0.72);
    waist.castShadow = true; g.add(waist);

    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.318, 0.40, 28), skinMat);
    hips.position.y = 0.86; hips.scale.set(1.14, 1, 0.76);
    hips.castShadow = true; g.add(hips);

    [-1, 1].forEach(side => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.128, 22, 16), skinMat);
      ball.position.set(side * 0.455, 1.99, 0); ball.castShadow = true; g.add(ball);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.093, 0.70, 22), skinMat);
      upper.position.set(side * 0.492, 1.63, 0); upper.rotation.z = side * -0.055;
      upper.castShadow = true; g.add(upper);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.092, 18, 14), skinMat);
      elbow.position.set(side * 0.518, 1.28, 0); elbow.castShadow = true; g.add(elbow);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.070, 0.66, 22), skinMat);
      fore.position.set(side * 0.535, 0.95, 0.015); fore.rotation.z = side * -0.030;
      fore.castShadow = true; g.add(fore);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.082, 18, 14), skinMat);
      hand.position.set(side * 0.548, 0.60, 0.02); hand.scale.set(0.72, 1.32, 0.52);
      hand.castShadow = true; g.add(hand);
    });

    [-1, 1].forEach(side => {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.132, 0.88, 24), skinMat);
      thigh.position.set(side * 0.168, 0.30, 0); thigh.rotation.z = side * 0.018;
      thigh.castShadow = true; g.add(thigh);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 14), skinMat);
      knee.position.set(side * 0.180, -0.16, 0); knee.castShadow = true; g.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.088, 0.82, 24), skinMat);
      shin.position.set(side * 0.186, -0.58, 0); shin.castShadow = true; g.add(shin);

      const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 12), skinMat);
      ankle.position.set(side * 0.190, -0.98, 0); ankle.castShadow = true; g.add(ankle);
    });

    return g;
  }

  function disposeGroup(grp) {
    if (!grp) return;
    grp.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    root.remove(grp);
  }

  // ---------- garment builders ----------

  function buildTop(hex, fit) {
    const wide = /boxy|relaxed|oversized|baggy/i.test(fit || '');
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.94, metalness: 0.0,
    });

    const rTop = wide ? 0.452 : 0.414;
    const rBot = wide ? 0.478 : 0.404;
    const len  = wide ? 1.12 : 1.04;
    const yMid = wide ? 1.62 : 1.66;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 40, 1, true), mat);
    body.position.y = yMid; body.scale.set(1.14, 1, 0.72);
    body.castShadow = true; body.receiveShadow = true; grp.add(body);

    // hem cap so the shirt doesn't look hollow from below
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(rBot, rBot * 0.99, 0.02, 40), mat);
    hem.position.y = yMid - len / 2; hem.scale.set(1.14, 1, 0.72); grp.add(hem);

    // shoulder yoke follows the body's shoulder dome
    const yoke = new THREE.Mesh(
      new THREE.SphereGeometry(rTop, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    yoke.position.y = yMid + len / 2 - 0.02;
    yoke.scale.set(1.14, 0.50, 0.72);
    yoke.castShadow = true; grp.add(yoke);

    // SLEEVES — angled to sit on the arms, not jutting outward
    const sleeveLen = wide ? 0.70 : 0.56;
    const sleeveR   = wide ? 0.168 : 0.138;
    [-1, 1].forEach(side => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(sleeveR, sleeveR * 0.92, sleeveLen, 24, 1, true), mat);
      sleeve.position.set(side * 0.487, 1.99 - sleeveLen / 2 + 0.02, 0);
      sleeve.rotation.z = side * -0.055;
      sleeve.castShadow = true; grp.add(sleeve);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(sleeveR, 20, 14), mat);
      cap.position.set(side * 0.462, 1.98, 0);
      cap.castShadow = true; grp.add(cap);
    });

    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.030, 12, 28), mat);
    collar.position.y = 2.20; collar.rotation.x = Math.PI / 2;
    collar.scale.set(1.15, 1, 0.85); collar.castShadow = true; grp.add(collar);

    return grp;
  }

  function buildBottom(hex, fit) {
    const wide = /wide|relaxed|baggy/i.test(fit || '');
    const straight = /straight/i.test(fit || '');
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.96, metalness: 0.0,
    });

    const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.372, 0.362, 0.14, 32), mat);
    waistband.position.y = 1.00; waistband.scale.set(1.13, 1, 0.79);
    waistband.castShadow = true; grp.add(waistband);

    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.362, 0.330, 0.42, 30, 1, true), mat);
    seat.position.y = 0.74; seat.scale.set(1.13, 1, 0.80);
    seat.castShadow = true; grp.add(seat);

    const topR = wide ? 0.238 : (straight ? 0.206 : 0.186);
    const botR = wide ? 0.262 : (straight ? 0.198 : 0.146);

    [-1, 1].forEach(side => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, 1.62, 28, 1, true), mat);
      leg.position.set(side * 0.176, -0.26, 0);
      leg.rotation.z = side * 0.012;
      leg.castShadow = true; leg.receiveShadow = true; grp.add(leg);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(botR, botR, 0.03, 28), mat);
      cuff.position.set(side * 0.180, -1.07, 0); grp.add(cuff);
    });

    return grp;
  }

  function buildShoes(hex) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.48, metalness: 0.04,
    });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xE8E8EC, roughness: 0.72 });

    [-1, 1].forEach(side => {
      const x = side * 0.184;

      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), mat);
      heel.position.set(x, -1.045, -0.045); heel.scale.set(1, 0.92, 1);
      heel.castShadow = true; grp.add(heel);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.165, 0.44), mat);
      upper.position.set(x, -1.055, 0.135);
      upper.castShadow = true; grp.add(upper);

      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.113, 22, 16), mat);
      toe.position.set(x, -1.065, 0.345); toe.scale.set(1, 0.74, 1.28);
      toe.castShadow = true; grp.add(toe);

      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.252, 0.062, 0.60), soleMat);
      sole.position.set(x, -1.152, 0.115);
      sole.castShadow = true; sole.receiveShadow = true; grp.add(sole);
    });

    return grp;
  }

  function buildLayer(hex) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.85, side: THREE.DoubleSide,
    });
    // two open front panels
    [-1, 1].forEach(side => {
      const panel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.492, 0.516, 1.20, 28, 1, true, side < 0 ? 0.42 : Math.PI + 0.42, 2.05), mat);
      panel.position.y = 1.58;
      panel.scale.set(1.10, 1, 0.74);
      panel.castShadow = true;
      grp.add(panel);
    });
    return grp;
  }

  // ---------- public API ----------

  function init(container) {
    if (typeof THREE === 'undefined') return false;

    const w = container.clientWidth || 380;
    const h = container.clientHeight || 460;

    // Re-entrant: on a second render the old #stage node is gone, so the
    // existing canvas is orphaned. Re-attach it to the new container
    // instead of bailing out (which left the stage permanently blank).
    if (mounted && renderer) {
      if (renderer.domElement.parentNode !== container) {
        container.appendChild(renderer.domElement);
      }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      attachDrag(container);
      if (!rafId) animate();
      return true;
    }

    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(31, w / h, 0.1, 100);
    camera.position.set(0, 0.92, 6.6);
    camera.lookAt(0, 0.80, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // studio lighting — key, fill, rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.40));
    const hemi = new THREE.HemisphereLight(0xffffff, 0x202024, 0.45);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3.2, 6.0, 4.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 3;
    key.shadow.bias = -0.0006;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 22;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 5; key.shadow.camera.bottom = -4;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xE8EEF5, 0.45);
    fill.position.set(-4.2, 2.4, 2.8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xFFFFFF, 0.7);
    rim.position.set(-1.4, 3.2, -5.2);
    scene.add(rim);

    // ground shadow catcher
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 48),
      new THREE.ShadowMaterial({ opacity: 0.30 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.185;
    ground.receiveShadow = true;
    scene.add(ground);

    root = new THREE.Group();
    root.add(makeMannequin());
    scene.add(root);

    clock = new THREE.Clock();
    attachDrag(container);
    mounted = true;
    animate();

    window.addEventListener('resize', () => onResize(container));
    return true;
  }

  function onResize(container) {
    if (!renderer) return;
    const w = container.clientWidth || 380;
    const h = container.clientHeight || 460;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function attachDrag(container) {
    const down = x => { dragging = true; lastX = x; autoRotate = false; container.classList.add('grabbing'); };
    const move = x => {
      if (!dragging) return;
      const dx = x - lastX; lastX = x;
      velocity = dx * 0.0075;
      targetY += velocity;
    };
    const up = () => { dragging = false; container.classList.remove('grabbing'); };

    container.addEventListener('mousedown', e => down(e.clientX));
    window.addEventListener('mousemove', e => move(e.clientX));
    window.addEventListener('mouseup', up);
    container.addEventListener('touchstart', e => down(e.touches[0].clientX), { passive: true });
    container.addEventListener('touchmove', e => move(e.touches[0].clientX), { passive: true });
    container.addEventListener('touchend', up);
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    if (!renderer) return;
    const t = clock.getElapsedTime();

    if (autoRotate && !dragging) targetY += 0.0035;
    else if (!dragging) { targetY += velocity; velocity *= 0.94; }

    root.rotation.y += (targetY - root.rotation.y) * 0.09;
    root.position.y = Math.sin(t * 0.85) * 0.022;   // gentle idle float

    renderer.render(scene, camera);
  }

  /** Dress the mannequin from a combo object. */
  function setOutfit(combo) {
    if (!mounted || !combo) return;
    ['top', 'bottom', 'shoes', 'layer'].forEach(k => {
      if (garments[k]) { disposeGroup(garments[k]); garments[k] = null; }
    });

    garments.top = buildTop(combo.top.hex, combo.top.fit);
    garments.bottom = buildBottom(combo.bottom.hex, combo.bottom.fit);
    garments.shoes = buildShoes(combo.shoes.hex);
    if (combo.layer) garments.layer = buildLayer(combo.layer.hex);

    Object.values(garments).forEach(g => {
      if (!g) return;
      g.scale.setScalar(0.86);
      root.add(g);
      // pop-in transition
      const start = performance.now();
      (function grow() {
        const p = Math.min((performance.now() - start) / 340, 1);
        const e = 1 - Math.pow(1 - p, 3);
        g.scale.setScalar(0.86 + 0.14 * e);
        if (p < 1) requestAnimationFrame(grow);
      })();
    });
  }

  function resumeAutoRotate() { autoRotate = true; }

  /** Tear down so a new reading can mount a fresh stage. */
  function reset() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    scene = camera = renderer = root = null;
    garments = {};
    mounted = false;
    targetY = 0; velocity = 0; autoRotate = true;
  }

  return { init, setOutfit, resumeAutoRotate, reset };
})();
