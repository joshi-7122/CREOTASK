/* =========================================================
   CREOTASK — Admin Controller
   GET  /api/admin/stats
   GET  /api/admin/users
   PUT  /api/admin/users/:userId/ban
   PUT  /api/admin/users/:userId/unban
   GET  /api/admin/projects
   PUT  /api/admin/projects/:projectId/moderate
   GET  /api/admin/skill-queue
   PUT  /api/admin/skill-queue/:qId
   GET  /api/admin/disputes
   PUT  /api/admin/disputes/:disputeId
   GET  /api/admin/ledger
   POST /api/admin/users/:userId/set-admin
   GET  /api/admin/tier-events
   POST /api/admin/users/:userId/evaluate-tier
   ========================================================= */
"use strict";
const db = require("../config/db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { id, now } = require("../utils/helpers");
const { evaluateTier } = require("../utils/tierEngine");
const { notify, TYPES } = require("../utils/notify");
const { audit } = require("../utils/audit");
const { revokeAllSessions } = require("../services/sessions");
const { SUSPENSION_REASONS } = require("../config/catalog");

const getStats = asyncHandler(async (req, res) => {
  const [users, freelancers, clients, projects, openDisputes, pendingSkills, totalLedger] = await Promise.all([
    db.get("SELECT COUNT(*) as n FROM users WHERE is_active = 1"),
    db.get("SELECT COUNT(*) as n FROM freelancer_profiles"),
    db.get("SELECT COUNT(*) as n FROM client_profiles"),
    db.get("SELECT COUNT(*) as n, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM projects"),
    db.get("SELECT COUNT(*) as n FROM disputes WHERE status NOT IN ('closed')"),
    db.get("SELECT COUNT(*) as n FROM skill_verification_queue WHERE status = 'pending'"),
    db.get("SELECT SUM(amount_paise) as total FROM ledger WHERE entry_type = 'milestone_release'"),
  ]);
  res.json({ users, freelancers, clients, projects, openDisputes, pendingSkills, totalLedger });
});

const listUsers = asyncHandler(async (req, res) => {
  const { q, role, page = "1", limit = "50" } = req.query;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;

  let where = ["1=1"];
  const params = [];
  if (q) { where.push("(u.email LIKE ? OR fp.display_name LIKE ? OR cp.display_name LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (role === "freelancer") where.push("fp.user_id IS NOT NULL");
  if (role === "client") where.push("cp.user_id IS NOT NULL");

  const whereSQL = "WHERE " + where.join(" AND ");
  const total = (await db.get(`SELECT COUNT(DISTINCT u.id) as n FROM users u LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id LEFT JOIN client_profiles cp ON cp.user_id = u.id ${whereSQL}`, params))?.n || 0;
  const rows = await db.all(
    `SELECT u.id, u.email, u.email_verified, u.is_active, u.is_banned, u.active_role, u.created_at,
            fp.display_name as freelancer_name, fp.tier, fp.kyc_status,
            cp.display_name as client_name
     FROM users u
     LEFT JOIN freelancer_profiles fp ON fp.user_id = u.id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     ${whereSQL}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, lim, offset]
  );
  res.json({ data: rows, pagination: { page: pg, limit: lim, total } });
});

// Suspension (TRUST-05 foundation). Full appeal workflow + in-flight work handling: Phase 4.
const banUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason, reason_category } = req.body || {};
  if (!reason?.trim()) throw httpError(400, "An internal note explaining the suspension is required.", "VALIDATION_FAILED");
  if (!SUSPENSION_REASONS[reason_category]) {
    throw httpError(400, `reason_category must be one of: ${Object.keys(SUSPENSION_REASONS).join(", ")}.`, "VALIDATION_FAILED");
  }
  if (req.adminRole !== "super_admin" && req.adminRole !== "admin") throw httpError(403, "Insufficient admin role.", "STAFF_ROLE_REQUIRED");
  if (userId === req.user.id) throw httpError(400, "You can't suspend your own account.", "SELF_ACTION");
  const target = await db.get("SELECT id, is_banned FROM users WHERE id = ?", [userId]);
  if (!target) throw httpError(404, "User not found.", "NOT_FOUND");

  await db.transaction(async () => {
    await db.run(
      "UPDATE users SET is_banned = 1, ban_reason = ?, suspension_reason_category = ?, suspended_at = ?, updated_at = ? WHERE id = ?",
      [reason.trim(), reason_category, now(), now(), userId]
    );
    await revokeAllSessions(userId, "suspended");
    await audit({ actorId: req.user.id, action: "user.suspended", entityType: "user", entityId: userId,
                  before: { is_banned: !!target.is_banned }, after: { is_banned: true, reason_category },
                  reasonCode: reason_category, note: reason.trim(), ip: req.ip });
  });
  res.json({ message: "User suspended and signed out of all sessions." });
});

const unbanUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body || {};
  if (req.adminRole !== "super_admin" && req.adminRole !== "admin") throw httpError(403, "Insufficient admin role.", "STAFF_ROLE_REQUIRED");
  const target = await db.get("SELECT id, is_banned, suspension_reason_category FROM users WHERE id = ?", [userId]);
  if (!target) throw httpError(404, "User not found.", "NOT_FOUND");
  await db.transaction(async () => {
    await db.run(
      "UPDATE users SET is_banned = 0, ban_reason = NULL, suspension_reason_category = NULL, suspended_at = NULL, updated_at = ? WHERE id = ?",
      [now(), userId]
    );
    await audit({ actorId: req.user.id, action: "user.reinstated", entityType: "user", entityId: userId,
                  before: { is_banned: !!target.is_banned, reason_category: target.suspension_reason_category },
                  after: { is_banned: false }, reasonCode: "reinstated", note: reason?.trim() || null, ip: req.ip });
  });
  res.json({ message: "User reinstated." });
});

const listProjects = asyncHandler(async (req, res) => {
  const { status, moderation_status, page = "1" } = req.query;
  const pg = Math.max(1, parseInt(page));
  const lim = 50;
  const offset = (pg - 1) * lim;

  let where = ["1=1"];
  const params = [];
  if (status) { where.push("p.status = ?"); params.push(status); }
  if (moderation_status) { where.push("p.moderation_status = ?"); params.push(moderation_status); }

  const whereSQL = "WHERE " + where.join(" AND ");
  const total = (await db.get(`SELECT COUNT(*) as n FROM projects p ${whereSQL}`, params))?.n || 0;
  const rows = await db.all(
    `SELECT p.*, cp.display_name as client_name FROM projects p
     JOIN client_profiles cp ON cp.user_id = p.client_id
     ${whereSQL}
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, lim, offset]
  );
  res.json({ data: rows, pagination: { page: pg, limit: lim, total } });
});

const moderateProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { action, note } = req.body; // action: 'approve' | 'reject' | 'flag'
  if (!["approve", "reject", "flag"].includes(action)) throw httpError(400, "Invalid action.");
  const statusMap = { approve: "approved", reject: "rejected", flag: "flagged" };
  const ts = now();
  await db.run(
    "UPDATE projects SET moderation_status = ?, moderation_note = ?, moderated_by = ?, moderated_at = ?, updated_at = ? WHERE id = ?",
    [statusMap[action], note || null, req.user.id, ts, ts, projectId]
  );
  if (action === "reject") {
    await db.run("UPDATE projects SET status = 'rejected', updated_at = ? WHERE id = ?", [ts, projectId]);
  }
  res.json({ message: `Project ${action}d.` });
});

