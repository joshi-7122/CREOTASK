/* =========================================================
   CREOTASK — Outlook sections
   Beyond 9-to-5 · India's opportunity (an explorer) · the CreoStart route · Take action.
   - Reveals: elements marked [data-reveal] rise in once as they scroll into view.
   - Counters: [data-count] numbers count up once when seen.
   - Explorer: 2020–21 estimate vs 2029–30 projection (NITI Aayog), as an accessible tab set.
   - Route: the first-timer's six steps; steps through once on first view, then it is yours.
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

  // ── CreoStart route ──
  const route = document.getElementById("csRoute");
  const steps = document.getElementById("csSteps");
  const detail = document.getElementById("csDetail");
  if (route && steps && detail) {
    route.classList.add("is-armed");
    const items = [...steps.children];
    let timer = 0, touched = false;
    function setStep(i) {
      items.forEach((li, k) => {
        li.classList.toggle("is-active", k === i);
        li.classList.toggle("is-done", k <= i);
        li.querySelector("button").setAttribute("aria-expanded", k === i ? "true" : "false");
      });
      steps.style.setProperty("--step", String(i + 1));
      detail.textContent = items[i].querySelector("p").textContent;
    }
    items.forEach((li, i) => li.querySelector("button").addEventListener("click", () => {
      touched = true; clearInterval(timer); setStep(i);
    }));
    setStep(0);
    // Once, on first view, walk through the six steps so the route reads as a journey.
    if (!reduce) {
      whenSeen(route, () => {
        let i = 0;
        timer = setInterval(() => {
          if (touched) { clearInterval(timer); return; }
          i += 1;
          if (i >= items.length) { clearInterval(timer); return; }
          setStep(i);
        }, 1400);
      }, 0.4);
    }
  }
})();
