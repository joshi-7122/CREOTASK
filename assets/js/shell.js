/* =========================================================
   CREOTASK — Signed-in app shell (shared by app.html and dashboard.html)
   Top bar, role switch, tier badge, notifications, account menu,
   desktop nav + phone tab bar, account banners.
   Usage: Shell.init({ user, profile, adminRole, paymentsMode, onTierClick, activeRoute })
   ========================================================= */
(function (global) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = UI.esc;
  let currentUser = null, currentProfile = null, userAdminRole = null, paymentsMode = "disabled";
  let showTierModal = () => { location.href = "app.html#tiers"; };

  // ── Header ────────────────────────────────────────────────
  function renderHeader() {
    const isClient = currentUser.active_role === "client";
    const name = currentProfile?.display_name || currentUser.email.split("@")[0];

    $("roleBadge").textContent = isClient ? "Client" : "Freelancer";
    $("roleSwitchBtn").title = `Switch to ${isClient ? "freelancer" : "client"}`;
    $("menuSwitchRole").textContent = `Switch to ${isClient ? "freelancer" : "client"}`;
    $("headerName").textContent = name;
    $("headerEmail").textContent = currentUser.email;
    $("headerAvatar").textContent = UI.initials(name);
    $("homeLink").href = isClient ? "app.html#my-projects" : "app.html#projects";

    const tierPillWrap = $("tierPillWrap");
    if (!isClient && currentProfile) {
      const tier = currentProfile.tier || "bronze";
      const label = tier.charAt(0).toUpperCase() + tier.slice(1);
      tierPillWrap.innerHTML = `<button class="ui-tier ui-tier--${tier}" id="openTierBtn" type="button" title="Your tier and what's needed for the next one">${label}</button>`;
      $("openTierBtn").addEventListener("click", showTierModal);
    } else if (isClient) {
      const verified = currentProfile?.verification_status === "verified";
      tierPillWrap.innerHTML = verified ? `<span class="ui-badge ui-badge--success ui-badge--dot">Verified client</span>` : "";
    }
  }

  // AUTH-01: unverified accounts are told why commitments are blocked and can resend the link.
  function renderAccountBanner() {
    const host = $("accountBanner");
    if (!host) return;
    const parts = [];
    if (!currentUser.email_verified) {
      parts.push(`
        <div class="ui-alert ui-alert--warning" role="status">
          <span><b>Verify your email.</b> Until you do, you can browse and build your profile, but you can't publish projects, apply, send offers or fund work.</span>
          <button class="ui-btn ui-btn--sm" id="resendVerifyBtn" type="button">Resend link</button>
        </div>`);
    }
    if (paymentsMode === "sandbox") {
      parts.push(`
        <div class="ui-alert ui-alert--info" role="note">
          <span><b>Sandbox payments.</b> Funding and payouts on this environment are test records only. No real money moves.</span>
        </div>`);
    }
    host.innerHTML = parts.join("");
    $("resendVerifyBtn")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        await CreoAPI.auth.resendVerification(currentUser.email);
        UI.toast(`We've sent a new verification link to ${currentUser.email}. Older links no longer work.`, "success");
      } catch (err) {
        UI.toast(err.message, "error");
        e.target.disabled = false;
      }
    });
  }

  // Small popover controller for the notification and account menus.
  function bindMenu(btnId, menuId, onOpen) {
    const btn = $(btnId), menu = $(menuId);
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = menu.hidden;
      document.querySelectorAll(".sh-pop .ui-menu").forEach((m) => { m.hidden = true; });
      document.querySelectorAll(".sh-pop [aria-expanded]").forEach((b) => b.setAttribute("aria-expanded", "false"));
      menu.hidden = !opening;
      btn.setAttribute("aria-expanded", String(opening));
      if (opening && onOpen) onOpen();
    });
    document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
    menu.addEventListener("click", (e) => { if (e.target.closest("a, .ui-menu__item")) close(); });
  }

  async function switchRole() {
    const nextRole = currentUser.active_role === "client" ? "freelancer" : "client";
    try {
      await CreoAPI.auth.switchRole(nextRole);
      location.href = "app.html";
    } catch (err) {
      UI.toast(err.message, "error");
    }
  }

  function bindHeaderEvents() {
    $("roleSwitchBtn").addEventListener("click", switchRole);
    $("menuSwitchRole").addEventListener("click", switchRole);
    $("logoutBtn").addEventListener("click", () => CreoAPI.auth.logout());
    bindMenu("notifBtn", "notifMenu", refreshNotifications);
    bindMenu("accountBtn", "accountMenu");
    $("markAllNotifsBtn").addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await CreoAPI.notifications.markAllRead(); refreshNotifications(); }
      catch (err) { UI.toast(err.message, "error"); }
    });
  }

  /** Server notification links use REST-style paths; map the ones the app can show to hash routes. */
  function notifHref(link) {
    if (!link) return null;
    const m = /^\/projects\/([^/]+)\/workspace/.exec(link);
    return m ? `app.html#workspace/${encodeURIComponent(m[1])}` : null;
  }

  async function refreshNotifications() {
    const list = $("notifList");
    try {
      const res = await CreoAPI.notifications.list(false);
      $("notifBadge").hidden = !(res.unread_count > 0);
      if (!res.data.length) {
        list.innerHTML = `<p class="sh-notif__empty">You're all caught up. Updates about applications, offers and milestones will appear here.</p>`;
        return;
      }
      list.innerHTML = res.data.slice(0, 10).map((n) => {
        const href = notifHref(n.link);
        const inner = `<b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ""}<time datetime="${new Date(n.created_at).toISOString()}">${UI.timeAgo(n.created_at)}</time>`;
        return href
          ? `<a class="sh-notif__item" href="${href}" ${n.is_read ? "" : "data-unread"}>${inner}</a>`
          : `<div class="sh-notif__item" ${n.is_read ? "" : "data-unread"}>${inner}</div>`;
      }).join("");
    } catch (e) {
      list.innerHTML = `<p class="sh-notif__empty">Notifications couldn't load. They'll retry shortly.</p>`;
    }
  }

  // ── Navigation (desktop top bar + phone tab bar) ──────────
  function renderDock() {
    const isClient = currentUser.active_role === "client";
    const items = isClient
      ? [
          { route: "my-projects", label: "My projects" },
          { route: "explore", label: "Find talent" },
          { route: "workspace", label: "Contracts" },
          { route: "ledger", label: "Payments" },
        ]
      : [
          { route: "projects", label: "Find work" },
          { route: "applications", label: "Applications" },
          { route: "workspace", label: "Contracts" },
          { route: "tiers", label: "Tiers" },
        ];
    if (userAdminRole) items.push({ route: "admin", label: "Operations" });

    const html = items.map((item) => `<a class="sh-nav__item" href="app.html#${item.route}" data-route="${item.route}">${item.label}</a>`).join("");
    ["mainDock", "mobileTabbar"].forEach((id) => { if ($(id)) $(id).innerHTML = html; });
  }

  function updateActiveDock(route) {
    document.querySelectorAll(".sh-nav__item").forEach((el) => {
      if (el.dataset.route === route) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  const Shell = {
    init(opts) {
      currentUser = opts.user;
      currentProfile = opts.profile;
      userAdminRole = opts.adminRole || null;
      paymentsMode = opts.paymentsMode || "disabled";
      if (opts.onTierClick) showTierModal = opts.onTierClick;
      renderHeader();
      renderAccountBanner();
      renderDock();
      bindHeaderEvents();
      if (opts.activeRoute) updateActiveDock(opts.activeRoute);
      refreshNotifications();
      setInterval(() => { if (document.visibilityState === "visible") refreshNotifications(); }, 30000);
    },
    setActive: (route) => updateActiveDock(route),
    refreshBanner(user) { if (user) currentUser = user; renderAccountBanner(); },
  };
  global.Shell = Shell;

  // The dock strengthens its glass once the page scrolls under it.
  const top = document.querySelector(".sh-top");
  if (top) {
    const onScroll = () => top.classList.toggle("is-scrolled", global.scrollY > 8);
    global.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})(window);