const listSkillQueue = asyncHandler(async (req, res) => {
  const { status = "pending" } = req.query;
  const rows = await db.all(
    `SELECT svq.*, s.name as skill_name, s.proficiency, fp.display_name, fp.tier
     FROM skill_verification_queue svq
     JOIN skills s ON s.id = svq.skill_id
     JOIN freelancer_profiles fp ON fp.user_id = svq.user_id
     WHERE svq.status = ?
     ORDER BY svq.created_at`,
    [status]
  );
  res.json({ data: rows });
});

const reviewSkillVerification = asyncHandler(async (req, res) => {
  const { qId } = req.params;
  const { action, review_note } = req.body; // action: 'approve' | 'reject'
  if (!["approve", "reject"].includes(action)) throw httpError(400, "Action must be 'approve' or 'reject'.");

  const q = await db.get("SELECT * FROM skill_verification_queue WHERE id = ?", [qId]);
  if (!q) throw httpError(404, "Queue item not found.");
  if (q.status !== "pending" && q.status !== "under_review") throw httpError(400, "Already reviewed.");

  const ts = now();
  const verStatus = action === "approve" ? "verified" : "rejected";
  const qStatus   = action === "approve" ? "approved" : "rejected";

  await db.run(
    "UPDATE skills SET verification_status = ?, verified_at = ?, verified_by = ?, verification_note = ? WHERE id = ?",
    [verStatus, action === "approve" ? ts : null, action === "approve" ? req.user.id : null, review_note || null, q.skill_id]
  );
  await db.run(
    "UPDATE skill_verification_queue SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = ? WHERE id = ?",
    [qStatus, req.user.id, review_note || null, ts, qId]
  );

  if (action === "approve") {
    await notify(q.user_id, TYPES.SKILL_VERIFIED, "Skill verified!", review_note || "Your skill has been verified by our team.", `/dashboard`);
    // Re-evaluate tier
    const fp = await db.get("SELECT * FROM freelancer_profiles WHERE user_id = ?", [q.user_id]);
    const verifiedSkillCount = (await db.get("SELECT COUNT(*) as n FROM skills WHERE user_id = ? AND verification_status = 'verified'", [q.user_id]))?.n || 0;
    const { tier: newTier } = evaluateTier(fp, verifiedSkillCount, 0);
    if (newTier !== fp.tier) {
      await db.run("UPDATE freelancer_profiles SET tier = ?, tier_updated_at = ?, updated_at = ? WHERE user_id = ?", [newTier, ts, ts, q.user_id]);
      await db.run(
        `INSERT INTO tier_events (id, user_id, from_tier, to_tier, trigger_reason, evaluated_by, admin_id, created_at)
         VALUES (?, ?, ?, ?, 'skill_verified', 'admin', ?, ?)`,
        [id(), q.user_id, fp.tier, newTier, req.user.id, ts]
      );
    }
  }

  res.json({ message: `Skill ${action}d.` });
});

