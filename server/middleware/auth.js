/* =========================================================
   CREOTASK — Auth middleware
   - authenticate:         valid JWT + live server session; blocks suspended accounts
   - authenticateAllowSuspended: same, but lets a suspended user read their status / log out
   - optionalAuth:         attach user if a valid session exists
   - requireVerified:      AUTH-01 — unverified accounts cannot publish, apply, offer or fund
   - requireRole:          active role check (AUTH-03)
   - requireAdmin / requireAdminRole: staff checks
   ========================================================= */
"use strict";
const db = require("../config/db");
const sessions = require("../services/sessions");
const { SUSPENSION_REASONS } = require("../config/catalog");
const { POLICY } = require("../config/policy");

const USER_COLS = "id, email, email_verified, is_active, is_banned, active_role, suspension_reason_category, suspended_at";

function deny(res, status, code, error, extra = {}) {
  return res.status(status).json({ error, code, ...extra });
}

function suspensionPayload(user) {
  const cat = user.suspension_reason_category || "other";
  return {
    reason_category: cat,
    reason_label: SUSPENSION_REASONS[cat] || SUSPENSION_REASONS.other,
    suspended_at: user.suspended_at || null,
    appeal: {
      available: true,
      contact: POLICY.APPEALS_CONTACT || null,
      instructions: POLICY.APPEALS_CONTACT
        ? `To appeal, contact ${POLICY.APPEALS_CONTACT} with your account email.`
        : "To appeal, contact CreoTask support with your account email.",
    },
  };
}

async function resolve(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return { status: 401, code: "AUTH_REQUIRED", error: "Authentication required." };
  let payload;
  try { payload = sessions.verifyToken(header.slice(7)); }
  catch { return { status: 401, code: "SESSION_EXPIRED", error: "Session expired or invalid. Please log in again." }; }
  if (!payload.sid) return { status: 401, code: "SESSION_INVALID", error: "Session expired or invalid. Please log in again." };

  const { session, error } = await sessions.getActiveSession(payload.sid, payload.sub);
  if (error) return { status: 401, code: error, error: "Your session has ended. Please log in again." };

  const user = await db.get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [payload.sub]);
  if (!user) return { status: 401, code: "SESSION_INVALID", error: "Account not found." };
  if (!user.is_active) return { status: 401, code: "ACCOUNT_DEACTIVATED", error: "This account is deactivated." };
  return { user, session };
}

function makeAuthenticate({ allowSuspended }) {
  return async function authenticate(req, res, next) {
    try {
      const r = await resolve(req);
      if (!r.user) return deny(res, r.status, r.code, r.error);
      if (r.user.is_banned && !allowSuspended) {
        return deny(res, 403, "ACCOUNT_SUSPENDED", "This account is suspended.", { suspension: suspensionPayload(r.user) });
      }
      await sessions.touchSession(r.session);
      req.user = r.user;
      req.session = r.session;
      next();
    } catch (err) { next(err); }
  };
}

const authenticate = makeAuthenticate({ allowSuspended: false });
const authenticateAllowSuspended = makeAuthenticate({ allowSuspended: true });

/** Attach user when a valid, unsuspended session is present; never rejects. */
async function optionalAuth(req, res, next) {
  try {
    if ((req.headers.authorization || "").startsWith("Bearer ")) {
      const r = await resolve(req);
      if (r.user && !r.user.is_banned) { req.user = r.user; req.session = r.session; }
    }
    next();
  } catch (err) { next(err); }
}

/** AUTH-01: verified email required for marketplace commitments. */
function requireVerified(req, res, next) {
  if (!req.user) return deny(res, 401, "AUTH_REQUIRED", "Authentication required.");
  if (!req.user.email_verified) {
    return deny(res, 403, "EMAIL_NOT_VERIFIED",
      "Verify your email address first. You can resend the verification link from your account.");
  }
  next();
}

/** Require the user's active_role to be one of the given roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return deny(res, 401, "AUTH_REQUIRED", "Authentication required.");
    if (!roles.includes(req.user.active_role)) {
      return deny(res, 403, "ROLE_REQUIRED",
        `This action requires the ${roles.join(" or ")} role. Switch your active role first.`,
        { required_roles: roles, active_role: req.user.active_role });
    }
    next();
  };
}

/** Require the user to have an admin record. */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) return deny(res, 401, "AUTH_REQUIRED", "Authentication required.");
    const admin = await db.get("SELECT admin_role FROM admins WHERE user_id = ?", [req.user.id]);
    if (!admin) return deny(res, 403, "STAFF_REQUIRED", "Admin access required.");
    req.adminRole = admin.admin_role;
    next();
  } catch (err) { next(err); }
}

/** Require specific admin role. */
function requireAdminRole(...adminRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user) return deny(res, 401, "AUTH_REQUIRED", "Authentication required.");
      const admin = await db.get("SELECT admin_role FROM admins WHERE user_id = ?", [req.user.id]);
      if (!admin || !adminRoles.includes(admin.admin_role)) {
        return deny(res, 403, "STAFF_ROLE_REQUIRED", "Insufficient admin permissions.");
      }
      req.adminRole = admin.admin_role;
      next();
    } catch (err) { next(err); }
  };
}

module.exports = {
  authenticate, authenticateAllowSuspended, optionalAuth,
  requireVerified, requireRole, requireAdmin, requireAdminRole, suspensionPayload,
};
