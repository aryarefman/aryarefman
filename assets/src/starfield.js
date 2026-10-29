// A fixed, painted starfield for the GIF pages. Stars drawn in 3D would move on every frame while the camera
// sways and make the GIFs huge; painted stars stay still, so only the 3D objects change between frames.
export function paintStars(seed = 11, density = 1) {
  const c = document.createElement("canvas");
  c.width = innerWidth; c.height = innerHeight;
  c.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none";
  const g = c.getContext("2d");
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = Math.round(c.width * c.height / 2600 * density);
  for (let i = 0; i < n; i++) {
    const x = r() * c.width, y = r() * c.height, big = r() > 0.94;
    g.globalAlpha = big ? 0.95 : 0.25 + r() * 0.5;
    g.fillStyle = r() > 0.85 ? "#ffe1b8" : r() > 0.7 ? "#c9d2ff" : "#ffffff";
    g.beginPath(); g.arc(x, y, big ? 1.3 : 0.4 + r() * 0.6, 0, Math.PI * 2); g.fill();
  }
  document.body.prepend(c);
}
