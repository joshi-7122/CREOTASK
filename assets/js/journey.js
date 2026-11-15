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
  const orbits = sec.querySelector(".lp-orbits");
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

      // Previous content lifts away; the card turns to its next pose; the orbits swing round.
      tl.to(leaving, { autoAlpha: 0, y: -44, duration: 0.5, ease: "power2.in" }, t);
      tl.to(rig, POSES[i], t);
      if (orbits) tl.to(orbits, { "--oz": (i + 1) * 48 + "deg" }, t);
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

    const st = tl.scrollTrigger;
    const at = (t) => st.start + (st.end - st.start) * (t / tl.duration());
    api.pinned = true;
    api.chapterStart = (i) => at(i * STEP + 0.55);   // scroll position where chapter i becomes the active one
    api.chapterScroll = (i) => at(i * STEP + 1.35);  // scroll position where chapter i has fully arrived

    return () => {
      sec.classList.remove("is-pinned");
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
