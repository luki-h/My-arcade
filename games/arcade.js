// Shared helpers for every game in My Arcade

// ---------- Screens ----------
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.hidden = s.id !== id);
}

// ---------- Helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- Input ----------
const keys = {};
addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", e => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

const randInt = n => Math.floor(Math.random() * n);
const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// Move a keyboard cursor around a grid of cells with arrows / WASD
function gridMove(cursor, code, cols, rows) {
  const d = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  }[code];
  if (!d) return cursor;
  return clamp(Math.floor(cursor / cols) + d[1], 0, rows - 1) * cols + clamp(cursor % cols + d[0], 0, cols - 1);
}

// Drawing helpers
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function roundBox(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
}
