// The page background is one descent from deep space to the ground at dusk.
// `s` is the descent stage, 0 → 6:
//   0 deep space · 1 low orbit · 2 thermosphere (aurora) · 3 stratosphere
//   4 cloud deck · 5 dusk sky · 6 surface
// Everything is drawn on one fixed 2D canvas; elements fade in and out with `s` and move with scroll for parallax.

export const STAGES = [
  { name: "Deep space", alt: 1000 },
  { name: "Low orbit", alt: 400 },
  { name: "Aurora", alt: 100 },
  { name: "Stratosphere", alt: 30 },
  { name: "Clouds", alt: 2 },
  { name: "Dusk sky", alt: 0.5 },
  { name: "Surface", alt: 0 },
];

// sky gradient per stage: [top, middle, bottom]
const GRADIENTS = [
  ["#03030a", "#07061a", "#0d0a24"],
  ["#03040f", "#08102c", "#12285a"],
  ["#040818", "#08182e", "#0b2a3c"],
  ["#081032", "#121c4a", "#22306a"],
  ["#1a1a46", "#2d2a5c", "#4a3a72"],
  ["#1e1844", "#4a2c62", "#c0606a"],
  ["#141236", "#2e2250", "#6a3a5a"],
];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const bump = (a, peak, b, v) => (v < peak ? smooth(a, peak, v) : 1 - smooth(peak, b, v));
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function altitudeAt(s) {
  const i = Math.min(5, Math.floor(s)), t = s - i;
  const a = STAGES[i].alt, b = STAGES[i + 1].alt;
  if (b === 0) return a * (1 - t);
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t); // log scale: each layer gets equal scroll
}

