// The mini-game frame: start screen, score, best score, game over, Esc to leave.
// Each game page defines its game object and calls openMini(game).

// ---------- Mini games ----------
const BEST_KEY = "myArcadeBest";
let bests = {};
try { bests = JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) {}
const saveBests = () => { try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) {} };

const miniCanvas = document.getElementById("miniCanvas");
const mctx = miniCanvas.getContext("2d");
let mini = null;
let miniScale = 1;
let miniRaf = 0;

function openMini(game) {
  document.activeElement?.blur();
  game.reset();
  mini = { game, state: "ready", newBest: false, last: performance.now() };
  document.getElementById("miniTitle").textContent = game.title;
  document.getElementById("miniControls").textContent = game.controls + " · Esc to leave";
  show("mini");
  resizeMini();
  cancelAnimationFrame(miniRaf);
  miniRaf = requestAnimationFrame(miniLoop);
}

// Save the best score the moment the score passes it, so a refresh mid-game never loses it
function recordBest() {
  const g = mini.game;
  if (g.score > (bests[g.id] || 0)) {
    bests[g.id] = g.score;
    mini.newBest = true;
    saveBests();
  }
}

function closeMini() {
  const g = mini.game;
  if (mini.state === "playing") recordBest();
  g.leave?.();
  mini = null;
  cancelAnimationFrame(miniRaf);
  location.href = "../game.html";
}

function startMini() {
  mini.game.reset();
  mini.state = "playing";
  mini.newBest = false;
}

function endMini() {
  mini.state = "over";
  recordBest();
}

function miniKey(code, repeat) {
  if (repeat) {
    if (mini.state === "playing") mini.game.key?.(code, true);
    return;
  }
  if (code === "Escape") return closeMini();
  if (mini.state !== "playing") {
    if (code === "Space" || code === "Enter") startMini();
    return;
  }
  mini.game.key?.(code);
}

// Mouse position in game coordinates (for games you click on)
function toGame(e) {
  const r = miniCanvas.getBoundingClientRect(), g = mini.game;
  return [(e.clientX - r.left) * g.w / r.width, (e.clientY - r.top) * g.h / r.height];
}
miniCanvas.addEventListener("click", e => {
  if (mini.state !== "playing") return startMini();
  mini.game.tap?.(...toGame(e));
});
miniCanvas.addEventListener("contextmenu", e => {
  e.preventDefault();   // right-click flags in Minesweeper
  if (mini.state === "playing") mini.game.tap?.(...toGame(e), true);
});
miniCanvas.addEventListener("mousemove", e => {
  if (mini.state === "playing") mini.game.pointer?.(...toGame(e));
});
document.getElementById("miniBack").onclick = closeMini;

function resizeMini() {
  if (!mini) return;
  const g = mini.game;
  const s = Math.max(0.3, Math.min((innerWidth - 32) / g.w, (innerHeight - 230) / g.h, 1.5));
  const dpr = devicePixelRatio || 1;
  miniCanvas.style.width = g.w * s + "px";
  miniCanvas.style.height = g.h * s + "px";
  miniCanvas.width = Math.round(g.w * s * dpr);
  miniCanvas.height = Math.round(g.h * s * dpr);
  miniScale = s * dpr;
}
addEventListener("resize", resizeMini);

function miniLoop(now) {
  if (!mini) return;
  const dt = Math.min(0.033, (now - mini.last) / 1000);
  mini.last = now;
  if (mini.state === "playing") {
    if (!mini.game.update(dt)) endMini();
    else recordBest();
  }
  drawMini();
  miniRaf = requestAnimationFrame(miniLoop);
}

function drawMini() {
  const g = mini.game, c = mctx;
  c.setTransform(miniScale, 0, 0, miniScale, 0, 0);
  g.draw(c);

  if (mini.state !== "playing") {
    const cy = g.h / 2;
    c.textBaseline = "alphabetic";
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillRect(0, 0, g.w, g.h);
    c.textAlign = "center";
    c.fillStyle = "#fff";
    if (mini.state === "ready") {
      c.font = "bold 34px system-ui, sans-serif";
      c.fillText(g.title, g.w / 2, cy - 20);
      c.font = "18px system-ui, sans-serif";
      c.fillStyle = "#ffcc00";
      c.fillText("Press Space or click to start", g.w / 2, cy + 20);
    } else {
      c.font = "bold 40px system-ui, sans-serif";
      c.fillText(g.endText || "Game Over", g.w / 2, cy - 40);
      c.font = "22px system-ui, sans-serif";
      c.fillText(`Score ${g.score}`, g.w / 2, cy);
      if (mini.newBest) {
        c.fillStyle = "#4cd964";
        c.fillText("🏆 New best!", g.w / 2, cy + 32);
      }
      c.font = "18px system-ui, sans-serif";
      c.fillStyle = "#ffcc00";
      c.fillText("Space or click to play again", g.w / 2, cy + 70);
    }
  }

  document.getElementById("miniScore").textContent = `Score: ${g.score}`;
  document.getElementById("miniBest").textContent = `Best: ${bests[g.id] || 0}`;
}

// Keys go to the game that's open
addEventListener("keydown", e => {
  if (mini && (!e.repeat || mini.game.repeatKeys)) miniKey(e.code, e.repeat);
});
