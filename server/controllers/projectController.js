/* =========================================================
   CREOTASK — Project Controller
   POST   /api/projects               create project (client)
   GET    /api/projects               browse / search projects
   GET    /api/projects/:projectId    get project details
   PUT    /api/projects/:projectId    update project (client, draft only)
   POST   /api/projects/:projectId/publish
   DELETE /api/projects/:projectId    cancel project
   GET    /api/projects/my            my projects (client or freelancer)
   POST   /api/projects/:projectId/apply  (freelancer)
   GET    /api/projects/:projectId/applications (client)
   PUT    /api/projects/:projectId/applications/:appId  (shortlist/decline)
   POST   /api/projects/:projectId/offer (client sends offer)
   PUT    /api/projects/:projectId/offer/:offerId  (freelancer accepts/declines)
   POST   /api/projects/:projectId/milestones/:mileId/fund
   POST   /api/projects/:projectId/milestones/:mileId/submit
   PUT    /api/projects/:projectId/milestones/:mileId/review
   POST   /api/projects/:projectId/milestones/:mileId/change-order
   PUT    /api/projects/:projectId/change-orders/:coId
   POST   /api/projects/:projectId/complete
   POST   /api/projects/:projectId/dispute
   POST   /api/projects/:projectId/review
   ========================================================= */
"use strict";
const db = require("../config/db");
const { POLICY } = require("../config/policy");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { id, now, addHours, addDays, parseJSON, computeFees } = require("../utils/helpers");
const { notify, TYPES } = require("../utils/notify");

const PROJECT_CATEGORIES = ["Design", "Development", "Writing", "Video", "Marketing", "Data & Analytics", "Other"];

