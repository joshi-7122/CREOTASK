/* =========================================================
   CREOTASK — Floating glass navigation dock
   - Compacts into a dock once the page scrolls.
   - A sliding indicator follows the section in view; chapter links are tied to the
     pinned hero journey (journey.js) when it is running, and to the stacked chapters otherwise.
   - Explore: a disclosure panel with keyboard support. Small screens: a drawer.
   - Logo returns the page to the hero's opening state.
   Works without journey.js / GSAP: every link is a plain in-page anchor underneath.
   ========================================================= */
(function () {
  "use strict";

  const header = document.getElementById("siteHeader");
  const dock = document.getElementById("navDock");
  if (!header || !dock) return;

  const nav = dock.querySelector(".lp-dock__nav");
  const ind = document.getElementById("navInd");
  const brand = dock.querySelector(".lp-dock__brand");
  const exploreLi = document.getElementById("explore");
  const exploreBtn = document.getElementById("exploreBtn");
  const explorePanel = document.getElementById("explorePanel");
  const menuBtn = document.getElementById("navMenuBtn");
  const drawer = document.getElementById("navDrawer");
  const scrim = document.getElementById("navScrim");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const wide = window.matchMedia("(min-width: 1000px)");

  // ── Targets, in page order ──
  const TARGETS = [
    ["ch0", "ch-connect"], ["ch1", "ch-create"], ["ch2", "ch-compete"], ["ch3", "ch-why"], ["ch4", "ch-insights"],
    ["how", "how"], ["tiers", "tiers"], ["creostart", "creostart"], ["faq", "faq"],
  ].map(([key, id]) => ({ key, el: document.getElementById(id) })).filter((t) => t.el);
  const closing = document.querySelector(".lp-closing");
  const byKey = Object.fromEntries(TARGETS.map((t) => [t.key, t]));
  const isChapter = (key) => /^ch\d$/.test(key);
  const journey = () => (window.CreoJourney && window.CreoJourney.pinned ? window.CreoJourney : null);
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  const dockOffset = () => dock.getBoundingClientRect().bottom + 28;

  // Scroll position at which a target becomes the active one.
  function reachedAt(t) {
    const J = journey();
    if (J && isChapter(t.key)) return J.chapterStart(+t.key[2]);
    return docTop(t.el) - window.innerHeight * 0.45;
  }
  // Scroll position a link should travel to.
  function destination(key) {
    const J = journey();
    if (J && isChapter(key)) return J.chapterScroll(+key[2]);
    return Math.max(0, docTop(byKey[key].el) - dockOffset());
  }
  function scrollToY(y) {
    window.scrollTo({ top: Math.round(y), behavior: reduce ? "auto" : "smooth" });
  }

  // ── Active link + sliding indicator ──
  let activeKey = null;
  function placeIndicator(instant) {
    if (!ind || !nav) return;
    const inDock = activeKey && nav.querySelector(`.lp-dock__links > li > [data-nav="${activeKey}"]`);
    const anchor = activeKey ? (inDock || exploreBtn) : null;
    exploreBtn?.classList.toggle("is-current", !!activeKey && !inDock);
    if (!anchor || !nav.offsetWidth) { ind.classList.remove("is-on"); return; }
    const li = anchor.closest("li");
    ind.classList.toggle("is-instant", !!instant || !ind.classList.contains("is-on"));
    ind.style.setProperty("--x", li.offsetLeft + "px");
    ind.style.setProperty("--w", li.offsetWidth + "px");
    ind.classList.add("is-on");
  }
  function setActive(key) {
    if (key === activeKey) return;
    activeKey = key;
    header.querySelectorAll("[data-nav]").forEach((a) => {
      if (a === exploreBtn) return;
      if (a.dataset.nav === key) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    placeIndicator(false);
  }

  let ticking = false;
  function update() {
    ticking = false;
    const y = window.scrollY;
    header.classList.toggle("is-docked", y > 24);
    let key = null;
    for (const t of TARGETS) if (y >= reachedAt(t) - 1) key = t.key;
    if (closing && y >= docTop(closing) - window.innerHeight * 0.45) key = null;
    setActive(key);
  }
  function requestUpdate() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", () => { requestUpdate(); placeIndicator(true); });
  document.fonts?.ready.then(() => placeIndicator(true));
  window.addEventListener("load", () => { update(); placeIndicator(true); });
  update();

  // ── Link clicks: travel smoothly; the logo returns to the hero's opening state ──
  header.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-nav]");
    if (link && byKey[link.dataset.nav]) {
      e.preventDefault();
      const key = link.dataset.nav;
      closeExplore(false);
      closeDrawer(false);
      scrollToY(destination(key));
      if (!isChapter(key)) history.replaceState(null, "", "#" + byKey[key].el.id);
      // Move keyboard focus to the section (not while the journey is pinned: its chapters are staged).
      if (!(journey() && isChapter(key))) {
        const el = byKey[key].el;
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
      }
      return;
    }
    if (e.target.closest(".lp-dock__brand")) {
      e.preventDefault();
      closeExplore(false);
      closeDrawer(false);
      scrollToY(0);
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if (e.target.closest("[data-auth]")) { closeExplore(false); closeDrawer(false); }
  });

  // ── Explore disclosure ──
  let exploreTimer = 0;
  const exploreItems = () => [...explorePanel.querySelectorAll("a, button")];
  function openExplore() {
    clearTimeout(exploreTimer);
    if (exploreBtn.getAttribute("aria-expanded") === "true") return;
    explorePanel.hidden = false;
    exploreBtn.setAttribute("aria-expanded", "true");
    void explorePanel.offsetWidth; // commit the starting state so the transition runs
    explorePanel.classList.add("is-open");
  }
  function closeExplore(focusBtn) {
    clearTimeout(exploreTimer);
    if (!explorePanel || exploreBtn.getAttribute("aria-expanded") !== "true") return;
    exploreBtn.setAttribute("aria-expanded", "false");
    explorePanel.classList.remove("is-open");
    exploreTimer = setTimeout(() => { explorePanel.hidden = true; }, reduce ? 0 : 240);
    if (focusBtn) exploreBtn.focus();
  }
  if (exploreBtn && explorePanel && exploreLi) {
    exploreBtn.addEventListener("click", () => {
      if (exploreBtn.getAttribute("aria-expanded") === "true") closeExplore(false); else openExplore();
    });
    if (fine) {
      exploreLi.addEventListener("pointerenter", openExplore);
      exploreLi.addEventListener("pointerleave", () => {
        clearTimeout(exploreTimer);
        exploreTimer = setTimeout(() => { if (!exploreLi.contains(document.activeElement) || document.activeElement === exploreBtn) closeExplore(false); }, 180);
      });
    }
    exploreLi.addEventListener("keydown", (e) => {
      const items = exploreItems();
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); closeExplore(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); openExplore(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); (items[i - 1] || exploreBtn).focus(); }
      else if (e.key === "Home" && i >= 0) { e.preventDefault(); items[0].focus(); }
      else if (e.key === "End" && i >= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    });
    exploreLi.addEventListener("focusout", (e) => { if (!exploreLi.contains(e.relatedTarget)) closeExplore(false); });
    document.addEventListener("pointerdown", (e) => { if (!exploreLi.contains(e.target)) closeExplore(false); });
  }

  // ── Drawer (small screens) ──
  let drawerTimer = 0;
  const drawerOpen = () => menuBtn?.getAttribute("aria-expanded") === "true";
  function openDrawer() {
    if (!drawer || drawerOpen()) return;
    clearTimeout(drawerTimer);
    drawer.hidden = false; scrim.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    menuBtn.setAttribute("aria-label", "Close menu");
    document.documentElement.style.overflow = "hidden";
    void drawer.offsetWidth; // commit the starting state so the transition runs
    header.classList.add("is-menu-open");
    drawer.querySelector("a, button")?.focus({ preventScroll: true });
  }
  function closeDrawer(focusBtn) {
    if (!drawer || !drawerOpen()) return;
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Open menu");
    header.classList.remove("is-menu-open");
    document.documentElement.style.overflow = "";
    drawerTimer = setTimeout(() => { drawer.hidden = true; scrim.hidden = true; }, reduce ? 0 : 320);
    if (focusBtn) menuBtn.focus();
  }
  if (menuBtn && drawer && scrim) {
    drawer.querySelectorAll("li a").forEach((a, i) => a.style.setProperty("--i", i));
    menuBtn.addEventListener("click", () => (drawerOpen() ? closeDrawer(false) : openDrawer()));
    scrim.addEventListener("click", () => closeDrawer(false));
    wide.addEventListener("change", (e) => { if (e.matches) closeDrawer(false); });
    document.addEventListener("keydown", (e) => {
      if (!drawerOpen()) return;
      if (e.key === "Escape") { e.preventDefault(); closeDrawer(true); return; }
      if (e.key !== "Tab") return;
      // Keep focus inside the menu button + drawer while it is open.
      const f = [menuBtn, ...drawer.querySelectorAll("a, button")];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!f.includes(document.activeElement)) { e.preventDefault(); first.focus(); }
    });
  }

  // ── Magnetic hover on dock items (fine pointers, motion allowed) ──
  if (fine && !reduce) {
    dock.querySelectorAll(".lp-dock__links > li > a, .lp-explore__btn, .lp-nav-actions .ui-btn").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        el.style.translate = `${(dx * 4).toFixed(1)}px ${(dy * 3).toFixed(1)}px`;
      });
      el.addEventListener("pointerleave", () => { el.style.translate = ""; });
    });
  }
})();