const listDisputes = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status ? "WHERE d.status = ?" : "";
  const rows = await db.all(
    `SELECT d.*, p.title as project_title, fp.display_name as raiser_name
     FROM disputes d
     JOIN projects p ON p.id = d.project_id
     LEFT JOIN freelancer_profiles fp ON fp.user_id = d.raised_by
     LEFT JOIN client_profiles cp ON cp.user_id = d.raised_by
     ${where}
     ORDER BY d.created_at DESC`,
    status ? [status] : []
  );
  res.json({ data: rows });
});

const resolveDispute = asyncHandler(async (req, res) => {
  const { disputeId } = req.params;
  const { action, decision, note, resolution } = req.body;
  // action: 'assign' | 'decide'

  const dispute = await db.get("SELECT * FROM disputes WHERE id = ?", [disputeId]);
  if (!dispute) throw httpError(404, "Dispute not found.");

  const ts = now();
  if (action === "assign") {
    await db.run(
      "UPDATE disputes SET status = 'assigned', assigned_to = ?, updated_at = ? WHERE id = ?",
      [req.user.id, ts, disputeId]
    );
  } else if (action === "decide") {
    if (!decision || !resolution) throw httpError(400, "Decision and resolution are required.");
    const validResolutions = ["client_refund", "freelancer_payout", "partial", "dismissed"];
    if (!validResolutions.includes(resolution)) throw httpError(400, "Invalid resolution.");

    await db.run(
      `UPDATE disputes SET status = 'decision', decision = ?, decision_note = ?, resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
      [decision, note || null, resolution, ts, ts, disputeId]
    );

    // Apply resolution
    const project = await db.get("SELECT * FROM projects WHERE id = ?", [dispute.project_id]);
    if (resolution === "client_refund" || resolution === "dismissed") {
      await db.run("UPDATE projects SET status = 'cancelled', updated_at = ? WHERE id = ?", [ts, dispute.project_id]);
    } else {
      await db.run("UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?", [ts, dispute.project_id]);
    }

    await notify(dispute.raised_by, TYPES.DISPUTE_RESOLVED, "Dispute resolved", decision, `/disputes/${disputeId}`);
    const otherParty = dispute.raiser_role === "client" ? project.hired_freelancer_id : project.client_id;
    if (otherParty) await notify(otherParty, TYPES.DISPUTE_RESOLVED, "Dispute resolved", decision, `/disputes/${disputeId}`);
  }

  res.json({ dispute: await db.get("SELECT * FROM disputes WHERE id = ?", [disputeId]) });
});

const getLedger = asyncHandler(async (req, res) => {
  const { project_id, page = "1" } = req.query;
  const pg = Math.max(1, parseInt(page));
  const lim = 50;
  const offset = (pg - 1) * lim;

  const where = project_id ? "WHERE l.project_id = ?" : "";
  const params = project_id ? [project_id] : [];
  const total = (await db.get(`SELECT COUNT(*) as n FROM ledger l ${where}`, params))?.n || 0;
  const rows = await db.all(
    `SELECT l.*, p.title as project_title FROM ledger l
     LEFT JOIN projects p ON p.id = l.project_id
     ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [...params, lim, offset]
  );
  res.json({ data: rows, pagination: { page: pg, limit: lim, total } });
});

const setAdmin = asyncHandler(async (req, res) => {
  if (req.adminRole !== "super_admin") throw httpError(403, "Only super admins can grant admin roles.");
  const { userId } = req.params;
  const { admin_role } = req.body;
  const valid = ["admin", "moderator", "finance"];
  if (!valid.includes(admin_role)) throw httpError(400, `admin_role must be one of: ${valid.join(", ")}`);

  const user = await db.get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!user) throw httpError(404, "User not found.");

  await db.run(
    `INSERT OR REPLACE INTO admins (user_id, admin_role, granted_by, created_at) VALUES (?, ?, ?, ?)`,
    [userId, admin_role, req.user.id, now()]
  );
  res.json({ message: `${userId} granted ${admin_role} role.` });
});