// ── Create Project ────────────────────────────────────────
const createProject = asyncHandler(async (req, res) => {
  if (req.user.active_role !== "client") throw httpError(403, "Switch to client role to post projects.");
  const {
    title, description, category, required_skills = [],
    budget_paise, timeline_days, is_creostart = false, is_remote = true,
    acceptance_criteria, deliverables, milestones = [], visibility = "public"
  } = req.body;

  if (!title?.trim())       throw httpError(400, "Project title is required.");
  if (!description?.trim()) throw httpError(400, "Project description is required.");
  if (!category)            throw httpError(400, "Category is required.");
  if (!PROJECT_CATEGORIES.includes(category)) throw httpError(400, `Category must be one of: ${PROJECT_CATEGORIES.join(", ")}`);
  if (!budget_paise || budget_paise < 50000) throw httpError(400, "Budget must be at least ₹500 (50,000 paise).");
  if (!milestones.length) throw httpError(400, "At least one milestone is required.");

  // Validate milestone budget sum
  const milestoneTotal = milestones.reduce((s, m) => s + (parseInt(m.budget_paise) || 0), 0);
  if (Math.abs(milestoneTotal - parseInt(budget_paise)) > 100) {
    throw httpError(400, `Milestone budgets must sum to the total project budget (₹${budget_paise/100}). Currently: ₹${milestoneTotal/100}`);
  }

  const projectId = id();
  const ts = now();

  await db.run(
    `INSERT INTO projects (id, client_id, title, description, category, required_skills, budget_paise, timeline_days, is_creostart, is_remote, acceptance_criteria, deliverables, status, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [projectId, req.user.id, title.trim(), description.trim(), category,
     JSON.stringify(required_skills), parseInt(budget_paise),
     timeline_days ? parseInt(timeline_days) : null,
     is_creostart ? 1 : 0, is_remote ? 1 : 0,
     acceptance_criteria || null, deliverables || null, visibility, ts, ts]
  );

  // Insert milestones
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    if (!m.title?.trim())   throw httpError(400, `Milestone ${i + 1}: title is required.`);
    if (!m.budget_paise)    throw httpError(400, `Milestone ${i + 1}: budget is required.`);
    await db.run(
      `INSERT INTO milestones (id, project_id, title, description, sort_order, budget_paise, timeline_days, status, max_revisions, revisions_used, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'not_funded', 2, 0, ?, ?)`,
      [id(), projectId, m.title.trim(), m.description || null, i,
       parseInt(m.budget_paise), m.timeline_days ? parseInt(m.timeline_days) : null, ts, ts]
    );
  }

  // Update client stats
  await db.run(
    "UPDATE client_profiles SET total_projects_posted = total_projects_posted + 1, updated_at = ? WHERE user_id = ?",
    [ts, req.user.id]
  );

  const project = await db.get("SELECT * FROM projects WHERE id = ?", [projectId]);
  const milestoneRows = await db.all("SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order", [projectId]);
  res.status(201).json({ project, milestones: milestoneRows });
});

// ── Publish Project ───────────────────────────────────────
const publishProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const project = await db.get("SELECT * FROM projects WHERE id = ? AND client_id = ?", [projectId, req.user.id]);
  if (!project) throw httpError(404, "Project not found.");
  if (project.status !== "draft") throw httpError(400, "Only draft projects can be published.");

  const ts = now();
  await db.run(
    "UPDATE projects SET status = 'open', published_at = ?, updated_at = ? WHERE id = ?",
    [ts, ts, projectId]
  );
  res.json({ message: "Project published and open for applications.", project: await db.get("SELECT * FROM projects WHERE id = ?", [projectId]) });
});

// ── Browse Projects ───────────────────────────────────────
const browseProjects = asyncHandler(async (req, res) => {
  const {
    q, category, skills, creostart, min_budget, max_budget,
    page = "1", limit = "20"
  } = req.query;

  const pg  = Math.max(1, parseInt(page));
  const lim = Math.min(50, Math.max(1, parseInt(limit)));
  const offset = (pg - 1) * lim;

  let where = ["p.status IN ('open','shortlisting') AND p.visibility = 'public' AND p.moderation_status = 'approved'"];
  const params = [];

  if (q) {
    where.push("(p.title LIKE ? OR p.description LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) { where.push("p.category = ?"); params.push(category); }
  if (creostart === "true") { where.push("p.is_creostart = 1"); }
  if (min_budget) { where.push("p.budget_paise >= ?"); params.push(parseInt(min_budget)); }
  if (max_budget) { where.push("p.budget_paise <= ?"); params.push(parseInt(max_budget)); }

  if (skills) {
    const skillList = skills.split(",").map(s => s.trim()).filter(Boolean);
    if (skillList.length) {
      // Check if required_skills JSON contains any of the requested skills
      const skillConditions = skillList.map(() => "p.required_skills LIKE ?");
      where.push(`(${skillConditions.join(" OR ")})`);
      params.push(...skillList.map(s => `%"${s}"%`));
    }
  }

  const whereSQL = "WHERE " + where.join(" AND ");

  const total = (await db.get(`SELECT COUNT(*) as n FROM projects p ${whereSQL}`, params))?.n || 0;

  const projects = await db.all(
    `SELECT p.id, p.title, p.description, p.category, p.required_skills,
            p.budget_paise, p.timeline_days, p.is_creostart, p.created_at, p.published_at, p.status,
            cp.display_name as client_name, cp.avatar_url as client_avatar, cp.verification_status as client_verified,
            (SELECT COUNT(*) FROM applications a WHERE a.project_id = p.id) as application_count
     FROM projects p
     JOIN client_profiles cp ON cp.user_id = p.client_id
     ${whereSQL}
     ORDER BY p.is_creostart DESC, p.published_at DESC
     LIMIT ? OFFSET ?`,
    [...params, lim, offset]
  );

  projects.forEach(p => { p.required_skills = parseJSON(p.required_skills, []); });

  res.json({
    data: projects,
    pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) },
    categories: PROJECT_CATEGORIES,
  });
});

// ── Get Project Detail ────────────────────────────────────
const getProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const project = await db.get(
    `SELECT p.*, cp.display_name as client_name, cp.avatar_url as client_avatar,
            cp.organization_name, cp.verification_status as client_verified
     FROM projects p
     JOIN client_profiles cp ON cp.user_id = p.client_id
     WHERE p.id = ?`,
    [projectId]
  );
  if (!project) throw httpError(404, "Project not found.");

  // Redact private projects unless participant
  if (project.visibility === "private" && req.user?.id !== project.client_id && req.user?.id !== project.hired_freelancer_id) {
    throw httpError(403, "This project is private.");
  }

  project.required_skills = parseJSON(project.required_skills, []);
  project.attachments     = parseJSON(project.attachments, []);

  const milestones = await db.all(
    "SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order",
    [projectId]
  );

  // If viewing user is a participant, include messages and their application status
  let myApplication = null, messages = [], offer = null;
  if (req.user) {
    if (req.user.active_role === "freelancer") {
      myApplication = await db.get(
        "SELECT * FROM applications WHERE project_id = ? AND freelancer_id = ?",
        [projectId, req.user.id]
      );
      offer = await db.get(
        "SELECT * FROM offers WHERE project_id = ? AND freelancer_id = ?",
        [projectId, req.user.id]
      );
    }
    if (req.user.id === project.client_id || req.user.id === project.hired_freelancer_id) {
      messages = await db.all(
        "SELECT m.*, u.email as sender_email FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.project_id = ? ORDER BY m.created_at",
        [projectId]
      );
    }
  }

  res.json({ project, milestones, myApplication, offer, messages });
});

// ── My Projects ───────────────────────────────────────────
const myProjects = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const userId = req.user.id;
  const role   = req.user.active_role;

  let rows;
  if (role === "client") {
    const where = status ? "AND p.status = ?" : "";
    rows = await db.all(
      `SELECT p.*, (SELECT COUNT(*) FROM applications a WHERE a.project_id = p.id) as application_count
       FROM projects p WHERE p.client_id = ? ${where} ORDER BY p.created_at DESC`,
      status ? [userId, status] : [userId]
    );
  } else {
    // Freelancer — projects they applied to + active/completed projects
    const where = status ? "AND p.status = ?" : "";
    rows = await db.all(
      `SELECT DISTINCT p.*, a.status as my_application_status
       FROM projects p
       JOIN applications a ON a.project_id = p.id AND a.freelancer_id = ?
       ${where.replace("p.status", "p.status")}
       ORDER BY p.updated_at DESC`,
      status ? [userId, status] : [userId]
    );
  }

  rows.forEach(r => { r.required_skills = parseJSON(r.required_skills, []); });
  res.json({ data: rows });
});

// ── Apply to Project ──────────────────────────────────────
const applyToProject = asyncHandler(async (req, res) => {
  if (req.user.active_role !== "freelancer") throw httpError(403, "Switch to freelancer role to apply.");
  const { projectId } = req.params;
  const { pitch, proposed_budget_paise, proposed_timeline_days, portfolio_evidence = [] } = req.body;

  if (!pitch?.trim()) throw httpError(400, "A pitch message is required.");

  const project = await db.get(
    "SELECT * FROM projects WHERE id = ? AND status IN ('open','shortlisting')",
    [projectId]
  );
  if (!project) throw httpError(404, "Project not found or no longer accepting applications.");

  // Cannot apply to own project (if dual-role user)
  if (project.client_id === req.user.id) throw httpError(400, "You cannot apply to your own project.");

  const existing = await db.get(
    "SELECT id FROM applications WHERE project_id = ? AND freelancer_id = ?",
    [projectId, req.user.id]
  );
  if (existing) throw httpError(409, "You have already applied to this project.");

  // CreoStart eligibility check
  if (project.is_creostart) {
    const fp = await db.get("SELECT creostart_eligible FROM freelancer_profiles WHERE user_id = ?", [req.user.id]);
    // Any freelancer can apply to CreoStart projects, but it's intended for newcomers.
    // Eligibility is informational here.
  }

  const appId = id();
  await db.run(
    `INSERT INTO applications (id, project_id, freelancer_id, pitch, proposed_budget_paise, proposed_timeline_days, portfolio_evidence, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
    [appId, projectId, req.user.id, pitch.trim(),
     proposed_budget_paise ? parseInt(proposed_budget_paise) : null,
     proposed_timeline_days ? parseInt(proposed_timeline_days) : null,
     JSON.stringify(portfolio_evidence), now(), now()]
  );

  // Update project status to shortlisting if first application
  const appCount = (await db.get("SELECT COUNT(*) as n FROM applications WHERE project_id = ?", [projectId]))?.n || 0;
  if (appCount === 1 && project.status === "open") {
    await db.run("UPDATE projects SET status = 'shortlisting', updated_at = ? WHERE id = ?", [now(), projectId]);
  }

  // Notify client
  await notify(project.client_id, TYPES.APPLICATION_RECEIVED,
    "New application received",
    `A freelancer applied to your project: ${project.title}`,
    `/projects/${projectId}/applications`
  );

  res.status(201).json({ application: await db.get("SELECT * FROM applications WHERE id = ?", [appId]) });
});

// ── List Applications (client view) ──────────────────────
const listApplications = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const project = await db.get("SELECT * FROM projects WHERE id = ? AND client_id = ?", [projectId, req.user.id]);
  if (!project) throw httpError(404, "Project not found.");

  const apps = await db.all(
    `SELECT a.*, fp.display_name, fp.headline, fp.tier, fp.avg_rating, fp.total_reviews, fp.avatar_url, fp.creostart_eligible
     FROM applications a
     JOIN freelancer_profiles fp ON fp.user_id = a.freelancer_id
     WHERE a.project_id = ?
     ORDER BY CASE a.status WHEN 'shortlisted' THEN 0 ELSE 1 END, a.created_at DESC`,
    [projectId]
  );
  for (const app of apps) {
    app.portfolio_evidence = parseJSON(app.portfolio_evidence, []);
    const skills = await db.all(
      "SELECT name, proficiency, verification_status FROM skills WHERE user_id = ? LIMIT 6",
      [app.freelancer_id]
    );
    app.skills = skills;
    // Mark application as viewed
    if (app.status === "submitted") {
      await db.run("UPDATE applications SET status = 'viewed', updated_at = ? WHERE id = ?", [now(), app.id]);
    }
  }
  res.json({ data: apps });
});

