// The low-poly worlds shared by the README renderer (scene.html) and the portfolio site.
// createWorld() fills `scene`, aims `camera`, and returns animators that take a loop phase p in [0, 1).
import * as THREE from "three";

export const ACCENTS = {
  dark: { see: "#ffb454", defend: "#ff6b6b", decide: "#8b9cff" },
  light: { see: "#c97a10", defend: "#d9473f", decide: "#4f5fe0" },
};

// drift: sway the hero camera within each loop so near and far layers slide past each other (parallax in a GIF).
// stars3d: false leaves the sky to a painted backdrop (see starfield.js) so GIF frames stay small.
export function createWorld({ name, scene, camera, width, height, dark, drift = false, stars3d = true }) {
  const DARK = dark;
  const W = width, H = height;
  const accents = ACCENTS[dark ? "dark" : "light"];
  const C = {
    see: new THREE.Color(accents.see),
    defend: new THREE.Color(accents.defend),
    decide: new THREE.Color(accents.decide),
    grass: new THREE.Color(DARK ? "#5f8f62" : "#79a96a"),
    grass2: new THREE.Color(DARK ? "#4c7a55" : "#6a9a5d"),
    soil: new THREE.Color(DARK ? "#8a5a44" : "#a8694b"),
    rock: new THREE.Color(DARK ? "#6a5a86" : "#8d8193"),
    rock2: new THREE.Color(DARK ? "#55476f" : "#77697f"),
    stone: new THREE.Color(DARK ? "#d9cfc2" : "#efe6da"),
    slate: new THREE.Color(DARK ? "#3b3456" : "#3a3448"),
    water: new THREE.Color(DARK ? "#5fb3a8" : "#6cc1b4"),
    rice: new THREE.Color(DARK ? "#b9d36a" : "#9cc455"),
    leaf: new THREE.Color(DARK ? "#3f7a58" : "#4f9a68"),
    leaf2: new THREE.Color(DARK ? "#2f6648" : "#3f8659"),
    trunk: new THREE.Color("#6b4a3a"),
  };

  // ---------- helpers ----------
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const TAU = Math.PI * 2;
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
  const glow = (color, intensity = 2.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, flatShading: true });
  function mesh(geo, material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
  // Smooth periodic noise on the unit circle so a jittered ring closes without a seam.
  function ringNoise(angle, seed, k = 3) {
    let v = 0;
    for (let i = 1; i <= k; i++) v += Math.sin(angle * (i + 1) + seed * 1.7 * i) / (i * 1.3);
    return v;
  }
  function jitterRadial(geo, amount, seed, yFn = null) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const a = Math.atan2(z, x);
      const s = 1 + amount * ringNoise(a, seed + y * 3.1);
      p.setX(i, x * s); p.setZ(i, z * s);
      if (yFn) p.setY(i, yFn(y, a));
    }
    geo.computeVertexNormals();
    return geo;
  }
  let glowTexture;
  function glowSprite(color, size) {
    if (!glowTexture) {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,0.35)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      glowTexture = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, depthWrite: false, blending: DARK ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: DARK ? 0.9 : 0.55 }));
    s.scale.setScalar(size);
    return s;
  }

  function lights(target = new THREE.Vector3()) {
    scene.add(new THREE.HemisphereLight(DARK ? 0xb9a8ff : 0xfff4e0, DARK ? 0x2a1d36 : 0xb8a58f, DARK ? 1.1 : 1.5));
    const sun = new THREE.DirectionalLight(DARK ? 0xffd9b0 : 0xfff1dc, DARK ? 2.6 : 2.8);
    sun.position.set(6, 10, 7);
    sun.target.position.copy(target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(DARK ? 0x8b9cff : 0xffc9a8, DARK ? 1.4 : 0.8);
    rim.position.set(-8, 3, -6);
    scene.add(rim);
  }

  function stars(count, spread, seed) {
    const r = rng(seed), pos = [];
    const group = new THREE.Group();
    // three layers: many faint far stars, fewer bright near ones (they also parallax differently)
    [[count * 2, 0.045, 0.6, -14, 18], [count, 0.075, 0.85, -9, 10], [Math.round(count / 6), 0.13, 1, -6, 4]].forEach(([n, size, opacity, z0, dz]) => {
      const pos = [];
      for (let i = 0; i < n; i++) pos.push((r() - 0.5) * spread * 2.4, (r() - 0.35) * spread * 1.1, z0 - r() * dz);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xece8ff, size, transparent: true, opacity, depthWrite: false })));
    });
    return group;
  }

  function tree(r, x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.28 * s, 5), mat(C.trunk));
    trunk.position.y = 0.14 * s; g.add(trunk);
    const tiers = 2 + Math.floor(r() * 2);
    for (let i = 0; i < tiers; i++) {
      const cone = mesh(new THREE.ConeGeometry((0.26 - i * 0.06) * s, (0.38 - i * 0.04) * s, 6), mat(i % 2 ? C.leaf2 : C.leaf));
      cone.position.y = (0.34 + i * 0.17) * s;
      cone.rotation.y = r() * TAU;
      g.add(cone);
    }
    g.position.set(x, 0, z);
    return g;
  }

  // Cone with several height rows. ConeGeometry in r169 leaves holes once heightSegments > 1,
  // so build it as a cylinder with a pinpoint top instead.
  const spike = (radius, height, segments, rows) => new THREE.CylinderGeometry(0.002, radius, height, segments, rows);

  // A floating chunk of land: grass cap, soil band, rocky underside.
  function islandBase(radius, depth, seed, pal = {}) {
    const g = new THREE.Group();
    const cap = mesh(jitterRadial(new THREE.CylinderGeometry(radius, radius * 1.02, 0.22, 30, 1), 0.035, seed), mat(pal.grass || C.grass));
    cap.position.y = -0.11; g.add(cap);
    const soil = mesh(jitterRadial(new THREE.CylinderGeometry(radius * 1.02, radius * 0.9, 0.42, 30, 2), 0.05, seed + 2), mat(pal.soil || C.soil));
    soil.position.y = -0.43; g.add(soil);
    const rock = mesh(jitterRadial(spike(radius * 0.9, depth, 12, 3), 0.06, seed + 5), mat(pal.rock || C.rock));
    rock.rotation.x = Math.PI; rock.position.y = -0.64 - depth / 2; g.add(rock);
    const r = rng(seed);
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = radius * (0.35 + r() * 0.3);
      const sub = mesh(jitterRadial(spike(radius * 0.32, depth * 0.55, 7, 2), 0.08, seed + 9 + i), mat(C.rock2));
      sub.rotation.x = Math.PI; sub.position.set(Math.cos(a) * d, -0.64 - depth * 0.27, Math.sin(a) * d);
      g.add(sub);
    }
    return g;
  }

  // Sway the camera around its target once per loop; near objects slide past far ones (parallax in a GIF).
  function swayCamera(target, amountX, amountY) {
    if (!drift) return;
    const base = camera.position.clone();
    animators.push((p) => {
      camera.position.set(base.x + amountX * Math.sin(TAU * p), base.y + amountY * Math.sin(TAU * p * 2), base.z);
      camera.lookAt(target);
    });
  }

  // ---------- scenes ----------
  const animators = [];
  let LOOP = 4;

  function buildHero() {
    LOOP = 4;
    const r = rng(7);
    const world = new THREE.Group();
    scene.add(world);
    lights();
    if (stars3d) scene.add(stars(DARK ? 260 : 120, 22, 3));

    const island = islandBase(3.2, 2.8, 11);
    world.add(island);

    const hub = (deg, rad) => new THREE.Vector3(Math.cos((deg * Math.PI) / 180) * rad, 0, Math.sin((deg * Math.PI) / 180) * rad);
    const P_SEE = hub(200, 1.85), P_DEF = hub(325, 1.8), P_DEC = hub(85, 1.9);

    // grass patches for texture
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = 0.6 + r() * 2.4;
      const p = mesh(new THREE.CylinderGeometry(0.18 + r() * 0.25, 0.22 + r() * 0.25, 0.04, 6), mat(C.grass2), { cast: false });
      p.position.set(Math.cos(a) * d, 0.01, Math.sin(a) * d);
      world.add(p);
    }

    // --- center: rice terraces with water (Jagapadi nod)
    const terraces = new THREE.Group();
    [0.95, 0.68, 0.42].forEach((rad, i) => {
      const t = mesh(jitterRadial(new THREE.CylinderGeometry(rad, rad + 0.04, 0.12, 18), 0.04, 30 + i), mat(i ? C.grass : C.soil));
      t.position.y = 0.06 + i * 0.12;
      terraces.add(t);
      const water = mesh(new THREE.CylinderGeometry(rad - 0.06, rad - 0.06, 0.02, 18), new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }), { cast: false });
      water.position.y = 0.12 + i * 0.12 + 0.005;
      terraces.add(water);
    });
    const tuftGeo = new THREE.ConeGeometry(0.022, 0.12, 4);
    const tufts = new THREE.InstancedMesh(tuftGeo, mat(C.rice), 220);
    tufts.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let n = 0;
    for (let ring = 0; ring < 3 && n < 220; ring++) {
      const outer = [0.95, 0.68, 0.42][ring] - 0.1, inner = ring < 2 ? [0.68, 0.42][ring] + 0.06 : 0;
      const count = [100, 75, 45][ring];
      for (let k = 0; k < count && n < 220; k++) {
        const a = r() * TAU, d = inner + r() * (outer - inner);
        e.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(Math.cos(a) * d, 0.12 + ring * 0.12 + 0.06, Math.sin(a) * d), q, new THREE.Vector3(1, 0.8 + r() * 0.5, 1));
        tufts.setMatrixAt(n++, m4);
      }
    }
    terraces.add(tufts);
    world.add(terraces);

    // --- SEE: watchtower with a sweeping camera
    const see = new THREE.Group(); see.position.copy(P_SEE); world.add(see);
    const pad = mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 8), mat(C.stone)); pad.position.y = 0.04; see.add(pad);
    const pole = mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.5, 8), mat(C.stone)); pole.position.y = 0.83; see.add(pole);
    const deck = mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.08, 8), mat(C.slate)); deck.position.y = 1.6; see.add(deck);
    const head = new THREE.Group(); head.position.y = 1.78; see.add(head);
    const body = mesh(new THREE.BoxGeometry(0.46, 0.24, 0.26), mat(C.slate)); head.add(body);
    const lens = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 14), glow(C.see, 2.5)); lens.rotation.z = Math.PI / 2; lens.position.x = 0.28; head.add(lens);
    const hood = mesh(new THREE.BoxGeometry(0.52, 0.04, 0.32), mat(C.see)); hood.position.y = 0.14; head.add(hood);
    const beamGeo = new THREE.ConeGeometry(0.75, 2.1, 28, 1, true); beamGeo.translate(0, -1.05, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      uniforms: { color: { value: C.see.clone() }, opacity: { value: DARK ? 0.32 : 0.38 } },
      vertexShader: "varying float vT; void main() { vT = -position.y / 2.1; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 color; uniform float opacity; varying float vT; void main() { gl_FragColor = vec4(color, opacity * pow(1.0 - clamp(vT, 0.0, 1.0), 1.6)); }",
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: DARK ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    beam.rotation.z = Math.PI / 2 - 0.62; beam.position.x = 0.3; head.add(beam);
    const lensGlow = glowSprite(C.see, 0.7); lensGlow.position.x = 0.34; head.add(lensGlow);
    animators.push((p) => { head.rotation.y = -0.15 + 0.75 * Math.sin(TAU * p); });

    // --- DEFEND: shielded core
    const def = new THREE.Group(); def.position.copy(P_DEF); world.add(def);
    const base = mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.1, 10), mat(C.stone)); base.position.y = 0.05; def.add(base);
    const core = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), mat(C.slate)); core.position.y = 0.32; def.add(core);
    const roof = mesh(new THREE.ConeGeometry(0.42, 0.3, 4), mat(C.defend)); roof.position.y = 0.7; roof.rotation.y = Math.PI / 4; def.add(roof);
    const door = mesh(new THREE.BoxGeometry(0.14, 0.22, 0.02), glow(C.defend, 1.6)); door.position.set(0, 0.22, 0.26); def.add(door);
    const domeGeo = new THREE.SphereGeometry(0.98, 16, 8, 0, TAU, 0, Math.PI / 2);
    const dome = new THREE.Group(); def.add(dome); dome.position.y = 0.1;
    const domeFill = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: C.defend, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    const domeLines = new THREE.LineSegments(new THREE.EdgesGeometry(domeGeo, 1), new THREE.LineBasicMaterial({ color: C.defend, transparent: true, opacity: 0.7 }));
    dome.add(domeFill, domeLines);
    animators.push((p) => {
      dome.rotation.y = (TAU / 16) * p; // 16-fold symmetry: one segment per loop is seamless
      const pulse = 0.5 + 0.5 * Math.sin(TAU * p * 2);
      domeFill.material.opacity = (DARK ? 0.06 : 0.08) + 0.1 * pulse;
      domeLines.material.opacity = 0.45 + 0.4 * pulse;
    });

    // --- DECIDE: server racks with blinking LEDs and an antenna
    const dec = new THREE.Group(); dec.position.copy(P_DEC); world.add(dec);
    const slab = mesh(new THREE.BoxGeometry(1.25, 0.08, 0.7), mat(C.stone)); slab.position.y = 0.04; dec.add(slab);
    const leds = [];
    for (let i = 0; i < 3; i++) {
      const h = [0.95, 1.2, 0.8][i];
      const rack = mesh(new THREE.BoxGeometry(0.32, h, 0.42), mat(C.slate)); rack.position.set(-0.38 + i * 0.38, 0.08 + h / 2, 0); dec.add(rack);
      const cap = mesh(new THREE.BoxGeometry(0.34, 0.03, 0.44), mat(C.decide)); cap.position.set(rack.position.x, 0.08 + h + 0.015, 0); dec.add(cap);
      for (let j = 0; j < Math.floor(h / 0.13); j++) {
        const led = mesh(new THREE.BoxGeometry(0.2, 0.035, 0.02), glow(C.decide, 2.2), { cast: false });
        led.position.set(rack.position.x, 0.2 + j * 0.13, 0.215);
        dec.add(led); leds.push(led);
      }
    }
    const antenna = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 5), mat(C.stone)); antenna.position.set(0, 1.58, 0); dec.add(antenna);
    const tip = glowSprite(C.decide, 0.45); tip.position.set(0, 1.9, 0); dec.add(tip);
    const ledRand = rng(99), pattern = leds.map(() => Array.from({ length: 16 }, () => ledRand() > 0.35));
    animators.push((p) => {
      const step = Math.floor(p * 16) % 16;
      leds.forEach((l, i) => { l.material.emissiveIntensity = pattern[i][step] ? 2.4 : 0.15; });
      tip.material.opacity = (DARK ? 0.9 : 0.55) * (0.35 + 0.65 * (0.5 + 0.5 * Math.cos(TAU * p * 4)));
    });

    // --- river from the terraces to the rim, spilling over as a waterfall
    const RIVER_A = (140 * Math.PI) / 180, rimR = 3.18;
    const riverDir = new THREE.Vector3(Math.cos(RIVER_A), 0, Math.sin(RIVER_A));
    const nearRiver = (x, z) => {
      const t = THREE.MathUtils.clamp(x * riverDir.x + z * riverDir.z, 0.9, rimR);
      return Math.hypot(x - riverDir.x * t, z - riverDir.z * t);
    };
    const lip = rimR + 0.24; // the river runs past the rim so the fall clears the soil band
    const riverLen = lip - 0.9;
    const riverMat = new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.12, metalness: 0.15, emissive: C.water, emissiveIntensity: DARK ? 0.18 : 0.05 });
    const river = mesh(new THREE.BoxGeometry(riverLen, 0.03, 0.3), riverMat, { cast: false });
    river.position.copy(riverDir.clone().multiplyScalar(0.9 + riverLen / 2)).setY(0.015);
    river.rotation.y = -RIVER_A; world.add(river);
    [-1, 1].forEach((side) => {
      for (let k = 0; k < 7; k++) {
        const t = 1.0 + k * 0.32, off = new THREE.Vector3(-riverDir.z, 0, riverDir.x).multiplyScalar(side * (0.2 + r() * 0.05));
        const pebble = mesh(new THREE.DodecahedronGeometry(0.045 + r() * 0.03, 0), mat(C.stone));
        pebble.position.copy(riverDir.clone().multiplyScalar(t).add(off)).setY(0.03); world.add(pebble);
      }
    });
    const bridge = new THREE.Group();
    const deckB = mesh(new THREE.BoxGeometry(0.62, 0.05, 0.22), mat(C.trunk)); deckB.position.y = 0.09; bridge.add(deckB);
    [-1, 1].forEach((s2) => { const rail = mesh(new THREE.BoxGeometry(0.62, 0.03, 0.03), mat(C.trunk)); rail.position.set(0, 0.2, s2 * 0.1); bridge.add(rail); });
    bridge.position.copy(riverDir.clone().multiplyScalar(2.05)); bridge.rotation.y = -RIVER_A + Math.PI / 2; world.add(bridge);

    const fallH = 3.0;
    const fallGeo = new THREE.PlaneGeometry(0.34, fallH, 1, 24); fallGeo.translate(0, -fallH / 2, 0);
    { // bow the sheet outward as it falls
      const fp = fallGeo.attributes.position;
      for (let i = 0; i < fp.count; i++) { const y = -fp.getY(i) / fallH; fp.setZ(i, 0.55 * y * y + 0.12 * y); }
    }
    const fall = new THREE.Mesh(fallGeo, new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, color: { value: C.water.clone().lerp(new THREE.Color("#ffffff"), 0.35) } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float phase; uniform vec3 color; varying vec2 vUv;
        void main() {
          float y = 1.0 - vUv.y;
          float streak = 0.55 + 0.45 * sin((vUv.x * 9.0 + sin(vUv.x * 23.0) * 0.6) * 6.2831);
          float flow = 0.6 + 0.4 * sin((y * 5.0 - phase * 3.0) * 6.2831 + vUv.x * 4.0);
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float fade = smoothstep(1.0, 0.45, y);
          gl_FragColor = vec4(color * (0.85 + 0.25 * flow), (0.35 + 0.5 * streak * flow) * edge * fade);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    fall.position.copy(riverDir.clone().multiplyScalar(lip)).setY(0.025);
    fall.rotation.y = Math.PI / 2 - RIVER_A;
    world.add(fall);
    animators.push((p) => { fall.material.uniforms.phase.value = p; });
    const mist = [];
    for (let k = 0; k < 5; k++) {
      const m = glowSprite(new THREE.Color("#ffffff"), 0.35 + r() * 0.3); world.add(m); mist.push([m, r()]);
    }
    animators.push((p) => {
      mist.forEach(([m, ph], k) => {
        const u = (p * 2 + ph) % 1;
        m.position.copy(riverDir.clone().multiplyScalar(lip + 0.25 + 0.4 * u)).setY(-0.4 - 1.6 * u);
        m.position.add(new THREE.Vector3(-riverDir.z, 0, riverDir.x).multiplyScalar((k - 2) * 0.08));
        m.material.opacity = (DARK ? 0.22 : 0.4) * Math.sin(Math.PI * u);
      });
    });

    // --- wind turbine on the back of the island (3 blades: a third of a turn per loop is seamless)
    const turbine = new THREE.Group(); turbine.position.copy(hub(292, 2.55)); world.add(turbine);
    const tower = mesh(new THREE.CylinderGeometry(0.035, 0.07, 2.0, 8), mat(C.stone)); tower.position.y = 1.0; turbine.add(tower);
    const nacelle = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.26), mat(C.stone)); nacelle.position.set(0, 2.02, 0.04); turbine.add(nacelle);
    const rotor = new THREE.Group(); rotor.position.set(0, 2.02, 0.19); turbine.add(rotor);
    for (let k = 0; k < 3; k++) {
      const blade = mesh(new THREE.BoxGeometry(0.06, 0.78, 0.015), mat(C.stone)); blade.position.y = 0.39;
      const arm = new THREE.Group(); arm.rotation.z = (k * TAU) / 3; arm.add(blade); rotor.add(arm);
    }
    rotor.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(C.see)));
    turbine.rotation.y = 0.35;
    animators.push((p) => { rotor.rotation.z = -(TAU / 3) * p; });

    // --- trees around the rim, away from the three districts
    const hubs = [P_SEE, P_DEF, P_DEC, new THREE.Vector3()];
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 16; tries++) {
      const a = r() * TAU, d = 1.3 + r() * 1.65;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (hubs.some((h, i) => Math.hypot(h.x - x, h.z - z) < (i === 3 ? 1.15 : 0.95))) continue;
      if (nearRiver(x, z) < 0.42) continue;
      world.add(tree(r, x, z, 0.75 + r() * 0.5)); placed++;
    }

    // --- data packets flying between the districts
    const links = [[P_SEE, 1.9, P_DEF, 1.0, C.see], [P_DEF, 1.0, P_DEC, 1.7, C.defend], [P_DEC, 1.7, P_SEE, 1.9, C.decide]];
    links.forEach(([a, ha, b, hb, color], li) => {
      const from = a.clone().setY(ha), to = b.clone().setY(hb);
      const mid = from.clone().add(to).multiplyScalar(0.5).setY(Math.max(ha, hb) + 1.1);
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.08, transparent: true, opacity: 0.55 }));
      line.computeLineDistances(); world.add(line);
      const packets = [0, 1, 2].map(() => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), glow(color, 3), { cast: false }));
        g.add(glowSprite(color, 0.42));
        world.add(g); return g;
      });
      animators.push((p) => {
        packets.forEach((pk, k) => {
          const u = (p + k / 3 + li * 0.11) % 1;
          pk.position.copy(curve.getPoint(u));
          pk.children[0].rotation.set(u * TAU * 2, u * TAU, 0);
        });
      });
    });

    // --- a small satellite orbiting overhead
    const sat = new THREE.Group();
    const satBody = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.22), mat(C.stone)); sat.add(satBody);
    [-1, 1].forEach((s) => { const pnl = mesh(new THREE.BoxGeometry(0.34, 0.015, 0.16), glow(C.decide, 0.6)); pnl.position.x = s * 0.27; sat.add(pnl); });
    world.add(sat);
    animators.push((p) => {
      const a = TAU * p + 0.6;
      sat.position.set(Math.cos(a) * 3.6, 2.5 + 0.25 * Math.sin(a * 2), Math.sin(a) * 3.6);
      sat.rotation.set(0.3, -a, 0.2);
    });

    // --- floating rocks
    for (let i = 0; i < 6; i++) {
      const rock = mesh(new THREE.DodecahedronGeometry(0.1 + r() * 0.13, 0), mat(i % 2 ? C.rock : C.rock2));
      const a = r() * TAU, d = 3.6 + r() * 0.5, y0 = -0.7 - r() * 0.9, ph = r();
      world.add(rock);
      animators.push((p) => {
        rock.position.set(Math.cos(a) * d, y0 + 0.14 * Math.sin(TAU * (p + ph)), Math.sin(a) * d);
        rock.rotation.set(TAU * p, TAU * (p + ph), 0);
      });
    }

    // --- a ringed planet far behind the island
    const planet = new THREE.Group();
    const globe = mesh(new THREE.IcosahedronGeometry(1.5, 3), new THREE.MeshStandardMaterial({ color: 0xc9a7ff, roughness: 0.9, flatShading: true }), { cast: false, receive: false });
    planet.add(globe);
    const bands = mesh(new THREE.IcosahedronGeometry(1.52, 3), new THREE.MeshStandardMaterial({ color: 0x7f5cd6, roughness: 0.9, flatShading: true, transparent: true, opacity: 0.55 }), { cast: false, receive: false });
    bands.scale.set(1, 0.35, 1); planet.add(bands);
    const ring = mesh(new THREE.RingGeometry(2.0, 2.9, 64), new THREE.MeshBasicMaterial({ color: 0xffd6a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), { cast: false, receive: false });
    ring.rotation.x = Math.PI / 2 - 0.35; planet.add(ring);
    planet.position.set(5.5, -1.3, -12); planet.rotation.z = 0.25; planet.scale.setScalar(0.8);
    scene.add(planet);
    animators.push((p) => { globe.rotation.y = TAU * p * 0.25; bands.rotation.y = TAU * p * 0.25; });

    // --- a shooting star once per loop
    const trailGeo = new THREE.PlaneGeometry(2.2, 0.035); trailGeo.translate(-1.1, 0, 0);
    const trail = new THREE.Mesh(trailGeo, new THREE.ShaderMaterial({
      uniforms: { fade: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float fade; varying vec2 vUv; void main() { gl_FragColor = vec4(1.0, 0.95, 0.85, fade * pow(vUv.x, 2.0)); }",
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    trail.rotation.z = -0.38; scene.add(trail);
    const meteor = glowSprite(new THREE.Color("#fff4dc"), 0.5); scene.add(meteor);
    animators.push((p) => {
      const u = (p - 0.15) / 0.3, on = u > 0 && u < 1;
      const x = -9 + 10 * Math.max(0, Math.min(1, u)), y = 5.2 - 3.9 * Math.max(0, Math.min(1, u));
      trail.position.set(x, y, -6); meteor.position.set(x, y, -6);
      const f = on ? Math.sin(Math.PI * u) : 0;
      trail.material.uniforms.fade.value = f; meteor.material.opacity = f;
    });

    // --- two little satellite islands drifting nearby
    [[-5.0, 1.3, -2.6, 51], [4.55, -1.6, -1.6, 53]].forEach(([x, y, z, seed], k) => {
      const isle = islandBase(1.0, 1.3, seed); isle.scale.setScalar(0.55);
      const rr = rng(seed);
      for (let t = 0; t < 3; t++) { const a = rr() * TAU, d = rr() * 0.55; isle.add(tree(rr, Math.cos(a) * d, Math.sin(a) * d, 0.9)); }
      scene.add(isle);
      animators.push((p) => { isle.position.set(x, y + 0.16 * Math.sin(TAU * p + k * 2.4), z); isle.rotation.y = 0.4 + 0.12 * Math.sin(TAU * p + k); });
    });

    // --- fireflies / dust motes
    const motes = [];
    for (let k = 0; k < 26; k++) {
      const col = [C.see, C.decide, C.defend][k % 3];
      const m = glowSprite(col, 0.16 + r() * 0.12); scene.add(m);
      motes.push([m, r() * TAU, 1.6 + r() * 3.4, -0.5 + r() * 3.0, r()]);
    }
    animators.push((p) => {
      motes.forEach(([m, a, d, y, ph]) => {
        m.position.set(Math.cos(a + 0.3 * Math.sin(TAU * (p + ph))) * d, y + 0.3 * Math.sin(TAU * (p + ph)), Math.sin(a) * d * 0.7);
        m.material.opacity = (DARK ? 0.85 : 0.5) * (0.4 + 0.6 * Math.abs(Math.sin(TAU * (p + ph))));
      });
    });


    animators.push((p) => {
      world.position.y = 0.12 * Math.sin(TAU * p);
      world.rotation.y = 0.35 + 0.16 * Math.sin(TAU * p);
    });

    camera.fov = 28;
    // out-of-focus rocks close to the lens: they move most when the camera moves
    const near = [];
    [[-1.3, -1.65, 6.6, 0.3], [2.3, 1.55, 6.2, 0.24], [2.0, -1.55, 7.8, 0.18]].forEach(([x, y, z, s], k) => {
      const rock = mesh(new THREE.DodecahedronGeometry(s, 0), mat(k % 2 ? C.rock : C.rock2), { cast: false });
      rock.position.set(x, y, z); scene.add(rock); near.push([rock, y, k]);
    });
    animators.push((p) => near.forEach(([rock, y, k]) => {
      rock.position.y = y + 0.12 * Math.sin(TAU * p + k * 2);
      rock.rotation.set(TAU * p * (k % 2 ? 1 : -1), 0.6 * k, 0.3);
    }));

    const dist = 15.2, elev = 0.3;
    camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(0, -0.2, 0);
    camera.setViewOffset(W, H, -W * 0.225, 0, W, H);
    if (drift) {
      const base = camera.position.clone();
      animators.push((p) => {
        camera.position.set(base.x + 1.1 * Math.sin(TAU * p), base.y + 0.3 * Math.sin(TAU * p * 2), base.z);
        camera.lookAt(0, -0.2, 0);
      });
    }
  }

  function buildPillars() {
    LOOP = 6;
    lights();
    if (stars3d) scene.add(stars(DARK ? 140 : 70, 22, 5));
    const spots = [-7.9, 0, 7.9];
    const colors = [C.see, C.defend, C.decide];
    const objects = [];

    spots.forEach((x, i) => {
      const g = new THREE.Group(); g.position.set(x, 0, 0); g.scale.setScalar(1.3); scene.add(g);
      const isle = islandBase(1.05, 0.75, 40 + i * 7);
      isle.scale.setScalar(0.95);
      g.add(isle);
      const ring = mesh(new THREE.TorusGeometry(0.82, 0.025, 6, 40), glow(colors[i], 1.2), { cast: false });
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; g.add(ring);
      const holder = new THREE.Group(); holder.position.y = 0.95; g.add(holder);
      objects.push({ holder, ring });
    });

    // SEE: a camera-eye with stacked lens rings
    {
      const h = objects[0].holder;
      const body = mesh(new THREE.BoxGeometry(0.9, 0.6, 0.55), mat(C.slate)); h.add(body);
      const top = mesh(new THREE.BoxGeometry(0.34, 0.14, 0.4), mat(C.slate)); top.position.set(-0.18, 0.37, 0); h.add(top);
      [0.3, 0.24, 0.18].forEach((rad, k) => {
        const ringM = mesh(new THREE.TorusGeometry(rad, 0.045, 8, 28), mat(k === 0 ? C.see : C.stone)); ringM.position.z = 0.3 + k * 0.07; h.add(ringM);
      });
      const glass = mesh(new THREE.CircleGeometry(0.16, 24), glow(C.see, 2.4)); glass.position.z = 0.43; h.add(glass);
      const s = glowSprite(C.see, 1.1); s.position.z = 0.5; h.add(s);
      const flash = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), glow(C.see, 1.5)); flash.position.set(0.3, 0.2, 0.29); h.add(flash);
    }
    // DEFEND: a beveled shield
    {
      const h = objects[1].holder;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.62); shape.quadraticCurveTo(0.32, 0.5, 0.55, 0.52);
      shape.quadraticCurveTo(0.58, -0.2, 0, -0.66); shape.quadraticCurveTo(-0.58, -0.2, -0.55, 0.52);
      shape.quadraticCurveTo(-0.32, 0.5, 0, 0.62);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
      geo.center();
      const shield = mesh(geo, mat(C.defend, { roughness: 0.55 })); h.add(shield);
      const inner = new THREE.Shape();
      inner.moveTo(0, 0.4); inner.quadraticCurveTo(0.22, 0.32, 0.36, 0.34); inner.quadraticCurveTo(0.38, -0.12, 0, -0.42);
      inner.quadraticCurveTo(-0.38, -0.12, -0.36, 0.34); inner.quadraticCurveTo(-0.22, 0.32, 0, 0.4);
      const ig = new THREE.ExtrudeGeometry(inner, { depth: 0.06, bevelEnabled: false, curveSegments: 10 }); ig.center();
      [1, -1].forEach((side) => { const m = mesh(ig, mat(C.slate)); m.position.z = side * 0.14; m.position.y = 0.0; h.add(m); });
      const lock = mesh(new THREE.BoxGeometry(0.2, 0.16, 0.42), glow(C.defend, 1.8)); lock.position.y = -0.04; h.add(lock);
      const shackle = mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 16, Math.PI), mat(C.stone)); shackle.position.y = 0.04; h.add(shackle);
    }
    // DECIDE: a node graph around a core
    {
      const h = objects[2].holder;
      const core = mesh(new THREE.IcosahedronGeometry(0.3, 0), glow(C.decide, 1.4)); h.add(core);
      h.add(glowSprite(C.decide, 1.2));
      const nr = rng(77), pts = [];
      for (let k = 0; k < 7; k++) {
        const v = new THREE.Vector3(nr() - 0.5, nr() - 0.5, nr() - 0.5).normalize().multiplyScalar(0.62 + nr() * 0.12);
        const node = mesh(new THREE.OctahedronGeometry(0.09, 0), mat(k % 2 ? C.stone : C.decide)); node.position.copy(v); h.add(node);
        pts.push(new THREE.Vector3(), v);
        if (k) pts.push(v, pts[(k - 1) * 2 + 1]);
      }
      h.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: C.decide, transparent: true, opacity: 0.7 })));
    }

    animators.push((p) => {
      objects.forEach(({ holder, ring }, i) => {
        holder.rotation.y = TAU * p + i * 0.9;
        holder.position.y = 0.95 + 0.08 * Math.sin(TAU * p + i * 2.1);
        ring.scale.setScalar(1 + 0.05 * Math.sin(TAU * p * 2 + i));
      });
    });

    camera.fov = 26;
    camera.position.set(0, 2.6, 15.5);
    camera.lookAt(0, 0.1, 0);
    camera.setViewOffset(W, H, 0, H * 0.1, W, H);
    swayCamera(new THREE.Vector3(0, 0.1, 0), 2.2, 0.35);
  }

  function buildMetrics() {
    LOOP = 4;
    lights();
    if (stars3d) scene.add(stars(DARK ? 120 : 60, 22, 13));
    const cols = [[C.defend, 7], [C.defend, 5], [C.see, 6], [C.decide, 4], [C.decide, 5]];
    const cube = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    cols.forEach(([color, n], i) => {
      const g = new THREE.Group(); g.position.set((i - 2) * 5.3, 0, 0); scene.add(g);
      const base = mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, 6), mat(C.slate)); base.position.y = -0.08; g.add(base);
      const ring = mesh(new THREE.TorusGeometry(0.98, 0.02, 6, 6), glow(color, 1.2), { cast: false }); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; g.add(ring);
      const stack = [];
      for (let k = 0; k < n; k++) {
        const top = k === n - 1;
        const c = mesh(cube, top ? glow(color, 1.6) : mat(color.clone().lerp(C.slate, 0.55 - k * 0.05)));
        g.add(c); stack.push(c);
        if (top) { const s = glowSprite(color, 1.3); c.add(s); }
      }
      animators.push((p) => {
        stack.forEach((c, k) => {
          const wave = Math.sin(TAU * p - i * 0.9 - k * 0.35);
          c.position.set(0, 0.24 + k * 0.46 + 0.05 * wave * k / n, 0);
          c.rotation.y = 0.25 * Math.sin(TAU * p + k * 0.5 + i);
        });
        g.rotation.y = 0.5 + 0.1 * Math.sin(TAU * p + i);
      });
    });
    camera.fov = 24;
    camera.position.set(0, 3.0, 19.5);
    camera.lookAt(0, 1.5, 0);
    camera.setViewOffset(W, H, 0, H * 0.13, W, H);
    swayCamera(new THREE.Vector3(0, 1.5, 0), 2.6, 0.4);
  }


  // ---------- seasonal islands ----------
  // Each returns { group, update(p) }; p is the loop phase in [0, 1). Everything periodic in p, so GIFs loop.
  const SEASON_LABELS = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };

  function roundTree(r, x, z, s, colors) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.42 * s, 6), mat(C.trunk));
    trunk.position.y = 0.21 * s; g.add(trunk);
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const blob = mesh(new THREE.IcosahedronGeometry((0.2 + r() * 0.08) * s, 0), mat(colors[i % colors.length]));
      blob.position.set((r() - 0.5) * 0.28 * s, (0.5 + r() * 0.2) * s, (r() - 0.5) * 0.28 * s);
      blob.rotation.set(r() * TAU, r() * TAU, 0);
      g.add(blob);
    }
    g.position.set(x, 0, z);
    return g;
  }

  function palm(r, x, z, s) {
    const g = new THREE.Group();
    const lean = (r() - 0.5) * 0.5;
    for (let i = 0; i < 6; i++) {
      const seg = mesh(new THREE.CylinderGeometry(0.045 * s, 0.055 * s, 0.17 * s, 6), mat(new THREE.Color("#8a6a4a")));
      seg.position.set(lean * i * 0.05 * s, (0.09 + i * 0.16) * s, 0); seg.rotation.z = -lean * 0.4; g.add(seg);
    }
    const top = new THREE.Vector3(lean * 0.3 * s, 1.0 * s, 0);
    for (let k = 0; k < 6; k++) {
      const frond = mesh(new THREE.BoxGeometry(0.62 * s, 0.02 * s, 0.13 * s), mat(new THREE.Color(k % 2 ? "#3f9a5c" : "#57b46b")));
      frond.geometry.translate(0.31 * s, 0, 0);
      frond.position.copy(top); frond.rotation.set(0, (k / 6) * TAU, -0.45);
      g.add(frond);
    }
    const coco = mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), mat(new THREE.Color("#6b4a2a")));
    coco.position.copy(top).add(new THREE.Vector3(0.05 * s, -0.06 * s, 0.04 * s)); g.add(coco);
    g.position.set(x, 0, z);
    return g;
  }

  function placeAround(r, count, minD, maxD, avoid, fn) {
    const spots = [];
    for (let t = 0; t < 400 && spots.length < count; t++) {
      const a = r() * TAU, d = minD + r() * (maxD - minD), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar)) continue;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.42)) continue;
      spots.push([x, z]); fn(x, z);
    }
  }

  // Falling particles (petals, leaves, snow) inside a cylinder above the island; speed is a whole number of
  // falls per loop so the GIF loops cleanly.
  function fallers(group, count, radius, height, makeMesh, seed, spin = true) {
    const r = rng(seed), items = [];
    for (let i = 0; i < count; i++) {
      const m = makeMesh(i); group.add(m);
      items.push({ m, a: r() * TAU, d: Math.sqrt(r()) * radius, ph: r(), drift: 0.15 + r() * 0.2, sp: 1 + Math.floor(r() * 2) });
    }
    return (p) => items.forEach((it) => {
      const u = (p * it.sp + it.ph) % 1;
      it.m.position.set(Math.cos(it.a) * it.d + it.drift * Math.sin(TAU * (u * 2 + it.ph)), height * (1 - u) - 0.2, Math.sin(it.a) * it.d);
      if (spin) it.m.rotation.set(TAU * u * 2, TAU * (u + it.ph), 0);
      it.m.visible = u < 0.97;
    });
  }

  function seasonIsland(season, seed = 100) {
    const r = rng(seed);
    const g = new THREE.Group();
    const updates = [];
    const R = 2.2;
    const hex = (c) => new THREE.Color(c);

    if (season === "spring") {
      g.add(islandBase(R, 2.0, seed, { grass: hex("#8fd16f"), soil: hex("#9a6a4c") }));
      const pond = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x7fd3e6, roughness: 0.1, metalness: 0.1 }), { cast: false });
      pond.position.set(0.5, 0.01, 0.35); pond.scale.set(1.3, 1, 0.8); g.add(pond);
      const pinks = [hex("#ffb7d5"), hex("#ff94c2"), hex("#ffd1e4")];
      placeAround(r, 7, 0.6, 1.9, [[0.5, 0.35, 0.95]], (x, z) => g.add(roundTree(r, x, z, 0.85 + r() * 0.35, pinks)));
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 2.0;
        const f = mesh(new THREE.SphereGeometry(0.035, 6, 4), mat([hex("#ffffff"), hex("#ffe36b"), hex("#ff8fbf"), hex("#c9a7ff")][i % 4]), { cast: false });
        f.position.set(Math.cos(a) * d, 0.03, Math.sin(a) * d); g.add(f);
      }
      const petal = new THREE.PlaneGeometry(0.07, 0.05);
      const petalMat = new THREE.MeshBasicMaterial({ color: 0xffb7d5, side: THREE.DoubleSide });
      updates.push(fallers(g, 26, 2.3, 2.6, () => new THREE.Mesh(petal, petalMat), seed + 1));
    }

    if (season === "summer") {
      g.add(islandBase(R, 2.0, seed, { grass: hex("#f2d58b"), soil: hex("#d9b46a"), rock: hex("#8a7a6a") }));
      const lawn = mesh(jitterRadial(new THREE.CylinderGeometry(1.45, 1.5, 0.06, 24), 0.08, seed + 3), mat(hex("#6cc46a")), { cast: false });
      lawn.position.set(-0.35, 0.03, -0.25); g.add(lawn);
      const lagoon = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.035, 24), new THREE.MeshStandardMaterial({ color: 0x3fd6c8, roughness: 0.05, metalness: 0.2, emissive: 0x0e5a55, emissiveIntensity: 0.4 }), { cast: false });
      lagoon.position.set(0.85, 0.02, 0.75); lagoon.scale.set(1.2, 1, 0.9); g.add(lagoon);
      placeAround(r, 5, 0.4, 1.6, [[0.85, 0.75, 1.0]], (x, z) => g.add(palm(r, x, z, 0.8 + r() * 0.3)));
      const umbrella = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), mat(C.stone)); pole.position.y = 0.3; umbrella.add(pole);
      const top = mesh(new THREE.ConeGeometry(0.38, 0.18, 8), mat(hex("#ff6b6b"))); top.position.y = 0.62; umbrella.add(top);
      umbrella.position.set(1.55, 0, -0.4); g.add(umbrella);
      const towel = mesh(new THREE.BoxGeometry(0.4, 0.01, 0.2), mat(hex("#ffb454")), { cast: false }); towel.position.set(1.45, 0.01, -0.1); towel.rotation.y = 0.4; g.add(towel);
      const sun = glowSprite(hex("#ffd27a"), 2.2); sun.material.opacity = DARK ? 0.75 : 0.6; sun.position.set(-0.6, 2.4, -1.4); g.add(sun);
      const sunCore = mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0xffd27a }), { cast: false, receive: false });
      sunCore.position.copy(sun.position); g.add(sunCore);
      updates.push((p) => { sun.scale.setScalar(2.2 + 0.25 * Math.sin(TAU * p * 2)); });
    }

    if (season === "autumn") {
      g.add(islandBase(R, 2.0, seed, { grass: hex("#c9a24a"), soil: hex("#8a5a3c") }));
      const warm = [[hex("#ff8a3d"), hex("#e85d2f"), hex("#ffb347")], [hex("#d9472b"), hex("#ff7a45"), hex("#b8341f")], [hex("#ffcc4d"), hex("#f5a524"), hex("#ffde80")]];
      placeAround(r, 8, 0.5, 1.9, [[-0.6, 0.6, 0.7]], (x, z) => g.add(roundTree(r, x, z, 0.85 + r() * 0.35, warm[Math.floor(r() * 3)])));
      for (let i = 0; i < 3; i++) {
        const bale = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 12), mat(hex("#e8c46a")));
        bale.rotation.z = Math.PI / 2; bale.position.set(-0.8 + i * 0.22, 0.16, 0.5 + (i % 2) * 0.25); g.add(bale);
      }
      for (let i = 0; i < 4; i++) {
        const pumpkin = mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(hex("#ff7a1a")));
        pumpkin.scale.set(1.2, 0.8, 1.2); pumpkin.position.set(-0.4 + (i % 2) * 0.25, 0.08, 0.95 + Math.floor(i / 2) * 0.2); g.add(pumpkin);
      }
      for (let i = 0; i < 60; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 2.0;
        const leaf = mesh(new THREE.CircleGeometry(0.04, 5), mat(warm[i % 3][i % 3]), { cast: false });
        leaf.rotation.x = -Math.PI / 2; leaf.position.set(Math.cos(a) * d, 0.012, Math.sin(a) * d); g.add(leaf);
      }
      const leafGeo = new THREE.PlaneGeometry(0.08, 0.06);
      const leafMats = ["#ff8a3d", "#d9472b", "#ffcc4d"].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      updates.push(fallers(g, 24, 2.2, 2.6, (i) => new THREE.Mesh(leafGeo, leafMats[i % 3]), seed + 2));
    }

    if (season === "winter") {
      g.add(islandBase(R, 2.0, seed, { grass: hex("#f2f6ff"), soil: hex("#c9d4ea"), rock: hex("#6a6f8a") }));
      const ice = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.3 }), { cast: false });
      ice.position.set(-0.6, 0.02, 0.55); ice.scale.set(1.2, 1, 0.85); g.add(ice);
      placeAround(r, 9, 0.5, 1.95, [[-0.6, 0.55, 0.95], [0.75, -0.35, 0.75]], (x, z) => {
        const t = new THREE.Group(), s2 = 0.9 + r() * 0.4;
        const trunk = mesh(new THREE.CylinderGeometry(0.035 * s2, 0.05 * s2, 0.28 * s2, 5), mat(C.trunk)); trunk.position.y = 0.14 * s2; t.add(trunk);
        for (let i = 0; i < 3; i++) {
          const cone = mesh(new THREE.ConeGeometry((0.28 - i * 0.07) * s2, (0.36 - i * 0.04) * s2, 7), mat(hex(i % 2 ? "#2f6a58" : "#3a7d68")));
          cone.position.y = (0.34 + i * 0.17) * s2; t.add(cone);
          const snow = mesh(new THREE.ConeGeometry((0.16 - i * 0.04) * s2, (0.14 - i * 0.02) * s2, 7), mat(hex("#ffffff")));
          snow.position.y = (0.46 + i * 0.17) * s2; t.add(snow);
        }
        t.position.set(x, 0, z); g.add(t);
      });
      const cabin = new THREE.Group();
      const body = mesh(new THREE.BoxGeometry(0.6, 0.38, 0.48), mat(hex("#7a4a34"))); body.position.y = 0.19; cabin.add(body);
      const roof = mesh(new THREE.ConeGeometry(0.5, 0.32, 4), mat(hex("#ffffff"))); roof.position.y = 0.54; roof.rotation.y = Math.PI / 4; cabin.add(roof);
      const win = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.01), glow(hex("#ffb454"), 2.4), { cast: false }); win.position.set(0.12, 0.2, 0.245); cabin.add(win);
      const warmLight = glowSprite(hex("#ffb454"), 0.7); warmLight.position.set(0.12, 0.2, 0.3); cabin.add(warmLight);
      cabin.position.set(0.75, 0, -0.35); cabin.rotation.y = -0.4; g.add(cabin);
      const snowman = new THREE.Group();
      [[0.16, 0.14], [0.12, 0.38], [0.085, 0.56]].forEach(([rad, y]) => { const b = mesh(new THREE.IcosahedronGeometry(rad, 1), mat(hex("#ffffff"))); b.position.y = y; snowman.add(b); });
      const nose = mesh(new THREE.ConeGeometry(0.02, 0.1, 6), mat(hex("#ff8a3d"))); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.56, 0.1); snowman.add(nose);
      snowman.position.set(0.1, 0, 1.15); g.add(snowman);
      const flake = new THREE.SphereGeometry(0.025, 5, 4);
      const flakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      updates.push(fallers(g, 40, 2.4, 2.8, () => new THREE.Mesh(flake, flakeMat), seed + 3, false));
    }

    return { group: g, update: (p) => updates.forEach((fn) => fn(p)) };
  }

  // README strip: the four seasons side by side
  function buildSeasons() {
    LOOP = 4;
    lights();
    ["spring", "summer", "autumn", "winter"].forEach((season, i) => {
      const isle = seasonIsland(season, 200 + i * 17);
      isle.group.scale.setScalar(1.05);
      isle.group.position.set((i - 1.5) * 8.0, 0, 0);
      scene.add(isle.group);
      animators.push((p) => {
        isle.update(p);
        isle.group.position.y = 0.1 * Math.sin(TAU * p + i * 1.4);
        isle.group.rotation.y = 0.5 + 0.18 * Math.sin(TAU * p + i);
      });
    });
    camera.fov = 24;
    camera.position.set(0, 3.2, 24);
    camera.lookAt(0, 0.6, 0);
    camera.setViewOffset(W, H, 0, H * 0.12, W, H);
    swayCamera(new THREE.Vector3(0, 0.6, 0), 2.2, 0.35);
  }

  // Portfolio site: the seasons spread far apart; the page moves the camera from one to the next.
  function buildArchipelago() {
    LOOP = 8;
    lights();
    const isles = ["spring", "summer", "autumn", "winter"].map((season, i) => {
      const isle = seasonIsland(season, 300 + i * 23);
      isle.group.position.set(i * 40, 0, 0);
      scene.add(isle.group);
      animators.push((p) => { isle.update(p); isle.group.position.y = 0.12 * Math.sin(TAU * p + i); });
      return isle.group;
    });
    camera.userData.isles = isles;
  }

  function buildFooter() {
    LOOP = 6;
    lights();
    if (stars3d) scene.add(stars(DARK ? 120 : 60, 20, 9));
    const globe = new THREE.Group(); scene.add(globe);
    const geo = new THREE.IcosahedronGeometry(1.25, 3);
    const col = [], pos = geo.attributes.position, land = new THREE.Color(C.grass), sea = new THREE.Color(DARK ? "#3a6f9a" : "#5c9cc9"), sand = new THREE.Color(DARK ? "#c9a777" : "#dcc08f");
    const noise = (v) => Math.sin(v.x * 2.3 + 1.1) * Math.cos(v.y * 2.9) + Math.sin(v.z * 3.1 + v.x * 1.3) * 0.7 + Math.cos(v.y * 5.3 + v.z * 1.9) * 0.3;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      v.set(0, 0, 0);
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, i + k));
      v.divideScalar(3);
      const n = noise(v.clone().normalize());
      const c = n > 0.35 ? land : n > 0.22 ? sand : sea;
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    globe.add(mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 })));
    const atmo = glowSprite(C.decide, 4.4); atmo.material.opacity = DARK ? 0.35 : 0.3; atmo.position.z = -1.5; scene.add(atmo);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.01, 6, 90), new THREE.MeshBasicMaterial({ color: C.see, transparent: true, opacity: 0.55 }));
    orbit.rotation.set(Math.PI / 2 - 0.35, 0, 0.25); scene.add(orbit);
    const sat = new THREE.Group();
    sat.add(mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), mat(C.stone)));
    [-1, 1].forEach((s) => { const pnl = mesh(new THREE.BoxGeometry(0.3, 0.012, 0.14), glow(C.decide, 0.6)); pnl.position.x = s * 0.24; sat.add(pnl); });
    sat.add(glowSprite(C.see, 0.5));
    orbit.add(sat);
    // data packets on tilted orbits around the globe
    const orbiters = [[C.see, 1.55, 0.5, 1], [C.defend, 1.7, -0.6, 2], [C.decide, 1.62, 1.2, 1]].map(([color, rad, tilt, speed], k) => {
      const pivot = new THREE.Group(); pivot.rotation.set(tilt, 0, 0.4 * (k - 1)); scene.add(pivot);
      const cube = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), glow(color, 2.6), { cast: false });
      cube.add(glowSprite(color, 0.45)); pivot.add(cube);
      return [cube, rad, speed, k / 3];
    });
    animators.push((p) => {
      orbiters.forEach(([cube, rad, speed, ph]) => {
        const a = TAU * (p * speed + ph);
        cube.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        cube.rotation.set(a, a * 2, 0);
      });
    });
    // a moon
    const moon = mesh(new THREE.IcosahedronGeometry(0.22, 1), mat(C.stone));
    scene.add(moon);
    animators.push((p) => { const a = TAU * p + 1; moon.position.set(Math.cos(a) * 2.6, 0.5 * Math.sin(a), Math.sin(a) * 2.6 - 0.5); moon.rotation.y = a; });
    animators.push((p) => {
      globe.rotation.set(0.35, TAU * p, 0);
      const a = -TAU * p;
      sat.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
      sat.rotation.set(0, 0, a);
    });
    camera.fov = 26;
    camera.position.set(0, 0.6, 11);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(W, H, -W * 0.3, 0, W, H);
    swayCamera(new THREE.Vector3(0, 0, 0), 1.4, 0.3);
  }

  const build = { hero: buildHero, pillars: buildPillars, metrics: buildMetrics, footer: buildFooter, seasons: buildSeasons, archipelago: buildArchipelago }[name];
  if (!build) throw new Error(`unknown world: ${name}`);
  build();
  camera.updateProjectionMatrix();
  return {
    loop: LOOP,
    update(p) { animators.forEach((fn) => fn(p)); },
  };
}
