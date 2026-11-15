// Player accounts and leaderboards for My Arcade.
// Every page loads arcade-config.js and then this file. It:
//  - shows a sign in / sign up screen until you're signed in
//  - gives pages window.Arcade: submitScore(), leaderboard panels, the signed-in player, sign out, admin tools
// The accounts and scores live in Supabase (see SETUP.md and supabase/setup.sql). Until that's set up,
// the arcade works like before: no sign-in screen, and the leaderboards say they aren't switched on yet.
(() => {
  const cfg = window.ARCADE_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseKey && !/YOUR-/.test(cfg.supabaseUrl + cfg.supabaseKey));
  const SESSION_KEY = "myArcadeSession";

  // ---------- Talking to Supabase ----------
  async function rpc(fn, args, keepalive = false) {
    const headers = { "Content-Type": "application/json", apikey: cfg.supabaseKey };
    if (cfg.supabaseKey.startsWith("eyJ")) headers.Authorization = "Bearer " + cfg.supabaseKey;   // older "anon" keys
    let res;
    try {
      res = await fetch(`${cfg.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`,
        { method: "POST", headers, body: JSON.stringify(args), keepalive });
    } catch (e) {
      throw new Error("Can't reach the arcade server. Check your internet and try again.");
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) {
      const msg = data?.message || "Something went wrong. Try again.";
      if (/sign in again/i.test(msg)) signedOut();
      throw new Error(msg);
    }
    return data;
  }

  // ---------- The signed-in player ----------
  let session = null;   // { token, player: { id, firstName, lastName, name, isAdmin } }
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) {}
  if (!session?.token || !session?.player) session = null;
  const listeners = [];
  const boards = new Set();

  function setSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    listeners.forEach(cb => cb(s?.player || null));
    boards.forEach(b => b.refresh());
  }
  function signedOut() {
    if (!session) return;
    setSession(null);
    showGate();
  }

  // ---------- Sign in / sign up screen ----------
  let gate = null;
  function showGate() {
    if (!ready || gate) return;
    if (!document.body) return addEventListener("DOMContentLoaded", showGate, { once: true });
    gate = document.createElement("div");
    gate.className = "ac-gate";
    gate.innerHTML = `
      <form class="ac-box" novalidate>
        <h2>🎮 Welcome to the arcade!</h2>
        <div class="ac-tabs" role="tablist">
          <button type="button" data-mode="in" class="on">Sign in</button>
          <button type="button" data-mode="up">Sign up</button>
        </div>
        <label>First name <input name="first" autocomplete="given-name" maxlength="30"></label>
        <label>Last name <span class="ac-opt">(optional)</span> <input name="last" autocomplete="family-name" maxlength="30"></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" maxlength="72"></label>
        <p class="ac-error" role="alert"></p>
        <button type="submit" class="ac-go">Sign in</button>
        <p class="ac-hint"></p>
        <p class="ac-fine">The admin can see your password, so don't use one you use anywhere else.</p>
      </form>`;
    const form = gate.querySelector("form");
    const err = gate.querySelector(".ac-error");
    const go = gate.querySelector(".ac-go");
    const hint = gate.querySelector(".ac-hint");
    let mode = "in";
    function setMode(m) {
      mode = m;
      gate.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
      go.textContent = m === "in" ? "Sign in" : "Sign up";
      form.password.autocomplete = m === "in" ? "current-password" : "new-password";
      hint.textContent = m === "in"
        ? "Use the same first and last name you signed up with. Forgot your password? Ask the admin."
        : "Your name will show on the leaderboards. Pick a password with at least 4 characters.";
      err.textContent = "";
    }
    gate.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const first = form.first.value.trim(), last = form.last.value.trim(), password = form.password.value;
      if (!first) { err.textContent = "Please type your first name."; form.first.focus(); return; }
      if (!password) { err.textContent = "Please type your password."; form.password.focus(); return; }
      if (mode === "up" && password.length < 4) { err.textContent = "Your password needs at least 4 characters."; form.password.focus(); return; }
      err.textContent = "";
      go.disabled = true;
      go.textContent = "One moment…";
      try {
        const r = await rpc(mode === "in" ? "sign_in" : "sign_up", { p_first: first, p_last: last || null, p_password: password });
        if (r?.error) { err.textContent = r.error; return; }
        gate.remove();
        gate = null;
        setSession({ token: r.token, player: r.player });
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        go.disabled = false;
        go.textContent = mode === "in" ? "Sign in" : "Sign up";
      }
    });
    // While this screen is open, keys and clicks must not reach the game underneath
    for (const type of ["keydown", "keyup", "keypress", "mousedown", "mouseup", "click", "pointerdown", "pointerup", "contextmenu", "wheel"]) {
      gate.addEventListener(type, e => e.stopPropagation());
    }
    setMode("in");
    document.body.appendChild(gate);
    form.first.focus();
  }
  // Keys pressed while focus is outside the sign-in screen (e.g. on the page) are blocked too
  for (const type of ["keydown", "keyup", "keypress"]) {
    addEventListener(type, e => { if (gate && !(e.target instanceof Node && gate.contains(e.target))) e.stopImmediatePropagation(); }, true);
  }

  // ---------- Leaderboard panel ----------
  function leaderboard(container, game) {
    const el = document.createElement("div");
    el.className = "ac-board";
    el.innerHTML = `
      <div class="ac-board-head">
        <h3>🏆 Leaderboard</h3>
        <div class="ac-tabs">
          <button type="button" data-period="all" class="on">All time</button>
          <button type="button" data-period="week">This week</button>
        </div>
      </div>
      <ol class="ac-list"></ol>
      <p class="ac-note"></p>`;
    const list = el.querySelector(".ac-list"), note = el.querySelector(".ac-note");
    let period = "all", loadId = 0;
    el.querySelectorAll("[data-period]").forEach(b => b.addEventListener("click", () => {
      period = b.dataset.period;
      el.querySelectorAll("[data-period]").forEach(x => x.classList.toggle("on", x === b));
      b.blur();   // so Space goes back to the game, not this button
      refresh();
    }));
    async function refresh() {
      const id = ++loadId;
      list.replaceChildren();
      if (!ready) { note.textContent = "Leaderboards aren't switched on yet."; return; }
      if (!session) { note.textContent = "Sign in to see the leaderboard."; return; }
      note.textContent = "Loading…";
      let rows;
      try {
        rows = await rpc("leaderboard", { p_token: session.token, p_game: game, p_period: period, p_limit: 10 });
      } catch (e) {
        if (id === loadId) note.textContent = e.message;
        return;
      }
      if (id !== loadId) return;   // a newer refresh started meanwhile
      for (const r of rows) {
        const li = document.createElement("li");
        if (r.player === session?.player.id) li.className = "me";
        const rank = document.createElement("span"), name = document.createElement("span"), score = document.createElement("span");
        rank.className = "ac-rank";
        rank.textContent = ["🥇", "🥈", "🥉"][r.rank - 1] || `${r.rank}.`;
        name.className = "ac-name";
        name.textContent = r.name;
        score.className = "ac-score";
        score.textContent = Number(r.score).toLocaleString();
        li.append(rank, name, score);
        list.appendChild(li);
      }
      note.textContent = rows.length
        ? (period === "week" ? "This week starts over every Monday." : "")
        : (period === "week" ? "No scores yet this week. Be the first!" : "No scores yet. Be the first!");
    }
    const board = { el, refresh };
    boards.add(board);
    container.appendChild(el);
    refresh();
    return board;
  }

  // ---------- Scores ----------
  // Sends a finished game's score. keepalive lets it finish even if the page is being left.
  async function submitScore(game, score) {
    score = Math.min(Math.floor(Number(score) || 0), 10000000);
    if (!ready || !session || score <= 0) return false;
    try {
      await rpc("submit_score", { p_token: session.token, p_game: game, p_score: score }, true);
    } catch (e) {
      return false;
    }
    boards.forEach(b => b.refresh());
    return true;
  }

  async function signOut() {
    const token = session?.token;
    setSession(null);
    if (token) rpc("sign_out", { p_token: token }).catch(() => {});
    showGate();
  }

  // Only work for the admin: the server checks, so these just fail for everyone else
  const admin = {
    players: () => rpc("admin_players", { p_token: session?.token }),
    adjustPoints: (player, game, points, reason) =>
      rpc("admin_adjust_points", { p_token: session?.token, p_player: player, p_game: game, p_points: points, p_reason: reason || null }),
    resetPassword: (player, password) =>
      rpc("admin_reset_password", { p_token: session?.token, p_player: player, p_new_password: password }),
  };

  // ---------- Start ----------
  if (ready) {
    if (!session) showGate();
    // Check the saved session still works (it ends after 60 days, or when the admin resets the password)
    else rpc("whoami", { p_token: session.token }).then(p => setSession({ token: session.token, player: p })).catch(() => {});
  }

  // Can't be replaced or changed from the console
  Object.defineProperty(window, "Arcade", { value: Object.freeze({
    ready,
    player: () => session?.player || null,
    onPlayer(cb) { listeners.push(cb); cb(session?.player || null); },
    submitScore,
    leaderboard,
    signOut,
    admin: Object.freeze(admin),
  }) });

  // ---------- Look ----------
  const style = document.createElement("style");
  style.textContent = `
    .ac-gate { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
      padding: 16px; background: rgba(5, 4, 20, 0.88); backdrop-filter: blur(4px); font-family: system-ui, -apple-system, sans-serif; }
    .ac-box { width: min(380px, 100%); background: #2a2f45; color: #fff; border-radius: 16px; padding: 24px;
      display: flex; flex-direction: column; gap: 12px; text-align: left; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); }
    .ac-box h2 { margin: 0; text-align: center; font-size: 1.4em; }
    .ac-box label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 0.95em; }
    .ac-box .ac-opt { font-weight: 400; color: #aab0cc; }
    .ac-box input { font: inherit; font-weight: 400; padding: 9px 11px; border-radius: 8px; border: 2px solid #454b68;
      background: #1b1e2b; color: #fff; }
    .ac-box input:focus { outline: none; border-color: #ffcc00; }
    .ac-tabs { display: flex; gap: 6px; justify-content: center; }
    .ac-tabs button { font: inherit; font-size: 0.9em; font-weight: 600; padding: 6px 14px; border: 0; border-radius: 999px;
      background: #3a3f55; color: #fff; cursor: pointer; }
    .ac-tabs button.on { background: #ffcc00; color: #222; }
    .ac-go { font: inherit; font-weight: 700; font-size: 1.05em; padding: 11px; border: 0; border-radius: 10px;
      background: #ffcc00; color: #222; cursor: pointer; }
    .ac-go:disabled { opacity: 0.6; cursor: wait; }
    .ac-error { margin: 0; min-height: 1.2em; color: #ff8a8a; font-weight: 600; font-size: 0.9em; }
    .ac-hint { margin: 0; color: #aab0cc; font-size: 0.82em; line-height: 1.4; }
    .ac-fine { margin: -4px 0 0; color: #8a90ad; font-size: 11px; line-height: 1.3; }   /* small print, but still readable */
    .ac-board { width: min(420px, 100%); margin: 8px auto 0; padding: 14px 16px; border-radius: 14px; background: #2a2f45;
      color: #fff; font-family: system-ui, -apple-system, sans-serif; text-align: left; }
    .ac-board-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .ac-board h3 { margin: 0; font-size: 1.1em; }
    .ac-board .ac-tabs button { font-size: 0.8em; padding: 4px 10px; }
    .ac-list { list-style: none; margin: 10px 0 0; padding: 0; }
    .ac-list li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; }
    .ac-list li:nth-child(odd) { background: rgba(255, 255, 255, 0.04); }
    .ac-list li.me { background: rgba(255, 204, 0, 0.18); }
    .ac-rank { width: 2em; text-align: center; color: #aab0cc; }
    .ac-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ac-score { font-weight: 700; color: #ffcc00; font-variant-numeric: tabular-nums; }
    .ac-note { margin: 8px 0 0; color: #aab0cc; font-size: 0.85em; text-align: center; }
    .ac-note:empty { display: none; }
  `;
  document.head.appendChild(style);
})();