// ── Update Application (shortlist / decline) ──────────────
const updateApplication = asyncHandler(async (req, res) => {
  const { projectId, appId } = req.params;
  const { status, client_note } = req.body;

  const project = await db.get("SELECT * FROM projects WHERE id = ? AND client_id = ?", [projectId, req.user.id]);
  if (!project) throw httpError(404, "Project not found.");

  if (!["shortlisted", "declined"].includes(status)) throw httpError(400, "Status must be 'shortlisted' or 'declined'.");

  const app = await db.get("SELECT * FROM applications WHERE id = ? AND project_id = ?", [appId, projectId]);
  if (!app) throw httpError(404, "Application not found.");
  if (["hired", "withdrawn"].includes(app.status)) throw httpError(400, "Cannot update this application.");

  await db.run(
    "UPDATE applications SET status = ?, client_note = COALESCE(?, client_note), updated_at = ? WHERE id = ?",
    [status, client_note || null, now(), appId]
  );

  const notifType = status === "shortlisted" ? TYPES.APPLICATION_SHORTLISTED : TYPES.APPLICATION_DECLINED;
  const notifTitle = status === "shortlisted"
    ? `You've been shortlisted for "${project.title}"`
    : `Application update for "${project.title}"`;
  await notify(app.freelancer_id, notifType, notifTitle, client_note || null, `/projects/${projectId}`);

  res.json({ application: await db.get("SELECT * FROM applications WHERE id = ?", [appId]) });
});

