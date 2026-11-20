/* =========================================================
   CREOTASK — Smooth wheel scrolling
   Stepped mouse wheels jump the page in chunks; this glides between them. The page keeps
   its real scroll position (scrolling is not faked with transforms), so the fixed nav,
   sticky headings, anchors, the GSAP scroll journey and every scroll listener keep working.
   - Only mouse wheels are smoothed. Trackpads and touch are already smooth and stay native
     (no added delay).
   - Left alone: pinch-zoom, horizontal scrolling, scrollable panels that can still scroll,
     open dialogs, the intro, and anyone who prefers reduced motion.
   - Keyboard, scrollbar, anchor jumps and scripted scrolls are followed, not fought.
   ========================================================= */
(function () {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const root = document.documentElement;
  let target = window.scrollY, current = target, raf = 0, last = 0, expectY = null;

  const maxY = () => root.scrollHeight - window.innerHeight;
  const locked = () =>
    root.classList.contains("intro-on") ||
    !!document.querySelector("dialog[open]") ||
    getComputedStyle(document.body).overflowY === "hidden" ||
    getComputedStyle(root).overflowY === "hidden";

  // A panel under the pointer that can still scroll this way keeps the wheel.
  function scrollablePanel(el, dy) {
    for (; el && el !== document.body && el !== root; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return el;
    }
    return null;
  }

  // Mouse wheels report fixed steps (multiples of 120, or line/page units); trackpads don't.
  function isMouseWheel(e) {
    if (e.deltaMode !== 0) return true;
    const w = e.wheelDeltaY;
    return typeof w === "number" && w !== 0 && Math.abs(w) % 120 === 0;
  }

  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.defaultPrevented || !isMouseWheel(e) || locked()) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 40;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;
    if (scrollablePanel(e.target, dy)) return;
    e.preventDefault();
    if (!raf) current = target = window.scrollY;
    target = Math.max(0, Math.min(maxY(), target + dy));
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }, { passive: false });

  function frame(ts) {
    raf = 0;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    current += (target - current) * (1 - Math.exp(-dt * 12));   // frame-rate independent glide
    if (Math.abs(target - current) < 0.5) current = target;
    const y = Math.round(current);
    if (y !== Math.round(window.scrollY)) { expectY = y; window.scrollTo(0, y); }
    if (current !== target) raf = requestAnimationFrame(frame);
  }

  // Someone else moved the page (keys, scrollbar, anchor, script): follow it.
  window.addEventListener("scroll", () => {
    if (expectY !== null && Math.abs(window.scrollY - expectY) < 2) { expectY = null; return; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    current = target = window.scrollY;
  }, { passive: true });
})();
