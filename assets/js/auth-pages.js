/* Verify-email and reset-password pages. Reads the one-time token from the URL. */
(function () {
  "use strict";
  const page = document.querySelector("[data-page]")?.dataset.page;
  const token = new URLSearchParams(location.search).get("token");
  const $ = (id) => document.getElementById(id);

  async function post(path, body) {
    const res = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || "Something went wrong. Try again."); e.code = data.code; throw e; }
    return data;
  }
  function show(id) { ["stateLoading", "stateSuccess", "stateError"].forEach((s) => { if ($(s)) $(s).hidden = s !== id; }); }

  if (page === "verify") {
    // Already signed in? Send them into the app; otherwise to log in.
    let signedIn = false;
    try { signedIn = !!localStorage.getItem("creotask_jwt_token"); } catch {}
    $("continueLink").href = signedIn ? "/app.html" : "/index.html?auth=signin";
    $("continueLink").textContent = signedIn ? "Continue to CreoTask" : "Log in";

    if (!token) { $("errorMessage").textContent = "This link is missing its verification code."; show("stateError"); }
    else post("/auth/verify-email", { token }).then(() => show("stateSuccess")).catch((e) => { $("errorMessage").textContent = e.message; show("stateError"); });

    $("resendForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      try { $("resendResult").textContent = (await post("/auth/resend-verification", { email: $("resendEmail").value.trim() })).message; }
      catch (err) { $("resendResult").textContent = err.message; }
      finally { btn.disabled = false; }
    });
  }

  if (page === "reset") {
    const form = $("resetForm"), err = $("formError"), btn = $("submitBtn");
    form.addEventListener("input", (e) => { e.target.removeAttribute("aria-invalid"); err.textContent = ""; });
    if (!token) { form.hidden = true; err.textContent = ""; $("stateForm").innerHTML = `<h1 class="ui-h2">This link isn't complete</h1><p class="ui-text-2">Open the most recent password reset email and use its link, or request a new one from the log-in screen.</p><a class="ui-btn" href="/index.html?auth=signin">Back to log in</a>`; return; }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const p1 = $("password").value, p2 = $("confirmPassword").value;
      if (p1.length < 8 || !/[A-Za-z]/.test(p1) || !/[0-9]/.test(p1)) { err.textContent = "Use at least 8 characters, including a letter and a number."; $("password").setAttribute("aria-invalid", "true"); return; }
      if (p1 !== p2) { err.textContent = "The two passwords don't match."; $("confirmPassword").setAttribute("aria-invalid", "true"); return; }
      btn.disabled = true; btn.setAttribute("aria-busy", "true");
      try {
        await post("/auth/reset-password", { token, password: p1 });
        try { localStorage.removeItem("creotask_jwt_token"); localStorage.removeItem("creotask_cached_user"); } catch {}
        form.hidden = true; $("stateForm").hidden = true; $("stateSuccess").hidden = false;
      } catch (ex) { err.textContent = ex.message; }
      finally { btn.disabled = false; btn.removeAttribute("aria-busy"); }
    });
  }
})();