// ── Send Offer ────────────────────────────────────────────
const sendOffer = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { application_id, message, terms } = req.body;

  const project = await db.get(
    "SELECT * FROM projects WHERE id = ? AND client_id = ? AND status IN ('open','shortlisting')",
    [projectId, req.user.id]
  );
  if (!project) throw httpError(404, "Project not found or not in a state to send offers.");

  const app = await db.get(
    "SELECT * FROM applications WHERE id = ? AND project_id = ?",
    [application_id, projectId]
  );
  if (!app) throw httpError(404, "Application not found.");
  if (!["shortlisted", "viewed", "submitted"].includes(app.status)) throw httpError(400, "This application cannot receive an offer.");

  // Check no pending offer exists for this freelancer on this project
  const pendingOffer = await db.get(
    "SELECT id FROM offers WHERE project_id = ? AND freelancer_id = ? AND status = 'pending'",
    [projectId, app.freelancer_id]
  );
  if (pendingOffer) throw httpError(409, "A pending offer already exists for this freelancer.");

  const fees = computeFees(project.budget_paise);
  const expiryHours = parseInt(process.env.OFFER_EXPIRY_HOURS || "72");
  const offerId = id();
  const ts = now();

  await db.run(
    `INSERT INTO offers (id, project_id, application_id, client_id, freelancer_id,
       gross_paise, platform_fee_paise, tax_paise, net_paise, platform_fee_pct,
       message, terms, expires_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [offerId, projectId, application_id, req.user.id, app.freelancer_id,
     fees.grossPaise, fees.platformFeePaise, fees.taxPaise, fees.netPaise, fees.feePct,
     message || null, terms || null, addHours(ts, expiryHours), ts, ts]
  );

  await db.run(
    "UPDATE applications SET status = 'hired', updated_at = ? WHERE id = ?",
    [ts, application_id]
  );
  await db.run(
    "UPDATE projects SET status = 'offer_sent', updated_at = ? WHERE id = ?",
    [ts, projectId]
  );

  await notify(
    app.freelancer_id, TYPES.OFFER_SENT,
    `New offer for "${project.title}"`,
    `A client has sent you an offer. It expires in ${expiryHours} hours.`,
    `/offers/${offerId}`
  );

  res.status(201).json({ offer: await db.get("SELECT * FROM offers WHERE id = ?", [offerId]) });
});

// ── Respond to Offer (freelancer) ─────────────────────────
const respondToOffer = asyncHandler(async (req, res) => {
  if (req.user.active_role !== "freelancer") throw httpError(403, "Switch to freelancer role.");
  const { offerId } = req.params;
  const { action, decline_reason } = req.body; // action: 'accept' | 'decline'

  const offer = await db.get(
    "SELECT * FROM offers WHERE id = ? AND freelancer_id = ?",
    [offerId, req.user.id]
  );
  if (!offer) throw httpError(404, "Offer not found.");
  if (offer.status !== "pending") throw httpError(400, "This offer is no longer active.");
  if (offer.expires_at < now()) {
    await db.run("UPDATE offers SET status = 'expired', updated_at = ? WHERE id = ?", [now(), offerId]);
    throw httpError(400, "This offer has expired.");
  }

  if (!["accept", "decline"].includes(action)) throw httpError(400, "Action must be 'accept' or 'decline'.");

  const ts = now();
  if (action === "accept") {
    await db.run(
      "UPDATE offers SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, offerId]
    );
    await db.run(
      `UPDATE projects SET status = 'awaiting_funding', hired_freelancer_id = ?, hired_at = ?, updated_at = ? WHERE id = ?`,
      [req.user.id, ts, ts, offer.project_id]
    );
    await notify(offer.client_id, TYPES.OFFER_ACCEPTED,
      "Offer accepted",
      "The freelancer accepted your offer. Please fund the first milestone to begin.",
      `/projects/${offer.project_id}/workspace`
    );
  } else {
    await db.run(
      "UPDATE offers SET status = 'declined', declined_at = ?, decline_reason = ?, updated_at = ? WHERE id = ?",
      [ts, decline_reason || null, ts, offerId]
    );
    await db.run(
      "UPDATE projects SET status = 'shortlisting', updated_at = ? WHERE id = ?",
      [ts, offer.project_id]
    );
    await notify(offer.client_id, TYPES.OFFER_DECLINED,
      "Offer declined",
      "The freelancer declined your offer.",
      `/projects/${offer.project_id}/applications`
    );
  }

  res.json({ offer: await db.get("SELECT * FROM offers WHERE id = ?", [offerId]) });
});

// ── Fund Milestone (simulated gateway) ───────────────────
const fundMilestone = asyncHandler(async (req, res) => {
  const { projectId, mileId } = req.params;

  // PRD §13 CRITICAL LAUNCH GATE / OFR-03: no approved payment provider yet.
  // Funding is disabled unless PAYMENTS_MODE=sandbox (never in production), and
  // sandbox entries are explicitly labelled — they are NOT provider confirmations.
  if (POLICY.PAYMENTS_MODE !== "sandbox") {
    throw httpError(503,
      "Milestone funding isn't available yet. CreoTask will enable payments only through an approved payment provider.",
      "PAYMENTS_DISABLED");
  }

  const project = await db.get(
    "SELECT * FROM projects WHERE id = ? AND client_id = ?",
    [projectId, req.user.id]
  );
  if (!project) throw httpError(404, "Project not found.");
  if (!["awaiting_funding", "active"].includes(project.status)) throw httpError(400, "Project is not awaiting funding.");

  const ms = await db.get(
    "SELECT * FROM milestones WHERE id = ? AND project_id = ?",
    [mileId, projectId]
  );
  if (!ms) throw httpError(404, "Milestone not found.");
  if (ms.status !== "not_funded") throw httpError(400, "This milestone is not awaiting funding.");

  const idempKey = `funding-${projectId}-${mileId}-${req.user.id}`;
  const existing = await db.get("SELECT id FROM ledger WHERE idempotency_key = ?", [idempKey]);
  if (existing) throw httpError(409, "This milestone was already funded.");

  const ts = now();

  // Simulated payment: in production this would redirect to Razorpay/Stripe checkout
  await db.run(
    `INSERT INTO ledger (id, idempotency_key, project_id, milestone_id, payer_id, payee_id, entry_type, amount_paise, currency, provider, provider_ref, provider_status, note, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'funding', ?, 'INR', 'sandbox', ?, 'sandbox_test', 'SANDBOX milestone funding — no real money', ?, ?)`,
    [id(), idempKey, projectId, mileId, req.user.id, project.hired_freelancer_id,
     ms.budget_paise, `sandbox_${id()}`, req.user.id, ts]
  );

  await db.run(
    "UPDATE milestones SET status = 'funded', funded_at = ?, updated_at = ? WHERE id = ?",
    [ts, ts, mileId]
  );

  // Set project to active after first funding
  if (project.status === "awaiting_funding") {
    await db.run("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?", [ts, projectId]);
  }

  await notify(project.hired_freelancer_id, TYPES.MILESTONE_FUNDED,
    `Milestone funded: "${ms.title}"`,
    "The client has funded this milestone. You can begin work.",
    `/projects/${projectId}/workspace`
  );

  // Post system message in workspace
  await db.run(
    `INSERT INTO messages (id, project_id, sender_id, sender_role, content, created_at)
     VALUES (?, ?, ?, 'system', ?, ?)`,
    [id(), projectId, req.user.id, `[SANDBOX] Test funding recorded for milestone "${ms.title}" (₹${ms.budget_paise/100}). No real money moved.`, ts]
  );

  res.json({
    milestone: await db.get("SELECT * FROM milestones WHERE id = ?", [mileId]),
    payments_mode: "sandbox",
    message: "SANDBOX: test funding recorded. No real money moved and nothing is held by a provider.",
  });
});

// ── Submit Deliverable ────────────────────────────────────
const submitDeliverable = asyncHandler(async (req, res) => {
  if (req.user.active_role !== "freelancer") throw httpError(403, "Switch to freelancer role.");
  const { projectId, mileId } = req.params;
  const { note, external_links = [] } = req.body;

  const project = await db.get("SELECT * FROM projects WHERE id = ? AND hired_freelancer_id = ?", [projectId, req.user.id]);
  if (!project) throw httpError(403, "You are not the hired freelancer for this project.");

  const ms = await db.get(
    "SELECT * FROM milestones WHERE id = ? AND project_id = ?",
    [mileId, projectId]
  );
  if (!ms) throw httpError(404, "Milestone not found.");
  if (!["funded", "in_progress", "revision_requested"].includes(ms.status)) {
    throw httpError(400, "This milestone is not ready for submission.");
  }

  // Get latest version number
  const latestDel = await db.get(
    "SELECT MAX(version) as v FROM deliverables WHERE milestone_id = ?",
    [mileId]
  );
  const version = (latestDel?.v || 0) + 1;
  const delId = id();
  const ts = now();

  await db.run(
    `INSERT INTO deliverables (id, milestone_id, project_id, submitted_by, version, note, files, external_links, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, 'pending', ?)`,
    [delId, mileId, projectId, req.user.id, version, note || null, JSON.stringify(external_links), ts]
  );

  await db.run(
    "UPDATE milestones SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?",
    [ts, ts, mileId]
  );

  await notify(project.client_id, TYPES.MILESTONE_SUBMITTED,
    `Deliverable submitted for "${ms.title}"`,
    "The freelancer has submitted work for your review.",
    `/projects/${projectId}/workspace`
  );

  res.status(201).json({ deliverable: await db.get("SELECT * FROM deliverables WHERE id = ?", [delId]) });
});

// ── Review Deliverable (accept / request revision) ────────
const reviewDeliverable = asyncHandler(async (req, res) => {
  const { projectId, mileId } = req.params;
  const { action, note } = req.body; // action: 'accept' | 'request_revision'

  const project = await db.get("SELECT * FROM projects WHERE id = ? AND client_id = ?", [projectId, req.user.id]);
  if (!project) throw httpError(403, "Only the client can review deliverables.");

  const ms = await db.get(
    "SELECT * FROM milestones WHERE id = ? AND project_id = ? AND status = 'submitted'",
    [mileId, projectId]
  );
  if (!ms) throw httpError(404, "No submitted milestone found.");

  if (!["accept", "request_revision"].includes(action)) throw httpError(400, "Action must be 'accept' or 'request_revision'.");

  const ts = now();

  if (action === "accept") {
    await db.run(
      "UPDATE milestones SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, mileId]
    );
    // Auto-release funds
    await releaseMilestoneFunds(project, ms, req.user.id, ts);

    // Check if all milestones complete
    const pending = await db.get(
      "SELECT COUNT(*) as n FROM milestones WHERE project_id = ? AND status NOT IN ('released','accepted')",
      [projectId]
    );
    if (!pending?.n) {
      await db.run(
        "UPDATE projects SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
        [ts, ts, projectId]
      );
      // Update stats
      await updateCompletionStats(project, ts);
    }

    await notify(project.hired_freelancer_id, TYPES.MILESTONE_ACCEPTED,
      `Milestone accepted: "${ms.title}"`,
      "Great work! The client has accepted your deliverable and funds have been released.",
      `/projects/${projectId}/workspace`
    );
  } else {
    // Revision
    if (ms.revisions_used >= ms.max_revisions) {
      throw httpError(400, `Maximum revisions (${ms.max_revisions}) already used for this milestone. Use a Change Order or raise a dispute.`);
    }
    await db.run(
      "UPDATE milestones SET status = 'revision_requested', revisions_used = revisions_used + 1, updated_at = ? WHERE id = ?",
      [ts, mileId]
    );
    await db.run(
      "UPDATE deliverables SET status = 'revision_requested', reviewer_note = ?, reviewed_at = ? WHERE milestone_id = ? AND status = 'pending'",
      [note || null, ts, mileId]
    );
    await notify(project.hired_freelancer_id, TYPES.REVISION_REQUESTED,
      `Revision requested for "${ms.title}"`,
      note || "The client has requested a revision.",
      `/projects/${projectId}/workspace`
    );
  }

  res.json({ milestone: await db.get("SELECT * FROM milestones WHERE id = ?", [mileId]) });
});

async function releaseMilestoneFunds(project, ms, actorId, ts) {
  const fees = computeFees(ms.budget_paise);
  const idempKey = `release-${project.id}-${ms.id}`;
  const existing = await db.get("SELECT id FROM ledger WHERE idempotency_key = ?", [idempKey]);
  if (existing) return;

  // Record release, fee, and net payout
  await db.run(
    `INSERT INTO ledger (id, idempotency_key, project_id, milestone_id, payer_id, payee_id, entry_type, amount_paise, currency, provider, note, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'milestone_release', ?, 'INR', 'sandbox', 'SANDBOX milestone release — no real money', ?, ?)`,
    [id(), idempKey, project.id, ms.id, project.client_id, project.hired_freelancer_id, fees.grossPaise, actorId, ts]
  );
  await db.run(
    `INSERT INTO ledger (id, idempotency_key, project_id, milestone_id, payer_id, payee_id, entry_type, amount_paise, currency, provider, note, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'platform_fee', ?, 'INR', 'sandbox', 'SANDBOX platform fee — no real money', ?, ?)`,
    [id(), `fee-${project.id}-${ms.id}`, project.id, ms.id, project.hired_freelancer_id, null, fees.platformFeePaise, actorId, ts]
  );

  await db.run(
    "UPDATE milestones SET status = 'released', released_at = ?, updated_at = ? WHERE id = ?",
    [ts, ts, ms.id]
  );
  // Update freelancer earnings
  await db.run(
    "UPDATE freelancer_profiles SET total_earned_paise = total_earned_paise + ?, updated_at = ? WHERE user_id = ?",
    [fees.netPaise, ts, project.hired_freelancer_id]
  );
}

async function updateCompletionStats(project, ts) {
  // Update freelancer stats
  const previousClientIds = await db.all(
    "SELECT DISTINCT client_id FROM projects WHERE hired_freelancer_id = ? AND status = 'completed' AND id != ?",
    [project.hired_freelancer_id, project.id]
  );
  const isNewClient = !previousClientIds.find(r => r.client_id === project.client_id);

  await db.run(
    `UPDATE freelancer_profiles SET
       total_projects_completed = total_projects_completed + 1,
       total_unique_clients = total_unique_clients + ?,
       creostart_eligible = CASE WHEN total_projects_completed >= 2 THEN 0 ELSE creostart_eligible END,
       updated_at = ?
     WHERE user_id = ?`,
    [isNewClient ? 1 : 0, ts, project.hired_freelancer_id]
  );
  await db.run(
    "UPDATE client_profiles SET total_projects_completed = total_projects_completed + 1, updated_at = ? WHERE user_id = ?",
    [ts, project.client_id]
  );
}

// ── Send Message ──────────────────────────────────────────
const sendMessage = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { content } = req.body;
  if (!content?.trim()) throw httpError(400, "Message content is required.");

  const project = await db.get("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!project) throw httpError(404, "Project not found.");

  // Only participants can message
  if (req.user.id !== project.client_id && req.user.id !== project.hired_freelancer_id) {
    throw httpError(403, "Only project participants can send messages.");
  }

  const role = req.user.id === project.client_id ? "client" : "freelancer";
  const msgId = id();
  await db.run(
    `INSERT INTO messages (id, project_id, sender_id, sender_role, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [msgId, projectId, req.user.id, role, content.trim(), now()]
  );

  const recipientId = role === "client" ? project.hired_freelancer_id : project.client_id;
  if (recipientId) {
    await notify(recipientId, TYPES.MESSAGE_RECEIVED,
      "New message",
      content.trim().slice(0, 100),
      `/projects/${projectId}/workspace`
    );
  }

  res.status(201).json({ message: await db.get("SELECT * FROM messages WHERE id = ?", [msgId]) });
});

