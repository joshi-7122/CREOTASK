/* =========================================================
   CREOTASK — Main App Router & Interactive Modules
   Implements PRD v1.2 / v2.0 direct-project marketplace,
   milestones, workspace, role switching, tier system,
   offers, and operations console.
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const view = $("view");
  const esc = UI.esc;
  const inr = (p, isPaise = true) => UI.formatINR(p, isPaise);

  let currentUser = null;
  let currentProfile = null;
  let userAdminRole = null;
  let paymentsMode = "disabled";

  // ── Init & Auth Check ─────────────────────────────────────
  async function init() {
    UI.bindModals();
    const meData = await CreoAPI.auth.me();
    if (!meData || !meData.user) {
      window.location.replace("index.html?auth=signin");
      return;
    }
    currentUser = meData.user;
    currentProfile = meData.profile;
    userAdminRole = meData.admin_role;
    try { paymentsMode = (await CreoAPI.meta()).policy.payments_mode; } catch {}

    Shell.init({ user: currentUser, profile: currentProfile, adminRole: userAdminRole, paymentsMode, onTierClick: showTierModal });
    bindPostProjectEvents();

    // Route listener
    window.addEventListener("hashchange", handleRoute);
    if (!location.hash) {
      location.hash = currentUser.active_role === "client" ? "#my-projects" : "#projects";
    } else {
      handleRoute();
    }

  }

  // ── Router ────────────────────────────────────────────────
  async function handleRoute() {
    const hash = location.hash.slice(1) || (currentUser.active_role === "client" ? "my-projects" : "projects");
    const [route, param] = hash.split("/");
    Shell.setActive(route);

    view.setAttribute("aria-busy", "true");
    view.innerHTML = `<div class="ui-stack" aria-label="Loading"><span class="ui-skeleton ui-skeleton--line" style="width:40%;height:28px"></span><span class="ui-skeleton ui-skeleton--block"></span><span class="ui-skeleton ui-skeleton--block"></span></div>`;

    try {
      switch (route) {
        case "projects":
          await viewProjects();
          break;
        case "my-projects":
          await viewMyProjects();
          break;
        case "applications":
          await viewMyApplications();
          break;
        case "workspace":
          await viewWorkspaces(param);
          break;
        case "explore":
          await viewExplore();
          break;
        case "tiers":
          await viewTiersGuide();
          break;
        case "ledger":
          await viewLedger();
          break;
        case "admin":
          await viewAdmin();
          break;
        default:
          location.hash = currentUser.active_role === "client" ? "#my-projects" : "#projects";
      }
    } catch (err) {
      view.innerHTML = `<div class="ui-alert ui-alert--danger" role="alert"><span><b>This page didn't load.</b> ${esc(err.message)}</span><button class="ui-btn ui-btn--sm" type="button" onclick="location.reload()">Try again</button></div>`;
    } finally {
      view.removeAttribute("aria-busy");
    }
  }

  // ── View: Browse Projects (Freelancer / Public) ───────────
  async function viewProjects() {
    const isClient = currentUser.active_role === "client";
    const res = await CreoAPI.projects.browse();

    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Direct Project Marketplace</h1>
          <p class="view-sub">Fixed-price projects split into milestones. Apply to the ones that match your skills.</p>
        </div>
        ${isClient ? `<button class="btn btn--gold" id="openPostModalBtn">+ Post a Project</button>` : ''}
      </div>

      <div class="filters">
        <input class="input" id="searchProjectsInput" placeholder="Search by skill, title, keyword..." style="max-width:320px" />
        <select class="select" id="catFilter">
          <option value="">All Categories</option>
          ${res.categories.map(c => `<option value="${c}">${c}</option>`).join("")}
        </select>
        <button class="chip-btn" id="creostartFilterBtn" aria-pressed="false">★ CreoStart Only (Newcomer Friendly)</button>
      </div>

      <div id="projectsGrid" class="grid grid--3">
        ${renderProjectCards(res.data)}
      </div>
    `;

    if (isClient) {
      $("openPostModalBtn")?.addEventListener("click", () => UI.openModal($("postProjectModal")));
    }

    // Filter handlers
    let currentCreostart = false;
    const filterProjects = async () => {
      const q = $("searchProjectsInput").value.trim();
      const category = $("catFilter").value;
      const params = {};
      if (q) params.q = q;
      if (category) params.category = category;
      if (currentCreostart) params.creostart = "true";

      const filtered = await CreoAPI.projects.browse(params);
      $("projectsGrid").innerHTML = renderProjectCards(filtered.data);
      bindProjectCardClicks();
    };

    $("searchProjectsInput").addEventListener("input", debounce(filterProjects, 300));
    $("catFilter").addEventListener("change", filterProjects);
    $("creostartFilterBtn").addEventListener("click", function () {
      currentCreostart = !currentCreostart;
      this.setAttribute("aria-pressed", currentCreostart);
      filterProjects();
    });

    bindProjectCardClicks();
  }

  function renderProjectCards(projects) {
    if (!projects || !projects.length) {
      return `<div class="empty-note" style="grid-column:1/-1">No projects found matching the criteria.</div>`;
    }
    return projects.map(p => `
      <article class="proj-card" data-project-id="${p.id}">
        <div class="proj-card__header">
          <span class="pill">${esc(p.category)}</span>
          ${p.is_creostart ? `<span class="badge-status badge-status--creostart">★ CreoStart</span>` : ''}
        </div>
        <h3 class="proj-card__title">${esc(p.title)}</h3>
        <p class="proj-card__desc">${esc(p.description)}</p>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">
          ${(p.required_skills || []).slice(0, 3).map(s => `<span class="pill pill--gold">${esc(s)}</span>`).join("")}
        </div>

        <div class="proj-card__meta">
          <div class="proj-card__budget">
            ${inr(p.budget_paise)}
            <small>Fixed Budget</small>
          </div>
          <div style="text-align:right">
            <span class="muted" style="font-size:12px">${p.timeline_days ? p.timeline_days + ' days' : 'Flexible'}</span>
            <div style="font-size:11px;color:var(--muted)">${p.application_count || 0} applicants</div>
          </div>
        </div>
      </article>
    `).join("");
  }

  function bindProjectCardClicks() {
    document.querySelectorAll(".proj-card").forEach(el => {
      el.addEventListener("click", () => openProjectDetail(el.dataset.projectId));
    });
  }

  // ── Project Detail & Application Modal ────────────────────
  async function openProjectDetail(projectId) {
    const data = await CreoAPI.projects.get(projectId);
    const p = data.project;
    const isClient = currentUser.active_role === "client";
    const isOwner = p.client_id === currentUser.id;
    const hasApplied = !!data.myApplication;

    const modal = $("projectModal");
    const container = $("projectDetail");

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <span class="pill">${esc(p.category)}</span>
            ${p.is_creostart ? `<span class="badge-status badge-status--creostart">★ CreoStart Project</span>` : ''}
            <span class="badge-status badge-status--${p.status}">${p.status.toUpperCase()}</span>
          </div>
          <h2 style="margin:0 0 4px;font-size:24px">${esc(p.title)}</h2>
          <div class="muted" style="font-size:13px">Posted by <b>${esc(p.client_name)}</b> (${p.organization_name || 'Individual'})</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:26px;font-weight:700;color:var(--gold)">${inr(p.budget_paise)}</div>
          <div class="muted" style="font-size:12px">Fixed price · INR</div>
        </div>
      </div>

      <div class="tile" style="margin-bottom:16px">
        <h4 style="margin:0 0 8px;font-size:14px;color:var(--gold)">Project Scope & Brief</h4>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#e1e1e4">${esc(p.description)}</p>
      </div>

      ${p.deliverables ? `
        <div style="margin-bottom:14px">
          <b style="font-size:13px;color:var(--muted)">EXPECTED DELIVERABLES:</b>
          <p style="margin:4px 0 0;font-size:14px">${esc(p.deliverables)}</p>
        </div>
      ` : ''}

      ${p.acceptance_criteria ? `
        <div style="margin-bottom:14px">
          <b style="font-size:13px;color:var(--muted)">ACCEPTANCE CRITERIA:</b>
          <p style="margin:4px 0 0;font-size:14px">${esc(p.acceptance_criteria)}</p>
        </div>
      ` : ''}

      <div style="margin-bottom:16px">
        <b style="font-size:13px;color:var(--muted)">REQUIRED SKILLS:</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          ${(p.required_skills || []).map(s => `<span class="pill pill--gold" style="font-size:12px">${esc(s)}</span>`).join("")}
        </div>
      </div>

      <div style="margin-bottom:20px">
        <b style="font-size:13px;color:var(--muted)">MILESTONE SCHEDULE:</b>
        <div style="margin-top:8px" class="stack">
          ${(data.milestones || []).map((m, idx) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--surface-2);border-radius:var(--radius-sm);border:1px solid var(--line)">
              <div>
                <b>Milestone ${idx + 1}: ${esc(m.title)}</b>
                ${m.description ? `<p style="margin:2px 0 0;font-size:12px;color:var(--muted)">${esc(m.description)}</p>` : ''}
              </div>
              <div style="font-weight:600;color:var(--gold)">${inr(m.budget_paise)}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Action Area -->
      <div id="projectActionArea">
        ${isOwner ? `
          <div style="display:flex;gap:10px">
            <button class="btn btn--gold btn--block" id="viewAppsBtn">View Applicants (${p.application_count || 0})</button>
            ${p.status === 'draft' ? `<button class="btn btn--light" id="publishProjBtn">Publish Now</button>` : ''}
          </div>
        ` : !isClient ? `
          ${hasApplied ? `
            <div style="padding:14px;background:rgba(61,220,151,.1);border:1px solid var(--success);border-radius:var(--radius-sm);text-align:center">
              <span style="color:var(--success);font-weight:600">✓ Application Submitted (${data.myApplication.status.toUpperCase()})</span>
              <p style="margin:4px 0 0;font-size:12px;color:var(--muted)">The client will review your pitch and evidence.</p>
            </div>
          ` : `
            <form id="applyProjectForm" class="stack" style="gap:12px;background:var(--surface-2);padding:18px;border-radius:var(--radius-sm);border:1px solid var(--line-strong)">
              <h4 style="margin:0;font-size:15px;color:var(--gold)">Submit Your Application</h4>
              <label>
                <span class="label">Your Tailored Pitch (Highlight relevant experience & execution plan)</span>
                <textarea class="textarea" name="pitch" required placeholder="Explain why your skills match this brief and how you will deliver the milestones..." style="min-height:80px"></textarea>
              </label>
              <div class="row-2">
                <label><span class="label">Proposed Budget (₹ INR)</span><input class="input" type="number" name="budget" value="${p.budget_paise/100}" /></label>
                <label><span class="label">Estimated Days</span><input class="input" type="number" name="timeline" value="${p.timeline_days || 14}" /></label>
              </div>
              <p class="form-error" id="applyError"></p>
              <button class="btn btn--gold btn--block" type="submit">Submit Application</button>
            </form>
          `}
        ` : ''}
      </div>
    `;

    UI.openModal(modal);

    if (isOwner) {
      $("viewAppsBtn")?.addEventListener("click", () => {
        UI.closeModal(modal);
        openApplicationsModal(projectId, p.title);
      });
      $("publishProjBtn")?.addEventListener("click", async () => {
        await CreoAPI.projects.publish(projectId);
        UI.toast("Project published!", "success");
        UI.closeModal(modal);
        location.reload();
      });
    } else if (!isClient && !hasApplied) {
      const applyForm = $("applyProjectForm");
      applyForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = $("applyError");
        errEl.textContent = "";
        try {
          const pitch = applyForm.pitch.value;
          const budget = parseInt(applyForm.budget.value) * 100;
          const timeline = parseInt(applyForm.timeline.value);
          await CreoAPI.projects.apply(projectId, {
            pitch,
            proposed_budget_paise: budget,
            proposed_timeline_days: timeline
          });
          UI.toast("Application submitted successfully!", "success");
          UI.closeModal(modal);
          location.hash = "#applications";
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }
  }

  // ── View: My Projects (Client View) ───────────────────────
  async function viewMyProjects() {
    const res = await CreoAPI.projects.my();

    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">My Projects</h1>
          <p class="view-sub">Manage your briefs, review applicants, and track active contracts.</p>
        </div>
        <button class="btn btn--gold" id="openPostModalBtn">+ Post a Project</button>
      </div>

      <div class="grid grid--3">
        ${(!res.data || !res.data.length) ? `
          <div class="empty-note" style="grid-column:1/-1">
            <p>You haven't posted any projects yet.</p>
            <button class="btn btn--gold" onclick="document.getElementById('openPostModalBtn').click()">Create First Project</button>
          </div>
        ` : res.data.map(p => `
          <article class="proj-card" data-project-id="${p.id}">
            <div class="proj-card__header">
              <span class="pill">${esc(p.category)}</span>
              <span class="badge-status badge-status--${p.status}">${p.status.toUpperCase()}</span>
            </div>
            <h3 class="proj-card__title">${esc(p.title)}</h3>
            <p class="proj-card__desc">${esc(p.description)}</p>

            <div class="proj-card__meta">
              <div class="proj-card__budget">
                ${inr(p.budget_paise)}
                <small>Fixed Budget</small>
              </div>
              <div style="text-align:right">
                <button class="btn btn--sm btn--light" style="margin-bottom:4px" onclick="event.stopPropagation(); window.openApps('${p.id}', '${esc(p.title)}')">
                  Applicants (${p.application_count || 0})
                </button>
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    `;

    $("openPostModalBtn").addEventListener("click", () => UI.openModal($("postProjectModal")));
    bindProjectCardClicks();

    window.openApps = (projId, title) => openApplicationsModal(projId, title);
  }

  // ── Post Project Wizard Logic ─────────────────────────────
  function bindPostProjectEvents() {
    const list = $("milestonesList");
    let count = 0;

    const addMilestone = (title = "", budget = "") => {
      count++;
      const div = document.createElement("div");
      div.className = "row-2";
      div.style.alignItems = "center";
      div.innerHTML = `
        <input class="input" placeholder="Milestone ${count} Title" name="m_title_${count}" value="${title}" required />
        <div style="display:flex;gap:6px;align-items:center">
          <input class="input" type="number" placeholder="₹ Amount" name="m_budget_${count}" value="${budget}" required />
          <button type="button" class="remove" style="color:var(--danger)">&times;</button>
        </div>
      `;
      div.querySelector(".remove").addEventListener("click", () => div.remove());
      list.appendChild(div);
    };

    $("addMilestoneBtn")?.addEventListener("click", () => addMilestone());

    // Add initial milestone
    if (list && !list.children.length) {
      addMilestone("Milestone 1: Prototype / Initial Deliverable", "7500");
      addMilestone("Milestone 2: Final Acceptance & Source Code", "7500");
    }

    const form = $("postProjectForm");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = $("postProjectError");
      errEl.textContent = "";

      const title = form.title.value;
      const description = form.description.value;
      const category = form.category.value;
      const timeline_days = parseInt(form.timeline_days.value);
      const deliverables = form.deliverables.value;
      const acceptance_criteria = form.acceptance_criteria.value;
      const skills = form.skills.value.split(",").map(s => s.trim()).filter(Boolean);
      const is_creostart = form.is_creostart.checked;
      const budget = parseInt(form.budget.value) * 100; // to paise

      // Parse milestones
      const milestoneInputs = list.querySelectorAll(".row-2");
      const milestones = [];
      let totalM = 0;
      milestoneInputs.forEach(row => {
        const mTitle = row.querySelectorAll("input")[0].value.trim();
        const mBudget = parseInt(row.querySelectorAll("input")[1].value) * 100;
        totalM += mBudget;
        milestones.push({ title: mTitle, budget_paise: mBudget, timeline_days: Math.round(timeline_days / milestoneInputs.length) });
      });

      if (Math.abs(totalM - budget) > 100) {
        errEl.textContent = `Milestone amounts sum to ₹${totalM/100}, but project budget is ₹${budget/100}. They must match exactly.`;
        return;
      }

      try {
        const res = await CreoAPI.projects.create({
          title,
          description,
          category,
          timeline_days,
          deliverables,
          acceptance_criteria,
          required_skills: skills,
          is_creostart,
          budget_paise: budget,
          milestones
        });

        // Publish right away
        await CreoAPI.projects.publish(res.project.id);
        UI.toast("Project published to marketplace!", "success");
        UI.closeModal($("postProjectModal"));
        form.reset();
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  // ── Client Application Review & Comparison ────────────────
  async function openApplicationsModal(projectId, projectTitle) {
    const modal = $("applicationsModal");
    $("appsModalTitle").textContent = `Applicants for "${projectTitle}"`;

    const res = await CreoAPI.projects.listApplications(projectId);
    const body = $("appsModalBody");

    if (!res.data || !res.data.length) {
      body.innerHTML = `<div class="empty-note">No applications received yet for this project.</div>`;
      UI.openModal(modal);
      return;
    }

    body.innerHTML = res.data.map(app => `
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="creator__avatar" style="border-color:${tierColor(app.tier)}">${UI.initials(app.display_name)}</div>
            <div>
              <h4 style="margin:0;font-size:16px">${esc(app.display_name)}</h4>
              <div style="display:flex;gap:6px;align-items:center;margin-top:2px">
                <span class="tier-pill tier-pill--${app.tier}" style="padding:2px 8px;font-size:10px">${app.tier.toUpperCase()}</span>
                ${app.creostart_eligible ? `<span class="badge-status badge-status--creostart" style="font-size:9px">CreoStart Newcomer</span>` : ''}
                <span style="font-size:12px;color:var(--gold)">★ ${app.avg_rating > 0 ? app.avg_rating.toFixed(1) : 'New'} (${app.total_reviews} reviews)</span>
              </div>
            </div>
          </div>
          <div style="text-align:right">
            <span class="badge-status badge-status--${app.status}">${app.status.toUpperCase()}</span>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">${UI.timeAgo(app.created_at)}</div>
          </div>
        </div>

        <div style="margin:10px 0;background:#151518;padding:12px;border-radius:var(--radius-sm)">
          <b style="font-size:12px;color:var(--muted)">PITCH & APPROACH:</b>
          <p style="margin:4px 0 0;font-size:13.5px;line-height:1.5">${esc(app.pitch)}</p>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${(app.skills || []).map(s => `
              <span class="pill ${s.verification_status === 'verified' ? 'pill--green' : ''}">
                ${s.verification_status === 'verified' ? '✓ ' : ''}${esc(s.name)}
              </span>
            `).join("")}
          </div>

          <div style="display:flex;gap:8px">
            ${app.status !== 'shortlisted' && app.status !== 'hired' ? `
              <button class="btn btn--sm btn--light" onclick="window.updateAppStatus('${projectId}', '${app.id}', 'shortlisted')">Shortlist</button>
            ` : ''}
            ${app.status !== 'hired' && app.status !== 'declined' ? `
              <button class="btn btn--sm btn--ghost" style="color:var(--danger)" onclick="window.updateAppStatus('${projectId}', '${app.id}', 'declined')">Decline</button>
            ` : ''}
            ${app.status !== 'hired' ? `
              <button class="btn btn--sm btn--gold" onclick="window.openOfferModal('${projectId}', '${app.id}', '${app.proposed_budget_paise || 1500000}')">Send Offer</button>
            ` : `
              <span class="pill pill--green">HIRED</span>
            `}
          </div>
        </div>
      </div>
    `).join("");

    UI.openModal(modal);

    window.updateAppStatus = async (pId, aId, status) => {
      await CreoAPI.projects.updateApplication(pId, aId, status);
      UI.toast(`Candidate marked as ${status}`);
      openApplicationsModal(pId, projectTitle);
    };

    window.openOfferModal = (pId, aId, grossPaise) => {
      UI.closeModal(modal);
      openSendOfferModal(pId, aId, parseInt(grossPaise));
    };
  }

  function tierColor(tier) {
    const map = { bronze: "#c7834a", silver: "#c9ced6", gold: "#e8b64c", platinum: "#b8e3ee" };
    return map[tier] || "#c7834a";
  }

  // ── Send Offer Modal Logic ────────────────────────────────
  function openSendOfferModal(projectId, applicationId, grossPaise) {
    const modal = $("sendOfferModal");
    const form = $("sendOfferForm");
    form.project_id.value = projectId;
    form.application_id.value = applicationId;

    const fee = Math.round(grossPaise * 0.1);
    const net = grossPaise - fee;

    $("offerGross").textContent = inr(grossPaise);
    $("offerFee").textContent = `-${inr(fee)}`;
    $("offerTax").textContent = `₹0 (B2B Nil TDS)`;
    $("offerNet").textContent = inr(net);

    UI.openModal(modal);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const errEl = $("sendOfferError");
      errEl.textContent = "";
      try {
        await CreoAPI.projects.sendOffer(projectId, {
          application_id: applicationId,
          message: form.message.value,
          terms: form.terms.value
        });
        UI.toast("Offer sent with 72-hour expiry terms!", "success");
        UI.closeModal(modal);
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
      }
    };
  }

  // ── View: My Applications (Freelancer View) ───────────────
  async function viewMyApplications() {
    const res = await CreoAPI.projects.my();

    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">My Applications & Offers</h1>
          <p class="view-sub">Track real-time status of your project submissions.</p>
        </div>
      </div>

      <div class="grid grid--3">
        ${(!res.data || !res.data.length) ? `
          <div class="empty-note" style="grid-column:1/-1">
            <p>You haven't submitted any project proposals yet.</p>
            <a href="#projects" class="btn btn--gold">Discover Open Projects</a>
          </div>
        ` : res.data.map(p => `
          <article class="proj-card" data-project-id="${p.id}">
            <div class="proj-card__header">
              <span class="pill">${esc(p.category)}</span>
              <span class="badge-status badge-status--${p.my_application_status}">${(p.my_application_status || 'submitted').toUpperCase()}</span>
            </div>
            <h3 class="proj-card__title">${esc(p.title)}</h3>
            <p class="proj-card__desc">${esc(p.description)}</p>

            <div class="proj-card__meta">
              <div class="proj-card__budget">
                ${inr(p.budget_paise)}
                <small>Budget</small>
              </div>
              <div style="text-align:right">
                ${p.status === 'offer_sent' ? `
                  <button class="btn btn--sm btn--gold" onclick="event.stopPropagation(); window.checkOffer('${p.id}')">View Offer</button>
                ` : p.status === 'active' || p.status === 'completed' ? `
                  <a href="#workspace/${p.id}" class="btn btn--sm btn--light" onclick="event.stopPropagation()">Open Workspace</a>
                ` : `
                  <span class="muted" style="font-size:12px">Pending Client Action</span>
                `}
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    `;

    bindProjectCardClicks();

    window.checkOffer = async (projId) => {
      const data = await CreoAPI.projects.get(projId);
      if (data.offer) {
        openFreelancerOfferModal(data.offer, data.project);
      }
    };
  }

  // ── Freelancer Offer View Modal ───────────────────────────
  function openFreelancerOfferModal(offer, project) {
    const modal = $("projectModal");
    const container = $("projectDetail");

    container.innerHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <div class="status-icon status-icon--pending" style="margin:0 auto 10px">🎁</div>
        <h2 style="margin:0 0 4px">Official Project Offer</h2>
        <p class="muted" style="font-size:13px">You have been selected for <b>${esc(project.title)}</b></p>
      </div>

      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:16px">
        <h4 style="margin:0 0 10px;font-size:13px;color:var(--muted)">GUARANTEED FINANCIAL BREAKDOWN</h4>
        <table class="fee-table">
          <tr><td>Agreed Budget</td><td>${inr(offer.gross_paise)}</td></tr>
          <tr><td>CreoTask Platform Take Rate (10%)</td><td style="color:var(--muted)">-${inr(offer.platform_fee_paise)}</td></tr>
          <tr class="total-row"><td>Your Net Payout</td><td style="color:var(--success)">${inr(offer.net_paise)}</td></tr>
        </table>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">
          ⏱️ Offer expires in <b>${UI.timeAgo(offer.expires_at).replace("ago", "from now")}</b>
        </div>
      </div>

      ${offer.terms ? `
        <div style="margin-bottom:18px;background:#17171a;padding:12px;border-radius:var(--radius-sm)">
          <b style="font-size:12px;color:var(--muted)">TERMS & SCOPE:</b>
          <p style="margin:4px 0 0;font-size:13.5px">${esc(offer.terms)}</p>
        </div>
      ` : ''}

      <div style="display:flex;gap:12px">
        <button class="btn btn--gold btn--block" id="acceptOfferBtn">Accept Offer & Start Workspace</button>
        <button class="btn btn--ghost" style="color:var(--danger)" id="declineOfferBtn">Decline</button>
      </div>
    `;

    UI.openModal(modal);

    $("acceptOfferBtn").onclick = async () => {
      await CreoAPI.projects.respondOffer(offer.id, "accept");
      UI.toast("Offer accepted! Waiting for client first milestone funding.", "success");
      UI.closeModal(modal);
      location.hash = `#workspace/${project.id}`;
    };

    $("declineOfferBtn").onclick = async () => {
      await CreoAPI.projects.respondOffer(offer.id, "decline", "Freelancer unavailable");
      UI.toast("Offer declined.");
      UI.closeModal(modal);
      location.reload();
    };
  }

  // ── View: Workspaces (Interactive Contract Execution) ─────
  async function viewWorkspaces(specificProjId) {
    const res = await CreoAPI.projects.my();
    const activeProjects = (res.data || []).filter(p => ["awaiting_funding", "active", "disputed", "completed"].includes(p.status));

    if (!activeProjects.length) {
      view.innerHTML = `
        <div class="view-head">
          <h1 class="view-title">Project Workspaces</h1>
        </div>
        <div class="empty-note">
          <p>No active project contracts currently in progress.</p>
          <a href="#projects" class="btn btn--gold">Discover Projects</a>
        </div>
      `;
      return;
    }

    const currentProj = specificProjId ? activeProjects.find(p => p.id === specificProjId) || activeProjects[0] : activeProjects[0];
    const fullProjData = await CreoAPI.projects.get(currentProj.id);
    const p = fullProjData.project;
    const milestones = fullProjData.milestones || [];
    const messages = fullProjData.messages || [];

    const isClient = currentUser.id === p.client_id;

    view.innerHTML = `
      <div class="view-head">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <span class="badge-status badge-status--${p.status}">${p.status.toUpperCase()}</span>
            <span class="pill">${esc(p.category)}</span>
          </div>
          <h1 class="view-title" style="font-size:28px">${esc(p.title)}</h1>
          <div class="muted" style="font-size:13px">
            ${isClient ? `Freelancer: <b>${esc(p.hired_freelancer_id ? 'Assigned Partner' : 'Awaiting Hire')}</b>` : `Client: <b>${esc(p.client_name)}</b>`}
            · Fixed Budget: <b style="color:var(--gold)">${inr(p.budget_paise)}</b>
          </div>
        </div>

        <div style="display:flex;gap:8px">
          ${activeProjects.length > 1 ? `
            <select class="select" id="workspaceSelector" style="width:220px">
              ${activeProjects.map(ap => `<option value="${ap.id}" ${ap.id === currentProj.id ? 'selected' : ''}>${esc(ap.title)}</option>`).join("")}
            </select>
          ` : ''}
          ${p.status === 'completed' ? `
            <button class="btn btn--gold" id="leaveReviewBtn">★ Leave Review</button>
          ` : `
            <button class="btn btn--ghost" style="color:var(--danger)" id="openDisputeBtn">Raise Dispute</button>
          `}
        </div>
      </div>

      <div class="ws-container">
        <!-- Milestones Column -->
        <div>
          <h3 style="margin:0 0 12px;font-size:17px">Milestones & Deliverables</h3>
          <div class="stack" style="gap:14px">
            ${milestones.map((m, idx) => `
              <div class="ws-milestone ${m.status === 'funded' ? 'is-funded' : m.status === 'released' ? 'is-released' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                  <div>
                    <span class="badge-status badge-status--${m.status}">${m.status.replace("_", " ").toUpperCase()}</span>
                    <h4 style="margin:6px 0 2px;font-size:16px">M${idx + 1}: ${esc(m.title)}</h4>
                    ${m.description ? `<p style="margin:0;font-size:13px;color:var(--muted)">${esc(m.description)}</p>` : ''}
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:18px;font-weight:700;color:var(--gold)">${inr(m.budget_paise)}</div>
                    <small style="color:var(--muted)">Revisions: ${m.revisions_used}/${m.max_revisions}</small>
                  </div>
                </div>

                <!-- Milestone Actions -->
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">
                  ${isClient && m.status === 'not_funded' ? `
                    <button class="btn btn--sm btn--gold" onclick="window.fundMilestone('${p.id}', '${m.id}', '${m.budget_paise}')">
                      💳 Fund Milestone (${inr(m.budget_paise)})
                    </button>
                  ` : ''}

                  ${!isClient && (m.status === 'funded' || m.status === 'in_progress' || m.status === 'revision_requested') ? `
                    <button class="btn btn--sm btn--gold" onclick="window.submitDeliverable('${p.id}', '${m.id}')">
                      Upload Deliverable
                    </button>
                  ` : ''}

                  ${isClient && m.status === 'submitted' ? `
                    <button class="btn btn--sm btn--light" style="color:var(--danger)" onclick="window.reviewDeliverable('${p.id}', '${m.id}', 'request_revision')">
                      Request Revision
                    </button>
                    <button class="btn btn--sm btn--gold" onclick="window.reviewDeliverable('${p.id}', '${m.id}', 'accept')">
                      ✓ Accept & Release Funds
                    </button>
                  ` : ''}

                  ${m.status === 'released' ? `
                    <span class="pill pill--green">✓ Funds Released & Completed</span>
                  ` : ''}
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Chat & Audit Column -->
        <div>
          <div class="chat-box">
            <div style="padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface-2);font-weight:600;font-size:13.5px;display:flex;justify-content:space-between">
              <span>Project Collaboration Room</span>
              <span class="pill pill--gold" style="font-size:10px">Protected Channel</span>
            </div>
            <div class="chat-messages" id="chatMessages">
              <div class="chat-msg chat-msg--system">
                ⚠️ Keep discussions, deliverables and payments on CreoTask so the agreed scope, milestone records and dispute process apply to your work.
              </div>
              ${messages.map(msg => `
                <div class="chat-msg chat-msg--${msg.sender_role}">
                  <div style="font-size:11px;opacity:0.7;margin-bottom:2px">
                    ${msg.sender_role === 'system' ? 'System Notification' : msg.sender_role.toUpperCase()} · ${UI.timeAgo(msg.created_at)}
                  </div>
                  <div>${esc(msg.content)}</div>
                </div>
              `).join("")}
            </div>
            <form class="chat-input-bar" id="chatForm">
              <input class="input" name="message" placeholder="Type a message or share an update..." required style="font-size:13px" />
              <button class="btn btn--gold btn--sm" type="submit">Send</button>
            </form>
          </div>
        </div>
      </div>
    `;

    // Workspace switch
    $("workspaceSelector")?.addEventListener("change", (e) => {
      location.hash = `#workspace/${e.target.value}`;
    });

    // Chat submit
    const chatForm = $("chatForm");
    const chatMessages = $("chatMessages");
    chatMessages.scrollTop = chatMessages.scrollHeight;

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = chatForm.message.value;
      if (!content.trim()) return;
      chatForm.message.value = "";
      await CreoAPI.projects.sendMessage(p.id, content);
      viewWorkspaces(p.id);
    });

    // Actions
    window.fundMilestone = async (projId, mileId, budgetPaise) => {
      if (paymentsMode !== "sandbox") {
        UI.toast("Milestone funding isn't available yet. CreoTask will enable payments only through an approved payment provider.", "error");
        return;
      }
      if (!confirm(`SANDBOX ONLY — record test funding of ${inr(budgetPaise)} for this milestone?\n\nNo real money moves and nothing is held by a payment provider.`)) return;
      try {
        const r = await CreoAPI.projects.fundMilestone(projId, mileId);
        UI.toast(r.message || "Sandbox test funding recorded.", "success");
        viewWorkspaces(projId);
      } catch (err) {
        UI.toast(err.message, "error");
      }
    };

    window.submitDeliverable = (projId, mileId) => {
      const note = prompt("Enter notes or links for this submission:");
      if (note) {
        CreoAPI.projects.submitDeliverable(projId, mileId, { note, external_links: [note] })
          .then(() => {
            UI.toast("Deliverable submitted for client review!", "success");
            viewWorkspaces(projId);
          });
      }
    };

    window.reviewDeliverable = async (projId, mileId, action) => {
      if (action === "accept") {
        if (confirm("Accept deliverable and immediately release funds to the freelancer?")) {
          await CreoAPI.projects.reviewDeliverable(projId, mileId, "accept");
          UI.toast("Deliverable accepted! Payout credited to freelancer.", "success");
          viewWorkspaces(projId);
        }
      } else {
        const note = prompt("Specify the revision requirements:");
        if (note) {
          await CreoAPI.projects.reviewDeliverable(projId, mileId, "request_revision", note);
          UI.toast("Revision request sent.", "success");
          viewWorkspaces(projId);
        }
      }
    };

    $("openDisputeBtn")?.addEventListener("click", async () => {
      const reason = prompt("Enter the reason for raising a formal dispute:");
      if (reason) {
        await CreoAPI.projects.openDispute(p.id, { reason });
        UI.toast("Dispute opened. An operations moderator has been notified.", "error");
        viewWorkspaces(p.id);
      }
    });

    $("leaveReviewBtn")?.addEventListener("click", () => {
      const rating = prompt("Enter rating (1 to 5 stars):", "5");
      const comment = prompt("Enter review feedback:");
      if (rating && comment) {
        CreoAPI.projects.submitReview(p.id, parseInt(rating), comment)
          .then(res => {
            UI.toast(res.message, "success");
          })
          .catch(err => UI.toast(err.message, "error"));
      }
    });
  }

  // ── View: Explore Freelancers & Talent ────────────────────
  async function viewExplore() {
    const res = await CreoAPI.profiles.browseFreelancers();

    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Find Freelancers & Creators</h1>
          <p class="view-sub">Evidence-based talent search with fair Newcomer Exploration allocation.</p>
        </div>
      </div>

      <div class="filters">
        <input class="input" id="searchTalentInput" placeholder="Search by name, skill, bio..." style="max-width:320px" />
        <select class="select" id="talentTierFilter">
          <option value="">All Tiers</option>
          <option value="platinum">Platinum (Elite)</option>
          <option value="gold">Gold (Proven)</option>
          <option value="silver">Silver (Rising)</option>
          <option value="bronze">Bronze (Emerging)</option>
        </select>
      </div>

      <div id="talentGrid" class="grid grid--3">
        ${renderTalentCards(res.data)}
      </div>
    `;

    const filterTalent = async () => {
      const q = $("searchTalentInput").value.trim();
      const tier = $("talentTierFilter").value;
      const filtered = await CreoAPI.profiles.browseFreelancers({ q, tier });
      $("talentGrid").innerHTML = renderTalentCards(filtered.data);
    };

    $("searchTalentInput").addEventListener("input", debounce(filterTalent, 300));
    $("talentTierFilter").addEventListener("change", filterTalent);
  }

  function renderTalentCards(talent) {
    if (!talent || !talent.length) return `<div class="empty-note" style="grid-column:1/-1">No creators found.</div>`;
    return talent.map(t => `
      <article class="tile creator" style="position:relative">
        ${t._newcomer_slot ? `<span class="badge-status badge-status--creostart" style="position:absolute;top:12px;right:12px;font-size:9px">★ Newcomer Spotlight</span>` : ''}
        <div class="creator__head">
          <div class="creator__avatar" style="border-color:${tierColor(t.tier)}">${UI.initials(t.display_name)}</div>
          <div>
            <h3 style="margin:0">${esc(t.display_name)}</h3>
            <div class="creator__title">${esc(t.headline || 'Independent Specialist')}</div>
          </div>
        </div>

        <div style="display:flex;gap:6px;align-items:center;margin:4px 0">
          <span class="tier-pill tier-pill--${t.tier}" style="padding:2px 8px;font-size:10px">${t.tier.toUpperCase()}</span>
          <span style="font-size:12px;color:var(--gold)">★ ${t.avg_rating > 0 ? t.avg_rating.toFixed(1) : 'New'} (${t.total_reviews} reviews)</span>
          <span class="muted" style="font-size:12px">· ${t.location_city || 'India'}</span>
        </div>

        <div class="creator__skills">
          ${(t.skills || []).map(s => `
            <span class="pill ${s.verification_status === 'verified' ? 'pill--green' : ''}">
              ${s.verification_status === 'verified' ? '✓ ' : ''}${esc(s.name)}
            </span>
          `).join("")}
        </div>

        <div class="creator__actions">
          <a href="dashboard.html" class="btn btn--sm btn--light">View Full Profile</a>
        </div>
      </article>
    `).join("");
  }

  // ── View: Tier System & CreoStart Guide ───────────────────
  async function viewTiersGuide() {
    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">CreoTask Four-Tier Foundation</h1>
          <p class="view-sub">Evidence-based progression. Transparent, non-purchasable, and merit-first.</p>
        </div>
      </div>

      <div class="tiers" style="margin-bottom:30px">
        <div class="tile tier">
          <span class="tier-pill tier-pill--bronze">BRONZE</span>
          <h3>Emerging Talent</h3>
          <p class="muted" style="font-size:13px">Default entry level for new creators, freshers, and bootcamp graduates.</p>
          <ul>
            <li>Access to CreoStart entry projects</li>
            <li>1-in-5 Newcomer Exploration share</li>
            <li>Submit portfolio & verified skill tests</li>
          </ul>
        </div>
        <div class="tile tier">
          <span class="tier-pill tier-pill--silver">SILVER</span>
          <h3>Rising Professional</h3>
          <p class="muted" style="font-size:13px">Demonstrated baseline delivery or verified technical capabilities.</p>
          <ul>
            <li>1+ completed projects or verified skill</li>
            <li>Rating ≥ 4.0</li>
            <li>Priority invitations for relevant briefs</li>
          </ul>
        </div>
        <div class="tile tier">
          <span class="tier-pill tier-pill--gold">GOLD</span>
          <h3>Proven Performer</h3>
          <p class="muted" style="font-size:13px">Consistent track record across diverse client projects.</p>
          <ul>
            <li>5+ completed projects</li>
            <li>3+ unique clients</li>
            <li>Rating ≥ 4.3 & on-time ≥ 80%</li>
            <li>2+ verified skills</li>
          </ul>
        </div>
        <div class="tile tier">
          <span class="tier-pill tier-pill--platinum">PLATINUM</span>
          <h3>Elite Contributor</h3>
          <p class="muted" style="font-size:13px">Top-tier specialist with comprehensive delivery excellence.</p>
          <ul>
            <li>15+ completed projects</li>
            <li>8+ unique clients</li>
            <li>Rating ≥ 4.6 & on-time ≥ 90%</li>
            <li>3+ verified skills & 0 disputes</li>
          </ul>
        </div>
      </div>

      <div class="tile" style="padding:24px">
        <h3 style="margin:0 0 10px;color:var(--gold)">The CreoStart Pathway</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#dcdce0">
          The central challenge on legacy platforms is the cold start trap: newcomers cannot win work without prior reviews.
          CreoTask solves this through <b>CreoStart</b>: designated paid entry projects with bounded scope, kept clearly separate from unpaid practice challenges.
          Additionally, our search algorithm allocates up to 1-in-5 qualified discovery slots to qualified Bronze candidates without bypassing skill match.
        </p>
      </div>
    `;
  }

  // ── View: Financial Ledger (Client / Freelancer) ──────────
  async function viewLedger() {
    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Financial Ledger & Statements</h1>
          <p class="view-sub">Immutable transaction history. Every fund movement is double-entry reconciled.</p>
        </div>
      </div>
      <div class="tile" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Reference / Idempotency</th>
              <th>Type</th>
              <th>Currency & Amount</th>
              <th>Provider Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody id="ledgerBody">
            <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Loading transactions...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    try {
      const res = await CreoAPI.admin.getLedger();
      const body = $("ledgerBody");
      if (!res.data.length) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">No financial ledger records found yet.</td></tr>`;
        return;
      }
      body.innerHTML = res.data.map(l => `
        <tr>
          <td>${new Date(l.created_at).toLocaleString("en-IN")}</td>
          <td><code style="font-size:11px;color:var(--gold)">${esc(l.idempotency_key)}</code></td>
          <td><span class="badge-status badge-status--${l.entry_type}">${l.entry_type.toUpperCase()}</span></td>
          <td style="font-weight:600">${inr(l.amount_paise)}</td>
          <td><span class="pill pill--green">Confirmed</span></td>
          <td>${esc(l.note || '')}</td>
        </tr>
      `).join("");
    } catch (e) {
      $("ledgerBody").innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">Ledger restricted to authorized accounts.</td></tr>`;
    }
  }

  // ── View: Admin & Operations Console ──────────────────────
  async function viewAdmin() {
    if (!userAdminRole) {
      view.innerHTML = `<div class="empty-note" style="color:var(--danger)">Admin privilege required.</div>`;
      return;
    }

    const stats = await CreoAPI.admin.getStats();

    view.innerHTML = `
      <div class="view-head">
        <div>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
            <span class="pill pill--gold">STAFF ROLE: ${userAdminRole.toUpperCase()}</span>
          </div>
          <h1 class="view-title">CreoTask Operations Console</h1>
          <p class="view-sub">Supervise skill verifications, project moderation, disputes, and audit ledger.</p>
        </div>
      </div>

      <div class="stat-row" style="margin-bottom:24px">
        <div class="tile stat-box">
          <b>${stats.users.n}</b>
          <span>Total Users</span>
        </div>
        <div class="tile stat-box">
          <b>${stats.projects.active || 0}</b>
          <span>Active Contracts</span>
        </div>
        <div class="tile stat-box">
          <b>${stats.pendingSkills.n}</b>
          <span>Pending Skill Verifications</span>
        </div>
        <div class="tile stat-box">
          <b>${stats.openDisputes.n}</b>
          <span>Open Disputes</span>
        </div>
      </div>

      <div class="tabs" style="margin-bottom:18px">
        <button class="tab is-active" id="adminTabSkills">Skill Verification Queue (${stats.pendingSkills.n})</button>
        <button class="tab" id="adminTabDisputes">Disputes Desk (${stats.openDisputes.n})</button>
        <button class="tab" id="adminTabLedger">Master Ledger</button>
      </div>

      <div id="adminTabContent"></div>
    `;

    renderAdminSkillQueue();

    $("adminTabSkills").onclick = () => {
      setActiveAdminTab("adminTabSkills");
      renderAdminSkillQueue();
    };
    $("adminTabDisputes").onclick = () => {
      setActiveAdminTab("adminTabDisputes");
      renderAdminDisputes();
    };
    $("adminTabLedger").onclick = () => {
      setActiveAdminTab("adminTabLedger");
      renderAdminLedger();
    };
  }

  function setActiveAdminTab(tabId) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("is-active"));
    $(tabId).classList.add("is-active");
  }

  async function renderAdminSkillQueue() {
    const res = await CreoAPI.admin.listSkillQueue("pending");
    const container = $("adminTabContent");

    if (!res.data.length) {
      container.innerHTML = `<div class="empty-note">No pending skill verification requests in queue.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="tile" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Skill Claimed</th>
              <th>Proficiency</th>
              <th>Evidence Provided</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${res.data.map(q => `
              <tr>
                <td><b>${esc(q.display_name)}</b> (${q.tier.toUpperCase()})</td>
                <td><span class="pill pill--gold">${esc(q.skill_name)}</span></td>
                <td>${esc(q.proficiency)}</td>
                <td>${esc(q.evidence_note || 'Portfolio & credentials submitted')}</td>
                <td>
                  <button class="btn btn--sm btn--light" onclick="window.reviewSkill('${q.id}', 'approve')">Approve ✓</button>
                  <button class="btn btn--sm btn--ghost" style="color:var(--danger)" onclick="window.reviewSkill('${q.id}', 'reject')">Reject</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    window.reviewSkill = async (qId, action) => {
      const note = prompt(`Enter ${action} note for audit history:`, action === "approve" ? "Verified against submitted portfolio evidence." : "Insufficient evidence.");
      if (note) {
        await CreoAPI.admin.reviewSkill(qId, action, note);
        UI.toast(`Skill ${action}d successfully.`, "success");
        renderAdminSkillQueue();
      }
    };
  }

  async function renderAdminDisputes() {
    const res = await CreoAPI.admin.listDisputes();
    const container = $("adminTabContent");

    if (!res.data.length) {
      container.innerHTML = `<div class="empty-note">No open dispute cases currently recorded.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="tile" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Raised By</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${res.data.map(d => `
              <tr>
                <td><b>${esc(d.project_title)}</b></td>
                <td>${esc(d.raiser_name || d.raiser_role)}</td>
                <td>${esc(d.reason)}</td>
                <td><span class="badge-status badge-status--${d.status}">${d.status.toUpperCase()}</span></td>
                <td>
                  <button class="btn btn--sm btn--gold" onclick="window.resolveDisputeModal('${d.id}')">Resolve Case</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    window.resolveDisputeModal = async (disputeId) => {
      const resolution = prompt("Enter resolution: client_refund | freelancer_payout | dismissed", "client_refund");
      const decision = prompt("Enter decision notes:");
      if (resolution && decision) {
        await CreoAPI.admin.resolveDispute(disputeId, { action: "decide", resolution, decision });
        UI.toast("Dispute resolved and audited.", "success");
        renderAdminDisputes();
      }
    };
  }

  async function renderAdminLedger() {
    const res = await CreoAPI.admin.getLedger();
    const container = $("adminTabContent");
    container.innerHTML = `
      <div class="tile" style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Transaction ID / Idempotency</th>
              <th>Type</th>
              <th>Amount (INR)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${res.data.map(l => `
              <tr>
                <td>${new Date(l.created_at).toLocaleString("en-IN")}</td>
                <td><code>${esc(l.idempotency_key)}</code></td>
                <td><span class="badge-status badge-status--${l.entry_type}">${l.entry_type.toUpperCase()}</span></td>
                <td style="font-weight:600">${inr(l.amount_paise)}</td>
                <td><span class="pill pill--green">Settled</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Tier Progress & Criteria Breakdown Modal ─────────────
  async function showTierModal() {
    const modal = $("tierModal");
    const container = $("tierModalBody");
    const me = await CreoAPI.profiles.getFreelancer(currentUser.id);
    const p = me.profile;
    const info = me.tier_info;

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="display:flex;gap:10px;align-items:center">
          <span class="tier-pill tier-pill--${p.tier}" style="font-size:14px;padding:6px 14px">
            CURRENT: ${p.tier.toUpperCase()} TIER
          </span>
          ${p.creostart_eligible ? `<span class="badge-status badge-status--creostart">CreoStart Eligible</span>` : ''}
        </div>
        <div class="muted" style="font-size:13px">Non-Purchasable Merit Rating</div>
      </div>

      <div class="tile" style="margin-bottom:16px">
        <h4 style="margin:0 0 12px;font-size:14px;color:var(--gold)">Current Delivery Evidence</h4>
        <div class="stat-row">
          <div class="stat-box">
            <b>${p.total_projects_completed}</b>
            <span>Completed Projects</span>
          </div>
          <div class="stat-box">
            <b>${p.total_unique_clients}</b>
            <span>Unique Clients</span>
          </div>
          <div class="stat-box">
            <b>${p.avg_rating > 0 ? p.avg_rating.toFixed(1) : '—'}</b>
            <span>Review Rating</span>
          </div>
          <div class="stat-box">
            <b>${Math.round(p.on_time_rate * 100)}%</b>
            <span>On-Time Rate</span>
          </div>
        </div>
      </div>

      ${info.next_tier ? `
        <div style="background:rgba(245,179,1,.08);border:1px solid rgba(245,179,1,.3);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px">
          <b style="color:var(--gold);font-size:14px">Criteria Needed for Next Tier (${info.next_tier.toUpperCase()}):</b>
          <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#d5d5db">
            ${(info.unmet_criteria || []).map(c => `<li>${esc(c)}</li>`).join("")}
          </ul>
        </div>
      ` : `
        <div style="background:rgba(61,220,151,.1);border:1px solid var(--success);border-radius:var(--radius-sm);padding:14px;text-align:center">
          <span style="color:var(--success);font-weight:600">🏆 Maximum Tier Reached: Platinum Elite Contributor</span>
        </div>
      `}

      <div style="font-size:12px;color:var(--muted);line-height:1.5">
        * CreoTask strictly enforces evidence-based progression. Inactivity does not demote your tier, and paid promotions or subscriptions cannot purchase tier progression.
      </div>
    `;

    UI.openModal(modal);
  }

  // ── Utilities ─────────────────────────────────────────────
  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Start app
  init();
})();
