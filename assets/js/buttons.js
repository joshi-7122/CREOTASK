/* =========================================================
   CREOTASK — Button light
   The glass buttons are lit by the pointer: a soft pool of light sits where the cursor is
   inside the button (--bx / --by, read by landing.css). Pointer devices only. No movement,
   so it is safe with reduced motion. Delegated, so it covers buttons added later.
   ========================================================= */
(function () {
  "use strict";
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const SELECTOR = ".lp-hero__cta .ui-btn, .lp-closing .ui-btn, .lp-path > .ui-btn, .lp-act > .ui-btn";
  let raf = 0, last = null;

  function apply() {
    raf = 0;
    if (!last) return;
    const { el, x, y } = last;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--bx", Math.round(x - r.left) + "px");
    el.style.setProperty("--by", Math.round(y - r.top) + "px");
  }

  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest(SELECTOR);
    if (!el) return;
    last = { el, x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
})();