// ── Submit Review ─────────────────────────────────────────
const submitReview = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { rating, comment } = req.body;

  const project = await db.get("SELECT * FROM projects WHERE id = ? AND status = 'completed'", [projectId]);
  if (!project) throw httpError(404, "Project not found or not yet completed.");

  if (req.user.id !== project.client_id && req.user.id !== project.hired_freelancer_id) {
    throw httpError(403, "Only project participants can leave reviews.");
  }

  if (!rating || rating < 1 || rating > 5) throw httpError(400, "Rating must be between 1 and 5.");

  const reviewerRole = req.user.id === project.client_id ? "client" : "freelancer";
  const revieweeId   = reviewerRole === "client" ? project.hired_freelancer_id : project.client_id;

  const existing = await db.get("SELECT id FROM reviews WHERE project_id = ? AND reviewer_id = ?", [projectId, req.user.id]);
  if (existing) throw httpError(409, "You have already submitted a review for this project.");

  await db.run(
    `INSERT INTO reviews (id, project_id, reviewer_id, reviewee_id, reviewer_role, rating, comment, is_visible, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [id(), projectId, req.user.id, revieweeId, reviewerRole, parseInt(rating), comment || null, now()]
  );

  // Check if both parties have reviewed — reveal both reviews (double-blind)
  const bothReviewed = await db.get(
    "SELECT COUNT(*) as n FROM reviews WHERE project_id = ?",
    [projectId]
  );
  if (bothReviewed?.n >= 2) {
    await db.run("UPDATE reviews SET is_visible = 1 WHERE project_id = ?", [projectId]);
    await updateRatingStats(revieweeId);
    await updateRatingStats(req.user.id);

    // Re-evaluate tiers for freelancer
    await reevaluateFreelancerTier(project.hired_freelancer_id);
  }

  await notify(revieweeId, TYPES.REVIEW_RECEIVED,
    "New review received",
    comment?.slice(0, 80) || `${rating}/5 stars`,
    `/profiles/${revieweeId}`
  );

  res.status(201).json({ message: "Review submitted. It will be visible once both parties have reviewed." });
});

async function updateRatingStats(userId) {
  const stats = await db.get(
    "SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE reviewee_id = ? AND is_visible = 1",
    [userId]
  );
  await db.run(
    "UPDATE freelancer_profiles SET avg_rating = ?, total_reviews = ?, updated_at = ? WHERE user_id = ?",
    [Math.round((stats?.avg || 0) * 10) / 10, stats?.count || 0, now(), userId]
  );
}

async function reevaluateFreelancerTier(userId) {
  const fp = await db.get("SELECT * FROM freelancer_profiles WHERE user_id = ?", [userId]);
  if (!fp) return;
  const verifiedSkillCount = (await db.get("SELECT COUNT(*) as n FROM skills WHERE user_id = ? AND verification_status = 'verified'", [userId]))?.n || 0;
  const openDisputeCount   = (await db.get("SELECT COUNT(*) as n FROM disputes WHERE raised_by = ? AND status IN ('opened','evidence_collection','assigned','under_review')", [userId]))?.n || 0;
  const { evaluateTier } = require("../utils/tierEngine");
  const { tier: newTier } = evaluateTier(fp, verifiedSkillCount, openDisputeCount);

  if (newTier !== fp.tier) {
    const ts = now();
    await db.run(
      "UPDATE freelancer_profiles SET tier = ?, tier_updated_at = ?, updated_at = ? WHERE user_id = ?",
      [newTier, ts, ts, userId]
    );
    await db.run(
      `INSERT INTO tier_events (id, user_id, from_tier, to_tier, trigger_reason, evaluated_by, created_at)
       VALUES (?, ?, ?, ?, 'project_completion_review', 'system', ?)`,
      [id(), userId, fp.tier, newTier, ts]
    );
    await notify(userId, TYPES.TIER_UPGRADED,
      `Tier updated: ${fp.tier} → ${newTier}`,
      "Your evidence has been evaluated and your tier has been updated.",
      `/dashboard`
    );
  }
}

// ── Open Dispute ──────────────────────────────────────────
const openDispute = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { milestone_id, reason, description } = req.body;

  const project = await db.get("SELECT * FROM projects WHERE id = ? AND status = 'active'", [projectId]);
  if (!project) throw httpError(404, "Active project not found.");
  if (req.user.id !== project.client_id && req.user.id !== project.hired_freelancer_id) {
    throw httpError(403, "Only project participants can raise disputes.");
  }
  if (!reason?.trim()) throw httpError(400, "Dispute reason is required.");

  const raiserRole = req.user.id === project.client_id ? "client" : "freelancer";
  const disputeId  = id();
  const ts = now();

  await db.run(
    `INSERT INTO disputes (id, project_id, milestone_id, raised_by, raiser_role, reason, description, evidence_files, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'opened', ?, ?)`,
    [disputeId, projectId, milestone_id || null, req.user.id, raiserRole, reason.trim(), description || null, ts, ts]
  );
  await db.run("UPDATE projects SET status = 'disputed', updated_at = ? WHERE id = ?", [ts, projectId]);

  const otherParty = raiserRole === "client" ? project.hired_freelancer_id : project.client_id;
  await notify(otherParty, TYPES.DISPUTE_OPENED,
    "A dispute has been raised",
    `A dispute was raised on project "${project.title}". Our team will review shortly.`,
    `/disputes/${disputeId}`
  );

  res.status(201).json({ dispute: await db.get("SELECT * FROM disputes WHERE id = ?", [disputeId]) });
});

// ── Submit Change Order ───────────────────────────────────
const submitChangeOrder = asyncHandler(async (req, res) => {
  const { projectId, mileId } = req.params;
  const { scope_note, budget_delta_paise = 0, timeline_delta_days = 0 } = req.body;

  const project = await db.get("SELECT * FROM projects WHERE id = ? AND status = 'active'", [projectId]);
  if (!project) throw httpError(404, "Active project not found.");
  if (req.user.id !== project.client_id && req.user.id !== project.hired_freelancer_id) {
    throw httpError(403, "Only project participants can submit change orders.");
  }

  const requesterRole = req.user.id === project.client_id ? "client" : "freelancer";
  const coId = id();
  await db.run(
    `INSERT INTO change_orders (id, project_id, milestone_id, requested_by, requester_role, scope_note, budget_delta_paise, timeline_delta_days, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [coId, projectId, mileId || null, req.user.id, requesterRole, scope_note || null,
     parseInt(budget_delta_paise), parseInt(timeline_delta_days), now()]
  );

  const otherParty = requesterRole === "client" ? project.hired_freelancer_id : project.client_id;
  await notify(otherParty, TYPES.CHANGE_ORDER_RECEIVED,
    "Change order request received",
    scope_note || "A change order has been proposed.",
    `/projects/${projectId}/workspace`
  );

  res.status(201).json({ changeOrder: await db.get("SELECT * FROM change_orders WHERE id = ?", [coId]) });
});

