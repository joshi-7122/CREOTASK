/* Landing page: header state + Sign Up / Login modal */
(function () {
  "use strict";

  const modal = document.getElementById("authModal");
  const form = document.getElementById("authForm");
  const errorEl = document.getElementById("authError");
  const submitBtn = document.getElementById("authSubmit");
  const switchEl = document.getElementById("authSwitch");
  let mode = "signup";

  document.getElementById("year").textContent = new Date().getFullYear();
  UI.bindModals();

  // Signed-in visitors get a shortcut to their dashboard instead of auth buttons.
  const me = Store.current();
  if (me) {
    document.getElementById("headerActions").innerHTML =
      `<a class="btn btn--light" href="app.html">Open CREOTASK</a>`;
  }

  function setMode(m) {
    mode = m;
    submitBtn.textContent = m === "signup" ? "Sign Up" : "Log In";
    form.password.autocomplete = m === "signup" ? "new-password" : "current-password";
    switchEl.innerHTML = m === "signup"
      ? `Already have an account? <button type="button" data-mode="signin">Log in</button>`
      : `New to CREOTASK? <button type="button" data-mode="signup">Create an account</button>`;
    errorEl.textContent = "";
    document.getElementById("roleToggle").hidden = m !== "signup";
  }

  function open(m) {
    if (Store.current()) { location.href = "app.html"; return; }
    setMode(m);
    UI.openModal(modal);
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-auth]");
    if (trigger) open(trigger.dataset.auth);
    const sw = e.target.closest("[data-mode]");
    if (sw) setMode(sw.dataset.mode);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = "Enter a valid email address."; return; }
    if (password.length < 6) { errorEl.textContent = "Password must be at least 6 characters."; return; }

    submitBtn.disabled = true;
    try {
      if (mode === "signup") await Store.signUp(email, password, form.role.value);
      else await Store.signIn(email, password);
      location.href = "app.html";
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  form.querySelectorAll("[data-provider]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.provider;
      UI.toast(`Signing in with ${p[0].toUpperCase() + p.slice(1)} (demo account)…`);
      Store.socialSignIn(p);
      setTimeout(() => (location.href = "app.html"), 600);
    });
  });

  document.getElementById("forgotBtn").addEventListener("click", () => {
    const email = form.email.value.trim();
    UI.toast(email ? `If ${email} is registered, a reset link is on its way.` : "Enter your email first, then tap Forgot password.");
  });

  // Deep link: index.html?auth=signin opens the modal directly.
  const q = new URLSearchParams(location.search).get("auth");
  if (q === "signin" || q === "signup") open(q);
})();
