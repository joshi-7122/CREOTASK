/* =========================================================
   CREOTASK — Outlook sections
   Beyond 9-to-5 · India's opportunity (an explorer) · the CreoStart route · Take action.
   - Reveals: elements marked [data-reveal] rise in once as they scroll into view.
   - Counters: [data-count] numbers count up once when seen.
   - Explorer: 2020–21 estimate vs 2029–30 projection (NITI Aayog), as an accessible tab set.
   - Route: the first-timer's six steps as a navigation map; one smooth glide from step 1 to 6.
   Everything is fully readable without this script, and with reduced motion nothing animates.
   ========================================================= */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasIO = "IntersectionObserver" in window;

  // Calls fn once, the first time el is meaningfully on screen (observer plus a scroll backup).
  function whenSeen(el, fn, ratio) {
    if (!el) return;
    let done = false;
    const go = () => { if (done) return; done = true; io && io.disconnect(); window.removeEventListener("scroll", check); fn(); };
    const check = () => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight * 0.85 && r.bottom > 0) go(); };
    const io = hasIO ? new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) go(); }, { threshold: ratio || 0.2 }) : null;
    io && io.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    check();
  }

  // ── Reveals ──
  const reveals = [...document.querySelectorAll("[data-reveal]")];
  if (reveals.length && !reduce) {
    root.classList.add("js-reveal");
    reveals.forEach((el) => whenSeen(el, () => el.classList.add("is-in"), 0.12));
  }

  // ── Counters ──
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || "0", 10);
    const pre = el.dataset.prefix || "";
    const suf = el.dataset.suffix || "";
    const text = (v) => pre + v.toFixed(dec) + suf;
    cancelAnimationFrame(el._raf);
    if (reduce) { el.textContent = text(target); return; }
    const t0 = performance.now(), dur = 1100;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = text(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  document.querySelectorAll(".lp-fig [data-count]").forEach((el) => whenSeen(el, () => animateCount(el), 0.6));

  // ── India explorer ──
  const ex = document.getElementById("indiaExplorer");
  if (ex) {
    ex.classList.add("is-armed");
    const tabs = [...ex.querySelectorAll('[role="tab"]')];
    const years = [...ex.querySelectorAll(".lp-yr")];
    const panel = document.getElementById("indiaPanel");
    const status = document.getElementById("indiaStatus");
    const SAY = {
      "2021": "2020–21 estimate: 7.7 million gig and platform workers, 1.5% of India's total workforce.",
      "2030": "2029–30 projection: 23.5 million gig and platform workers, 4.1% of India's total workforce.",
    };
    let seen = false;
    function select(year, focus, announce) {
      tabs.forEach((t) => {
        const on = t.dataset.year === year;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on) { panel.setAttribute("aria-labelledby", t.id); if (focus) t.focus(); }
      });
      years.forEach((y) => {
        const on = y.dataset.year === year;
        y.classList.toggle("is-on", on);
        if (on && seen) { const n = y.querySelector("[data-count]"); if (n) animateCount(n); }
      });
      if (announce && status) status.textContent = SAY[year];
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t.dataset.year, false, true));
      t.addEventListener("keydown", (e) => {
        let j = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        if (j >= 0) { e.preventDefault(); select(tabs[j].dataset.year, true, true); }
      });
    });
    whenSeen(ex, () => {
      seen = true;
      ex.classList.add("is-seen");
      const first = ex.querySelector(".lp-yr.is-on [data-count]");
      if (first) animateCount(first);
    }, 0.3);
  }

  // ── CreoStart route: a navigation map that is travelled once, smoothly ──
  // The winding path is drawn from the real waypoint positions, so it follows the layout at any
  // width (a zig-zag on wide screens, a straight line down the list on phones).
  // First view: one smooth glide from step 1 to 6, then the line stays lit. Picking a step glides there too.
  const route = document.getElementById("csRoute");
  const steps = document.getElementById("csSteps");
  const detail = document.getElementById("csDetail");
  const map = document.getElementById("csMap");
  if (route && steps && detail && map) {
    route.classList.add("is-armed");
    const items = [...steps.children];
    const N = items.length;
    const svg = map.querySelector(".lp-route__path");
    const inner = map.querySelector(".lp-route__inner");
    const allPaths = [...svg.querySelectorAll(".lp-route__d")];
    const baseP = svg.querySelector(".lp-route__base");
    const doneP = svg.querySelector(".lp-route__done");
    const count = document.getElementById("csCount");
    const text = document.getElementById("csText");

    const PASS_MS_PER_STEP = 1250;       // the one-time glide, per step
    let cur = -1, u = 0, fracs = [0], pts = [];
    let glide = null, rafId = 0, layoutUntil = 0;
    let traveled = false, onScreen = false;
    const clock = () => performance.now() / 1000;
    const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * k);   // smooth in and out

    // ── Geometry ──
    function curveD() {
      let d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
          const mx = ((x0 + x1) / 2).toFixed(1);
          d += " C" + mx + " " + y0.toFixed(1) + " " + mx + " " + y1.toFixed(1) + " " + x1.toFixed(1) + " " + y1.toFixed(1);
        } else {
          const my = ((y0 + y1) / 2).toFixed(1);
          d += " C" + x0.toFixed(1) + " " + my + " " + x1.toFixed(1) + " " + my + " " + x1.toFixed(1) + " " + y1.toFixed(1);
        }
      }
      return d;
    }
    function setD(d) { allPaths.forEach((p) => p.setAttribute("d", d)); }

    // Reads the real waypoint positions and where each sits along the drawn path.
    function measure() {
      const mr = inner.getBoundingClientRect();
      if (!mr.width) return;
      pts = items.map((li) => {
        const r = li.querySelector(".lp-s__dot").getBoundingClientRect();
        return [r.left + r.width / 2 - mr.left, r.top + r.height / 2 - mr.top];
      });
      svg.setAttribute("viewBox", "0 0 " + mr.width + " " + mr.height);
      setD(curveD());
      const total = baseP.getTotalLength() || 1;
      fracs = [0];
      let from = 0;
      for (let i = 1; i < pts.length; i++) {
        let best = from, bd = Infinity;
        for (let l = from; l <= total; l += 3) {
          const q = baseP.getPointAtLength(l);
          const dd = (q.x - pts[i][0]) * (q.x - pts[i][0]) + (q.y - pts[i][1]) * (q.y - pts[i][1]);
          if (dd < bd) { bd = dd; best = l; }
        }
        fracs.push(best / total);
        from = best;
      }
    }
    // u is the head's position in knot units (0 to N-1); the line ends exactly there.
    function applyProgress() {
      const k = Math.max(0, Math.min(N - 1, Math.floor(u)));
      const a = fracs[k] || 0, b = fracs[Math.min(k + 1, N - 1)] || a;
      const v = String(1 - (a + (b - a) * (u - k)));
      doneP.style.strokeDashoffset = v;
    }

    // ── The active step (text crossfades; the phone list opens smoothly) ──
    let swapTimer = 0;
    function activate(k) {
      if (k === cur) return;
      const first = cur < 0;
      cur = k;
      items.forEach((li, n) => {
        li.classList.toggle("is-active", n === k);
        li.classList.toggle("is-done", n <= k);
        li.querySelector("button").setAttribute("aria-expanded", n === k ? "true" : "false");
      });
      map.style.setProperty("--step", String(k + 1));
      const label = "Step " + (k + 1) + " of " + N;
      const body = items[k].querySelector("p").textContent;
      clearTimeout(swapTimer);
      if (first || reduce) { count.textContent = label; text.textContent = body; }
      else {
        detail.classList.add("is-swap");
        swapTimer = setTimeout(() => { count.textContent = label; text.textContent = body; detail.classList.remove("is-swap"); }, 180);
      }
      layoutUntil = clock() + 0.8;   // keep the path glued to the dots while the list opens and closes
      kick();
    }

    // ── One animation loop for the glide ──
    function frame(ts) {
      rafId = 0;
      const t = ts / 1000;
      let busy = false;
      if (glide) {
        const k = Math.min(1, (ts - glide.t0) / glide.dur);
        u = glide.from + (glide.to - glide.from) * ease(k);
        if (!glide.user) {
          const want = Math.max(0, Math.min(N - 1, Math.floor(u + 0.08)));
          if (want !== cur) activate(want);
        }
        if (k >= 1) {
          u = glide.to;
          const done = glide.onDone;
          glide = null;
          map.classList.remove("is-driving");
          if (done) done();
        }
        busy = true;
      }
      if (layoutUntil > t) { measure(); busy = true; }
      applyProgress();
      if (busy) rafId = requestAnimationFrame(frame);
    }
    function kick() { if (!rafId) rafId = requestAnimationFrame(frame); }
    function glideTo(target, dur, user, onDone) {
      glide = { from: u, to: target, t0: performance.now(), dur, user, onDone };
      map.classList.add("is-driving");
      kick();
    }

    // ── Start ──
    measure();
    activate(0);
    applyProgress();
    window.addEventListener("resize", () => { measure(); applyProgress(); });
    window.addEventListener("load", () => { measure(); applyProgress(); });
    document.fonts && document.fonts.ready.then(() => { measure(); applyProgress(); });
    if ("ResizeObserver" in window) new ResizeObserver(() => { measure(); applyProgress(); }).observe(inner);
    detail.setAttribute("aria-live", "off");

    // First view: the one smooth pass from step 1 to 6.
    function travel() {
      if (traveled || reduce) return;
      traveled = true;
      glideTo(N - 1, (N - 1) * PASS_MS_PER_STEP, false, null);
    }

    // Picking a step takes over from the automatic pass and glides there.
    items.forEach((li, i) => li.querySelector("button").addEventListener("click", () => {
      traveled = true;
      detail.setAttribute("aria-live", "polite");
      if (reduce) { u = i; activate(i); measure(); applyProgress(); return; }
      glide = null;
      activate(i);
      glideTo(i, 520 + 240 * Math.abs(i - u), true, null);
    }));

    if (!reduce) {
      document.addEventListener("visibilitychange", kick);
      // Track whether the route is on screen (observer plus a scroll backup); the first time it
      // is, the one-time pass begins.
      const setOn = (now) => {
        if (now === onScreen) return;
        onScreen = now;
        if (onScreen) setTimeout(travel, 700);
        kick();
      };
      const check = () => {
        const r = route.getBoundingClientRect();
        setOn(r.top < window.innerHeight * 0.9 && r.bottom > window.innerHeight * 0.1);
      };
      if (hasIO) new IntersectionObserver((e) => { if (e.length) setOn(e[e.length - 1].isIntersecting); }, { threshold: 0.25 }).observe(route);
      window.addEventListener("scroll", check, { passive: true });
      setInterval(check, 600); // cheap safety net in case a scroll or observer event is delayed
      check();
    }
  }
})();