// ── Respond to Change Order ───────────────────────────────
const respondToChangeOrder = asyncHandler(async (req, res) => {
  const { projectId, coId } = req.params;
  const { action, responder_note } = req.body;

  const project = await db.get("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!project) throw httpError(404, "Project not found.");

  const co = await db.get("SELECT * FROM change_orders WHERE id = ? AND project_id = ? AND status = 'pending'", [coId, projectId]);
  if (!co) throw httpError(404, "Pending change order not found.");

  // The OTHER party must respond
  if (req.user.id === co.requested_by) throw httpError(400, "You cannot respond to your own change order.");
  if (req.user.id !== project.client_id && req.user.id !== project.hired_freelancer_id) {
    throw httpError(403, "Not a project participant.");
  }

  if (!["accept", "reject"].includes(action)) throw httpError(400, "Action must be 'accept' or 'reject'.");

  const status = action === "accept" ? "accepted" : "rejected";
  const ts = now();
  await db.run(
    "UPDATE change_orders SET status = ?, responder_note = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
    [status, responder_note || null, ts, req.user.id, coId]
  );

  if (action === "accept" && co.milestone_id) {
    // Apply budget and timeline changes
    if (co.budget_delta_paise !== 0) {
      await db.run(
        "UPDATE milestones SET budget_paise = budget_paise + ?, updated_at = ? WHERE id = ?",
        [co.budget_delta_paise, ts, co.milestone_id]
      );
      await db.run(
        "UPDATE projects SET budget_paise = budget_paise + ?, updated_at = ? WHERE id = ?",
        [co.budget_delta_paise, ts, projectId]
      );
    }
    if (co.timeline_delta_days !== 0 && (await db.get("SELECT due_at FROM milestones WHERE id = ?", [co.milestone_id]))?.due_at) {
      await db.run(
        "UPDATE milestones SET due_at = due_at + ?, updated_at = ? WHERE id = ?",
        [co.timeline_delta_days * 86400000, ts, co.milestone_id]
      );
    }
  }

  const notifType = status === "accepted" ? TYPES.CHANGE_ORDER_ACCEPTED : TYPES.CHANGE_ORDER_REJECTED;
  await notify(co.requested_by, notifType,
    `Change order ${status}`,
    responder_note || null,
    `/projects/${projectId}/workspace`
  );

  res.json({ changeOrder: await db.get("SELECT * FROM change_orders WHERE id = ?", [coId]) });
});

module.exports = {
  createProject, publishProject, browseProjects, getProject, myProjects,
  applyToProject, listApplications, updateApplication,
  sendOffer, respondToOffer,
  fundMilestone, submitDeliverable, reviewDeliverable,
  sendMessage, submitReview,
  openDispute,
  submitChangeOrder, respondToChangeOrder,
};
