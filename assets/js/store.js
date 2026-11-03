/* =========================================================
   CREOTASK — client-side store
   ---------------------------------------------------------
   A tiny localStorage-backed data layer so the front end is
   fully clickable without a server. Every function here maps
   to an obvious REST endpoint (see README) so it can be swapped
   for fetch() calls once a backend exists.
   NOTE: password hashing in the browser is for the demo only —
   real auth must happen server-side.
   ========================================================= */
(function (global) {
  "use strict";

  const KEY = "creotask:v1";
  const XP_PER_LEVEL = 500;

  const safe = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };

  function read() {
    try { return JSON.parse(safe.get(KEY)) || { users: {}, session: null }; }
    catch { return { users: {}, session: null }; }
  }
  function write(db) { safe.set(KEY, JSON.stringify(db)); }

  async function hash(text) {
    if (global.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return btoa(unescape(encodeURIComponent(text)));
  }

  function nameFromEmail(email) {
    const base = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    return base.replace(/\b\w/g, (c) => c.toUpperCase()) || "New Creator";
  }

  function newProfile(email, provider, role) {
    return {
      email,
      role: role === "client" ? "client" : "freelancer",
      provider: provider || "email",
      verified: provider && provider !== "email",
      createdAt: Date.now(),
      name: nameFromEmail(email),
      location: "Greater Noida",
      about: "",
      avatar: "",
      rating: 0,
      reviews: 0,
      xp: 0,
      portfolio: [],
      skills: [],
      achievements: [],
      activity: [],
      xpLog: {},              // { "2026-11-03": 120 }
      challengeDoneOn: null,  // ISO date of last completed daily challenge
      challengeDates: [],
      contests: {},           // { contestId: { joinedAt, files: [names], submittedAt } }
      hosted: [],             // contests this user created as a client
      shortlist: [],          // creator ids
      courses: [],            // completed Academy course ids
      tickets: [],            // support tickets
      plan: "free",           // "free" | "pro"
    };
  }

  const Store = {
    XP_PER_LEVEL,

    async signUp(email, password, role) {
      email = email.trim().toLowerCase();
      const db = read();
      if (db.users[email]) throw new Error("An account with this email already exists. Try logging in.");
      db.users[email] = { pass: await hash(password), profile: newProfile(email, "email", role) };
      db.session = email;
      write(db);
      return db.users[email].profile;
    },

    async signIn(email, password) {
      email = email.trim().toLowerCase();
      const db = read();
      const u = db.users[email];
      if (!u || u.pass !== (await hash(password))) throw new Error("Incorrect email or password.");
      db.session = email;
      write(db);
      return u.profile;
    },

    /** Stand-in for an OAuth redirect: creates/loads a demo account for the provider. */
    socialSignIn(provider) {
      const email = `demo.${provider}@creotask.dev`;
      const db = read();
      if (!db.users[email]) {
        const p = newProfile(email, provider);
        p.name = "Ansh Vasisth";
        p.rating = 4.8;
        p.reviews = 30;
        db.users[email] = { pass: null, profile: p };
      }
      db.session = email;
      write(db);
      return db.users[email].profile;
    },

    signOut() { const db = read(); db.session = null; write(db); },

    current() {
      const db = read();
      return db.session && db.users[db.session] ? Store.migrate(db.users[db.session].profile) : null;
    },

    /** Mutate the current profile via a callback and persist it. */
    update(fn) {
      const db = read();
      const u = db.users[db.session];
      if (!u) return null;
      Store.migrate(u.profile);
      fn(u.profile);
      if (!safe.set(KEY, JSON.stringify(db))) throw new Error("Storage is full — try a smaller image.");
      return u.profile;
    },

    /** Grant (or remove, if negative) XP and record it in the activity feed. */
    award(p, amount, label) {
      const t = Store.today();
      p.xp = Math.max(0, p.xp + amount);
      p.xpLog[t] = Math.max(0, (p.xpLog[t] || 0) + amount);
      Store.log(p, label, amount);
    },
    log(p, label, xp) {
      p.activity.unshift({ at: Date.now(), label, xp: xp || 0 });
      p.activity = p.activity.slice(0, 50);
    },
    /** Fill in fields added after a profile was first saved. */
    migrate(p) {
      const d = newProfile(p.email, p.provider);
      Object.keys(d).forEach((k) => { if (p[k] === undefined) p[k] = d[k]; });
      return p;
    },

    level(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; },
    today() { return localDate(new Date()); },
  };

  function localDate(d) {
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  Store.localDate = localDate;

  /* ---------- UI helpers shared by both pages ---------- */
  const UI = {
    toast(msg, type) {
      let host = document.querySelector(".toast-host");
      if (!host) {
        host = document.createElement("div");
        host.className = "toast-host";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
      }
      const t = document.createElement("div");
      t.className = "toast" + (type ? " toast--" + type : "");
      t.textContent = msg;
      host.appendChild(t);
      while (host.children.length > 3) host.firstElementChild.remove();
      setTimeout(() => t.remove(), 3200);
    },

    openModal(el) {
      el.classList.add("is-open");
      el.setAttribute("aria-hidden", "false");
      el._lastFocus = document.activeElement;
      const f = el.querySelector("input, textarea, button:not(.modal__close)");
      if (f) setTimeout(() => f.focus(), 50);
    },
    closeModal(el) {
      el.classList.remove("is-open");
      el.setAttribute("aria-hidden", "true");
      if (el._lastFocus) el._lastFocus.focus();
    },
    /** Wire close buttons, backdrop clicks and Escape for every .modal on the page. */
    bindModals() {
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

    esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },

    initials(name) {
      return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    },
  };

  global.Store = Store;
  global.UI = UI;
})(window);
