/* =========================================================
   CREOTASK — Currency-note fan ("Start with what you can do")
   Eight black glass notes, C R E O T A S K from the bottom up, fanned out from
   a point at the far left of the closing section, above the cards. Each note is drawn once into an
   offscreen texture, then revealed in real time with Canvas2D:
     1. ASCII: the note appears as dithered characters (ordered Bayer threshold),
        flickering, under scanlines;
     2. reconstruction: the image rebuilds from large pixels down to sharp, with
        horizontal glitch slices;
     3. settled: the crisp glass note, with a soft shadow for depth.
   Afterwards a random note glitches briefly every few seconds.
   - Only drawn while something is changing; idle otherwise.
   - Sized to stay clear of the heading, text and cards; hidden where even a
     small fan can't fit (phones, narrow windows).
   - Reduced motion: the finished notes are drawn once, with no animation.
   ========================================================= */
(function () {
  "use strict";

  const sec = document.querySelector(".lp-closing");
  const actions = sec && sec.querySelector(".lp-actions");
  if (!sec || !actions) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wrap = document.createElement("div");
  wrap.className = "lp-notes";
  wrap.setAttribute("aria-hidden", "true");
  wrap.hidden = true;
  const canvas = document.createElement("canvas");
  wrap.appendChild(canvas);
  sec.prepend(wrap);
  const ctx = canvas.getContext("2d");
  if (!ctx) { wrap.remove(); return; }

  const LETTERS = ["C", "R", "E", "O", "T", "A", "S", "K"]; // index 0 sits at the bottom
  const DUR = 1700;          // one note's reveal (swing plus rebuild)
  const STAGGER = 200;       // between notes
  const GLITCH_MS = 420;
  const RAMP = " .:-=+*#%@";
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  let dpr = 1, W = 0, H = 0, noteW = 0, noteH = 0, cell = 4;
  let notes = [], atlas = null, shadow = null, scan = null, scanFill = null, pix = null, pixCtx = null;
  let t0 = -1, raf = 0, started = false, onScreen = false, ready = false, idleTimer = 0;

  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ── Layout: a fan of notes at the far left, opening up and to the left ──
  // The fan pivots on its right, nearest the content, and the notes spread toward the screen
  // edge: C points left (lowest), K points straight up (highest), its top level with the top of
  // the heading's first line. Its size is the largest that keeps every note clear of the
  // heading, the text, the cards and the screen edge; if even a small fan can't fit, it hides.
  const A_LOW = -168, A_HIGH = -90;  // degrees: C's direction, K's direction (screen y points down)
  const TH = 0.3, LEN = 0.82;        // note width and length, as fractions of the fan radius
  let ox = 0, oy = 0;                // canvas origin, in section coordinates

  function textBox(el, sr) {
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const rs = [...rg.getClientRects()].filter((r) => r.width && r.height);
    if (!rs.length) return null;
    return {
      l: Math.min(...rs.map((r) => r.left)) - sr.left, t: Math.min(...rs.map((r) => r.top)) - sr.top,
      r: Math.max(...rs.map((r) => r.right)) - sr.left, b: Math.max(...rs.map((r) => r.bottom)) - sr.top,
    };
  }

  // Entrance: every note starts folded down below the pivot and swings clockwise (round the
  // left, up over the top, a little past, then back) to its place, so the tips trace an arc.
  const START = (70 * Math.PI) / 180;
  const SWING = 0.8;                 // share of each note's reveal spent swinging
  const backOut = (k) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

  function pose(n, a) {
    return { cx: n.px + n.rc * Math.cos(a), cy: n.py + n.rc * Math.sin(a), rot: a + Math.PI / 2 };
  }

  function fanNotes(px, py, R) {
    const L = R * LEN;
    return LETTERS.map((letter, i) => {
      let th = ((A_LOW + ((A_HIGH - A_LOW) * i) / 7) * Math.PI) / 180;
      if (th < START) th += Math.PI * 2;   // so the swing from START runs clockwise
      const n = { letter, px, py, rc: R - L / 2, th, glitchUntil: 0 };
      return Object.assign(n, pose(n, th));
    });
  }

  // Points around a rotated note's outline (centre cx, cy; size w × h; rotation rot)
  function outline(n, w, h, grow) {
    const pts = [], c = Math.cos(n.rot), sn = Math.sin(n.rot), hw = w / 2 + grow, hh = h / 2 + grow;
    for (let k = 0; k <= 8; k++) {
      const u = -hw + (2 * hw * k) / 8, v = -hh + (2 * hh * k) / 8;
      for (const [x, y] of [[u, -hh], [u, hh], [-hw, v], [hw, v]]) pts.push([n.cx + x * c - y * sn, n.cy + x * sn + y * c]);
    }
    return pts;
  }

  function layout() {
    const sr = sec.getBoundingClientRect();
    const cards = actions.getBoundingClientRect();
    if (sr.width < 980 || sr.height < 600) { wrap.hidden = true; return false; }
    const GAP = 22;
    const obstacles = [
      textBox(sec.querySelector(".lp-closing__title"), sr),
      textBox(sec.querySelector(".lp-closing__lead"), sr),
      textBox(sec.querySelector(".lp-closing__note"), sr),
      { l: cards.left - sr.left, t: cards.top - sr.top, r: cards.right - sr.left, b: cards.bottom - sr.top },
    ].filter(Boolean).map((o) => ({ l: o.l - GAP, t: o.t - GAP, r: o.r + GAP, b: o.b + GAP }));

    const cardsTop = cards.top - sr.top;
    const title = textBox(sec.querySelector(".lp-closing__title"), sr);
    const topLine = title ? title.t : 0;    // top of "Start with what"
    const clear = (pts) => pts.every(([x, y]) => x >= 6 && y >= 6 && !obstacles.some((o) => x > o.l && x < o.r && y > o.t && y < o.b));
    const cLow = (A_LOW * Math.PI) / 180;
    // The pivot sits far enough right that C's tip stays on screen.
    const pivotX = (r) => -Math.cos(cLow) * r + Math.abs(Math.sin(cLow)) * r * TH * 0.5 + 12;

    let R = 0, fan = null;
    // First choice: K's tip level with the top of the heading.
    for (let r = 440; r >= 160 && !fan; r -= 4) {
      const cand = fanNotes(pivotX(r), topLine + r, r);
      if (cand.every((n) => clear(outline(n, r * TH, r * LEN, 3)))) { R = r; fan = cand; }
    }
    // Otherwise the largest fan that sits just above the cards.
    for (let r = 440; r >= 160 && !fan; r -= 4) {
      const cand = fanNotes(pivotX(r), cardsTop - GAP - 6 - r * TH * 0.55, r);
      if (cand.every((n) => clear(outline(n, r * TH, r * LEN, 3)))) { R = r; fan = cand; }
    }
    if (!fan) { wrap.hidden = true; return false; }
    wrap.hidden = false;

    noteW = Math.round(R * TH);
    noteH = Math.round(R * LEN);
    cell = Math.max(3, Math.round(noteW / 18));

    // Canvas covers the fan and the path each note swings along (kept inside the section)
    const all = [];
    for (const n of fan) {
      for (let k = 0; k <= 1.0001; k += 0.05) all.push(...outline(Object.assign({}, n, pose(n, START + (n.th - START) * backOut(k))), noteW, noteH, 0));
    }
    const pad = 26;
    ox = Math.floor(Math.max(0, Math.min(...all.map((p) => p[0])) - pad));
    oy = Math.floor(Math.max(0, Math.min(...all.map((p) => p[1])) - pad));
    W = Math.ceil(Math.min(sr.width, Math.max(...all.map((p) => p[0])) + pad) - ox);
    H = Math.ceil(Math.min(sr.height, Math.max(...all.map((p) => p[1])) + pad) - oy);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    wrap.style.left = ox + "px";
    wrap.style.top = oy + "px";
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    notes = fan;
    return true;
  }

  // ── One note, drawn crisp into its own texture ──
  function buildTexture(letter) {
    const c = document.createElement("canvas");
    c.width = Math.round(noteW * dpr);
    c.height = Math.round(noteH * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const w = noteW, h = noteH, r = Math.max(5, w * 0.1);

    const body = g.createLinearGradient(0, 0, w * 0.45, h);
    body.addColorStop(0, "rgba(48, 49, 55, 0.97)");
    body.addColorStop(0.5, "rgba(19, 19, 22, 0.98)");
    body.addColorStop(1, "rgba(8, 8, 10, 0.99)");
    rr(g, 0.5, 0.5, w - 1, h - 1, r);
    g.fillStyle = body;
    g.fill();

    g.save();
    rr(g, 0.5, 0.5, w - 1, h - 1, r);
    g.clip();
    g.fillStyle = "rgba(255, 255, 255, 0.045)";             // fine engraving lines
    for (let y = 3; y < h; y += 3) g.fillRect(0, y, w, 0.5);
    const refl = g.createLinearGradient(0, 0, w, h * 0.65); // glass reflection band
    refl.addColorStop(0.36, "rgba(255, 255, 255, 0)");
    refl.addColorStop(0.47, "rgba(255, 255, 255, 0.11)");
    refl.addColorStop(0.55, "rgba(255, 255, 255, 0)");
    g.fillStyle = refl;
    g.fillRect(0, 0, w, h);
    const sheen = g.createLinearGradient(0, 0, 0, h * 0.32);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.11)");
    sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h * 0.32);
    g.restore();

    rr(g, 0.5, 0.5, w - 1, h - 1, r);
    g.strokeStyle = "rgba(255, 255, 255, 0.24)";
    g.lineWidth = 1;
    g.stroke();
    const ins = Math.max(4, w * 0.08);
    rr(g, ins, ins, w - ins * 2, h - ins * 2, r * 0.6);
    g.strokeStyle = "rgba(255, 255, 255, 0.09)";
    g.stroke();

    // $ and ₹ in the top corners, and again (turned round) in the bottom corners
    const fs = Math.max(9, w * 0.15);
    g.font = `600 ${fs}px Geist, system-ui, sans-serif`;
    g.fillStyle = "rgba(226, 228, 232, 0.86)";
    g.textBaseline = "top";
    const corners = () => {
      g.textAlign = "left"; g.fillText("$", ins + 3, ins + 2);
      g.textAlign = "right"; g.fillText("₹", w - ins - 3, ins + 2);
    };
    corners();
    g.save(); g.translate(w, h); g.rotate(Math.PI); corners(); g.restore();

    // A soft dark pad where the letter sits, so it reads against the glass
    const halo = g.createRadialGradient(w * LX, h * LY, 0, w * LX, h * LY, w * 0.5);
    halo.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
    return c;
  }

  // The letter, as its own upright sprite: it stays level on screen however the note is turned.
  const LX = 0.45, LY = 0.15;        // where the letter sits on the note: near the outer end, where the fan is widest
  function buildLetter(letter) {
    const ls = Math.round(noteW * 0.54);
    const S = Math.round(ls * 1.5);
    const c = document.createElement("canvas");
    c.width = Math.round(S * dpr);
    c.height = Math.round(S * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.font = `700 ${ls}px Cinzel, "Times New Roman", serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lg = g.createLinearGradient(0, S * 0.2, 0, S * 0.8);
    lg.addColorStop(0, "#ffffff");
    lg.addColorStop(0.6, "#e6e8eb");
    lg.addColorStop(1, "#b7bac0");
    g.shadowColor = "rgba(0, 0, 0, 0.95)";   // dark halo for contrast
    g.shadowBlur = Math.max(6, ls * 0.22);
    g.fillStyle = lg;
    g.fillText(letter, S / 2, S / 2 + ls * 0.05);
    g.shadowBlur = 0;
    g.fillText(letter, S / 2, S / 2 + ls * 0.05);
    c.size = S;
    return c;
  }

  // Brightness grid used by the ASCII stage
  function lumGrid(tex) {
    const cols = Math.floor(noteW / cell), rows = Math.floor(noteH / cell);
    const data = tex.getContext("2d").getImageData(0, 0, tex.width, tex.height).data;
    const lum = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = Math.min(tex.width - 1, Math.round((c + 0.5) * cell * dpr));
        const py = Math.min(tex.height - 1, Math.round((r + 0.5) * cell * dpr));
        const k = (py * tex.width + px) * 4;
        lum[r * cols + c] = ((0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255) * (data[k + 3] / 255);
      }
    }
    return { lum, cols, rows };
  }

  function buildShared() {
    // Glyph atlas: the ramp characters, pre-drawn once (drawImage is far cheaper than fillText)
    const A = Math.round(cell * dpr);
    atlas = document.createElement("canvas");
    atlas.width = A * RAMP.length;
    atlas.height = A;
    const a = atlas.getContext("2d");
    a.font = `${Math.round(A * 1.15)}px ui-monospace, Menlo, Consolas, monospace`;
    a.textAlign = "center";
    a.textBaseline = "middle";
    a.fillStyle = "#eceef1";
    for (let i = 1; i < RAMP.length; i++) a.fillText(RAMP[i], i * A + A / 2, A / 2 + 1);

    // Soft shadow under each note
    const pad = 18;
    shadow = document.createElement("canvas");
    shadow.width = Math.round((noteW + pad * 2) * dpr);
    shadow.height = Math.round((noteH + pad * 2) * dpr);
    const s = shadow.getContext("2d");
    s.scale(dpr, dpr);
    s.shadowColor = "rgba(0, 0, 0, 0.75)";
    s.shadowBlur = 14;
    s.shadowOffsetY = 6;
    s.fillStyle = "#000";
    rr(s, pad, pad, noteW, noteH, Math.max(5, noteW * 0.1));
    s.fill();

    // Scanline pattern
    scan = document.createElement("canvas");
    scan.width = 1;
    scan.height = 3;
    const sc = scan.getContext("2d");
    sc.fillStyle = "rgba(0, 0, 0, 0.55)";
    sc.fillRect(0, 0, 1, 1);
    scanFill = ctx.createPattern(scan, "repeat");

    pix = document.createElement("canvas");
    pixCtx = pix.getContext("2d");
  }

  function build() {
    if (!layout()) { ready = false; return; }
    buildShared();
    notes.forEach((n) => {
      n.tex = buildTexture(n.letter);
      n.letterTex = buildLetter(n.letter);
      Object.assign(n, lumGrid(n.tex));
    });
    ready = true;
  }

  // ── Stages ──
  function drawAscii(n, appear, alpha) {
    const A = Math.round(cell * dpr);
    const { lum, cols, rows } = n;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (BAYER[(r & 3) * 4 + (c & 3)] > appear) continue;   // ordered-dither dissolve
        const L = lum[r * cols + c];
        let k = Math.min(RAMP.length - 1, Math.floor(L * RAMP.length * 1.5));
        if (Math.random() < 0.09) k = (k + 1 + ((Math.random() * 3) | 0)) % RAMP.length; // flicker
        if (!k) continue;
        ctx.globalAlpha = alpha * (0.3 + 0.7 * Math.min(1, L * 1.7));
        ctx.drawImage(atlas, k * A, 0, A, A, c * cell, r * cell, cell, cell);
      }
    }
  }

  function drawPixelated(tex, x, y, w, h, blk) {
    const pw = Math.max(1, Math.ceil(w / blk)), ph = Math.max(1, Math.ceil(h / blk));
    if (pix.width !== pw || pix.height !== ph) { pix.width = pw; pix.height = ph; }
    pixCtx.clearRect(0, 0, pw, ph);
    pixCtx.imageSmoothingEnabled = true;
    pixCtx.drawImage(tex, 0, 0, pw, ph);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pix, 0, 0, pw, ph, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }

  function drawSliced(n, g) {
    if (g < 0.05) { ctx.drawImage(n.tex, 0, 0, noteW, noteH); return; }
    // Cut into horizontal bands; a few slide sideways
    const bands = 7;
    const bh = noteH / bands;
    for (let b = 0; b < bands; b++) {
      const shift = Math.random() < g * 0.55 ? (Math.random() - 0.5) * 14 * g : 0;
      ctx.drawImage(n.tex, 0, b * bh * dpr, n.tex.width, bh * dpr, shift, b * bh, noteW, bh);
    }
  }

  function drawNote(n, p, g) {
    let letter = null;
    // An idle glitch briefly sends the note back through the last stages.
    const q = Math.min(p, 1 - g * 0.5);
    const asciiIn = clamp(q / 0.42);
    const asciiOut = 1 - clamp((q - 0.5) / 0.25);
    const rebuild = clamp((q - 0.36) / 0.5);
    const flick = q < 0.86 ? 0.82 + Math.random() * 0.18 : 1;

    if (rebuild > 0) {
      ctx.globalAlpha = clamp(rebuild * 1.6) * 0.9;
      ctx.drawImage(shadow, -18, -18, noteW + 36, noteH + 36);
      ctx.globalAlpha = clamp(rebuild * 1.5) * flick;
      const blk = Math.max(1, Math.round(cell * 3.2 * (1 - easeOut(rebuild))));
      if (blk > 1) drawPixelated(n.tex, 0, 0, noteW, noteH, blk);
      else drawSliced(n, Math.max(g, (1 - q) * 0.9));
      letter = { alpha: clamp(rebuild * 1.4) * flick, blk };
    }
    if (asciiOut > 0) drawAscii(n, asciiIn, asciiOut * flick);

    const lines = Math.max((1 - q) * 0.9, g * 0.7);
    if (lines > 0.02) {
      ctx.globalAlpha = lines;
      ctx.fillStyle = scanFill;
      rr(ctx, 0, 0, noteW, noteH, Math.max(5, noteW * 0.1));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return letter;
  }

  // Letters go on top of every note, upright on screen, so none is covered by the next note.
  function drawLetter(n, at, l) {
    const c = Math.cos(at.rot), sn = Math.sin(at.rot);
    const lx = noteW * (LX - 0.5), ly = noteH * (LY - 0.5);   // offset from the note's centre
    const S = n.letterTex.size;
    ctx.save();
    ctx.translate(at.cx - ox + lx * c - ly * sn, at.cy - oy + lx * sn + ly * c);
    ctx.globalAlpha = l.alpha;
    if (l.blk > 1) drawPixelated(n.letterTex, -S / 2, -S / 2, S, S, l.blk);
    else ctx.drawImage(n.letterTex, -S / 2, -S / 2, S, S);
    ctx.restore();
  }

  // ── Loop: runs only while a reveal or glitch is in progress ──
  function frame(now) {
    raf = 0;
    if (!ready) return;
    if (t0 < 0) t0 = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    let busy = false;
    const letters = [];
    for (let i = 0; i < notes.length; i++) {   // C at the back, K in front, like a dealt fan
      const n = notes[i];
      const p = reduce ? 1 : clamp((now - t0 - i * STAGGER) / DUR);
      if (p < 1) busy = true;
      let g = 0;
      if (n.glitchUntil > now) { g = (n.glitchUntil - now) / GLITCH_MS; busy = true; }
      if (p <= 0) continue;
      // Swing into place along the arc, then hold the fan pose
      const k = clamp(p / SWING);
      const at = k >= 1 ? n : pose(n, START + (n.th - START) * backOut(k));
      ctx.save();
      ctx.translate(at.cx - ox, at.cy - oy);
      ctx.rotate(at.rot);
      ctx.translate(-noteW / 2, -noteH / 2);
      const l = drawNote(n, p, g);
      ctx.restore();
      if (l) letters.push([n, at, l]);
    }
    for (const [n, at, l] of letters) drawLetter(n, at, l);
    if (busy) raf = requestAnimationFrame(frame);
    else if (!reduce) scheduleGlitch();
  }
  function kick() { if (!raf && started) raf = requestAnimationFrame(frame); }

  function scheduleGlitch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (onScreen && !document.hidden && ready) {
        const n = notes[(Math.random() * notes.length) | 0];
        n.glitchUntil = performance.now() + GLITCH_MS;
        kick();
      } else scheduleGlitch();
    }, 2600 + Math.random() * 3600);
  }

  // ── Start once the section is in view (fonts first, so the textures use them) ──
  const fontsReady = Promise.race([
    Promise.all([
      document.fonts ? document.fonts.load('600 64px "Cinzel"') : null,
      document.fonts ? document.fonts.load('600 16px "Geist"') : null,
    ]),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  function start() {
    if (started) return;
    started = true;
    fontsReady.then(() => { build(); kick(); });
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) start();
    }, { threshold: 0.25 }).observe(sec);
  } else {
    onScreen = true;
    start();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) scheduleGlitch(); });

  // Re-fit on resize; a finished stack is redrawn settled, without replaying the reveal.
  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!started) return;
      const done = t0 >= 0 && performance.now() - t0 > STAGGER * 7 + DUR;
      build();
      if (done) t0 = performance.now() - (STAGGER * 7 + DUR) - 1;
      kick();
    }, 150);
  });
})();
