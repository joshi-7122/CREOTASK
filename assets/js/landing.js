/* Landing page: header state + Sign Up / Login modal */
(function () {
  "use strict";

  const modal = document.getElementById("authModal");
  const form = document.getElementById("authForm");
  const errorEl = document.getElementById("authError");
  const noticeEl = document.getElementById("authNotice");
  const submitBtn = document.getElementById("authSubmit");
  const switchEl = document.getElementById("authSwitch");
  const ageRow = document.getElementById("ageConfirmRow");
  let mode = "signup";
  let minAge = 18;

  document.getElementById("year").textContent = new Date().getFullYear();
  UI.bindModals();

  // The intro animation lives in intro.js.

  // Signed-in visitors get a shortcut into the app instead of auth buttons.
  if (Store.current()) {
    document.getElementById("headerActions").innerHTML =
      `<a class="ui-btn ui-btn--sm lp-dock__cta" href="app.html">Go to your dashboard</a>`;
    const drawerActions = document.getElementById("drawerActions");
    if (drawerActions) drawerActions.innerHTML = `<a class="ui-btn lp-dock__cta" href="app.html">Go to your dashboard</a>`;
    // Sign-up shortcuts in the Explore menu make no sense once signed in.
    document.querySelectorAll("[data-guest]").forEach((el) => el.remove());
  }

  const pwInput = document.getElementById("authPassword");
  const pwToggle = document.getElementById("pwToggle");
  pwToggle.addEventListener("click", () => {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.textContent = show ? "Hide" : "Show";
    pwToggle.setAttribute("aria-pressed", String(show));
  });

  // Server-provided policy (min age) and environment (demo picker is development-only).
  CreoAPI.meta().then((meta) => {
    minAge = meta.policy.min_account_age;
    document.getElementById("minAgeLabel").textContent = String(minAge);
    if (meta.env === "development") document.getElementById("demoPersonas").hidden = false;
  }).catch(() => { /* fall back to defaults; server will still enforce */ });

  function showNotice(html, tone = "danger") {
    noticeEl.innerHTML = html ? `<div>${html}</div>` : "";
    noticeEl.className = `ui-alert ui-alert--${tone}`;
    noticeEl.hidden = !html;
  }

  function showSuspension(s) {
    s = s || {};
    showNotice(`<b>Your account is suspended.</b><br>
      Reason: ${UI.esc(s.reason_label || "Policy reason")}.<br>
      ${UI.esc(s.appeal?.instructions || "Contact CreoTask support to appeal.")}`);
  }

  function setMode(m) {
    mode = m;
    const signup = m === "signup";
    document.getElementById("authTitle").textContent = signup ? "Create your account" : "Log in";
    document.getElementById("authSub").textContent = signup
      ? "Freelancers and clients use the same account. You can add the other role later."
      : "Welcome back.";
    submitBtn.textContent = signup ? "Create account" : "Log in";
    form.password.autocomplete = signup ? "new-password" : "current-password";
    switchEl.innerHTML = signup
      ? `Already have an account? <button class="ui-link-btn" type="button" data-mode="signin">Log in</button>`
      : `New to CreoTask? <button class="ui-link-btn" type="button" data-mode="signup">Create an account</button>`;
    errorEl.textContent = "";
    document.getElementById("roleToggle").hidden = !signup;
    document.getElementById("pwRule").hidden = !signup;
    document.getElementById("authNote").hidden = !signup;
    document.getElementById("authPilot").hidden = !signup;
    ageRow.hidden = !signup;
  }

  function open(m, role) {
    if (Store.current()) { location.href = "app.html"; return; }
    setMode(m);
    if (role) { const r = form.querySelector(`input[name="role"][value="${role}"]`); if (r) r.checked = true; }
    UI.openModal(modal);
    setTimeout(() => form.email.focus(), 40);
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-auth]");
    if (trigger) { showNotice(""); open(trigger.dataset.auth, trigger.dataset.role); }
    const sw = e.target.closest("[data-mode]");
    if (sw) setMode(sw.dataset.mode);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    errorEl.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = "Enter a valid email address."; return; }
    if (mode === "signup") {
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        errorEl.textContent = "Use at least 8 characters, including a letter and a number.";
        return;
      }
      if (!form.age_confirmed.checked) {
        errorEl.textContent = `You must be at least ${minAge} to create an account.`;
        form.age_confirmed.focus();
        return;
      }
    } else if (!password) {
      errorEl.textContent = "Enter your password."; return;
    }

    submitBtn.disabled = true;
    submitBtn.setAttribute("aria-busy", "true");
    try {
      if (mode === "signup") {
        await Store.signUp(email, password, form.role.value, undefined, true);
        UI.toast("Account created. We've sent a verification link to your email.", "success");
      } else {
        await Store.signIn(email, password);
      }
      setTimeout(() => (location.href = "app.html"), 400);
    } catch (err) {
      if (err.code === "ACCOUNT_SUSPENDED") showSuspension(err.data?.suspension);
      else errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("aria-busy");
    }
  });

  // Development-only demo accounts (panel is hidden unless the server is in development).
  form.querySelectorAll("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await Store.signIn(btn.dataset.demo, "Test@1234");
        location.href = "app.html";
      } catch (err) {
        UI.toast(err.message + " (Run `npm run db:seed` to create demo accounts.)", "error");
      }
    });
  });

  document.getElementById("forgotBtn").addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) {
      UI.toast("Enter your email address first, then choose Forgot password.");
      form.email.focus();
      return;
    }
    try {
      const r = await CreoAPI.auth.forgotPassword(email);
      UI.toast(r.message);
    } catch (err) {
      UI.toast(err.message, "error");
    }
  });

  // Deep links: index.html?auth=signin[&reason=session|suspended]
  const params = new URLSearchParams(location.search);
  const q = params.get("auth");
  if (q === "signin" || q === "signup") {
    open(q);
    const reason = params.get("reason");
    if (reason === "session") showNotice("<b>You've been signed out.</b> Your session ended. Log in again to continue.", "info");
    if (reason === "suspended") {
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem("creotask_suspension") || "null"); } catch {}
      showSuspension(s);
    }
  }
})();
