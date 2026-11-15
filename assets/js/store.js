/* =========================================================
   CREOTASK — Store & UI Bridge
   Connects UI components to CreoAPI backend service.
   Preserves UI utilities (toast, modal, formatters).
   ========================================================= */
(function (global) {
  "use strict";

  const UI = {
    /** Toast notification (design-system styled). type: "success" | "error" | undefined */
    toast(msg, type) {
      let host = document.querySelector(".ui-toast-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "ui-toast-host";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
      }
      const t = document.createElement("div");
      t.className = "ui-toast" + (type ? " ui-toast--" + type : "");
      t.textContent = msg;
      host.appendChild(t);
      while (host.children.length > 3) host.firstElementChild.remove();
      setTimeout(() => t.remove(), type === "error" ? 6000 : 3600);
    },

    _focusFirst(el) {
      const f = el.querySelector('[autofocus], input:not([type="hidden"]):not([disabled]), textarea, select, button:not([data-close]):not(.modal__close)');
      if (f) setTimeout(() => f.focus(), 30);
    },

    /** Open a native <dialog class="ui-dialog"> or a legacy .modal. */
    openModal(el) {
      if (!el) return;
      el._lastFocus = document.activeElement;
      if (el instanceof HTMLDialogElement) {
        if (!el.open) el.showModal();
        UI._focusFirst(el);
        return;
      }
      el.classList.add("is-open");
      el.setAttribute("aria-hidden", "false");
      UI._focusFirst(el);
    },

    closeModal(el) {
      if (!el) return;
      if (el instanceof HTMLDialogElement) {
        if (el.open) el.close();
      } else {
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
      }
      if (el._lastFocus && document.contains(el._lastFocus)) el._lastFocus.focus();
    },

    bindModals() {
      document.querySelectorAll("dialog.ui-dialog").forEach((d) => {
        d.addEventListener("click", (e) => {
          // Backdrop click (the dialog element itself, outside its content box) or a [data-close] control.
          if (e.target.closest("[data-close]")) return UI.closeModal(d);
          if (e.target === d) {
            const r = d.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) UI.closeModal(d);
          }
        });
        d.addEventListener("close", () => {
          if (d._lastFocus && document.contains(d._lastFocus)) d._lastFocus.focus();
        });
      });
      document.querySelectorAll(".modal").forEach((m) => {
        m.addEventListener("click", (e) => {
          if (e.target === m || e.target.closest("[data-close]")) UI.closeModal(m);
        });
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        document.querySelectorAll(".modal.is-open").forEach((m) => UI.closeModal(m));
      });
    },

    /** Mark a button busy while an async action runs. */
    async busy(btn, fn) {
      if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
      try { return await fn(); }
      finally { if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); } }
    },

    esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    },

    initials(name) {
      return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    },

    formatINR(paiseOrRupees, isPaise = true) {
      const rupees = isPaise ? Math.round(paiseOrRupees / 100) : paiseOrRupees;
      return "₹" + Number(rupees).toLocaleString("en-IN");
    },

    timeAgo(ts) {
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    }
  };

  const Store = {
    current() {
      const user = global.CreoAPI ? global.CreoAPI.getCachedUser() : null;
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.display_name || user.email.split("@")[0],
        role: user.active_role || "freelancer",
        tier: user.tier || "bronze",
        avatar: user.avatar_url || "",
        email_verified: user.email_verified || 0,
        ...user
      };
    },

    async refreshCurrent() {
      if (!global.CreoAPI) return null;
      const res = await global.CreoAPI.auth.me();
      if (!res) return null;
      return Store.current();
    },

    async signUp(email, password, role, display_name, age_confirmed) {
      if (!global.CreoAPI) throw new Error("API not loaded");
      const res = await global.CreoAPI.auth.register(email, password, role, display_name, age_confirmed);
      return res.user;
    },

    async signIn(email, password) {
      if (!global.CreoAPI) throw new Error("API not loaded");
      const res = await global.CreoAPI.auth.login(email, password);
      return res.user;
    },

    async switchRole(role) {
      if (!global.CreoAPI) throw new Error("API not loaded");
      await global.CreoAPI.auth.switchRole(role);
      await Store.refreshCurrent();
    },

    signOut() {
      if (global.CreoAPI) global.CreoAPI.auth.logout();
    }
  };

  global.UI = UI;
  global.Store = Store;
})(window);
