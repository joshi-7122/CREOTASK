/* =========================================================
   CREOTASK — Your profile (PROF-01…05, AUTH-02 account security)
   All data comes from the API. Anything not built yet is said so
   plainly rather than simulated.
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = UI.esc;

  const state = { user: null, profile: null, completeness: null, tierInfo: null, meta: null, adminRole: null, sessions: [], shellReady: false };
  const isFreelancer = () => state.user?.active_role === "freelancer";

  const PROF_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert" };
  const ENGAGEMENT_LABEL = { one_off: "One-off projects", ongoing: "Ongoing work", either: "Either" };
  const CLIENT_TYPE_LABEL = {
    individual: "An individual", startup: "A startup", small_business: "A small business", enterprise: "A large company",
    agency: "An agency", nonprofit: "A non-profit", education: "An education institution",
  };
  const KYC_LABEL = { not_started: "Not started", pending: "In review", verified: "Verified", action_required: "Action needed" };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  function showFormError(form, err) {
    const el = form.querySelector("[data-error]") || form.querySelector(".ui-error");
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    if (err?.fields) {
      for (const name of Object.keys(err.fields)) {
        const input = form.elements[name];
        if (input && input.setAttribute) input.setAttribute("aria-invalid", "true");
      }
    }
    if (el) el.textContent = err ? err.message : "";
  }

  // ── Load ───────────────────────────────────────────────
  async function load() {
    $("loadError").hidden = true;
    let me;
    try { me = await CreoAPI.auth.me(); }
    catch (err) { $("loadErrorText").textContent = `Your profile didn't load. ${err.message}`; $("loadError").hidden = false; return false; }
    if (!me || !me.user) { location.replace("index.html?auth=signin"); return false; }
    Object.assign(state, { user: me.user, profile: me.profile, completeness: me.completeness, tierInfo: me.tier_info, adminRole: me.admin_role });
    if (!state.meta) { try { state.meta = await CreoAPI.meta(); } catch { state.meta = null; } }
    return true;
  }

  async function reload() {
    if (!(await load())) return;
    if (!state.shellReady) {
      Shell.init({ user: state.user, profile: state.profile, adminRole: state.adminRole, paymentsMode: state.meta?.policy?.payments_mode });
      state.shellReady = true;
    } else {
      Shell.refreshBanner(state.user);
    }
    render();
  }

  // ── Render ─────────────────────────────────────────────
  function render() {
    document.querySelectorAll("[data-role-only]").forEach((el) => { el.hidden = el.dataset.roleOnly !== state.user.active_role; });
    renderHead();
    renderCompleteness();
    renderAbout();
    renderReadiness();
    if (isFreelancer()) { renderPortfolio(); renderSkills(); renderTrack(); }
    else renderClient();
    renderPreferences();
    renderAccount();
  }

  function renderHead() {
    const p = state.profile || {};
    const name = p.display_name || state.user.email.split("@")[0];
    document.title = `${name} — CreoTask`;
    $("name").textContent = name;
    $("avatar").textContent = UI.initials(name);
    $("headline").textContent = isFreelancer() ? (p.headline || "") : (p.organization_name || "");
    const loc = [p.location_city, p.location_state].filter(Boolean).join(", ");
    $("location").textContent = loc || "No location added";
    $("rating").textContent = p.total_reviews > 0
      ? `Rated ${Number(p.avg_rating).toFixed(1)} from ${p.total_reviews} review${p.total_reviews === 1 ? "" : "s"}`
      : "No reviews yet";
    $("tierInline").innerHTML = isFreelancer()
      ? `<span class="ui-tier ui-tier--${esc(p.tier || "bronze")}">${esc(cap(p.tier || "bronze"))}</span>`
      : (p.verification_status === "verified" ? `<span class="ui-badge ui-badge--success ui-badge--dot">Verified client</span>` : "");
    const pct = state.completeness?.percent ?? 0;
    $("completePct").textContent = `${pct}%`;
    $("completeBar").setAttribute("aria-valuenow", String(pct));
    $("completeBar").firstElementChild.style.width = pct + "%";
  }

  function renderCompleteness() {
    const c = state.completeness;
    $("checklistCard").hidden = !c || c.complete;
    if (!c || c.complete) return;
    $("checklistSub").textContent = isFreelancer()
      ? "Clients compare evidence. These are the gaps they'll notice first."
      : "Freelancers decide whether to apply partly on this. These are the gaps they'll notice first.";
    $("completenessBody").innerHTML = `<ul class="ui-checklist">${c.missing.map((m) => `<li>${esc(m.label)}</li>`).join("")}</ul>`;
  }

  function renderAbout() {
    const p = state.profile || {};
    const el = $("about");
    if (p.bio) { el.textContent = p.bio; el.removeAttribute("data-empty"); }
    else {
      el.textContent = isFreelancer()
        ? "Add a short bio: what you do, who you do it for, and how you work."
        : "Describe your organisation and the kind of work you hire for.";
      el.setAttribute("data-empty", "");
    }
  }

  function renderReadiness() {
    const p = state.profile || {};
    const badge = $("readinessStatus");
    if (isFreelancer()) {
      const kyc = p.kyc_status || "not_started";
      $("readinessTitle").textContent = "Payout readiness";
      badge.textContent = `Identity: ${KYC_LABEL[kyc] || kyc}`;
      badge.className = "ui-badge " + (kyc === "verified" ? "ui-badge--success" : kyc === "action_required" ? "ui-badge--danger" : "");
      $("readinessText").textContent = kyc === "verified"
        ? "Your identity is verified. Payouts start once CreoTask's payment provider is approved."
        : "You'll verify your identity before your first payout. That opens once CreoTask's payment provider is approved. Until then, anything you're owed is held for you, never lost.";
    } else {
      const v = p.verification_status || "unverified";
      $("readinessTitle").textContent = "Client verification";
      badge.textContent = v === "verified" ? "Verified" : v === "pending" ? "In review" : "Not verified";
      badge.className = "ui-badge " + (v === "verified" ? "ui-badge--success" : "");
      $("readinessText").textContent = v === "verified"
        ? "Your client account is verified."
        : "You'll verify your account before funding your first project. That opens once CreoTask's payment provider is approved.";
    }
  }

  function portfolioRow(item) {
    const badges = [];
    if (item.status === "archived") badges.push(`<span class="ui-badge">Archived</span>`);
    if (item.is_confidential) badges.push(`<span class="ui-badge ui-badge--info">Confidential</span>`);
    else if (!item.rights_declared) badges.push(`<span class="ui-badge ui-badge--warning">Hidden until you confirm display rights</span>`);
    else if (item.status === "active") badges.push(`<span class="ui-badge ui-badge--success ui-badge--dot">Public</span>`);
    if (item.category) badges.push(`<span class="ui-badge">${esc(item.category)}</span>`);
    const id = esc(item.id);
    return `
      <li class="ui-row ${item.status === "archived" ? "ui-row--muted" : ""}">
        <div class="ui-row__main">
          <span class="ui-row__title">${esc(item.title)}</span>
          ${item.description ? `<span class="ui-row__meta">${esc(item.description)}</span>` : ""}
          ${item.skills_used?.length ? `<span class="ui-row__meta">Skills: ${esc(item.skills_used.join(", "))}</span>` : ""}
          ${item.external_url ? `<a class="pf-work__link" href="${esc(item.external_url)}" target="_blank" rel="noopener noreferrer">${esc(item.external_url)}</a>` : ""}
          <div class="pf-work__badges">${badges.join("")}</div>
        </div>
        <div class="ui-row__actions">
          ${item.status === "active"
            ? `<button class="ui-link-btn" data-edit-portfolio="${id}" type="button" aria-label="Edit ${esc(item.title)}">Edit</button>
               <button class="ui-link-btn ui-link-btn--muted" data-archive-portfolio="${id}" type="button" aria-label="Archive ${esc(item.title)}">Archive</button>`
            : `<button class="ui-link-btn" data-restore-portfolio="${id}" type="button" aria-label="Restore ${esc(item.title)}">Restore</button>`}
          <button class="ui-link-btn ui-link-btn--danger" data-delete-portfolio="${id}" type="button" aria-label="Remove ${esc(item.title)}">Remove</button>
        </div>
      </li>`;
  }

  function renderPortfolio() {
    const items = state.profile?.portfolio || [];
    const active = items.filter((i) => i.status === "active");
    const archived = items.filter((i) => i.status === "archived");
    const pub = active.filter((i) => i.is_public).length;
    const parts = [`${pub} public`];
    if (active.length - pub) parts.push(`${active.length - pub} private`);
    if (archived.length) parts.push(`${archived.length} archived`);
    $("portfolioCount").textContent = items.length ? parts.join(", ") : "Nothing added yet";
    const body = $("portfolioBody");
    if (!items.length) {
      body.innerHTML = `
        <div class="ui-empty">
          <span class="ui-empty__title">Add your first piece of work</span>
          <p>Paid, personal or practice work all count. Clients compare real samples, not just ratings.</p>
          <button class="ui-btn ui-btn--primary ui-btn--sm" data-action="add-project" type="button">Add work</button>
        </div>`;
      return;
    }
    body.innerHTML = `<ul class="ui-rows">${[...active, ...archived].map(portfolioRow).join("")}</ul>`;
  }

  function renderSkills() {
    const skills = state.profile?.skills || [];
    const body = $("skillsBody");
    if (!skills.length) {
      body.innerHTML = `
        <div class="ui-empty">
          <span class="ui-empty__title">Add the skills you want to be hired for</span>
          <p>Pick from the suggestions where you can, so clients searching for that skill find you.</p>
          <button class="ui-btn ui-btn--primary ui-btn--sm" data-action="add-skill" type="button">Add skill</button>
        </div>`;
      return;
    }
    const statusBadge = (s) => ({
      verified: `<span class="ui-badge ui-badge--success">Verified</span>`,
      pending_verification: `<span class="ui-badge ui-badge--warning">In review</span>`,
      rejected: `<span class="ui-badge ui-badge--danger">Not verified</span>`,
    }[s.verification_status] || `<span class="ui-badge">Self-declared</span>`);
    body.innerHTML = `<ul class="ui-rows">${skills.map((s) => `
      <li class="ui-row">
        <div class="ui-row__main">
          <span class="ui-row__title pf-skill__name">${esc(s.name)} ${statusBadge(s)}</span>
          <span class="ui-row__meta">${PROF_LABEL[s.proficiency] || esc(s.proficiency)}${s.years_exp ? `, ${s.years_exp} year${s.years_exp === 1 ? "" : "s"}` : ""}</span>
        </div>
        <div class="ui-row__actions">
          ${["self_declared", "rejected"].includes(s.verification_status)
            ? `<button class="ui-link-btn" data-verify-skill="${esc(s.id)}" data-skill-name="${esc(s.name)}" type="button">${s.verification_status === "rejected" ? "Send new evidence" : "Get verified"}</button>` : ""}
          ${s.verification_status === "self_declared"
            ? `<button class="ui-link-btn ui-link-btn--danger" data-delete-skill="${esc(s.id)}" type="button" aria-label="Remove ${esc(s.name)}">Remove</button>` : ""}
        </div>
      </li>`).join("")}</ul>`;
  }

  function renderTrack() {
    const p = state.profile || {};
    const t = state.tierInfo || {};
    const unmet = t.unmet_criteria || [];
    $("trackBody").innerHTML = `
      <div class="pf-stats">
        <div><b class="ui-num">${p.total_projects_completed || 0}</b><span>Paid projects</span></div>
        <div><b class="ui-num">${p.total_unique_clients || 0}</b><span>Clients</span></div>
        <div><b class="ui-num">${p.total_projects_completed ? Math.round((p.on_time_rate ?? 1) * 100) + "%" : "—"}</b><span>On time</span></div>
      </div>
      <div class="pf-next">
        ${t.next_tier
          ? `<p class="ui-small">To reach <span class="ui-tier ui-tier--${esc(t.next_tier)}">${esc(cap(t.next_tier))}</span></p>
             <ul class="ui-checklist">${unmet.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>`
          : `<p class="ui-small">You're at the highest tier.</p>`}
        <p class="ui-xs ui-text-3">No history yet counts as neutral, not negative. Thresholds are pilot values and may change before launch.</p>
      </div>`;
  }

  function renderClient() {
    const p = state.profile || {};
    $("clientBody").innerHTML = `
      <dl class="ui-kv">
        <dt>Who's hiring</dt><dd>${esc(CLIENT_TYPE_LABEL[p.organization_type] || "Not set")}</dd>
        <dt>Organisation</dt><dd>${esc(p.organization_name || "Not set")}</dd>
        <dt>Website</dt><dd>${p.website_url ? `<a href="${esc(p.website_url)}" target="_blank" rel="noopener noreferrer">${esc(p.website_url)}</a>` : "Not set"}</dd>
        <dt>Projects posted</dt><dd class="ui-num">${p.total_projects_posted || 0}</dd>
      </dl>`;
  }

  // ── Preferences (PROF-04) ──────────────────────────────
  function timezoneOptions(selected) {
    let zones = [];
    try { zones = Intl.supportedValuesOf("timeZone"); } catch { zones = ["Asia/Kolkata", "UTC"]; }
    if (selected && !zones.includes(selected)) zones.unshift(selected);
    return zones.map((z) => `<option value="${esc(z)}" ${z === selected ? "selected" : ""}>${esc(z.replace(/_/g, " "))}</option>`).join("");
  }

  function urlField(name, label, value) {
    return `<div class="ui-field"><label class="ui-label" for="pref-${name}">${label} <span class="ui-optional">(optional)</span></label>
      <input class="ui-input" id="pref-${name}" name="${name}" type="url" placeholder="https://" value="${esc(value || "")}" /></div>`;
  }

  function renderPreferences() {
    const p = state.profile || {};
    const form = $("prefsForm");
    const tz = `<div class="ui-field"><label class="ui-label" for="pref-tz">Timezone</label><select class="ui-select" id="pref-tz" name="timezone">${timezoneOptions(p.timezone)}</select><p class="ui-hint">Deadlines and messages are shown in this timezone.</p></div>`;
    const actions = `<p class="ui-error" data-error role="alert"></p><div class="ui-cluster" style="justify-content:flex-end"><button class="ui-btn ui-btn--primary" type="submit">Save preferences</button></div>`;
    if (!isFreelancer()) {
      $("staleNote").hidden = true;
      $("prefsSub").textContent = "Used to show deadlines and messages at the right local time.";
      form.innerHTML = tz + actions;
      return;
    }
    $("staleNote").hidden = !p.availability_stale;
    const cats = state.meta?.categories || [];
    const mine = p.work_categories || [];
    const max = state.meta?.policy?.max_work_categories || 5;
    form.innerHTML = `
      <div class="ui-row-2">
        <div class="ui-field"><label class="ui-label" for="pref-avail">Availability</label>
          <select class="ui-select" id="pref-avail" name="availability">
            ${["available", "limited", "unavailable"].map((a) => `<option value="${a}" ${p.availability === a ? "selected" : ""}>${cap(a)}</option>`).join("")}
          </select>
          <p class="ui-hint">Last confirmed ${fmtDate(p.availability_updated_at)}.</p>
        </div>
        <div class="ui-field"><label class="ui-label" for="pref-cap">Hours per week <span class="ui-optional">(optional)</span></label>
          <input class="ui-input" id="pref-cap" name="weekly_capacity_hours" type="number" min="1" max="80" value="${p.weekly_capacity_hours ?? ""}" />
        </div>
      </div>
      <fieldset class="ui-chips" aria-describedby="catHint">
        <legend class="ui-label">Work categories, up to ${max}</legend>
        ${cats.map((c) => `<label class="ui-chip"><input type="checkbox" name="work_categories" value="${esc(c)}" ${mine.includes(c) ? "checked" : ""} /><span>${esc(c)}</span></label>`).join("")}
      </fieldset>
      <p class="ui-hint" id="catHint">Launch categories are still being chosen, so this list may get shorter.</p>
      <div class="ui-row-2">
        <div class="ui-field"><label class="ui-label" for="pref-eng">Preferred engagement</label>
          <select class="ui-select" id="pref-eng" name="engagement_preference">
            ${Object.entries(ENGAGEMENT_LABEL).map(([k, v]) => `<option value="${k}" ${p.engagement_preference === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        ${tz}
      </div>
      <div class="ui-row-2">${urlField("portfolio_url", "Portfolio site", p.portfolio_url)}${urlField("linkedin_url", "LinkedIn", p.linkedin_url)}</div>
      <div class="ui-row-2">${urlField("github_url", "GitHub", p.github_url)}${urlField("website_url", "Website", p.website_url)}</div>
      <label class="ui-check"><input type="checkbox" name="hidden_profile" ${p.public_visibility === "hidden" ? "checked" : ""} />
        <span><b>Hide my profile</b> from search and public view.</span></label>
      ${actions}`;
  }

  function prefsPayload(form) {
    if (!isFreelancer()) return { timezone: form.timezone.value };
    const urlOrNull = (v) => (v.trim() ? v.trim() : null);
    return {
      availability: form.availability.value,
      weekly_capacity_hours: form.weekly_capacity_hours.value ? Number(form.weekly_capacity_hours.value) : null,
      work_categories: [...form.querySelectorAll('input[name="work_categories"]:checked')].map((i) => i.value),
      engagement_preference: form.engagement_preference.value,
      timezone: form.timezone.value,
      portfolio_url: urlOrNull(form.portfolio_url.value),
      linkedin_url: urlOrNull(form.linkedin_url.value),
      github_url: urlOrNull(form.github_url.value),
      website_url: urlOrNull(form.website_url.value),
      public_visibility: form.hidden_profile.checked ? "hidden" : "public",
    };
  }

  // ── Account (AUTH-02) ──────────────────────────────────
  function renderAccount() {
    const u = state.user;
    const roles = (u.roles || []).map(cap);
    const other = u.active_role === "freelancer" ? "client" : "freelancer";
    $("accountBody").innerHTML = `
      <dl class="ui-kv">
        <dt>Email</dt><dd>${esc(u.email)}</dd>
        <dt>Email status</dt><dd>${u.email_verified
          ? `<span class="ui-badge ui-badge--success">Verified ${fmtDate(u.email_verified_at)}</span>`
          : `<span class="ui-badge ui-badge--warning">Not verified</span> <button class="ui-link-btn" type="button" data-action="resend-verify">Resend link</button>`}</dd>
        <dt>Your roles</dt><dd>${esc(roles.join(" and ") || "None")}</dd>
        <dt>Working as</dt><dd>${cap(u.active_role)} <button class="ui-link-btn" type="button" data-action="switch-role">Switch to ${other}</button></dd>
        <dt>Member since</dt><dd>${fmtDate(u.created_at)}</dd>
      </dl>`;
    loadSessions();
  }

  function describeAgent(ua) {
    if (!ua) return "Unknown device";
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /node|undici|curl/i.test(ua) ? "Script or API client" : "Browser";
    const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} on ${os}` : browser;
  }

  async function loadSessions() {
    const body = $("sessionsBody");
    try { state.sessions = (await CreoAPI.auth.sessions()).sessions || []; }
    catch (err) { body.innerHTML = `<p class="ui-error">${esc(err.message)}</p>`; return; }
    $("logoutAllBtn").disabled = !state.sessions.some((s) => !s.current);
    body.innerHTML = `<ul class="ui-rows">${state.sessions.map((s) => `
      <li class="ui-row">
        <div class="ui-row__main">
          <span class="ui-row__title">${esc(describeAgent(s.user_agent))} ${s.current ? `<span class="ui-badge ui-badge--accent">This device</span>` : ""}</span>
          <span class="ui-row__meta">Signed in ${fmtDateTime(s.created_at)}. Last active ${fmtDateTime(s.last_seen_at)}.</span>
        </div>
        ${s.current ? "" : `<div class="ui-row__actions"><button class="ui-link-btn ui-link-btn--danger" type="button" data-revoke-session="${esc(s.id)}">Sign out</button></div>`}
      </li>`).join("")}</ul>`;
  }

  // ── Dialogs ────────────────────────────────────────────
  function openProfileModal() {
    const p = state.profile || {};
    const f = $("profileForm");
    showFormError(f, null);
    f.querySelectorAll("[data-role-only]").forEach((el) => { el.hidden = el.dataset.roleOnly !== state.user.active_role; });
    f.display_name.value = p.display_name || "";
    f.headline.value = p.headline || "";
    f.location_city.value = p.location_city || "";
    f.location_state.value = p.location_state || "";
    f.bio.value = p.bio || "";
    const types = state.meta?.client_types || Object.keys(CLIENT_TYPE_LABEL);
    f.organization_type.innerHTML = `<option value="">Choose one</option>` + types.map((t) => `<option value="${t}" ${p.organization_type === t ? "selected" : ""}>${esc(CLIENT_TYPE_LABEL[t] || t)}</option>`).join("");
    f.organization_name.value = p.organization_name || "";
    f.website_url.value = p.website_url || "";
    $("bioLabel").textContent = isFreelancer() ? "Bio" : "About your organisation";
    $("bioHint").textContent = isFreelancer()
      ? "Aim for at least 80 characters: what you do, who for, and how you work."
      : "Aim for at least 40 characters: what you do and what you hire for.";
    UI.openModal($("profileModal"));
  }

  function openPortfolioModal(item) {
    const f = $("projectForm");
    f.reset();
    showFormError(f, null);
    f.category.innerHTML = `<option value="">None</option>` + (state.meta?.categories || []).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    $("projectTitle").textContent = item ? "Edit work" : "Add work";
    f.id.value = item?.id || "";
    if (item) {
      f.title.value = item.title || "";
      f.description.value = item.description || "";
      f.category.value = item.category || "";
      f.external_url.value = item.external_url || "";
      f.skills_used.value = (item.skills_used || []).join(", ");
      f.is_confidential.checked = !!item.is_confidential;
      f.rights_declared.checked = !!item.rights_declared;
    }
    syncRightsRow();
    UI.openModal($("projectModal"));
  }

  function syncRightsRow() {
    const f = $("projectForm");
    const conf = f.is_confidential.checked;
    $("rightsRow").setAttribute("aria-disabled", conf ? "true" : "false");
    f.rights_declared.disabled = conf;
  }

  let catalogTimer = null;
  function wireSkillSuggestions() {
    const input = $("skillForm").name;
    const list = $("skillSuggestions");
    const fill = async (q) => {
      try {
        const r = await CreoAPI.profiles.skillCatalog(q);
        list.innerHTML = r.skills.map((s) => `<option value="${esc(s.name)}">${esc(s.category)}</option>`).join("");
      } catch { /* suggestions are optional */ }
    };
    input.addEventListener("input", () => { clearTimeout(catalogTimer); catalogTimer = setTimeout(() => fill(input.value.trim()), 180); });
    fill("");
  }

  // ── Events ─────────────────────────────────────────────
  function bindTabs() {
    const tabs = [...document.querySelectorAll(".ui-tab")];
    const activate = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute("aria-controls"))?.classList.toggle("is-active", on);
      });
      if (focus) tab.focus();
      history.replaceState(null, "", tab.id === "tab-profile" ? location.pathname : `#${tab.id.slice(4)}`);
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        activate(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length], true);
      });
    });
    const start = tabs.find((t) => `#${t.id.slice(4)}` === location.hash);
    if (start) activate(start);
  }

  function on(id, ev, fn) { $(id).addEventListener(ev, fn); }

  function bindEvents() {
    bindTabs();
    wireSkillSuggestions();
    on("retryBtn", "click", reload);
    $("projectForm").is_confidential.addEventListener("change", syncRightsRow);

    on("profileForm", "submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const val = (v) => (v.trim() ? v.trim() : null);
      const payload = { display_name: f.display_name.value.trim(), location_city: val(f.location_city.value), location_state: val(f.location_state.value), bio: val(f.bio.value) };
      if (isFreelancer()) payload.headline = val(f.headline.value);
      else Object.assign(payload, { organization_type: f.organization_type.value || null, organization_name: val(f.organization_name.value), website_url: val(f.website_url.value) });
      await UI.busy(f.querySelector('[type="submit"]'), async () => {
        try {
          if (isFreelancer()) await CreoAPI.profiles.updateFreelancer(payload);
          else await CreoAPI.profiles.updateClient(payload);
          UI.closeModal($("profileModal"));
          UI.toast("Profile saved.", "success");
          await reload();
        } catch (err) { showFormError(f, err); }
      });
    });

    on("projectForm", "submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const itemId = f.id.value;
      const payload = {
        title: f.title.value.trim(),
        description: f.description.value.trim() || null,
        category: f.category.value || null,
        external_url: f.external_url.value.trim() || null,
        skills_used: f.skills_used.value.split(",").map((t) => t.trim()).filter(Boolean),
        is_confidential: f.is_confidential.checked,
        rights_declared: f.is_confidential.checked ? false : f.rights_declared.checked,
      };
      if (payload.title.length < 3) { showFormError(f, { message: "Add a title of at least 3 characters.", fields: { title: 1 } }); f.title.focus(); return; }
      if (!payload.is_confidential && !payload.rights_declared) {
        showFormError(f, { message: "Confirm you have the right to show this publicly, or keep it confidential.", fields: { rights_declared: 1 } });
        return;
      }
      await UI.busy($("projectSubmit"), async () => {
        try {
          if (itemId) await CreoAPI.profiles.updatePortfolio(itemId, payload);
          else await CreoAPI.profiles.addPortfolio(payload);
          UI.closeModal($("projectModal"));
          UI.toast(itemId ? "Work updated." : "Work added.", "success");
          await reload();
        } catch (err) { showFormError(f, err); }
      });
    });

    on("skillForm", "submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      await UI.busy(f.querySelector('[type="submit"]'), async () => {
        try {
          const r = await CreoAPI.profiles.addSkill({ name: f.name.value.trim(), proficiency: f.proficiency.value, years_exp: f.years_exp.value ? Number(f.years_exp.value) : undefined });
          UI.closeModal($("skillModal"));
          UI.toast(r.mapped_to_catalog ? `${r.skill.name} added.` : `${r.skill.name} added. It isn't in our skill list yet, so fewer clients may find it.`, "success");
          await reload();
        } catch (err) { showFormError(f, err); }
      });
    });

    on("evidenceForm", "submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const links = f.external_links.value.split(/\s+/).map((l) => l.trim()).filter(Boolean);
      await UI.busy(f.querySelector('[type="submit"]'), async () => {
        try {
          const r = await CreoAPI.profiles.verifySkill(f.skill_id.value, { evidence_note: f.evidence_note.value.trim(), external_links: links });
          UI.closeModal($("evidenceModal"));
          UI.toast(r.message, "success");
          await reload();
        } catch (err) { showFormError(f, err); }
      });
    });

    on("prefsForm", "submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const payload = prefsPayload(f);
      const max = state.meta?.policy?.max_work_categories || 5;
      if (payload.work_categories && payload.work_categories.length > max) { showFormError(f, { message: `Choose up to ${max} categories.` }); return; }
      await UI.busy(f.querySelector('[type="submit"]'), async () => {
        try {
          if (isFreelancer()) await CreoAPI.profiles.updateFreelancer(payload);
          else await CreoAPI.profiles.updateClient(payload);
          UI.toast("Preferences saved.", "success");
          await reload();
        } catch (err) { showFormError(f, err); }
      });
    });

    on("confirmAvailBtn", "click", (e) => UI.busy(e.target, async () => {
      try { await CreoAPI.profiles.updateFreelancer({ availability: state.profile.availability }); UI.toast("Availability confirmed.", "success"); await reload(); }
      catch (err) { UI.toast(err.message, "error"); }
    }));

    on("passwordForm", "submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      $("passwordError").textContent = "";
      await UI.busy(f.querySelector('[type="submit"]'), async () => {
        try { const r = await CreoAPI.auth.changePassword(f.current_password.value, f.new_password.value); f.reset(); UI.toast(r.message, "success"); loadSessions(); }
        catch (err) { $("passwordError").textContent = err.message; }
      });
    });

    on("logoutAllBtn", "click", (e) => UI.busy(e.target, async () => {
      try { UI.toast((await CreoAPI.auth.logoutAll()).message, "success"); loadSessions(); }
      catch (err) { UI.toast(err.message, "error"); }
    }));

    document.addEventListener("click", async (e) => {
      const t = e.target.closest("#profileMain button, #profileMain a");
      if (!t) return;
      const d = t.dataset;
      const run = (fn, ok) => UI.busy(t, async () => { try { await fn(); if (ok) UI.toast(ok); await reload(); } catch (err) { UI.toast(err.message, "error"); } });

      if (d.action === "add-skill") { $("skillForm").reset(); showFormError($("skillForm"), null); UI.openModal($("skillModal")); }
      if (d.action === "add-project") openPortfolioModal(null);
      if (d.action === "edit-profile") openProfileModal();
      if (d.action === "resend-verify") {
        await UI.busy(t, async () => {
          try { await CreoAPI.auth.resendVerification(state.user.email); UI.toast(`We've sent a new verification link to ${state.user.email}. Older links no longer work.`, "success"); }
          catch (err) { UI.toast(err.message, "error"); }
        });
      }
      if (d.action === "switch-role") {
        const next = state.user.active_role === "freelancer" ? "client" : "freelancer";
        await UI.busy(t, async () => {
          try { await CreoAPI.auth.switchRole(next); location.reload(); }
          catch (err) { UI.toast(err.message, "error"); }
        });
      }
      if (d.editPortfolio) openPortfolioModal((state.profile.portfolio || []).find((i) => i.id === d.editPortfolio));
      if (d.archivePortfolio) run(() => CreoAPI.profiles.archivePortfolio(d.archivePortfolio), "Archived. It's no longer shown publicly.");
      if (d.restorePortfolio) run(() => CreoAPI.profiles.restorePortfolio(d.restorePortfolio), "Restored.");
      if (d.deletePortfolio) {
        if (!confirm("Remove this work permanently? Archive it instead if you might want it back.")) return;
        run(() => CreoAPI.profiles.deletePortfolio(d.deletePortfolio), "Work removed.");
      }
      if (d.deleteSkill) {
        if (!confirm("Remove this skill from your profile?")) return;
        run(() => CreoAPI.profiles.deleteSkill(d.deleteSkill), "Skill removed.");
      }
      if (d.verifySkill) {
        const f = $("evidenceForm");
        f.reset(); showFormError(f, null);
        f.skill_id.value = d.verifySkill;
        $("evidenceTitle").textContent = `Get ${d.skillName || "this skill"} verified`;
        UI.openModal($("evidenceModal"));
      }
      if (d.revokeSession) {
        await UI.busy(t, async () => {
          try { await CreoAPI.auth.revokeSession(d.revokeSession); UI.toast("Device signed out."); loadSessions(); }
          catch (err) { UI.toast(err.message, "error"); }
        });
      }
    });
  }

  async function init() {
    UI.bindModals();
    bindEvents();
    await reload();
  }

  init();
})();
