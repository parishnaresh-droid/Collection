/* ============================================================
   3D Outfit Mannequin — real WebGL via Three.js
   Builds a stylised human form from primitives, then layers
   garment meshes over it coloured from the live combo data.
   Auto-orbits, drag to spin, smooth colour transitions.
   All geometry authored here — no external model assets.
   ============================================================ */

const Mannequin = (() => {
  let scene, camera, renderer, root, clock;
  let garments = {};           // { top, bottom, shoes, layer }
  let autoRotate = true;
  let dragging = false, lastX = 0, velocity = 0, targetY = 0;
  let mounted = false;
  let rafId = null;

  const SKIN = 0xD8C3AE;

  function makeMannequin() {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({
      color: SKIN, roughness: 0.82, metalness: 0.02,
    });

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 32, 24), skinMat);
    head.position.y = 2.62; head.scale.set(0.92, 1.12, 0.95);
    head.castShadow = true; g.add(head);

    // neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.24, 20), skinMat);
    neck.position.y = 2.32; neck.castShadow = true; g.add(neck);

    // torso — tapered, subtle
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.36, 1.16, 28), skinMat);
    torso.position.y = 1.64; torso.scale.set(1.14, 1, 0.72);
    torso.castShadow = true; g.add(torso);

    // hips
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.36, 24), skinMat);
    hips.position.y = 0.92; hips.scale.set(1.12, 1, 0.76);
    hips.castShadow = true; g.add(hips);

    // arms
    [-1, 1].forEach(side => {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.093, 0.72, 18), skinMat);
      upper.position.set(side * 0.53, 1.86, 0);
      upper.rotation.z = side * 0.10;
      upper.castShadow = true; g.add(upper);

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.075, 0.68, 18), skinMat);
      fore.position.set(side * 0.61, 1.18, 0.02);
      fore.rotation.z = side * 0.06;
      fore.castShadow = true; g.add(fore);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12), skinMat);
      hand.position.set(side * 0.645, 0.83, 0.02);
      hand.scale.set(0.8, 1.2, 0.55);
      hand.castShadow = true; g.add(hand);
    });

    // legs
    [-1, 1].forEach(side => {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.135, 0.86, 20), skinMat);
      thigh.position.set(side * 0.175, 0.34, 0);
      thigh.castShadow = true; g.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.098, 0.82, 20), skinMat);
      shin.position.set(side * 0.19, -0.50, 0);
      shin.castShadow = true; g.add(shin);
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
      color: new THREE.Color(hex), roughness: 0.88, metalness: 0.0,
    });

    const rTop = wide ? 0.52 : 0.455;
    const rBot = wide ? 0.56 : 0.45;
    const len = wide ? 1.30 : 1.20;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 32, 1, true), mat);
    body.position.y = wide ? 1.58 : 1.62;
    body.scale.set(1.10, 1, 0.76);
    body.castShadow = true; body.receiveShadow = true;
    grp.add(body);

    // shoulder cap
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(rTop * 0.99, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    shoulder.position.y = wide ? 2.22 : 2.21;
    shoulder.scale.set(1.10, 0.52, 0.76);
    shoulder.castShadow = true;
    grp.add(shoulder);

    // sleeves
    const sleeveLen = wide ? 0.62 : 0.50;
    [-1, 1].forEach(side => {
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(wide ? 0.175 : 0.145, wide ? 0.165 : 0.125, sleeveLen, 20, 1, true), mat);
      sleeve.position.set(side * 0.53, 2.03 - sleeveLen / 2 + 0.06, 0);
      sleeve.rotation.z = side * 0.10;
      sleeve.castShadow = true;
      grp.add(sleeve);
    });

    return grp;
  }

  function buildBottom(hex, fit) {
    const wide = /wide|relaxed|baggy/i.test(fit || '');
    const straight = /straight/i.test(fit || '');
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.9, metalness: 0.0,
    });

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.375, 0.40, 26, 1, true), mat);
    waist.position.y = 0.90; waist.scale.set(1.12, 1, 0.80);
    waist.castShadow = true; grp.add(waist);

    const topR = wide ? 0.235 : (straight ? 0.205 : 0.185);
    const botR = wide ? 0.255 : (straight ? 0.195 : 0.145);

    [-1, 1].forEach(side => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, 1.82, 24, 1, true), mat);
      leg.position.set(side * 0.183, -0.16, 0);
      leg.castShadow = true; leg.receiveShadow = true;
      grp.add(leg);
    });

    return grp;
  }

  function buildShoes(hex) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.55, metalness: 0.05,
    });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xF2F0EA, roughness: 0.7 });

    [-1, 1].forEach(side => {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.56), mat);
      upper.position.set(side * 0.19, -0.99, 0.10);
      upper.castShadow = true; grp.add(upper);

      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), mat);
      toe.position.set(side * 0.19, -0.99, 0.36);
      toe.scale.set(1, 0.78, 1.15);
      toe.castShadow = true; grp.add(toe);

      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.285, 0.075, 0.62), soleMat);
      sole.position.set(side * 0.19, -1.10, 0.11);
      sole.castShadow = true; grp.add(sole);
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
        new THREE.CylinderGeometry(0.60, 0.63, 1.34, 24, 1, true, side < 0 ? 0.35 : Math.PI + 0.35, 2.2), mat);
      panel.position.y = 1.55;
      panel.scale.set(1.06, 1, 0.80);
      panel.castShadow = true;
      grp.add(panel);
    });
    return grp;
  }

  // ---------- public API ----------

  function init(container) {
    if (mounted) return;
    if (typeof THREE === 'undefined') return false;

    const w = container.clientWidth || 380;
    const h = container.clientHeight || 460;

    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    camera.position.set(0, 1.05, 7.4);
    camera.lookAt(0, 1.05, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // studio lighting — key, fill, rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.52));

    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(3.2, 6.0, 4.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 22;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 5; key.shadow.camera.bottom = -4;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xE8EEF5, 0.45);
    fill.position.set(-4.2, 2.4, 2.8);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xFFF4E2, 0.62);
    rim.position.set(-1.4, 3.2, -5.2);
    scene.add(rim);

    // ground shadow catcher
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 48),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.16;
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

  return { init, setOutfit, resumeAutoRotate };
})();