export function createSky(canvas, { reduceMotion = false } = {}) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let stars = [], clouds = [], cloudSprites = [], ridges = [], lights = [], birds = [];
  const aur = document.createElement("canvas"), actx = aur.getContext("2d");
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function cloudSprite(w, h, tint) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    for (let i = 0; i < 26; i++) {
      const x = w * (0.15 + r() * 0.7), y = h * (0.35 + r() * 0.4), rad = h * (0.18 + r() * 0.3);
      const grd = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
      grd.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0.9)`);
      grd.addColorStop(0.6, `rgba(${tint[0] - 40},${tint[1] - 50},${tint[2] - 20},0.5)`);
      grd.addColorStop(1, "rgba(60,40,90,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  function ridge(baseFrac, amp, rough, n) {
    const pts = [];
    let y = 0, v = 0;
    for (let i = 0; i <= n; i++) {
      v += (r() - 0.5) * rough; v *= 0.9; y += v;
      pts.push([i / n, baseFrac - amp * (0.5 + 0.5 * Math.sin(i * 0.35 + r() * 0.6)) - y * 0.01]);
    }
    return pts;
  }

  function build() {
    dpr = Math.min(devicePixelRatio, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    aur.width = Math.ceil(W / 4); aur.height = Math.ceil(H / 4);
    seed = 7;
    const area = W * H;
    stars = [[0.04, 0.5, 0.35, area / 2200], [0.12, 0.9, 0.6, area / 6500], [0.28, 1.5, 0.95, area / 24000]].flatMap(([depth, size, alpha, n]) =>
      Array.from({ length: Math.round(n) }, () => ({ x: r() * W, y: r() * H * 3, size: size * (0.6 + r() * 0.8), alpha: alpha * (0.5 + r() * 0.5), tw: r() * 6.28, warm: r() > 0.85, depth })));
    cloudSprites = [[255, 236, 246], [246, 226, 255], [255, 214, 214], [236, 230, 255]].map((t, i) => cloudSprite(420, 200, t));
    clouds = Array.from({ length: 46 }, () => {
      const depth = 0.4 + r() * 1.6;
      return { sc: 3.1 + r() * 2.0, x: r(), depth, w: (180 + r() * 340) * depth, sprite: Math.floor(r() * 4), drift: (r() - 0.5) * 12 };
    }).sort((a, b) => a.depth - b.depth);
    // mountain ridges from far to near
    ridges = [
      { pts: ridge(0.72, 0.16, 6, 40), color: "#4a3466", rise: 0.5 },
      { pts: ridge(0.8, 0.13, 8, 50), color: "#33264f", rise: 0.7 },
      { pts: ridge(0.88, 0.08, 10, 60), color: "#21193a", rise: 0.9 },
      { pts: ridge(0.95, 0.05, 6, 70), color: "#120e24", rise: 1.1 },
    ];
    lights = Array.from({ length: 70 }, () => ({ x: r(), layer: 2 + Math.floor(r() * 2), off: 0.01 + r() * 0.05, tw: r() * 6.28, warm: r() > 0.3 }));
    birds = Array.from({ length: 9 }, (_, i) => ({ x: r(), y: 0.25 + r() * 0.2, sp: 0.012 + r() * 0.01, size: 5 + r() * 5, ph: r() * 6.28, i }));
  }

  function ridgeY(rd, x, lift) {
    const pts = rd.pts, f = clamp(x / W) * (pts.length - 1), i = Math.floor(f), t = f - i;
    const a = pts[i][1], b = pts[Math.min(pts.length - 1, i + 1)][1];
    return H * (a + (b - a) * t) + lift;
  }

  function draw(time, s, scroll, pointerX) {
    const T = reduceMotion ? 0 : time / 1000;
    // 1. gradient
    const i = Math.min(5, Math.floor(s)), t = smooth(0, 1, s - i);
    const [top, mid, bot] = [0, 1, 2].map((k) => mix(hexRgb(GRADIENTS[i][k]), hexRgb(GRADIENTS[i + 1][k]), t));
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(top)); g.addColorStop(0.55, rgb(mid)); g.addColorStop(1, rgb(bot));
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 2. nebulae (deep space only)
    const neb = 1 - smooth(0.4, 1.4, s);
    if (neb > 0.01) {
      [[0.8, 0.2, 0.55, "124,77,255", 0.22], [0.1, 0.8, 0.45, "0,170,190", 0.14], [0.15, 0.1, 0.4, "255,92,170", 0.1]].forEach(([x, y, rad, c, a]) => {
        const gr = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * rad);
        gr.addColorStop(0, `rgba(${c},${a * neb})`); gr.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      });
    }

    // 3. stars, fading out in the stratosphere
    const starA = 1 - smooth(2.6, 4.0, s);
    if (starA > 0.01) {
      const H3 = H * 3;
      for (const st of stars) {
        const y = ((st.y - scroll * st.depth) % H3 + H3) % H3;
        if (y > H) continue;
        const tw = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(T * 1.1 + st.tw);
        ctx.globalAlpha = st.alpha * tw * starA;
        ctx.fillStyle = st.warm ? "#ffe1b8" : "#e9e6ff";
        ctx.beginPath(); ctx.arc(st.x - pointerX * 30 * st.depth, y, st.size, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 4. Earth's limb rising in low orbit, then filling the view as we enter the atmosphere
    const limbA = bump(0.5, 1.4, 2.6, s);
    if (limbA > 0.01) {
      const R = Math.max(W, H) * 1.9, rise = smooth(0.5, 2.2, s);
      const cx = W * 0.5, cy = H + R - H * (0.12 + 0.55 * rise);
      ctx.globalAlpha = limbA;
      const glow = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.05);
      glow.addColorStop(0, "rgba(90,170,255,0.0)"); glow.addColorStop(0.45, "rgba(120,190,255,0.75)"); glow.addColorStop(0.6, "rgba(90,140,255,0.35)"); glow.addColorStop(1, "rgba(60,80,200,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, 6.283); ctx.fill();
      const body = ctx.createRadialGradient(cx, cy - R * 0.8, R * 0.2, cx, cy, R);
      body.addColorStop(0, "#1b3f7a"); body.addColorStop(0.85, "#0e2650"); body.addColorStop(1, "#163a72");
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R * 0.995, 0, 6.283); ctx.fill();
      // city lights and cloud swirls on the night side
      ctx.globalAlpha = limbA * 0.5;
      for (let k = 0; k < 60; k++) {
        const a = -Math.PI / 2 + ((k * 0.618) % 1 - 0.5) * 0.9, d = R * (0.985 - ((k * 0.377) % 1) * 0.04);
        ctx.fillStyle = k % 3 ? "rgba(255,210,140,0.9)" : "rgba(200,220,255,0.35)";
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, k % 3 ? 1.2 : 6, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 5. aurora ribbons, drawn at quarter resolution and scaled up for a soft glow
    const aurA = bump(1.5, 2.3, 3.3, s);
    if (aurA > 0.01) {
      const w = aur.width, h = aur.height;
      actx.clearRect(0, 0, w, h);
      actx.globalCompositeOperation = "lighter";
      [[0.42, "63,223,159", 0.8], [0.5, "139,120,255", 0.55], [0.36, "80,240,200", 0.5]].forEach(([base, c, a], k) => {
        const grd = actx.createLinearGradient(0, h * (base - 0.3), 0, h * base);
        grd.addColorStop(0, `rgba(${c},0)`); grd.addColorStop(0.7, `rgba(${c},${a * 0.6})`); grd.addColorStop(1, `rgba(${c},${a})`);
        actx.fillStyle = grd; actx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = h * base + Math.sin(x * 0.03 + T * 0.4 + k) * h * 0.06 + Math.sin(x * 0.011 - T * 0.25 + k * 2) * h * 0.08;
          x === 0 ? actx.moveTo(x, y) : actx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= 2) {
          const y = h * (base - 0.28) + Math.sin(x * 0.02 + T * 0.3 + k) * h * 0.05;
          actx.lineTo(x, y);
        }
        actx.closePath(); actx.fill();
      });
      ctx.globalAlpha = aurA; ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(aur, 0, 0, W, H);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }

    // 6. shooting stars in the stratosphere
    const metA = bump(2.4, 3.0, 3.8, s);
    if (metA > 0.01 && !reduceMotion) {
      for (let k = 0; k < 3; k++) {
        const u = ((T * 0.25 + k * 0.37) % 1);
        if (u > 0.35) continue;
        const p = u / 0.35, x0 = W * (0.2 + k * 0.3), y0 = H * (0.1 + k * 0.08);
        const x = x0 + p * W * 0.25, y = y0 + p * H * 0.18;
        const gr = ctx.createLinearGradient(x - 120, y - 86, x, y);
        gr.addColorStop(0, "rgba(255,240,220,0)"); gr.addColorStop(1, `rgba(255,240,220,${metA * Math.sin(Math.PI * p)})`);
        ctx.strokeStyle = gr; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 120, y - 86); ctx.lineTo(x, y); ctx.stroke();
      }
    }

    // 7. clouds: each sits at a stage height; we fall through them, near ones faster (parallax)
    const cloudZone = bump(2.8, 4.0, 5.4, s);
    if (cloudZone > 0.01) {
      for (const c of clouds) {
        const y = H * 0.5 + (c.sc - s) * H * 1.3 * c.depth;
        if (y < -300 || y > H + 300) continue;
        const x = ((c.x * (W + c.w) + T * c.drift - pointerX * 20 * c.depth) % (W + c.w)) - c.w * 0.5;
        const near = clamp(1 - Math.abs(c.sc - s) * 0.7);
        ctx.globalAlpha = cloudZone * (0.35 + 0.55 * near) * clamp(c.depth / 1.4, 0.4, 1);
        const img = cloudSprites[c.sprite];
        ctx.drawImage(img, x - c.w / 2, y - c.w * 0.24, c.w, c.w * 0.48);
      }
      ctx.globalAlpha = 1;
      // inside the deck: a soft haze washes over everything
      const haze = bump(3.6, 4.1, 4.7, s) * 0.32;
      if (haze > 0.01) { ctx.fillStyle = `rgba(214,200,240,${haze})`; ctx.fillRect(0, 0, W, H); }
    }

    // 8. dusk: low sun glow at the horizon and birds
    const duskA = smooth(4.3, 5.2, s);
    if (duskA > 0.01) {
      const sunY = H * (0.98 - 0.22 * smooth(4.3, 5.6, s));
      const sun = ctx.createRadialGradient(W * 0.68, sunY, 0, W * 0.68, sunY, Math.max(W, H) * 0.6);
      sun.addColorStop(0, `rgba(255,190,120,${0.55 * duskA})`); sun.addColorStop(0.25, `rgba(255,120,110,${0.25 * duskA})`); sun.addColorStop(1, "rgba(255,120,110,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,214,160,${duskA})`; ctx.beginPath(); ctx.arc(W * 0.68, sunY, 26, 0, 6.283); ctx.fill();
      const birdA = bump(4.6, 5.3, 6.2, s);
      if (birdA > 0.01) {
        ctx.strokeStyle = `rgba(30,20,40,${0.8 * birdA})`; ctx.lineWidth = 1.6;
        for (const b of birds) {
          const x = ((b.x + T * b.sp) % 1.2 - 0.1) * W, y = H * b.y + Math.sin(T + b.ph) * 8;
          const f = Math.sin(T * 7 + b.ph) * b.size * 0.6;
          ctx.beginPath(); ctx.moveTo(x - b.size, y - f); ctx.quadraticCurveTo(x - b.size * 0.4, y - b.size * 0.3, x, y); ctx.quadraticCurveTo(x + b.size * 0.4, y - b.size * 0.3, x + b.size, y - f); ctx.stroke();
        }
      }
    }

    // 9. the surface: ridges rise from below, near ones faster; village lights on the near hills
    const groundT = smooth(4.9, 6.0, s);
    if (groundT > 0.001) {
      ridges.forEach((rd, k) => {
        const lift = H * (1 - groundT) * rd.rise * 1.2;
        ctx.fillStyle = rd.color; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x - pointerX * 12 * (k + 1), ridgeY(rd, x, lift));
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
        if (k === 0) { // dusk rim light on the far ridge
          ctx.strokeStyle = "rgba(255,170,140,0.35)"; ctx.lineWidth = 1.2; ctx.beginPath();
          for (let x = 0; x <= W; x += 8) { const y = ridgeY(rd, x, lift); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke();
        }
      });
      const lightA = smooth(5.5, 6.0, s);
      if (lightA > 0.01) {
        for (const l of lights) {
          const rd = ridges[l.layer], lift = H * (1 - groundT) * rd.rise * 1.2;
          const x = l.x * W - pointerX * 12 * (l.layer + 1), y = ridgeY(rd, l.x * W, lift) + H * l.off;
          const tw = reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(T * 2 + l.tw);
          ctx.globalAlpha = lightA * tw;
          ctx.fillStyle = l.warm ? "#ffcf7a" : "#bfe6ff";
          ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.283); ctx.fill();
          ctx.globalAlpha = lightA * tw * 0.25; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  build();
  return { build, draw };
}