const evaluateUserTier = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const fp = await db.get("SELECT * FROM freelancer_profiles WHERE user_id = ?", [userId]);
  if (!fp) throw httpError(404, "Freelancer profile not found.");

  const verifiedSkillCount = (await db.get("SELECT COUNT(*) as n FROM skills WHERE user_id = ? AND verification_status = 'verified'", [userId]))?.n || 0;
  const openDisputeCount   = (await db.get("SELECT COUNT(*) as n FROM disputes WHERE raised_by = ? AND status IN ('opened','evidence_collection','assigned','under_review')", [userId]))?.n || 0;
  const { tier: newTier, evidence, unmetCriteria } = evaluateTier(fp, verifiedSkillCount, openDisputeCount);

  if (newTier !== fp.tier) {
    const ts = now();
    await db.run("UPDATE freelancer_profiles SET tier = ?, tier_updated_at = ?, updated_at = ? WHERE user_id = ?", [newTier, ts, ts, userId]);
    await db.run(
      `INSERT INTO tier_events (id, user_id, from_tier, to_tier, trigger_reason, evaluated_by, admin_id, evidence, created_at)
       VALUES (?, ?, ?, ?, 'admin_manual_evaluation', 'admin', ?, ?, ?)`,
      [id(), userId, fp.tier, newTier, req.user.id, JSON.stringify(evidence), ts]
    );
  }

  res.json({ tier: newTier, evidence, unmetCriteria, changed: newTier !== fp.tier });
});

module.exports = {
  getStats, listUsers, banUser, unbanUser,
  listProjects, moderateProject,
  listSkillQueue, reviewSkillVerification,
  listDisputes, resolveDispute,
  getLedger, setAdmin, evaluateUserTier,
};
