/* =========================================================
   CREOTASK — Hero journey (GSAP ScrollTrigger)
   One pinned stage: the CreoTask card stays anchored in the centre and
   turns in 3D while scroll moves through five chapters.
   - Wide screens: pinned, scrubbed timeline (.is-pinned layout).
   - Small / short screens: chapters stay stacked and simply rise in.
   - Reduced motion, or GSAP missing: nothing runs; the stacked layout is the page.
   ========================================================= */
(function () {
  "use strict";

  const sec = document.querySelector(".lp-journey");
  if (!sec || !window.gsap || !window.ScrollTrigger) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  const stage = sec.querySelector(".lp-j-stage");
  const intro = sec.querySelector(".lp-hero__inner");
  const rig = sec.querySelector(".lp-card-rig");
  const chrome = window.CreoChrome && window.CreoChrome.state; // hero backdrop settings (chrome.js)
  const shadow = sec.querySelector(".lp-card__floor");
  const chapters = [...sec.querySelectorAll(".lp-ch")];
  const rail = sec.querySelector(".lp-j-rail");
  const railItems = rail ? [...rail.children] : [];
  if (!stage || !rig || !chapters.length) return;

  // The card's pose for the intro and for each chapter.
  const INTRO_POSE = { rotationX: 14, rotationY: -10, scale: 1, yPercent: 0 };
  const POSES = [
    { rotationX: 6, rotationY: 28, scale: 0.94, yPercent: 0 },      // Connect: turns toward the panels
    { rotationX: 10, rotationY: -28, scale: 0.94, yPercent: 0 },    // Create: turns the other way
    { rotationX: 0, rotationY: 180, scale: 0.98, yPercent: 0 },     // Compete: flips to the tier ladder
    { rotationX: 56, rotationY: 360, scale: 0.86, yPercent: 6 },    // Why: lies back like a platform
    { rotationX: 4, rotationY: 372, scale: 0.8, yPercent: -4 },     // Insights: upright, set back
  ];
  // How the chrome ribbons move in each chapter: Connect draws them together, Create lets them
  // fold and billow, Compete lifts them into a rising diagonal, then they settle.
  const CHROME = [
    { flow: 0.9, amp: 0.75, converge: 0.75, twist: 0.6, tilt: 0, lift: 0, glow: 0.9, focus: 1 },       // Connect
    { flow: 1.2, amp: 1.5, converge: 0.3, twist: 1.6, tilt: 0.1, lift: 0, glow: 0.95, focus: 1 },      // Create
    { flow: 1.6, amp: 0.9, converge: 0.55, twist: 1.0, tilt: 0.36, lift: 0.03, glow: 1, focus: 1 },    // Compete
    { flow: 0.75, amp: 0.6, converge: 0.2, twist: 0.7, tilt: 0.05, lift: 0, glow: 0.72, focus: 1 },    // Why CreoTask
    { flow: 0.6, amp: 0.5, converge: 0.15, twist: 0.6, tilt: -0.04, lift: 0, glow: 0.6, focus: 1 },    // Insights
  ];
  const STEP = 1.7; // timeline units per chapter: ~1 of transition, ~0.7 of hold

  // Read-only hook for the navigation dock (nav.js): where each chapter sits on the scroll track.
  const api = (window.CreoJourney = { pinned: false, chapterStart: null, chapterScroll: null });

  const mm = gsap.matchMedia();

  // ── Wide screens: pinned, scroll-scrubbed journey ──
  mm.add("(min-width: 861px) and (min-height: 600px)", () => {
    sec.classList.add("is-pinned");
    gsap.set(rig, INTRO_POSE);
    gsap.set(chapters, { autoAlpha: 0 });

    let active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      rail?.classList.toggle("is-on", i >= 0);
      railItems.forEach((li, n) => li.classList.toggle("is-active", n === i));
    }

    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut", duration: 1 },
      scrollTrigger: {
        trigger: sec,
        start: "top top",
        end: () => "+=" + Math.round(window.innerHeight * chapters.length * 1.15),
        pin: true,
        scrub: 0.7,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate(self) {
          const t = self.progress * tl.duration();
          setActive(t < 0.55 ? -1 : Math.min(chapters.length - 1, Math.floor((t - 0.55) / STEP)));
        },
      },
    });

    chapters.forEach((ch, i) => {
      const t = i * STEP;
      const text = ch.querySelectorAll(".lp-ch__text > *");
      const panels = ch.querySelectorAll(".lp-glass");
      const leaving = i === 0 ? intro : chapters[i - 1];

      // Previous content lifts away; the card turns to its next pose; the chrome changes its flow.
      tl.to(leaving, { autoAlpha: 0, y: -44, duration: 0.5, ease: "power2.in" }, t);
      tl.to(rig, POSES[i], t);
      if (chrome && CHROME[i]) tl.to(chrome, { ...CHROME[i], duration: 1.2, ease: "sine.inOut" }, t);
      if (shadow) tl.to(shadow, { opacity: i === 3 ? 0.35 : 0.8, scaleX: POSES[i].scale, duration: 1 }, t);

      // Next chapter arrives: text rises in, glass panels swing in from depth.
      tl.set(ch, { autoAlpha: 1 }, t + 0.4);
      tl.fromTo(text, { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power2.out" }, t + 0.42);
      tl.fromTo(panels,
        { autoAlpha: 0, x: 90, z: -180, rotationY: -24 },
        { autoAlpha: 1, x: 0, z: 0, rotationY: 0, duration: 0.6, stagger: 0.1, ease: "power2.out" },
        t + 0.48);
    });
    tl.to({}, { duration: 0.7 }); // hold on the last chapter before the page moves on

    // Screen readers: chapters 2–5 are visibility:hidden until scrolled to, which also hides them from
    // assistive tech. Keep an offscreen copy of all five in the page so nobody misses a chapter.
    const summary = document.createElement("section");
    summary.className = "ui-sr-only";
    summary.setAttribute("aria-label", "Overview: Connect, Create, Compete, Why CreoTask, Market insights");
    chapters.forEach((ch) => {
      const copy = ch.cloneNode(true);
      copy.removeAttribute("id");
      copy.removeAttribute("aria-labelledby");
      copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      copy.querySelectorAll(".lp-glass__k, .lp-ch__no").forEach((n) => { n.hidden = false; });
      copy.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", "-1")); // screen readers still list them
      summary.appendChild(copy);
    });
    sec.querySelector(".lp-chapters")?.before(summary);
    summary.querySelectorAll(".lp-ch").forEach((n) => { n.style.cssText = "position:static;visibility:visible;"; });

    const st = tl.scrollTrigger;
    const at = (t) => st.start + (st.end - st.start) * (t / tl.duration());
    api.pinned = true;
    api.chapterStart = (i) => at(i * STEP + 0.55);   // scroll position where chapter i becomes the active one
    api.chapterScroll = (i) => at(i * STEP + 1.35);  // scroll position where chapter i has fully arrived

    return () => {
      sec.classList.remove("is-pinned");
      summary.remove();
      api.pinned = false;
      setActive(-1);
    };
  });

  // ── Small or short screens: stacked chapters that rise in, card turns gently with scroll ──
  mm.add("(max-width: 860px), (max-height: 599px)", () => {
    chapters.forEach((ch) => {
      gsap.from(ch.querySelectorAll(".lp-ch__text > *, .lp-glass"), {
        autoAlpha: 0, y: 30, duration: 0.7, stagger: 0.07, ease: "power2.out",
        scrollTrigger: { trigger: ch, start: "top 80%", once: true },
      });
    });
    if (chrome) gsap.to(chrome, { converge: 0.5, tilt: 0.12, ease: "none", scrollTrigger: { trigger: sec, start: "top top", end: "+=90%", scrub: 0.8 } });
    gsap.fromTo(rig, { rotationY: 0 }, {
      rotationY: 26, rotationX: -6, ease: "none",
      scrollTrigger: { trigger: rig, start: "top 70%", end: "bottom top", scrub: 0.6 },
    });
  });

  // Layout shifts after fonts load and after the intro unlocks scrolling.
  const refresh = () => ScrollTrigger.refresh();
  document.fonts?.ready.then(refresh);
  window.addEventListener("load", refresh);
})();
