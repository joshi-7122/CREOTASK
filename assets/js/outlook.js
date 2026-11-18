/* =========================================================
   CREOTASK — Outlook sections
   Beyond 9-to-5 · India's opportunity (an explorer) · the CreoStart route · Take action.
   - Reveals: elements marked [data-reveal] rise in once as they scroll into view.
   - Counters: [data-count] numbers count up once when seen.
   - Explorer: 2020–21 estimate vs 2029–30 projection (NITI Aayog), as an accessible tab set.
   - Route: the first-timer's six steps as a navigation map; loops continuously while on screen, under the visitor's control.
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

  // ── CreoStart route: a navigation map ──
  // The winding path is drawn from the real waypoint positions, so it follows the layout at any
  // width (a zig-zag on wide screens, a straight line down the list on phones).
  const route = document.getElementById("csRoute");
  const steps = document.getElementById("csSteps");
  const detail = document.getElementById("csDetail");
  const map = document.getElementById("csMap");
  if (route && steps && detail && map) {
    route.classList.add("is-armed");
    const items = [...steps.children];
    const svg = map.querySelector(".lp-route__path");
    const inner = map.querySelector(".lp-route__inner");
    const baseP = svg.querySelector(".lp-route__base");
    const doneP = svg.querySelector(".lp-route__done");
    const count = document.getElementById("csCount");
    const text = document.getElementById("csText");
    let cur = 0, fracs = [0];

    // The travelled line ends exactly on the current waypoint, whatever the spacing (the phone
    // list opens a gap under the active step), so measure each segment instead of assuming equal ones.
    function applyProgress() {
      const f = fracs[Math.min(cur, fracs.length - 1)] || 0;
      doneP.style.strokeDashoffset = String(1 - f);
    }
    function drawPath() {
      const mr = inner.getBoundingClientRect();
      if (!mr.width) return;
      const pts = items.map((li) => {
        const r = li.querySelector(".lp-s__dot").getBoundingClientRect();
        return [r.left + r.width / 2 - mr.left, r.top + r.height / 2 - mr.top];
      });
      svg.setAttribute("viewBox", "0 0 " + mr.width + " " + mr.height);
      let d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) { const mx = ((x0 + x1) / 2).toFixed(1); d += " C" + mx + " " + y0.toFixed(1) + " " + mx + " " + y1.toFixed(1) + " " + x1.toFixed(1) + " " + y1.toFixed(1); }
        else { const my = ((y0 + y1) / 2).toFixed(1); d += " C" + x0.toFixed(1) + " " + my + " " + x1.toFixed(1) + " " + my + " " + x1.toFixed(1) + " " + y1.toFixed(1); }
      }
      baseP.setAttribute("d", d);
      doneP.setAttribute("d", d);
      // Where along the drawn path each waypoint sits (found on the real path, so the travelled
      // line always ends exactly on the current dot, whatever the spacing between steps).
      const total = baseP.getTotalLength() || 1;
      fracs = [0];
      let from = 0;
      for (let i = 1; i < pts.length; i++) {
        let best = from, bd = Infinity;
        for (let l = from; l <= total; l += 2) {
          const q = baseP.getPointAtLength(l);
          const dd = (q.x - pts[i][0]) * (q.x - pts[i][0]) + (q.y - pts[i][1]) * (q.y - pts[i][1]);
          if (dd < bd) { bd = dd; best = l; }
        }
        fracs.push(best / total);
        from = best;
      }
      applyProgress();
    }

    function setStep(i) {
      cur = i;
      items.forEach((li, k) => {
        li.classList.toggle("is-active", k === i);
        li.classList.toggle("is-done", k <= i);
        li.querySelector("button").setAttribute("aria-expanded", k === i ? "true" : "false");
      });
      map.style.setProperty("--step", String(i + 1));
      applyProgress();
      count.textContent = "Step " + (i + 1) + " of " + items.length;
      text.textContent = items[i].querySelector("p").textContent;
      drawPath(); // the phone list changes height as steps open; redraw straight away
    }
    setStep(0);
    drawPath();
    window.addEventListener("resize", drawPath);
    window.addEventListener("load", drawPath);
    document.fonts && document.fonts.ready.then(drawPath);
    if ("ResizeObserver" in window) new ResizeObserver(drawPath).observe(inner);

    // ── Continuous loop ──
    // Travels step 1 to 6, holds, rewinds to step 1 and goes again, but only while the route is
    // on screen, and never against the visitor: hovering or focusing the map pauses it, picking a
    // step holds it for a few seconds, and the pause button stops it for good. Automatic steps are
    // not announced to screen readers; steps the visitor picks are.
    const pauseBtn = document.getElementById("csPause");
    const DWELL = 1900, END_HOLD = 2800, AFTER_PICK = 9000;
    let loopTimer = 0, resumeTimer = 0, onScreen = false, hoverHold = false, userPaused = false, pickHold = false;

    function canRun() { return !reduce && onScreen && !hoverHold && !userPaused && !pickHold && !document.hidden; }
    function schedule() {
      clearTimeout(loopTimer);
      if (!canRun()) return;
      const atEnd = cur === items.length - 1;
      loopTimer = setTimeout(() => {
        if (!canRun()) return;
        detail.setAttribute("aria-live", "off");
        if (atEnd) {
          map.classList.add("is-rewinding");
          setStep(0);
          setTimeout(() => map.classList.remove("is-rewinding"), 650);
        } else {
          setStep(cur + 1);
        }
        schedule();
      }, atEnd ? END_HOLD : DWELL);
    }
    function hold(ms) {
      pickHold = true;
      clearTimeout(loopTimer); clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { pickHold = false; schedule(); }, ms);
    }

    items.forEach((li, i) => li.querySelector("button").addEventListener("click", () => {
      detail.setAttribute("aria-live", "polite");
      setStep(i);
      hold(AFTER_PICK);
    }));
    detail.setAttribute("aria-live", "off");

    if (reduce) {
      if (pauseBtn) pauseBtn.remove();
    } else {
      map.addEventListener("pointerenter", () => { hoverHold = true; clearTimeout(loopTimer); });
      map.addEventListener("pointerleave", () => { hoverHold = false; schedule(); });
      map.addEventListener("focusin", () => { hoverHold = true; clearTimeout(loopTimer); });
      map.addEventListener("focusout", () => { hoverHold = false; schedule(); });
      document.addEventListener("visibilitychange", schedule);
      if (pauseBtn) pauseBtn.addEventListener("click", () => {
        userPaused = !userPaused;
        pauseBtn.setAttribute("aria-pressed", userPaused ? "true" : "false");
        pauseBtn.setAttribute("aria-label", userPaused ? "Play the route animation" : "Pause the route animation");
        if (userPaused) clearTimeout(loopTimer); else schedule();
      });
      // Track whether the route is on screen (observer plus a scroll backup).
      const setOn = (now) => { if (now !== onScreen) { onScreen = now; if (onScreen) setTimeout(schedule, 700); else clearTimeout(loopTimer); } };
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
