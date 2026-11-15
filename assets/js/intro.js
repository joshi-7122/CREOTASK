/* =========================================================
   CREOTASK — Landing intro + hero light
   - Intro: logo appears centred, then flies into the nav logo slot as the page is revealed
   - Hero: a soft cursor-following key light
   Plays once per visit (sessionStorage), ?intro forces a replay,
   never runs for prefers-reduced-motion. Decision is made in <head>.
   ========================================================= */
(function () {
  "use strict";

  const root = document.documentElement;

  // ── Intro timeline: logo centred → flies into the nav logo slot → page revealed ──
  function runIntro() {
    const el = document.getElementById("lpIntro");
    if (!el) return;
    if (!root.classList.contains("intro-on")) { el.remove(); return; }

    const timers = [];
    let flying = false;
    let landed = false;

    try { sessionStorage.setItem("creo_intro_played", "1"); } catch { /* private mode */ }

    const FLIGHT_MS = 1100;
    const HOLD_MS = 2300;

    // Aim the flight at the nav logo: X on the outer layer, Y + scale on the inner one.
    function aim() {
      const mark = el.querySelector(".lp-intro__mark");
      const target = document.querySelector(".lp-header .ui-brand img");
      if (!mark || !target) return;
      const a = mark.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      if (!a.width || !b.width) return;
      el.style.setProperty("--fx", ((b.left + b.width / 2) - (a.left + a.width / 2)).toFixed(1) + "px");
      el.style.setProperty("--fy", ((b.top + b.height / 2) - (a.top + a.height / 2)).toFixed(1) + "px");
      el.style.setProperty("--fs", (b.width / a.width).toFixed(4));
    }

    function land() {
      if (landed) return;
      landed = true;
      timers.forEach(clearTimeout);
      root.classList.remove("intro-flying");
      el.classList.add("is-done");
      setTimeout(() => el.remove(), 300);
      document.removeEventListener("keydown", onKey);
    }

    function fly() {
      if (flying) return;
      flying = true;
      // Unlock the page first (the scrollbar may return and shift the layout), then measure.
      root.classList.add("intro-flying", "intro-revealed");
      root.classList.remove("intro-on");
      aim();
      el.classList.add("is-flying");
      timers.push(setTimeout(land, FLIGHT_MS + 60));
    }

    // Skip: take off immediately (or, mid-flight, land straight away).
    function skip() { if (flying) land(); else fly(); }

    requestAnimationFrame(() => el.classList.add("is-playing"));
    timers.push(setTimeout(fly, HOLD_MS));
    timers.push(setTimeout(() => { fly(); land(); }, 5000)); // never hold the page longer than 5s

    document.getElementById("lpIntroSkip")?.addEventListener("click", (e) => { e.stopPropagation(); skip(); });
    el.addEventListener("click", skip);
    function onKey(e) {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") { e.preventDefault(); skip(); }
    }
    document.addEventListener("keydown", onKey);

    if (/[?&]intro\b/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
  }

  // ── Hero studio: metal type that lifts toward the cursor and catches the light,
  //    a card with depth and reflection, magnetic buttons, scroll choreography. ──
  function runHero() {
    const hero = document.querySelector(".lp-hero");
    const title = document.getElementById("heroTitle");
    if (!hero || !title) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const card = document.getElementById("lpCard");
    const btns = [...hero.querySelectorAll(".lp-hero__cta .ui-btn")];
    const fine = window.matchMedia("(pointer: fine)").matches;

    // Split each word into letters; the word's gradient is continued across its letters.
    const letters = [];
    title.querySelectorAll(".lp-hero__w").forEach((w) => {
      const text = w.textContent.trim();
      w.textContent = "";
      for (const ch of text) {
        const l = document.createElement("span");
        l.className = "lp-hero__l";
        l.textContent = ch;
        w.appendChild(l);
        letters.push(l);
      }
      w.classList.add("is-split");
    });
    function layoutLetters() {
      title.querySelectorAll(".lp-hero__w").forEach((w) => {
        w.style.setProperty("--ww", w.offsetWidth + "px");
        w.querySelectorAll(".lp-hero__l").forEach((l) => l.style.setProperty("--lo", -l.offsetLeft + "px"));
      });
    }
    layoutLetters();
    document.fonts?.ready.then(layoutLetters);
    window.addEventListener("resize", layoutLetters);

    // Scroll-linked movement now lives in journey.js (GSAP); this loop only handles light and tilt.

    // Smoothed state, animated in one rAF loop while the hero is on screen.
    let px = 0, py = 0, tpx = 0, tpy = 0;
    let pointer = null; // {x, y} in client coords while over the hero
    let inView = true, raf = 0;
    const lifts = new Map();

    function frame(t) {
      raf = 0;
      if (!fine || !pointer) {
        // No cursor: a slow drift keeps the light and the card alive (touch, or pointer away).
        tpx = Math.sin(t / 2900) * (fine ? 0.25 : 0.55);
        tpy = Math.cos(t / 3700) * (fine ? 0.15 : 0.3);
      }
      px += (tpx - px) * 0.08;
      py += (tpy - py) * 0.08;
      hero.style.setProperty("--px", px.toFixed(3));
      hero.style.setProperty("--py", py.toFixed(3));
      hero.style.setProperty("--la", (180 + px * 55).toFixed(1) + "deg");

      if (card) {
        // In the pinned journey the rig sets the pose; here the card only leans toward the pointer.
        const base = hero.classList.contains("is-pinned") ? 0 : 1;
        card.style.setProperty("--rx", (14 * base - py * 7).toFixed(2) + "deg");
        card.style.setProperty("--ry", (-10 * base + px * 13).toFixed(2) + "deg");
        card.style.setProperty("--gx", (50 - px * 45).toFixed(1) + "%");
        card.style.setProperty("--gy", (-10 - py * 30).toFixed(1) + "%");
      }

      // Letters near the cursor lift toward it.
      for (const l of letters) {
        let lift = 0;
        if (pointer) {
          const r = l.getBoundingClientRect();
          const d = Math.hypot(pointer.x - (r.left + r.width / 2), pointer.y - (r.top + r.height / 2));
          lift = Math.max(0, 1 - d / 260);
          lift = lift * lift;
        }
        const prev = lifts.get(l) || 0;
        if (Math.abs(prev - lift) > 0.01) { l.style.setProperty("--lift", lift.toFixed(3)); lifts.set(l, lift); }
      }

      if (inView) raf = requestAnimationFrame(frame);
    }
    function wake() { if (!raf && inView) raf = requestAnimationFrame(frame); }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((e) => { inView = e[0].isIntersecting; wake(); }).observe(hero);
    }
    wake();

    if (!fine) return;
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      pointer = { x: e.clientX, y: e.clientY };
      tpx = ((e.clientX - r.left) / r.width) * 2 - 1;
      tpy = ((e.clientY - r.top) / Math.min(r.height, window.innerHeight)) * 2 - 1;
      hero.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
      hero.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
      // Magnetic buttons
      for (const b of btns) {
        const br = b.getBoundingClientRect();
        const dx = e.clientX - (br.left + br.width / 2);
        const dy = e.clientY - (br.top + br.height / 2);
        const near = Math.hypot(dx, dy) < Math.max(br.width, 120);
        const cap = (v) => Math.max(-10, Math.min(10, v)).toFixed(1);
        b.style.translate = near ? `${cap(dx * 0.18)}px ${cap(dy * 0.28)}px` : "";
      }
      wake();
    });
    hero.addEventListener("pointerleave", () => {
      pointer = null;
      btns.forEach((b) => { b.style.translate = ""; });
      wake();
    });
  }

  // ── Brand mark backdrop behind the How it works headline ──
  function runMark() {
    const sec = document.querySelector(".lp-markzone");
    const mark = sec?.querySelector(".lp-mark");
    if (!sec || !mark) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Scroll: --sp runs -1 (section entering from below) → 0 (centred) → 1 (leaving above).
    let sraf = 0;
    const onScroll = () => {
      if (sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        const r = sec.getBoundingClientRect();
        const mid = r.top + r.height / 2 - window.innerHeight / 2;
        const p = Math.max(-1, Math.min(1, -mid / ((r.height + window.innerHeight) / 2)));
        mark.style.setProperty("--sp", p.toFixed(3));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    // Pointer: parallax + gold reveal under the cursor (fine pointers only).
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    sec.addEventListener("pointermove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = sec.getBoundingClientRect();
        const m = mark.getBoundingClientRect();
        mark.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        mark.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        mark.style.setProperty("--lx", (((e.clientX - m.left) / m.width) * 100).toFixed(1) + "%");
        mark.style.setProperty("--ly", (((e.clientY - m.top) / m.height) * 100).toFixed(1) + "%");
      });
    });
    sec.addEventListener("pointerleave", () => {
      ["--px", "--py", "--lx", "--ly"].forEach((v) => mark.style.removeProperty(v));
    });
  }

  // ── Tiers: medallions unlock Bronze → Platinum on scroll; hover tilts and lights them ──
  function runTiers() {
    const wrap = document.querySelector(".lp-climb-wrap");
    if (!wrap) return;
    const items = [...wrap.querySelectorAll(".lp-ladder li")];
    if (!items.length) return;
    const setLevel = (n) => wrap.style.setProperty("--level", String(n));
    const litCount = () => items.filter((li) => li.classList.contains("is-lit")).length;
    let hovering = false;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((li) => li.classList.add("is-lit"));
    } else {
      wrap.classList.add("is-armed");
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        io.disconnect();
        window.removeEventListener("scroll", check);
        items.forEach((li, i) => setTimeout(() => {
          li.classList.add("is-lit");
          if (!hovering) setLevel(i + 1);
        }, 250 + i * 480));
      };
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) start();
      }, { threshold: 0.25 });
      // Backup trigger from scroll position, so tiers can never stay locked.
      const check = () => {
        const r = wrap.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.8 && r.bottom > 0) start();
      };
      io.observe(wrap);
      window.addEventListener("scroll", check, { passive: true });
      check();
    }

    function activate(li) {
      items.forEach((x) => x.classList.toggle("is-active", x === li));
      if (li) { hovering = true; setLevel(items.indexOf(li) + 1); }
      else { hovering = false; setLevel(litCount()); }
    }

    const fine = window.matchMedia("(pointer: fine)").matches;
    items.forEach((li) => {
      const medal = li.querySelector(".lp-medal");
      const reset = () => { if (medal) ["--tx", "--ty", "--lx", "--ly"].forEach((v) => medal.style.removeProperty(v)); };
      if (fine) {
        let raf = 0;
        li.addEventListener("pointerenter", () => { if (li.classList.contains("is-lit")) activate(li); });
        li.addEventListener("pointermove", (e) => {
          if (!medal || raf || !li.classList.contains("is-lit")) return;
          raf = requestAnimationFrame(() => {
            raf = 0;
            const r = li.getBoundingClientRect();
            const m = medal.getBoundingClientRect();
            const dx = Math.max(-1, Math.min(1, (e.clientX - (m.left + m.width / 2)) / (r.width / 2)));
            const dy = Math.max(-1, Math.min(1, (e.clientY - (m.top + m.height / 2)) / (r.height / 2)));
            medal.style.setProperty("--tx", (-dy * 22).toFixed(1) + "deg");
            medal.style.setProperty("--ty", (dx * 26).toFixed(1) + "deg");
            medal.style.setProperty("--lx", (50 + dx * 32).toFixed(1) + "%");
            medal.style.setProperty("--ly", (45 + dy * 32).toFixed(1) + "%");
          });
        });
        li.addEventListener("pointerleave", () => { reset(); activate(null); });
      } else {
        // Touch: tap a tier to bring it forward, tap again to release.
        li.addEventListener("click", () => {
          if (!li.classList.contains("is-lit")) return;
          activate(li.classList.contains("is-active") ? null : li);
        });
      }
    });
  }

  runIntro();
  runHero();
  runMark();
  runTiers();
})();
