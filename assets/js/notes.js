/* =========================================================
   CREOTASK — Currency-note fan ("Start with what you can do")
   Eight large black glass notes, C R E O T A S K, fanned out from one point
   behind the heading, as the section's backdrop. The heading, text and cards
   stay in front and readable (the notes sit at reduced opacity).
   On entrance the notes start stacked, pointing up, then expand and rotate
   outward into their fan, one after another (C first), overshooting slightly
   and settling, while each is revealed in real time with Canvas2D:
     1. ASCII: dithered characters (ordered Bayer threshold), flickering, under scanlines;
     2. reconstruction: rebuilt from large pixels down to sharp, with glitch slices;
     3. settled: the crisp glass note with a soft shadow.
   Afterwards a random note glitches briefly every few seconds.
   - Letters stay upright on screen, in a layer above every note.
   - Only drawn while something is changing; idle otherwise.
   - Hidden on phones and very narrow windows.
   - Reduced motion: the finished fan is drawn once, with no animation.
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

  const LETTERS = ["C", "R", "E", "O", "T", "A", "S", "K"];
  const DUR = 1600;           // one note's reveal (swing plus rebuild)
  const STAGGER = 130;        // between notes
  const SWING = 0.8;          // share of the reveal spent swinging into place
  const GLITCH_MS = 420;
  const TH = 0.34, LEN = 0.82; // note width and length, as fractions of the fan's radius
  const LX = 0.38, LY = 0.14; // where the letter sits on a note: near the tip, on the side left uncovered
  const RAMP = " .:-=+*#%@";
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  let dpr = 1, W = 0, H = 0, ox = 0, oy = 0, fadeFrom = 0, fadeTo = 0;   // fadeFrom/To: section y where the notes' lower part fades out
  let notes = [], spiral = null /* the fan: pivot and radius */, atlases = new Map(), scanFill = null, pix = null, pixCtx = null;
  let t0 = -1, raf = 0, started = false, onScreen = false, ready = false, idleTimer = 0;

  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const backOut = (k) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function textBox(el, sr) {
    if (!el) return null;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const rs = [...rg.getClientRects()].filter((r) => r.width && r.height);
    if (!rs.length) return null;
    return {
      l: Math.min(...rs.map((r) => r.left)) - sr.left, t: Math.min(...rs.map((r) => r.top)) - sr.top,
      r: Math.max(...rs.map((r) => r.right)) - sr.left, b: Math.max(...rs.map((r) => r.bottom)) - sr.top,
    };
  }

  // ── The fan: every note pivots on one point and they overlap like a hand of cards ──
  // C points up-left, K up-right, spread across the heading. On entrance every note starts
  // pointing straight up, small, then rotates outward to its place with a slight overshoot and
  // grows as it settles.
  const A_FIRST = -158, A_LAST = -22;          // final directions of C and K, in degrees (screen y down)
  const START = -Math.PI / 2;                  // straight up

  function pose(n, a, s, fan) {
    const mid = fan.R * (1 - LEN / 2) * s;     // centre of the note, from the pivot
    return { cx: fan.px + mid * Math.cos(a), cy: fan.py + mid * Math.sin(a), rot: a + Math.PI / 2, s };
  }
  const swingAngle = (n, k) => START + (n.th - START) * backOut(k);
  const swingScale = (k) => 0.6 + 0.4 * easeOut(Math.min(1, k));

  // Points around a note's outline at a given pose
  function outline(n, at, grow) {
    const pts = [], c = Math.cos(at.rot), sn = Math.sin(at.rot);
    const hw = (n.w * at.s) / 2 + grow, hh = (n.h * at.s) / 2 + grow;
    for (let k = 0; k <= 8; k++) {
      const u = -hw + (2 * hw * k) / 8, v = -hh + (2 * hh * k) / 8;
      for (const [x, y] of [[u, -hh], [u, hh], [-hw, v], [hw, v]]) pts.push([at.cx + x * c - y * sn, at.cy + x * sn + y * c]);
    }
    return pts;
  }

  function makeNotes(fan) {
    return LETTERS.map((letter, i) => {
      const th = ((A_FIRST + ((A_LAST - A_FIRST) * i) / 7) * Math.PI) / 180;
      const n = { letter, th, w: fan.R * TH, h: fan.R * LEN, glitchUntil: 0 };
      n.final = pose(n, th, 1, fan);
      return n;
    });
  }

  // ── Layout: the largest fan, centred behind the heading, that stays inside the section ──
  function layout() {
    const sr = sec.getBoundingClientRect();
    if (sr.width < 700 || sr.height < 560) { wrap.hidden = true; return false; }
    const rel = (r) => ({ l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top });
    const cards = rel(actions.getBoundingClientRect());
    const title = textBox(sec.querySelector(".lp-closing__title"), sr);
    if (!title) { wrap.hidden = true; return false; }
    // Never reach into the content of the section above
    const prev = sec.previousElementSibling;
    const prevInner = prev && (prev.querySelector(".ui-container") || prev);
    const ceiling = prevInner ? rel(prevInner.getBoundingClientRect()).b + 24 : 0;

    const px = (title.l + title.r) / 2;                          // centred on the heading
    const py = title.t + (title.b - title.t) * 0.82;              // pivot low in the heading, so it fans up behind it
    const cardZone = { l: cards.l - 22, t: cards.t - 22, r: cards.r + 22, b: cards.b + 22 };
    const ok = (pts) => pts.every(([x, y]) => x >= 6 && x <= sr.width - 6 && y >= ceiling && !(x > cardZone.l && x < cardZone.r && y > cardZone.t && y < cardZone.b));

    let fan = null, cand = null;
    for (let R = 560; R >= 150; R -= 6) {
      const trial = { px, py, R };
      const ns = makeNotes(trial);
      // The final fan and the whole expansion must stay inside the allowed area
      const fits = ns.every((n) => {
        for (let k = 0; k <= 1.0001; k += 0.1) if (!ok(outline(n, pose(n, swingAngle(n, k), swingScale(k), trial), 3))) return false;
        return true;
      });
      if (fits) { fan = trial; cand = ns; break; }
    }
    if (!fan) { wrap.hidden = true; return false; }
    wrap.hidden = false;
    fadeFrom = title.t - (title.b - title.t) * 0.05;   // just above the heading's first line
    fadeTo = fan.py + 28;                               // gone by the pivot, where the notes converge
    spiral = fan;
    notes = cand;

    // Canvas covers every note along its whole swing (kept below the section above)
    const all = [];
    for (const n of notes) {
      for (let k = 0; k <= 1.0001; k += 0.05) all.push(...outline(n, pose(n, swingAngle(n, k), swingScale(k), fan), 0));
    }
    const pad = 26;
    ox = Math.floor(Math.max(0, Math.min(...all.map((q) => q[0])) - pad));
    oy = Math.floor(Math.max(ceiling, Math.min(...all.map((q) => q[1])) - pad));
    W = Math.ceil(Math.min(sr.width, Math.max(...all.map((q) => q[0])) + pad) - ox);
    H = Math.ceil(Math.min(sr.height, Math.max(...all.map((q) => q[1])) + pad) - oy);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);   // a backdrop at reduced opacity needs no more
    wrap.style.left = ox + "px";
    wrap.style.top = oy + "px";
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    return true;
  }

  // ── A note, drawn crisp into its own texture (letter excluded; it is drawn upright on top) ──
  function buildTexture(n) {
    const w = n.w, h = n.h, r = Math.max(5, w * 0.1);
    const c = document.createElement("canvas");
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);

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
    // a soft dark pad where the letter sits, so it reads against the glass
    const halo = g.createRadialGradient(w * LX, h * LY, 0, w * LX, h * LY, w * 0.5);
    halo.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
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
    return c;
  }

  function buildLetter(n) {
    const ls = Math.round(n.w * 0.46);
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
    g.shadowColor = "rgba(0, 0, 0, 0.95)";
    g.shadowBlur = Math.max(6, ls * 0.22);
    g.fillStyle = lg;
    g.fillText(n.letter, S / 2, S / 2 + ls * 0.05);
    g.shadowBlur = 0;
    g.fillText(n.letter, S / 2, S / 2 + ls * 0.05);
    c.size = S;
    return c;
  }

  function buildShadow(n) {
    const pad = 18;
    const c = document.createElement("canvas");
    c.width = Math.round((n.w + pad * 2) * dpr);
    c.height = Math.round((n.h + pad * 2) * dpr);
    const s = c.getContext("2d");
    s.scale(dpr, dpr);
    s.shadowColor = "rgba(0, 0, 0, 0.75)";
    s.shadowBlur = 14;
    s.shadowOffsetY = 6;
    s.fillStyle = "#000";
    rr(s, pad, pad, n.w, n.h, Math.max(5, n.w * 0.1));
    s.fill();
    return c;
  }

  // Glyph atlas for one cell size: the ramp characters, pre-drawn once
  function atlasFor(cell) {
    if (atlases.has(cell)) return atlases.get(cell);
    const A = Math.round(cell * dpr);
    const c = document.createElement("canvas");
    c.width = A * RAMP.length;
    c.height = A;
    const a = c.getContext("2d");
    a.font = `${Math.round(A * 1.15)}px ui-monospace, Menlo, Consolas, monospace`;
    a.textAlign = "center";
    a.textBaseline = "middle";
    a.fillStyle = "#eceef1";
    for (let i = 1; i < RAMP.length; i++) a.fillText(RAMP[i], i * A + A / 2, A / 2 + 1);
    atlases.set(cell, c);
    return c;
  }

  // Brightness grid used by the ASCII stage
  function lumGrid(n) {
    const cols = Math.floor(n.w / n.cell), rows = Math.floor(n.h / n.cell);
    const tex = n.tex;
    const data = tex.getContext("2d").getImageData(0, 0, tex.width, tex.height).data;
    const lum = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.min(tex.width - 1, Math.round((c + 0.5) * n.cell * dpr));
        const y = Math.min(tex.height - 1, Math.round((r + 0.5) * n.cell * dpr));
        const k = (y * tex.width + x) * 4;
        lum[r * cols + c] = ((0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255) * (data[k + 3] / 255);
      }
    }
    return { lum, cols, rows };
  }

  function build() {
    if (!layout()) { ready = false; return; }
    atlases = new Map();
    const scan = document.createElement("canvas");
    scan.width = 1;
    scan.height = 3;
    const sc = scan.getContext("2d");
    sc.fillStyle = "rgba(0, 0, 0, 0.55)";
    sc.fillRect(0, 0, 1, 1);
    scanFill = ctx.createPattern(scan, "repeat");
    pix = document.createElement("canvas");
    pixCtx = pix.getContext("2d");
    notes.forEach((n) => {
      n.cell = Math.max(3, Math.round(n.w / 18));
      n.tex = buildTexture(n);
      n.letterTex = buildLetter(n);
      n.shadow = buildShadow(n);
      n.atlas = atlasFor(n.cell);
      Object.assign(n, lumGrid(n));
    });
    ready = true;
  }

  // ── Stages (drawn in the note's own coordinates) ──
  function drawAscii(n, appear, alpha) {
    const A = Math.round(n.cell * dpr), cell = n.cell;
    const { lum, cols, rows, atlas } = n;
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
    if (g < 0.05) { ctx.drawImage(n.tex, 0, 0, n.w, n.h); return; }
    const bands = 7, bh = n.h / bands;
    for (let b = 0; b < bands; b++) {
      const shift = Math.random() < g * 0.55 ? (Math.random() - 0.5) * 14 * g : 0;
      ctx.drawImage(n.tex, 0, b * bh * dpr, n.tex.width, bh * dpr, shift, b * bh, n.w, bh);
    }
  }

  function drawNote(n, p, g) {
    let letter = null;
    // An idle glitch briefly sends the note back through the last stages.
    const q = Math.min(p, 1 - g * 0.5);
    const asciiIn = clamp(0.3 + q / 0.34);   // visible from the first frame, then fills in
    const asciiOut = 1 - clamp((q - 0.5) / 0.25);
    const rebuild = clamp((q - 0.36) / 0.5);
    const flick = q < 0.86 ? 0.82 + Math.random() * 0.18 : 1;

    if (rebuild > 0) {
      ctx.globalAlpha = clamp(rebuild * 1.6) * 0.9;
      ctx.drawImage(n.shadow, -18, -18, n.w + 36, n.h + 36);
      ctx.globalAlpha = clamp(rebuild * 1.5) * flick;
      const blk = Math.max(1, Math.round(n.cell * 3.2 * (1 - easeOut(rebuild))));
      if (blk > 1) drawPixelated(n.tex, 0, 0, n.w, n.h, blk);
      else drawSliced(n, Math.max(g, (1 - q) * 0.9));
      letter = { alpha: clamp(rebuild * 1.4) * flick, blk };
    }
    if (asciiOut > 0) drawAscii(n, asciiIn, asciiOut * flick);

    const lines = Math.max((1 - q) * 0.9, g * 0.7);
    if (lines > 0.02) {
      ctx.globalAlpha = lines;
      ctx.fillStyle = scanFill;
      rr(ctx, 0, 0, n.w, n.h, Math.max(5, n.w * 0.1));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return letter;
  }

  // Letters go on top of every note, upright on screen, so none is covered by another note.
  function drawLetter(n, at, l) {
    const c = Math.cos(at.rot), sn = Math.sin(at.rot);
    const lx = n.w * (LX - 0.5) * at.s, ly = n.h * (LY - 0.5) * at.s;   // offset from the note's centre
    const S = n.letterTex.size * at.s;
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
    for (let i = 0; i < notes.length; i++) {   // C at the back, K in front
      const n = notes[i];
      const p = reduce ? 1 : clamp((now - t0 - i * STAGGER) / DUR);
      if (p < 1) busy = true;
      let g = 0;
      if (n.glitchUntil > now) { g = (n.glitchUntil - now) / GLITCH_MS; busy = true; }
      if (p <= 0) continue;
      // Swing in from straight down, growing a little, then hold the final pose
      const k = clamp(p / SWING);
      const at = k >= 1 ? n.final : pose(n, swingAngle(n, k), swingScale(k), spiral);
      ctx.save();
      ctx.translate(at.cx - ox, at.cy - oy);
      ctx.rotate(at.rot);
      ctx.scale(at.s, at.s);
      ctx.translate(-n.w / 2, -n.h / 2);
      const l = drawNote(n, p, g);
      ctx.restore();
      if (l) letters.push([n, at, l]);
    }
    // Fade the lower part of the notes out behind the heading so its text stays clear.
    // (Letters are drawn after this, so they are not dimmed.)
    if (fadeTo > fadeFrom) {
      const g = ctx.createLinearGradient(0, fadeFrom - oy, 0, fadeTo - oy);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.96)");
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.max(0, fadeFrom - oy), W, H);
      ctx.restore();
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
      document.fonts ? document.fonts.load('700 64px "Cinzel"') : null,
      document.fonts ? document.fonts.load('600 16px "Geist"') : null,
    ]),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  // Build ahead of time, while the browser is idle, so the reveal can start the instant the
  // section approaches (a build takes ~40 ms, which would otherwise be a visible hitch).
  let builtSig = "";
  const signature = () => {
    const sr = sec.getBoundingClientRect(), t = sec.querySelector(".lp-closing__title");
    const tr = t ? t.getBoundingClientRect() : { top: 0 };
    return [Math.round(sr.width), Math.round(sr.height), Math.round(tr.top - sr.top)].join("x");
  };
  function prebuild() {
    builtSig = signature();
    build();
  }
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  function schedulePrebuild() { fontsReady.then(() => idle(() => { if (!ready) prebuild(); }, { timeout: 2500 })); }
  if (document.readyState === "complete") schedulePrebuild();
  else window.addEventListener("load", schedulePrebuild, { once: true });

  function start() {
    if (started) return;
    started = true;
    fontsReady.then(() => {
      if (!ready || builtSig !== signature()) prebuild();   // layout moved since: refit
      kick();
    });
  }

  if ("IntersectionObserver" in window) {
    // Begin while the section is still a little below the fold, so it is already moving on arrival
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      if (onScreen) start();
    }, { rootMargin: "0px 0px 35% 0px", threshold: 0 }).observe(sec);
  } else {
    onScreen = true;
    start();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) scheduleGlitch(); });

  // Re-fit on resize; a finished fan is redrawn settled, without replaying the entrance.
  let rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!started) return;
      const done = t0 >= 0 && performance.now() - t0 > STAGGER * 7 + DUR;
      builtSig = signature();
      build();
      if (done) t0 = performance.now() - (STAGGER * 7 + DUR) - 1;
      kick();
    }, 150);
  });

})();
