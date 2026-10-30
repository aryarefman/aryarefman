// The low-poly worlds shared by the README renderer (scene.html) and the portfolio site.
// createWorld() fills `scene`, aims `camera`, and returns animators that take a loop phase p in [0, 1).
import * as THREE from "three";

export const ACCENTS = {
  dark: { see: "#ffb454", defend: "#ff6b6b", decide: "#8b9cff" },
  light: { see: "#c97a10", defend: "#d9473f", decide: "#4f5fe0" },
};

// drift: sway the hero camera within each loop so near and far layers slide past each other (parallax in a GIF).
// stars3d: false leaves the sky to the painted backdrop (sky.js), so animated frames stay small.
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

    // --- islanders: one walks the path with a dog, one waves from beside the racks
    {
      const walker = figure({ shirt: "#ffb454", pants: "#2c3a52", skin: "#c98f6a" });
      walker.g.scale.setScalar(1.25); world.add(walker.g);
      const dog = fox(); dog.scale.setScalar(1.1); dog.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0xd8642a) o.material = smooth("#c8a070"); });
      world.add(dog);
      const hc = hub(255, 1.25);
      animators.push(circleWalk(null, walker.g, hc.x, hc.z, 0.38, 1, 0, (p) => walkPose(walker, TAU * p * 6)));
      animators.push(circleWalk(null, dog, hc.x, hc.z, 0.38, 1, -0.07));
      const waver = figure({ shirt: "#8b9cff", pants: "#2a2f45", skin: "#e2b08c", hair: "#3a2a1c" });
      waver.g.scale.setScalar(1.25); const wp = hub(60, 1.35); waver.g.position.set(wp.x, 0, wp.z); waver.g.rotation.y = 0.4; world.add(waver.g);
      animators.push((p) => { waver.arms[0].rotation.z = 0.3 + Math.max(0, Math.sin(TAU * p * 2)) * 2.0; waver.head.rotation.y = Math.sin(TAU * p) * 0.3; });
    }

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

  // ---------- planets for the numbers strip: each metric gets its own world ----------
  // 3D value noise sampled on the sphere, so the painted equirect textures wrap without a seam
  function noise3(x, y, z, seed) {
    const h = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.3) * 43758.5453; return v - Math.floor(v); };
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const s = (q) => q * q * (3 - 2 * q), u = s(xf), v = s(yf), w = s(zf);
    const L = (a, b, q) => a + (b - a) * q;
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
             L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  }
  function fbm3(x, y, z, seed, oct = 5) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += a * noise3(x * f, y * f, z * f, seed + i); a *= 0.5; f *= 2.03; }
    return v;
  }
  // paint(x, y, z) -> [r, g, b, alpha?, emissiveRGB?] (0..255) for every texel of a 512x256 equirect map
  function planetTextures(paint, withEmissive = false) {
    const W2 = 512, H2 = 256, make = () => { const c = document.createElement("canvas"); c.width = W2; c.height = H2; return c; };
    const cm = make(), ce = withEmissive ? make() : null;
    const gm = cm.getContext("2d"), im = gm.createImageData(W2, H2);
    const ge = ce && ce.getContext("2d"), ie = ge && ge.createImageData(W2, H2);
    for (let j = 0; j < H2; j++) {
      const lat = (0.5 - (j + 0.5) / H2) * Math.PI;
      for (let i = 0; i < W2; i++) {
        const lon = ((i + 0.5) / W2) * TAU;
        const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
        const o = paint(x, y, z), k = (j * W2 + i) * 4;
        im.data[k] = o[0]; im.data[k + 1] = o[1]; im.data[k + 2] = o[2]; im.data[k + 3] = o[3] ?? 255;
        if (ie) { const e = o[4] || [0, 0, 0]; ie.data[k] = e[0]; ie.data[k + 1] = e[1]; ie.data[k + 2] = e[2]; ie.data[k + 3] = 255; }
      }
    }
    gm.putImageData(im, 0, 0); if (ge) ge.putImageData(ie, 0, 0);
    const tex = (c) => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };
    return { map: tex(cm), emissive: ce && tex(ce) };
  }
  const mix3 = (a, b, q) => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
  const ramp = (stops, q) => {
    q = Math.min(1, Math.max(0, q));
    for (let i = 1; i < stops.length; i++) if (q <= stops[i][0]) return mix3(stops[i - 1][1], stops[i][1], Math.max(0, (q - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])));
    return stops[stops.length - 1][1];
  };
  const PLANETS = [
    { // rusty desert world with ice caps and craters
      kind: "mars", glow: C.defend,
      paint: (x, y, z) => {
        const h = fbm3(x * 2.2, y * 2.2, z * 2.2, 1), crater = fbm3(x * 7, y * 7, z * 7, 9);
        let c = ramp([[0.25, [92, 34, 22]], [0.45, [170, 74, 44]], [0.6, [214, 128, 78]], [0.75, [236, 182, 128]]], h);
        if (crater > 0.62) c = mix3(c, [70, 28, 20], Math.min(1, (crater - 0.62) * 6));
        const cap = Math.abs(y) + (h - 0.5) * 0.25;
        if (cap > 0.86) c = mix3(c, [246, 240, 236], Math.min(1, (cap - 0.86) * 14));
        return c;
      },
      moons: [{ r: 0.2, d: 2.0, speed: 1, tilt: 0.3, color: "#9a8f88" }],
    },
    { // molten world: black basalt crust split by glowing lava rivers
      kind: "lava", glow: new THREE.Color("#ff5a2a"),
      paint: (x, y, z) => {
        const h = fbm3(x * 2.6, y * 2.6, z * 2.6, 4), vein = Math.abs(fbm3(x * 3.4, y * 3.4, z * 3.4, 12) - 0.5);
        const crust = ramp([[0.3, [26, 18, 20]], [0.55, [58, 36, 34]], [0.8, [96, 62, 52]]], h);
        const hot = Math.max(0, 1 - vein / 0.045);
        const lava = ramp([[0, [255, 70, 20]], [0.6, [255, 150, 40]], [1, [255, 236, 150]]], hot);
        return [...mix3(crust, lava, hot), 255, lava.map((v) => v * hot)];
      },
      emissive: true,
    },
    { // banded amber gas giant with broad rings
      kind: "saturn", glow: C.see, tilt: 0.42,
      paint: (x, y, z) => {
        const w = fbm3(x * 3, y * 3, z * 3, 7) * 0.5;
        const band = 0.5 + 0.5 * Math.sin(y * 14 + w * 4) * Math.cos(y * 5.3 + w);
        return ramp([[0, [138, 86, 40]], [0.4, [214, 152, 82]], [0.7, [240, 206, 146]], [1, [252, 236, 200]]], band);
      },
      rings: [[1.35, 1.6, "#d9b27a", 0.55], [1.64, 2.05, "#f1d6a4", 0.75], [2.1, 2.35, "#b48a5a", 0.45]],
    },
    { // icy blue giant with a dark storm, a faint ring and a small moon
      kind: "neptune", glow: new THREE.Color("#5aa8ff"), tilt: 0.25,
      paint: (x, y, z) => {
        const w = fbm3(x * 2.5, y * 2.5, z * 2.5, 3);
        let c = ramp([[0, [24, 52, 140]], [0.5, [52, 112, 214]], [1, [140, 206, 255]]], 0.5 + 0.5 * Math.sin(y * 9 + w * 3));
        const sd = Math.hypot(x - 0.75, y + 0.3, z - 0.45);
        if (sd < 0.32) c = mix3(c, [16, 28, 86], Math.min(1, (0.32 - sd) * 7));
        if (Math.abs(y - 0.35) < 0.04 && w > 0.5) c = mix3(c, [236, 246, 255], 0.8);
        return c;
      },
      moons: [{ r: 0.24, d: 2.1, speed: -1, tilt: -0.4, color: "#d8dde6" }],
      rings: [[1.7, 1.78, "#9fc4ff", 0.3]],
    },
    { // living ocean world: seas, green continents, drifting clouds
      kind: "earth", glow: C.decide,
      paint: (x, y, z) => {
        const h = fbm3(x * 1.8, y * 1.8, z * 1.8, 21);
        if (Math.abs(y) > 0.9) return [240, 246, 255];
        if (h < 0.52) return ramp([[0.2, [14, 40, 110]], [0.52, [40, 110, 196]]], h);
        return ramp([[0.52, [216, 200, 140]], [0.56, [72, 140, 64]], [0.7, [44, 98, 50]], [0.8, [122, 104, 80]]], h);
      },
      clouds: (x, y, z) => { const c = fbm3(x * 3, y * 4.8, z * 3, 33); return [255, 255, 255, Math.min(230, Math.max(0, (c - 0.52) * 4) * 255)]; },
      moons: [{ r: 0.22, d: 2.1, speed: 1, tilt: 0.2, color: "#c8c4c0" }],
    },
  ];

  function planet(spec, R) {
    const g = new THREE.Group(), tiltGroup = new THREE.Group(), spin = new THREE.Group();
    tiltGroup.rotation.set(spec.rings ? 0.42 : 0, 0, spec.tilt ?? 0.2); g.add(tiltGroup); tiltGroup.add(spin);   // ringed planets lean toward the viewer so the rings read as discs
    const { map, emissive } = planetTextures(spec.paint, !!spec.emissive);
    spin.add(mesh(new THREE.SphereGeometry(R, 64, 40), new THREE.MeshStandardMaterial({
      map, roughness: spec.kind === "earth" ? 0.6 : 0.9, metalness: 0,
      ...(emissive ? { emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 1.6 } : {}),
    })));
    let sky = null;
    if (spec.clouds) {
      sky = mesh(new THREE.SphereGeometry(R * 1.025, 64, 40), new THREE.MeshStandardMaterial({ map: planetTextures(spec.clouds).map, transparent: true, depthWrite: false, roughness: 1 }), { cast: false });
      tiltGroup.add(sky);
    }
    const halo = glowSprite(spec.glow, R * 3.4); halo.material.opacity *= 0.5; halo.renderOrder = -1; g.add(halo);
    (spec.rings || []).forEach(([a, b, color, op]) => {
      const ring = mesh(new THREE.RingGeometry(R * a, R * b, 96, 1), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, roughness: 1, depthWrite: false }), { cast: false });
      ring.rotation.x = -Math.PI / 2; tiltGroup.add(ring);
    });
    const moons = (spec.moons || []).map((m) => {
      const pivot = new THREE.Group(); pivot.rotation.z = m.tilt; g.add(pivot);
      const moon = mesh(new THREE.IcosahedronGeometry(R * m.r, 3), mat(new THREE.Color(m.color), { flatShading: false }));
      moon.position.x = R * m.d; pivot.add(moon);
      return { pivot, m };
    });
    g.userData.update = (p) => {
      spin.rotation.y = TAU * p;
      if (sky) sky.rotation.y = TAU * p * 2;                      // clouds outrun the ground, still loop-periodic
      moons.forEach(({ pivot, m }) => (pivot.rotation.y = TAU * p * m.speed));
    };
    return g;
  }

  function buildMetrics() {
    LOOP = 6;
    lights();
    if (stars3d) scene.add(stars(DARK ? 120 : 60, 22, 13));
    const sizes = [1.05, 1.0, 1.1, 1.1, 1.1];
    PLANETS.forEach((spec, i) => {
      const p = planet(spec, sizes[i]); p.position.set((i - 2) * 5.3, 1.5, 0); scene.add(p);
      animators.push((q) => { p.userData.update(q); p.position.y = 1.5 + 0.08 * Math.sin(TAU * q + i * 1.2); });
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

  // ---------- tropical palm: curved ringed trunk, arching fronds with drooping leaflets, coconut cluster ----------
  function palm(r, x, z, s) {
    const g = new THREE.Group();
    const H = 1.2 * s, lx = (r() - 0.5) * 0.7, lz = (r() - 0.5) * 0.7;
    const curve = new THREE.CatmullRomCurve3([0, 0.35, 0.7, 1].map((t) => new THREE.Vector3(lx * t * t * H, t * H, lz * t * t * H)));
    const SEG = 48, RAD = 10;
    const trunkGeo = new THREE.TubeGeometry(curve, SEG, 0.05 * s, RAD, false);
    const tp = trunkGeo.attributes.position, centre = new THREE.Vector3(), cols = [];
    const bark = new THREE.Color("#8a6a48"), ring = new THREE.Color("#5e4632"), c = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const t = Math.floor(i / (RAD + 1)) / SEG;
      curve.getPointAt(t, centre);
      const band = Math.pow(Math.abs(Math.sin(t * 15 * Math.PI)), 6);          // leaf-scar rings
      const scale = (1.35 - 0.5 * t) * (1 + 0.14 * band) + (t < 0.06 ? (0.06 - t) * 6 : 0);   // flared base
      tp.setXYZ(i, centre.x + (tp.getX(i) - centre.x) * scale, tp.getY(i) + 0, centre.z + (tp.getZ(i) - centre.z) * scale);
      c.copy(bark).lerp(ring, band * 0.8).offsetHSL(0, 0, (hash2(i, t * 9, 3) - 0.5) * 0.05);
      cols.push(c.r, c.g, c.b);
    }
    trunkGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    trunk.castShadow = true; g.add(trunk);
    const top = curve.getPointAt(1);

    // fronds: one merged geometry of leaflet strips hanging from arching spines
    const pos = [], col = [], light = new THREE.Color("#7ccf5a"), deep = new THREE.Color("#2f7a3c"), dry = new THREE.Color("#a8874a");
    const addTri = (a, b, d, ca, cb, cd) => { pos.push(...a, ...b, ...d); [ca, cb, cd].forEach((k) => col.push(k.r, k.g, k.b)); };
    const FRONDS = 10;
    for (let k = 0; k < FRONDS; k++) {
      const dead = k >= FRONDS - 2;
      const az = (k / FRONDS) * TAU + r() * 0.3, len = (dead ? 0.55 : 0.75 + r() * 0.15) * s;
      const rise = dead ? -0.3 : 0.12 + r() * 0.12, droop = dead ? 0.9 : 0.55 + r() * 0.2;
      const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), side = new THREE.Vector3(-dir.z, 0, dir.x);
      const spine = (t) => top.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, (rise * Math.sin(t * Math.PI * 0.7) - droop * t * t) * len, 0));
      const N = 16;
      for (let j = 0; j < N; j++) {
        const t0 = j / N, t1 = (j + 1) / N, p0 = spine(t0), p1 = spine(t1);
        const leaf = (dead ? 0.12 : 0.26) * s * Math.pow(Math.sin(Math.PI * Math.min(1, t0 * 1.05 + 0.05)), 0.7);
        const cA = (dead ? dry : deep).clone().lerp(dead ? dry : light, t0 * 0.8);
        [-1, 1].forEach((sd) => {
          // each leaflet hangs down and sweeps forward a little
          const tip = p0.clone().addScaledVector(side, sd * leaf * 0.75).addScaledVector(dir, leaf * 0.35).add(new THREE.Vector3(0, -leaf * 0.7, 0));
          const tipC = cA.clone().lerp(light, 0.35);
          addTri(p0, p1, tip, cA, cA, tipC);
        });
      }
      // a thin midrib so fronds read from above
      for (let j = 0; j < N; j++) {
        const p0 = spine(j / N), p1 = spine((j + 1) / N), w = 0.012 * s;
        const a = p0.clone().addScaledVector(side, -w), b = p0.clone().addScaledVector(side, w), d = p1.clone().addScaledVector(side, -w), e = p1.clone().addScaledVector(side, w);
        const mc = dead ? dry : new THREE.Color("#5e8f3a");
        addTri(a, d, b, mc, mc, mc); addTri(b, d, e, mc, mc, mc);
      }
    }
    const frondGeo = new THREE.BufferGeometry();
    frondGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    frondGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    frondGeo.computeVertexNormals();
    const fronds = new THREE.Mesh(frondGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
    fronds.castShadow = true; g.add(fronds);
    for (let i = 0; i < 4; i++) {
      const coco = mesh(new THREE.SphereGeometry(0.045 * s, 12, 10), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x6b4a2a : 0x7a8a3a, roughness: 0.6 }));
      const a = (i / 4) * TAU; coco.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.05 * s, -0.06 * s, Math.sin(a) * 0.05 * s)); g.add(coco);
    }
    g.position.set(x, 0, z);
    return g;
  }

  // ---------- island life: small people and animals that walk, hop, graze and fly ----------
  const smooth = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  function figure(c) {
    const g = new THREE.Group();
    const legs = [-1, 1].map((s) => {
      const pv = new THREE.Group(); pv.position.set(s * 0.024, 0.11, 0);
      const leg = mesh(new THREE.CapsuleGeometry(0.018, 0.075, 4, 8), smooth(c.pants)); leg.position.y = -0.055; pv.add(leg);
      const shoe = mesh(new THREE.BoxGeometry(0.03, 0.016, 0.045), smooth(c.shoes || "#2a2a2e")); shoe.position.set(0, -0.105, 0.008); pv.add(shoe);
      g.add(pv); return pv;
    });
    const torso = mesh(new THREE.CapsuleGeometry(0.036, 0.07, 4, 12), smooth(c.shirt)); torso.position.y = 0.17; torso.scale.z = 0.72; g.add(torso);
    const arms = [-1, 1].map((s) => {
      const pv = new THREE.Group(); pv.position.set(s * 0.047, 0.205, 0);
      const arm = mesh(new THREE.CapsuleGeometry(0.013, 0.07, 4, 8), smooth(c.shirt)); arm.position.y = -0.045; pv.add(arm);
      const hand = mesh(new THREE.SphereGeometry(0.014, 8, 6), smooth(c.skin)); hand.position.y = -0.092; pv.add(hand);
      g.add(pv); return pv;
    });
    const head = mesh(new THREE.SphereGeometry(0.032, 16, 12), smooth(c.skin)); head.position.y = 0.258; g.add(head);
    const hair = mesh(new THREE.SphereGeometry(0.0345, 16, 8, 0, TAU, 0, Math.PI * 0.55), smooth(c.hair || "#2a1d16")); hair.position.y = 0.26; hair.rotation.x = -0.25; g.add(hair);
    if (c.hat) {
      const brim = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 20), smooth(c.hat)); brim.position.y = 0.282; g.add(brim);
      const crown = mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 16), smooth(c.hat)); crown.position.y = 0.298; g.add(crown);
    }
    return { g, legs, arms, head };
  }
  function walkPose(f, ph, amt = 0.6) {
    f.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + i * Math.PI) * amt));
    f.arms.forEach((a, i) => (a.rotation.x = -Math.sin(ph + i * Math.PI) * amt * 0.8));
  }
  function rabbit(colour) {
    const g = new THREE.Group(), fur = smooth(colour);
    const body = mesh(new THREE.SphereGeometry(1, 16, 12), fur); body.scale.set(0.045, 0.042, 0.065); body.position.y = 0.045; g.add(body);
    const head = mesh(new THREE.SphereGeometry(0.03, 14, 10), fur); head.position.set(0, 0.08, 0.055); g.add(head);
    [-1, 1].forEach((s) => {
      const ear = mesh(new THREE.CapsuleGeometry(0.008, 0.045, 4, 8), fur); ear.position.set(s * 0.012, 0.125, 0.045); ear.rotation.set(-0.3, 0, s * 0.18); g.add(ear);
      const eye = mesh(new THREE.SphereGeometry(0.005, 6, 4), smooth("#0a0a0a")); eye.position.set(s * 0.02, 0.088, 0.078); g.add(eye);
    });
    const tail = mesh(new THREE.SphereGeometry(0.016, 10, 8), smooth("#f4f1ea")); tail.position.set(0, 0.06, -0.065); g.add(tail);
    return g;
  }
  function deer() {
    const g = new THREE.Group(), coat = smooth("#9a6a3e"), dark = smooth("#4a3222");
    const body = mesh(new THREE.CapsuleGeometry(0.045, 0.13, 6, 12), coat); body.rotation.x = Math.PI / 2; body.position.y = 0.17; g.add(body);
    [[-0.03, 0.07], [0.03, 0.07], [-0.03, -0.07], [0.03, -0.07]].forEach(([x, z]) => { const leg = mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.15, 6), dark); leg.position.set(x, 0.075, z); g.add(leg); });
    const neck = new THREE.Group(); neck.position.set(0, 0.2, 0.09); g.add(neck);
    const n = mesh(new THREE.CapsuleGeometry(0.02, 0.07, 4, 8), coat); n.position.set(0, 0.04, 0.02); n.rotation.x = 0.5; neck.add(n);
    const head = mesh(new THREE.ConeGeometry(0.028, 0.08, 10), coat); head.rotation.x = Math.PI / 2 + 0.3; head.position.set(0, 0.09, 0.07); neck.add(head);
    [-1, 1].forEach((s) => {
      const ant = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.07, 5), smooth("#d8c8a8")); ant.position.set(s * 0.015, 0.13, 0.05); ant.rotation.z = s * 0.4; neck.add(ant);
      const tine = mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.03, 4), smooth("#d8c8a8")); tine.position.set(s * 0.03, 0.15, 0.06); tine.rotation.set(0.6, 0, s * 0.2); neck.add(tine);
      const ear = mesh(new THREE.ConeGeometry(0.01, 0.03, 6), coat); ear.position.set(s * 0.025, 0.11, 0.04); ear.rotation.z = s * 1.0; neck.add(ear);
    });
    const tail = mesh(new THREE.SphereGeometry(0.014, 8, 6), smooth("#f2ece0")); tail.position.set(0, 0.2, -0.11); g.add(tail);
    g.userData.neck = neck;
    return g;
  }
  function fox() {
    const g = new THREE.Group(), coat = smooth("#d8642a"), white = smooth("#f3eee6"), black = smooth("#1e1612");
    const body = mesh(new THREE.CapsuleGeometry(0.03, 0.09, 6, 12), coat); body.rotation.x = Math.PI / 2; body.position.y = 0.09; g.add(body);
    [[-0.02, 0.05], [0.02, 0.05], [-0.02, -0.05], [0.02, -0.05]].forEach(([x, z]) => { const leg = mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.07, 6), black); leg.position.set(x, 0.035, z); g.add(leg); });
    const head = mesh(new THREE.ConeGeometry(0.03, 0.07, 10), coat); head.rotation.x = Math.PI / 2; head.position.set(0, 0.11, 0.1); g.add(head);
    [-1, 1].forEach((s) => { const ear = mesh(new THREE.ConeGeometry(0.011, 0.03, 6), black); ear.position.set(s * 0.017, 0.14, 0.085); g.add(ear); });
    const tail = mesh(new THREE.CapsuleGeometry(0.02, 0.07, 6, 10), coat); tail.position.set(0, 0.08, -0.11); tail.rotation.x = -1.0; g.add(tail);
    const tip = mesh(new THREE.SphereGeometry(0.018, 10, 8), white); tip.position.set(0, 0.04, -0.15); g.add(tip);
    return g;
  }
  function butterfly(colour) {
    const g = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5, side: THREE.DoubleSide, emissive: colour, emissiveIntensity: 0.25 });
    const wings = [-1, 1].map((s) => {
      const pv = new THREE.Group(); g.add(pv);
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), wingMat); w.scale.set(1, 1.3, 1); w.rotation.x = -Math.PI / 2; w.position.x = s * 0.035; pv.add(w);
      return pv;
    });
    const body = mesh(new THREE.CapsuleGeometry(0.004, 0.03, 4, 6), smooth("#1a1a1a")); body.rotation.x = Math.PI / 2; g.add(body);
    g.userData.wings = wings;
    return g;
  }
  function crab() {
    const g = new THREE.Group(), shell = smooth("#d0452c");
    const body = mesh(new THREE.SphereGeometry(1, 16, 10), shell); body.scale.set(0.05, 0.022, 0.038); body.position.y = 0.03; g.add(body);
    for (let i = 0; i < 3; i++) [-1, 1].forEach((s) => { const leg = mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.05, 4), shell); leg.position.set(s * 0.05, 0.02, -0.02 + i * 0.02); leg.rotation.z = s * 1.1; g.add(leg); });
    [-1, 1].forEach((s) => {
      const claw = mesh(new THREE.SphereGeometry(0.016, 10, 8), shell); claw.scale.set(1, 0.7, 1.3); claw.position.set(s * 0.035, 0.035, 0.05); g.add(claw);
      const eye = mesh(new THREE.SphereGeometry(0.005, 6, 4), smooth("#111")); eye.position.set(s * 0.012, 0.055, 0.03); g.add(eye);
    });
    return g;
  }
  function gull() {
    const g = new THREE.Group(), white = smooth("#f5f5f2"), grey = smooth("#9aa3ad");
    const body = mesh(new THREE.CapsuleGeometry(0.02, 0.07, 6, 10), white); body.rotation.x = Math.PI / 2; g.add(body);
    const beak = mesh(new THREE.ConeGeometry(0.006, 0.025, 6), smooth("#f2b22e")); beak.rotation.x = Math.PI / 2; beak.position.z = 0.06; g.add(beak);
    const wings = [-1, 1].map((s) => {
      const pv = new THREE.Group(); pv.position.x = s * 0.015; g.add(pv);
      const w = mesh(new THREE.BoxGeometry(0.12, 0.004, 0.04), grey); w.position.x = s * 0.06; pv.add(w);
      return pv;
    });
    g.userData.wings = wings;
    return g;
  }
  // move `obj` around a circle on the island surface, facing its direction of travel; `n` laps per loop
  function circleWalk(isle, obj, cx, cz, rad, n, ph, onStep) {
    return (p) => {
      const a = TAU * (n * p + ph), x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      obj.position.set(x, isle ? isle.hAt(x, z) : 0, z);
      obj.rotation.y = n >= 0 ? -a : -a + Math.PI;
      if (onStep) onStep(p, a);
    };
  }
  function islandLife(season, g, isle, updates) {
    const H = (x, z) => isle.hAt(x, z);
    if (season === "spring") {
      [["#c9b8a3", -0.55, -0.7, 0.32, 0], ["#f2efe8", -0.35, -0.45, 0.22, 0.5]].forEach(([c, cx, cz, rad, ph]) => {
        const b = rabbit(c); g.add(b);
        updates.push(circleWalk(isle, b, cx, cz, rad, 1, ph, (p) => { b.position.y += Math.abs(Math.sin(TAU * (p * 6 + ph))) * 0.07; }));
      });
      const angler = figure({ shirt: "#3f6fb8", pants: "#2c3a52", skin: "#d9a27a", hat: "#e8d38a" });
      angler.g.position.set(-0.2, H(-0.2, 0.45), 0.45); angler.g.rotation.y = Math.PI / 2; g.add(angler.g);
      const rod = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.4, 5), smooth("#5a3a20")); rod.position.set(0.05, 0.25, 0.13); rod.rotation.x = 0.9; angler.arms[1].add(rod);
      angler.arms[1].rotation.x = -0.9; angler.arms[0].rotation.x = -0.7;
      updates.push((p) => { angler.arms[1].rotation.x = -0.9 + Math.sin(TAU * p * 2) * 0.05; angler.head.rotation.y = Math.sin(TAU * p) * 0.3; });
      ["#ffd34f", "#7fd0ff", "#ff8fd0"].forEach((c, i) => {
        const bf = butterfly(c); g.add(bf);
        updates.push((p) => {
          const a = TAU * (p + i / 3), x = Math.cos(a) * (0.7 + i * 0.25), z = Math.sin(a * 2) * 0.5 - 0.2;
          bf.position.set(x, H(x, z) + 0.3 + Math.sin(TAU * p * 4 + i) * 0.08, z); bf.rotation.y = -a;
          const f = Math.sin(TAU * p * 16 + i) * 1.1; bf.userData.wings[0].rotation.z = f; bf.userData.wings[1].rotation.z = -f;
        });
      });
    }
    if (season === "summer") {
      const walker = figure({ shirt: "#ff7a59", pants: "#2f5d8a", skin: "#c98f6a", hair: "#1a120c" });
      g.add(walker.g);
      updates.push(circleWalk(isle, walker.g, 0, 0, 1.78, 1, 0.1, (p) => walkPose(walker, TAU * p * 8)));
      const sunbather = figure({ shirt: "#ffd34f", pants: "#2fb4a8", skin: "#e0a77f", hat: "#f2e6c8" });
      sunbather.g.position.set(1.35, H(1.35, -0.62), -0.62); sunbather.g.rotation.y = -1.9; g.add(sunbather.g);
      updates.push((p) => { sunbather.arms[0].rotation.z = 0.2 + Math.max(0, Math.sin(TAU * p * 2)) * 2.2; });   // waving
      [[1.1, 0.15, 0], [0.6, -1.3, 0.5]].forEach(([cx, cz, ph]) => {
        const cr = crab(); g.add(cr);
        updates.push((p) => { const s2 = Math.sin(TAU * (p * 2 + ph)) * 0.18, x = cx + s2, z = cz; cr.position.set(x, H(x, z), z); cr.rotation.y = Math.PI / 2; });
      });
      [0, 0.5].forEach((ph, i) => {
        const gl = gull(); g.add(gl);
        updates.push((p) => {
          const a = TAU * (p + ph); gl.position.set(Math.cos(a) * (1.3 + i * 0.3), 1.6 + i * 0.25 + Math.sin(a * 2) * 0.1, Math.sin(a) * (1.3 + i * 0.3)); gl.rotation.set(0, -a, 0.35);
          const f = Math.sin(TAU * p * 6 + i) * 0.5; gl.userData.wings[0].rotation.z = f; gl.userData.wings[1].rotation.z = -f;
        });
      });
    }
    if (season === "autumn") {
      const farmer = figure({ shirt: "#8a3b2a", pants: "#3a3f5a", skin: "#c48a62", hat: "#d9b45a" });
      const basket = mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.04, 12), smooth("#a87a3a")); basket.position.set(0, -0.09, 0.02); farmer.arms[1].add(basket);
      g.add(farmer.g);
      updates.push(circleWalk(isle, farmer.g, 0.45, 0.3, 0.32, 1, 0, (p) => { walkPose(farmer, TAU * p * 6, 0.5); farmer.arms[1].rotation.x = -0.3; }));
      const d = deer(); d.position.set(-1.25, H(-1.25, 0.65), 0.65); d.rotation.y = 0.8; g.add(d);
      updates.push((p) => { d.userData.neck.rotation.x = 0.6 + Math.sin(TAU * p) * 0.6; });
      const fx = fox(); g.add(fx);
      updates.push(circleWalk(isle, fx, 1.0, 0.55, 0.28, -1, 0.3));
    }
    if (season === "winter") {
      const skater = figure({ shirt: "#d9473f", pants: "#2a2f45", skin: "#e2b08c", hat: "#f4f4f4" });
      g.add(skater.g);
      updates.push(circleWalk(null, skater.g, -0.6, 0.55, 0.32, 1, 0, (p) => {
        skater.g.position.y = H(-0.6, 0.55) + 0.04; skater.g.rotation.z = 0.15;
        walkPose(skater, TAU * p * 3, 0.35); skater.arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * 0.9));
      }));
      const d = deer(); d.position.set(-1.25, H(-1.25, -0.55), -0.55); d.rotation.y = -0.6; g.add(d);
      updates.push((p) => { d.userData.neck.rotation.x = 0.5 + Math.sin(TAU * p + 1) * 0.55; });
      const hare = rabbit("#f6f7fa"); g.add(hare);
      updates.push(circleWalk(isle, hare, 0.15, -1.05, 0.25, 1, 0.2, (p) => { hare.position.y += Math.abs(Math.sin(TAU * p * 5)) * 0.06; }));
    }
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

  // ---------- detailed seasonal islands ----------
  const hex = (c) => new THREE.Color(c);
  function hash2(x, z, s) { const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
  function vnoise(x, z, s) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
    const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  const fbm = (x, z, s) => vnoise(x, z, s) * 0.6 + vnoise(x * 2.1, z * 2.1, s + 3) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 7) * 0.1;
  const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

  function paint(geo, colorAt) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, col = [], c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      colorAt(cx, cy, cz, c);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  // Island with a rolling heightfield top, strata cliffs and a jagged underside.
  // pal: { top: [low, high], patch, cliff: [band1, band2, band3], under, root }
  function richIsland(R, seed, pal) {
    const g = new THREE.Group();
    const edge = (a) => R * (1 + 0.06 * ringNoise(a, seed) + 0.03 * ringNoise(a * 3, seed + 5));
    const hAt = (x, z) => {
      const d = Math.hypot(x, z) / R;
      const fall = 1 - Math.pow(Math.min(1, d), 4);
      return (fbm(x * 0.9 + 10, z * 0.9 + 10, seed) - 0.45) * 0.42 * fall;
    };
    // top: polar grid, so the rim follows `edge`
    const rings = 16, segs = 72, pos = [];
    const pt = (ri, si) => {
      const a = (si / segs) * TAU, t = ri / rings, r = edge(a) * t;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return [x, ri === rings ? -0.02 : hAt(x, z), z];
    };
    for (let ri = 0; ri < rings; ri++) for (let si = 0; si < segs; si++) {
      const a = pt(ri, si), b = pt(ri, si + 1), c = pt(ri + 1, si), d = pt(ri + 1, si + 1);
      if (ri > 0) pos.push(...a, ...b, ...c);
      pos.push(...b, ...d, ...c);
    }
    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lo = pal.top[0], hi = pal.top[1];
    const top = new THREE.Mesh(paint(topGeo, (x, y, z, c) => {
      c.copy(lo).lerp(hi, THREE.MathUtils.clamp((y + 0.12) / 0.28, 0, 1));
      if (pal.patch && fbm(x * 2.2, z * 2.2, seed + 40) > 0.62) c.lerp(pal.patch, 0.6);
      c.offsetHSL(0, 0, (hash2(x * 9, z * 9, seed) - 0.5) * 0.04);
    }), vmat);
    top.receiveShadow = true; g.add(top);

    // cliff: three strata, each a jittered ring shrinking downwards
    const bands = [[0.0, 0.38, 1.0, 0.97], [0.38, 0.8, 0.97, 0.86], [0.8, 1.25, 0.86, 0.7]];
    bands.forEach(([y0, y1, s0, s1], bi) => {
      const geo = new THREE.CylinderGeometry(1, 1, 1, segs, 3, true).toNonIndexed();
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i)), v = p.getY(i) + 0.5; // 1 top, 0 bottom
        const sc = THREE.MathUtils.lerp(s1, s0, v) * edge(a) * (1 + (v > 0.02 && v < 0.98 ? 0.05 * (hash2(a * 20, v * 9 + bi, seed) - 0.5) : 0));
        p.setX(i, Math.cos(a) * sc); p.setZ(i, Math.sin(a) * sc);
        p.setY(i, -THREE.MathUtils.lerp(y1, y0, v) - 0.02);
      }
      const m = new THREE.Mesh(paint(geo, (x, y, z, c) => {
        c.copy(pal.cliff[bi]).offsetHSL(0, 0, (hash2(Math.atan2(z, x) * 30, y * 20, seed) - 0.5) * 0.08);
        if (fbm(Math.atan2(z, x) * 4, y * 6, seed + bi) > 0.66) c.multiplyScalar(0.8);
      }), vmat);
      m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
    // underside: a main spike and smaller ones, darker toward the tip
    const spikeAt = (rad, depth, x, z, sd) => {
      const geo = jitterRadial(spike(rad, depth, 14, 5), 0.12, sd).toNonIndexed();
      // starts in the cliff's bottom colour so the rock reads as one piece, then darkens toward the tip
      const m = new THREE.Mesh(paint(geo, (px, py, pz, c) => {
        const k = THREE.MathUtils.clamp((depth / 2 - py) / depth, 0, 1);
        c.copy(pal.cliff[2]).lerp(pal.under, THREE.MathUtils.smoothstep(k, 0.05, 0.45)).lerp(hex("#0d0a18"), k * 0.7);
        c.offsetHSL(0, 0, (hash2(Math.atan2(pz, px) * 30, py * 20, sd) - 0.5) * 0.06);
      }), vmat);
      m.rotation.x = Math.PI; m.position.set(x, -1.25 - depth / 2 + 0.02, z); m.castShadow = true; g.add(m);
    };
    spikeAt(R * 0.74, R * 1.25, 0, 0, seed + 60);
    const r = rng(seed + 90);
    for (let i = 0; i < 4; i++) { const a = r() * TAU, d = R * (0.3 + r() * 0.3); spikeAt(R * (0.18 + r() * 0.14), R * (0.5 + r() * 0.4), Math.cos(a) * d, Math.sin(a) * d, seed + 70 + i); }
    return { group: g, hAt, edge };
  }

  // instanced grass tufts / flowers / stalks scattered on the terrain
  function scatter(g, isle, count, geo, colors, seed, { minD = 0, maxD = 0.94, avoid = [], scale = [0.8, 1.4], lift = 0 } = {}) {
    const r = rng(seed), inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    let n = 0;
    for (let t = 0; t < count * 8 && n < count; t++) {
      const a = r() * TAU, rr = isle.edge(a) * (minD + Math.sqrt(r()) * (maxD - minD)), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (avoid.some(([ax, az, ad]) => Math.hypot(ax - x, az - z) < ad)) continue;
      e.set((r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4); q.setFromEuler(e);
      const s2 = scale[0] + r() * (scale[1] - scale[0]);
      m4.compose(new THREE.Vector3(x, isle.hAt(x, z) + lift, z), q, new THREE.Vector3(s2, s2 * (0.8 + r() * 0.6), s2));
      inst.setMatrixAt(n, m4); inst.setColorAt(n, col.copy(colors[Math.floor(r() * colors.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.08)); n++;
    }
    inst.count = n; inst.castShadow = true; inst.receiveShadow = true;
    g.add(inst);
    return inst;
  }
  const tuftGeo = (() => { const geo = new THREE.ConeGeometry(0.03, 0.075, 4); geo.translate(0, 0.03, 0); return geo; })();

  // branching tree: trunk with two limbs and clustered canopy blobs
  function leafyTree(r, s, trunkCol, leafCols) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.035 * s, 0.07 * s, 0.6 * s, 6), mat(trunkCol)); trunk.position.y = 0.3 * s; t.add(trunk);
    const tops = [];
    for (let k = 0; k < 2; k++) {
      const limb = mesh(new THREE.CylinderGeometry(0.02 * s, 0.035 * s, 0.4 * s, 5), mat(trunkCol));
      const a = r() * TAU + k * Math.PI;
      limb.position.set(Math.cos(a) * 0.08 * s, 0.62 * s, Math.sin(a) * 0.08 * s);
      limb.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); t.add(limb);
      tops.push(new THREE.Vector3(Math.cos(a) * 0.2 * s, 0.8 * s, Math.sin(a) * 0.2 * s));
    }
    tops.push(new THREE.Vector3(0, 0.9 * s, 0));
    tops.forEach((c0, k) => {
      for (let j = 0; j < 3; j++) {
        const blob = mesh(new THREE.IcosahedronGeometry((0.16 + r() * 0.08) * s, 1), mat(leafCols[(k + j) % leafCols.length]));
        blob.position.copy(c0).add(new THREE.Vector3((r() - 0.5) * 0.22 * s, (r() - 0.3) * 0.16 * s, (r() - 0.5) * 0.22 * s));
        blob.scale.y = 0.85; t.add(blob);
      }
    });
    return t;
  }
  function pine(r, s, snow) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.3 * s, 6), mat(C.trunk)); trunk.position.y = 0.15 * s; t.add(trunk);
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const cone = mesh(new THREE.ConeGeometry((0.32 - i * 0.065) * s, (0.34 - i * 0.03) * s, 8), mat(hex(i % 2 ? "#2c5f4f" : "#36705c")));
      cone.position.y = (0.3 + i * 0.16) * s; cone.rotation.y = r() * TAU; t.add(cone);
      if (snow) {
        const cap = mesh(new THREE.ConeGeometry((0.22 - i * 0.05) * s, (0.13 - i * 0.015) * s, 8), mat(hex("#f4f8ff")));
        cap.position.y = (0.4 + i * 0.16) * s; cap.rotation.y = cone.rotation.y; t.add(cap);
      }
    }
    return t;
  }
  function plant(g, isle, obj, x, z) { obj.position.set(x, isle.hAt(x, z), z); g.add(obj); return obj; }
  function spots(r, isle, count, minD, maxD, avoid, minGap = 0.5) {
    const out = [];
    for (let t = 0; t < 600 && out.length < count; t++) {
      const a = r() * TAU, rr = isle.edge(a) * (minD + r() * (maxD - minD)), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (avoid.some(([ax, az, ad]) => Math.hypot(ax - x, az - z) < ad)) continue;
      if (out.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < minGap)) continue;
      out.push([x, z]);
    }
    return out;
  }
  function pondMesh(isle, x, z, rx, rz, color, opts = {}) {
    const geo = new THREE.CircleGeometry(1, 28); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.08, metalness: 0.2, transparent: true, opacity: opts.opacity ?? 0.9, emissive: color, emissiveIntensity: 0.12 }));
    m.scale.set(rx, 1, rz); m.position.set(x, isle.hAt(x, z) + 0.035, z); m.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 28), mat(opts.rim || hex("#8a8f98")));
    rim.rotation.x = Math.PI / 2; rim.scale.set(rx, rz, 1); rim.position.copy(m.position); rim.position.y -= 0.01;
    const grp = new THREE.Group(); grp.add(rim, m); return grp;
  }
  function stream(g, isle, from, angle, color, seed) {
    // a narrow channel from `from` to the rim, then a waterfall
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const pts = [];
    const start = new THREE.Vector3(from[0], 0, from[1]);
    const lip = isle.edge(angle) + 0.05;
    const end = dir.clone().multiplyScalar(lip);
    for (let i = 0; i <= 12; i++) {
      const p = start.clone().lerp(end, i / 12);
      p.add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.12 * Math.sin(i * 0.9 + seed)));
      p.y = isle.hAt(p.x, p.z) + 0.03; pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const water = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.07, 5, false), new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.2, emissive: color, emissiveIntensity: 0.15 }));
    water.scale.y = 0.35; g.add(water);
    const fallH = 2.4;
    const fallGeo = new THREE.PlaneGeometry(0.22, fallH, 1, 20); fallGeo.translate(0, -fallH / 2, 0);
    const fp = fallGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) { const y = -fp.getY(i) / fallH; fp.setZ(i, 0.45 * y * y + 0.1 * y); }
    const fall = new THREE.Mesh(fallGeo, new THREE.ShaderMaterial({
      uniforms: { phase: { value: 0 }, color: { value: hex(color).lerp(hex("#ffffff"), 0.4) } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float phase; uniform vec3 color; varying vec2 vUv;
        void main() { float y = 1.0 - vUv.y; float s = 0.55 + 0.45 * sin((vUv.x * 7.0) * 6.2831);
          float f = 0.6 + 0.4 * sin((y * 5.0 - phase * 3.0) * 6.2831 + vUv.x * 4.0);
          float e = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
          gl_FragColor = vec4(color * (0.85 + 0.25 * f), (0.35 + 0.5 * s * f) * e * smoothstep(1.0, 0.4, y)); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    fall.position.copy(end).setY(0.0); fall.rotation.y = Math.PI / 2 - angle; g.add(fall);
    return (p) => { fall.material.uniforms.phase.value = p; };
  }
  function fence(g, isle, a0, a1, rad, color) {
    for (let a = a0; a <= a1; a += 0.13) {
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad, y = isle.hAt(x, z);
      const post = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), mat(color)); post.position.set(x, y + 0.08, z); g.add(post);
      if (a + 0.13 <= a1) {
        const x2 = Math.cos(a + 0.13) * rad, z2 = Math.sin(a + 0.13) * rad, y2 = isle.hAt(x2, z2);
        const len = Math.hypot(x2 - x, z2 - z);
        [0.06, 0.12].forEach((h) => {
          const rail = mesh(new THREE.BoxGeometry(len, 0.018, 0.018), mat(color), { cast: false });
          rail.position.set((x + x2) / 2, (y + y2) / 2 + h, (z + z2) / 2); rail.rotation.y = -Math.atan2(z2 - z, x2 - x); g.add(rail);
        });
      }
    }
  }
  function smokePuffs(g, origin, seed) {
    const r = rng(seed), puffs = [];
    for (let i = 0; i < 6; i++) {
      const s = mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: 0xdfe4ee, transparent: true, opacity: 0.7, roughness: 1, flatShading: true }), { cast: false });
      g.add(s); puffs.push([s, i / 6, r()]);
    }
    return (p) => puffs.forEach(([s, ph, w]) => {
      const u = (p * 2 + ph) % 1;
      s.position.set(origin.x + 0.12 * Math.sin(TAU * (u + w)) + u * 0.25, origin.y + u * 0.9, origin.z);
      s.scale.setScalar(0.6 + u * 1.6); s.material.opacity = 0.7 * (1 - u);
    });
  }

  function seasonIsland(season, seed = 100) {
    const r = rng(seed);
    const g = new THREE.Group();
    const updates = [];
    const R = 2.2;
    const strataWarm = [hex("#8a5a3c"), hex("#6e4a36"), hex("#4e3a3a")];

    if (season === "spring") {
      const isle = richIsland(R, seed, { top: [hex("#5fa34f"), hex("#8fcb68")], patch: hex("#a9d97a"), cliff: strataWarm, under: hex("#4a3d5a") });
      g.add(isle.group);
      const pond = [0.55, 0.45];
      g.add(pondMesh(isle, ...pond, 0.55, 0.38, hex("#6fd0e6"), { rim: hex("#9aa3a8") }));
      updates.push(stream(isle.group, isle, pond, 0.65, "#6fd0e6", seed));
      const avoid = [[pond[0], pond[1], 0.75], [1.4, 1.1, 0.5], [-0.5, -0.6, 0.62], [-0.2, 0.45, 0.3]];
      spots(r, isle, 6, 0.25, 0.85, avoid, 0.6).forEach(([x, z]) => plant(g, isle, leafyTree(r, 0.8 + r() * 0.35, hex("#5a3a30"), [hex("#ffb7d5"), hex("#ff9cc6"), hex("#ffd1e4"), hex("#f7a8cf")]), x, z));
      scatter(g, isle, 520, tuftGeo, [hex("#5fae4f"), hex("#79c25e"), hex("#9ad46d")], seed + 1, { avoid: [[pond[0], pond[1], 0.62]] });
      const flowerGeo = new THREE.IcosahedronGeometry(0.03, 0);
      scatter(g, isle, 160, flowerGeo, [hex("#ffffff"), hex("#ffe36b"), hex("#ff8fbf"), hex("#c9a7ff")], seed + 2, { avoid: [[pond[0], pond[1], 0.62]], lift: 0.05, scale: [0.8, 1.2] });
      // stone lantern and stepping stones
      const lantern = new THREE.Group();
      [[0.16, 0.05, 0.03], [0.05, 0.22, 0.16], [0.14, 0.08, 0.31], [0.1, 0.06, 0.38]].forEach(([w, h, y]) => { const b = mesh(new THREE.BoxGeometry(w, h, w), mat(hex("#b8b2a8"))); b.position.y = y; lantern.add(b); });
      const lamp = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), glow(hex("#ffd27a"), 1.6)); lamp.position.y = 0.32; lantern.add(lamp);
      plant(g, isle, lantern, -0.9, 0.9);
      for (let i = 0; i < 6; i++) { const x = -0.6 + i * 0.22, z = 0.95 - i * 0.1; const st = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 7), mat(hex("#a9a39a"))); plant(g, isle, st, x, z).position.y += 0.015; }
      const petal = new THREE.PlaneGeometry(0.06, 0.045);
      const petalMat = new THREE.MeshBasicMaterial({ color: 0xffb7d5, side: THREE.DoubleSide });
      updates.push(fallers(g, 30, 2.3, 2.8, () => new THREE.Mesh(petal, petalMat), seed + 1));
      islandLife("spring", g, isle, updates);
    }

    if (season === "summer") {
      const isle = richIsland(R, seed, { top: [hex("#d4ad62"), hex("#e8c987")], cliff: [hex("#c9a46a"), hex("#a5815a"), hex("#7a6352")], under: hex("#5a4d5a") });
      g.add(isle.group);
      // grassy dune in the middle, turquoise lagoon and a shallow-water ring around the beach
      const dune = new THREE.Mesh(paint(new THREE.CircleGeometry(1.25, 30).rotateX(-Math.PI / 2), (x, y, z, c) => c.copy(hex("#5cb85c")).offsetHSL(0, 0, (hash2(x * 8, z * 8, seed) - 0.5) * 0.1)), vmat);
      dune.position.set(-0.35, 0.08, -0.2); dune.scale.set(1, 1, 0.85); dune.receiveShadow = true; g.add(dune);
      const lagoon = [0.85, 0.75];
      g.add(pondMesh(isle, ...lagoon, 0.6, 0.42, hex("#2fd6c8"), { rim: hex("#f4dc9a") }));
      spots(r, isle, 6, 0.15, 0.7, [[lagoon[0], lagoon[1], 0.75]], 0.55).forEach(([x, z]) => {
        const pl = palm(r, 0, 0, 0.85 + r() * 0.35); plant(g, isle, pl, x, z);
      });
      scatter(g, isle, 300, tuftGeo, [hex("#4fa64f"), hex("#6cc46a")], seed + 4, { maxD: 0.55 });
      // beach hut on stilts, umbrella and towels
      const hut = new THREE.Group();
      [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]].forEach(([x, z]) => { const s = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), mat(hex("#8a6a4a"))); s.position.set(x, 0.11, z); hut.add(s); });
      const floor = mesh(new THREE.BoxGeometry(0.46, 0.04, 0.4), mat(hex("#a5815a"))); floor.position.y = 0.23; hut.add(floor);
      const walls = mesh(new THREE.BoxGeometry(0.38, 0.22, 0.32), mat(hex("#d9b47a"))); walls.position.y = 0.36; hut.add(walls);
      const thatch = mesh(new THREE.ConeGeometry(0.36, 0.26, 4), mat(hex("#c9a24a"))); thatch.position.y = 0.6; thatch.rotation.y = Math.PI / 4; hut.add(thatch);
      plant(g, isle, hut, -1.45, -0.55).rotation.y = 0.6;
      const umbrella = new THREE.Group();
      const pole = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), mat(C.stone)); pole.position.y = 0.27; umbrella.add(pole);
      const canopy = mesh(new THREE.ConeGeometry(0.34, 0.14, 10), mat(hex("#ff6b6b"))); canopy.position.y = 0.56; umbrella.add(canopy);
      plant(g, isle, umbrella, 1.55, -0.45);
      [[1.4, -0.15, "#ffb454"], [1.7, -0.2, "#8b9cff"]].forEach(([x, z, c]) => { const t = mesh(new THREE.BoxGeometry(0.34, 0.012, 0.16), mat(hex(c)), { cast: false }); plant(g, isle, t, x, z).rotation.y = 0.5; });
      const sun = glowSprite(hex("#ffd27a"), 2.2); sun.material.opacity = 0.7; sun.position.set(-0.6, 2.6, -1.4); g.add(sun);
      const sunCore = mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: 0xffd27a }), { cast: false, receive: false });
      sunCore.position.copy(sun.position); g.add(sunCore);
      updates.push((p) => sun.scale.setScalar(2.2 + 0.25 * Math.sin(TAU * p * 2)));
      islandLife("summer", g, isle, updates);
    }

    if (season === "autumn") {
      const isle = richIsland(R, seed, { top: [hex("#b58a3a"), hex("#d9b25a")], patch: hex("#9a7a3a"), cliff: strataWarm, under: hex("#4a3a4a") });
      g.add(isle.group);
      const warm = [[hex("#ff8a3d"), hex("#e85d2f"), hex("#ffb347")], [hex("#d9472b"), hex("#ff7a45"), hex("#b8341f")], [hex("#ffcc4d"), hex("#f5a524"), hex("#ffde80")]];
      // wheat field (instanced stalks) inside a fence
      const field = [-0.55, -0.55];
      const stalk = (() => { const geo = new THREE.CylinderGeometry(0.008, 0.012, 0.22, 4); geo.translate(0, 0.11, 0); return geo; })();
      scatter(g, isle, 360, stalk, [hex("#e8c46a"), hex("#f2d58b"), hex("#d9b04a")], seed + 6, { minD: 0, maxD: 0.42, scale: [0.8, 1.2] }).position.set(field[0], 0, field[1]);
      fence(g, isle, -2.6, -0.7, 1.15, hex("#7a5a3c"));
      // windmill (4 sails: a quarter turn per loop is seamless)
      const mill = new THREE.Group();
      const tower = mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.8, 8), mat(hex("#efe6da"))); tower.position.y = 0.4; mill.add(tower);
      const cap = mesh(new THREE.ConeGeometry(0.22, 0.26, 8), mat(hex("#b8341f"))); cap.position.y = 0.93; mill.add(cap);
      const hub = new THREE.Group(); hub.position.set(0, 0.8, 0.2); mill.add(hub);
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group(); arm.rotation.z = (k * TAU) / 4;
        const sail = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.01), mat(hex("#f4efe6"))); sail.position.set(0.04, 0.3, 0); arm.add(sail);
        const spar = mesh(new THREE.BoxGeometry(0.015, 0.56, 0.015), mat(hex("#6b4a3a"))); spar.position.y = 0.28; arm.add(spar);
        hub.add(arm);
      }
      plant(g, isle, mill, 1.05, -0.75).rotation.y = -0.6;
      updates.push((p) => { hub.rotation.z = -(TAU / 4) * p; });
      spots(r, isle, 7, 0.35, 0.9, [[field[0], field[1], 0.75], [1.05, -0.75, 0.5], [0.45, 0.3, 0.5], [-1.25, 0.65, 0.3], [1.0, 0.55, 0.42]], 0.55).forEach(([x, z]) => plant(g, isle, leafyTree(r, 0.8 + r() * 0.35, hex("#4e342a"), warm[Math.floor(r() * 3)]), x, z));
      for (let i = 0; i < 3; i++) { const bale = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 12), mat(hex("#e8c46a"))); bale.rotation.z = Math.PI / 2; plant(g, isle, bale, 0.1 + i * 0.28, 0.75 + (i % 2) * 0.18).position.y += 0.13; }
      for (let i = 0; i < 5; i++) { const pk = mesh(new THREE.SphereGeometry(0.08, 10, 8), mat(hex("#ff7a1a"))); pk.scale.set(1.2, 0.8, 1.2); plant(g, isle, pk, -0.2 + (i % 3) * 0.18, 1.2 + Math.floor(i / 3) * 0.16).position.y += 0.06; }
      const scare = new THREE.Group();
      const sp = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), mat(hex("#6b4a3a"))); sp.position.y = 0.25; scare.add(sp);
      const arms = mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), mat(hex("#6b4a3a"))); arms.position.y = 0.36; scare.add(arms);
      const shirt = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.08), mat(hex("#3f6fb8"))); shirt.position.y = 0.34; scare.add(shirt);
      const head = mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(hex("#e8c46a"))); head.position.y = 0.5; scare.add(head);
      const hat = mesh(new THREE.ConeGeometry(0.09, 0.08, 8), mat(hex("#8a5a3c"))); hat.position.y = 0.57; scare.add(hat);
      plant(g, isle, scare, field[0], field[1]);
      scatter(g, isle, 140, new THREE.CircleGeometry(0.035, 5).rotateX(-Math.PI / 2), [hex("#ff8a3d"), hex("#d9472b"), hex("#ffcc4d")], seed + 7, { lift: 0.012, scale: [0.8, 1.4] });
      const leafGeo = new THREE.PlaneGeometry(0.07, 0.05);
      const leafMats = ["#ff8a3d", "#d9472b", "#ffcc4d"].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      updates.push(fallers(g, 26, 2.2, 2.8, (i) => new THREE.Mesh(leafGeo, leafMats[i % 3]), seed + 2));
      islandLife("autumn", g, isle, updates);
    }

    if (season === "winter") {
      const isle = richIsland(R, seed, { top: [hex("#c9d6ec"), hex("#eef3fb")], patch: hex("#b9c9e4"), cliff: [hex("#c9d4ea"), hex("#8a8fa8"), hex("#5a5f78")], under: hex("#3e4260"), root: 0x2a2f45 });
      g.add(isle.group);
      const lake = [-0.6, 0.55];
      g.add(pondMesh(isle, ...lake, 0.62, 0.44, hex("#6fb8e8"), { rough: 0.02, opacity: 0.95, rim: hex("#aab8d0") }));
      // cracks on the ice
      const cr = [], lr = rng(seed + 9);
      for (let i = 0; i < 7; i++) { const a = lr() * TAU, l = 0.2 + lr() * 0.3; cr.push(new THREE.Vector3(lake[0], 0, lake[1]), new THREE.Vector3(lake[0] + Math.cos(a) * l, 0, lake[1] + Math.sin(a) * l * 0.7)); }
      const cracks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cr), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
      cracks.position.y = isle.hAt(...lake) + 0.04; g.add(cracks);
      spots(r, isle, 11, 0.3, 0.92, [[lake[0], lake[1], 0.8], [0.8, -0.4, 0.6], [-1.25, -0.55, 0.3], [0.15, -1.05, 0.38]], 0.42).forEach(([x, z]) => plant(g, isle, pine(r, 0.85 + r() * 0.5, true), x, z).rotation.y = r() * TAU);
      // cabin with chimney smoke and warm windows
      const cabin = new THREE.Group();
      const body = mesh(new THREE.BoxGeometry(0.62, 0.36, 0.46), mat(hex("#7a4a34"))); body.position.y = 0.18; cabin.add(body);
      for (let i = 0; i < 4; i++) { const log = mesh(new THREE.BoxGeometry(0.64, 0.02, 0.48), mat(hex("#5e3a2a")), { cast: false }); log.position.y = 0.06 + i * 0.09; cabin.add(log); }
      const roof = mesh(new THREE.ConeGeometry(0.52, 0.34, 4), mat(hex("#f6f9ff"))); roof.position.y = 0.53; roof.rotation.y = Math.PI / 4; cabin.add(roof);
      const chimney = mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), mat(hex("#6a5a5a"))); chimney.position.set(0.16, 0.62, -0.08); cabin.add(chimney);
      [[0.13, 0.2, 0.235], [-0.15, 0.2, 0.235]].forEach(([x, y, z]) => { const w = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.01), glow(hex("#ffb454"), 2.4), { cast: false }); w.position.set(x, y, z); cabin.add(w); });
      const warmLight = glowSprite(hex("#ffb454"), 0.9); warmLight.position.set(0, 0.2, 0.32); cabin.add(warmLight);
      for (let i = 0; i < 6; i++) { const ic = mesh(new THREE.ConeGeometry(0.012, 0.06 + (i % 3) * 0.03, 4), mat(hex("#dff2ff")), { cast: false }); ic.rotation.x = Math.PI; ic.position.set(-0.27 + i * 0.11, 0.33, 0.25); cabin.add(ic); }
      plant(g, isle, cabin, 0.8, -0.4).rotation.y = -0.4;
      cabin.updateMatrixWorld(true);
      updates.push(smokePuffs(g, new THREE.Vector3(0.8 + 0.1, isle.hAt(0.8, -0.4) + 0.78, -0.4 - 0.12), seed + 11));
      const snowman = new THREE.Group();
      [[0.15, 0.13], [0.11, 0.36], [0.08, 0.53]].forEach(([rad, y]) => { const b = mesh(new THREE.IcosahedronGeometry(rad, 2), mat(hex("#ffffff"))); b.position.y = y; snowman.add(b); });
      const nose = mesh(new THREE.ConeGeometry(0.018, 0.09, 6), mat(hex("#ff8a3d"))); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.53, 0.09); snowman.add(nose);
      const scarf = mesh(new THREE.TorusGeometry(0.085, 0.02, 6, 16), mat(hex("#d9473f"))); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.45; snowman.add(scarf);
      plant(g, isle, snowman, 0.15, 1.15);
      scatter(g, isle, 90, new THREE.IcosahedronGeometry(0.06, 0), [hex("#ffffff"), hex("#eef3ff")], seed + 8, { avoid: [[lake[0], lake[1], 0.7]], scale: [0.6, 1.6] });
      const flake = new THREE.SphereGeometry(0.022, 5, 4);
      const flakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      updates.push(fallers(g, 46, 2.4, 2.9, () => new THREE.Mesh(flake, flakeMat), seed + 3, false));
      islandLife("winter", g, isle, updates);
    }

    // a dedicated key light per island, so shadows work wherever the island sits
    const key = new THREE.DirectionalLight(0xffe2c0, 1.1);
    key.position.set(4, 8, 5); key.target = g;
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 1, far: 20 });
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
    g.add(key);

    return { group: g, update: (p) => updates.forEach((fn) => fn(p)) };
  }

  // README strip: the four seasons side by side
  function buildSeasons() {
    LOOP = 4;
    lights();
    scene.children.filter((o) => o.isDirectionalLight && o.castShadow).forEach((l) => { l.castShadow = false; l.intensity *= 0.6; });
    // scattered, not in a row: different heights, depths and sizes; labels hang under each island
    const layout = [[-10.5, 2.4, -4, 0.95], [-3.4, -0.9, 3.0, 1.0], [3.8, 3.0, -6, 0.9], [10.2, -0.4, 0.5, 0.95]];
    camera.userData.anchors = [];
    ["spring", "summer", "autumn", "winter"].forEach((season, i) => {
      const [x, y, z, sc] = layout[i];
      const isle = seasonIsland(season, 200 + i * 17);
      isle.group.scale.setScalar(sc);
      isle.group.position.set(x, y, z);
      scene.add(isle.group);
      camera.userData.anchors.push(new THREE.Vector3(x, y - 2.3 * sc, z));
      animators.push((p) => {
        isle.update(p);
        isle.group.position.y = y + 0.12 * Math.sin(TAU * p + i * 1.4);
        isle.group.rotation.y = 0.5 + 0.18 * Math.sin(TAU * p + i);
      });
    });
    camera.fov = 30;
    camera.position.set(0, 2.4, 27);
    camera.lookAt(0, 0.2, 0);
    camera.setViewOffset(W, H, 0, H * 0.02, W, H);
    swayCamera(new THREE.Vector3(0, 0.2, 0), 1.2, 0.25);
  }

  // Portfolio site: the seasons spread far apart; the page moves the camera from one to the next.
  function buildArchipelago() {
    LOOP = 8;
    lights();
    scene.children.filter((o) => o.isDirectionalLight && o.castShadow).forEach((l) => { l.castShadow = false; l.intensity *= 0.6; });
    const isles = ["spring", "summer", "autumn", "winter"].map((season, i) => {
      const isle = seasonIsland(season, 300 + i * 23);
      isle.group.position.set(i * 40, 0, 0);
      scene.add(isle.group);
      animators.push((p) => { isle.update(p); isle.group.position.y = 0.12 * Math.sin(TAU * p + i); });
      return isle.group;
    });
    camera.userData.isles = isles;
    // one shared shadow light that the page moves to whichever island is in view: per-island lights would change
    // the light count as islands are shown and hidden, and every change recompiles all shaders
    isles.forEach((g) => g.children.filter((c) => c.isDirectionalLight).forEach((l) => g.remove(l)));
    const key = new THREE.DirectionalLight(0xffe2c0, 1.1);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 1, far: 20 });
    key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
    scene.add(key, key.target);
    camera.userData.key = key;
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
