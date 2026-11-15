/* =========================================================
   CREOTASK — Auth Controller (AUTH-01, AUTH-02, AUTH-03)
   POST /api/auth/register            POST /api/auth/login
   POST /api/auth/verify-email        POST /api/auth/resend-verification
   POST /api/auth/forgot-password     POST /api/auth/reset-password
   POST /api/auth/change-password     POST /api/auth/switch-role
   POST /api/auth/logout              POST /api/auth/logout-all
   GET  /api/auth/sessions            DELETE /api/auth/sessions/:sessionId
   GET  /api/auth/me
   ========================================================= */
"use strict";
const bcrypt = require("bcryptjs");
const db     = require("../config/db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { suspensionPayload } = require("../middleware/auth");
const { id, now, addHours, secureToken, hashToken } = require("../utils/helpers");
const { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail } = require("../utils/email");
const { validate } = require("../utils/validate");
const { audit } = require("../utils/audit");
const { track } = require("../utils/analytics");
const sessions = require("../services/sessions");
const { ensureRole, listRoles, defaultName } = require("../services/accounts");
const { POLICY } = require("../config/policy");
const S = require("../utils/serializers");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Pre-computed hash so failed logins for unknown emails cost the same time as real ones.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-password", 12);

function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < POLICY.PASSWORD_MIN_LENGTH) {
    throw httpError(400, `Password must be at least ${POLICY.PASSWORD_MIN_LENGTH} characters.`, "WEAK_PASSWORD");
  }
  if (Buffer.byteLength(pw, "utf8") > POLICY.PASSWORD_MAX_BYTES) {
    throw httpError(400, `Password must be ${POLICY.PASSWORD_MAX_BYTES} bytes or fewer.`, "PASSWORD_TOO_LONG");
  }
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    throw httpError(400, "Password must include at least one letter and one number.", "WEAK_PASSWORD");
  }
}

function normEmail(e) {
  if (typeof e !== "string" || !EMAIL_RE.test(e.trim()) || e.length > 254) {
    throw httpError(400, "Enter a valid email address.", "INVALID_EMAIL");
  }
  return e.trim().toLowerCase();
}

async function issueEmailToken(userId, purpose, ttlHours) {
  // Invalidate any outstanding token for the same purpose (single active link).
  await db.run(
    `UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
    [now(), userId, purpose]
  );
  const raw = secureToken();
  await db.run(
    `INSERT INTO auth_tokens (id, user_id, token_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id(), userId, hashToken(raw), purpose, addHours(now(), ttlHours), now()]
  );
  return raw;
}

/** Atomically consume a single-use token. Returns the token row or null. */
async function consumeToken(rawToken, purpose) {
  if (typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 200) return null;
  const record = await db.get(
    `SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`,
    [hashToken(rawToken), purpose, now()]
  );
  if (!record) return null;
  const r = await db.run("UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL", [now(), record.id]);
  return r.changes === 1 ? record : null; // lost a race → treat as used
}

// ── Register ─────────────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const email = normEmail(req.body?.email);
  checkPassword(req.body?.password);
  const v = validate(req.body, {
    role:          { type: "enum", values: ["freelancer", "client"], label: "Role" },
    display_name:  { type: "string", min: 2, max: 60, label: "Name" },
    age_confirmed: { type: "bool", required: true, label: "Age confirmation" },
  });
  const role = v.role || "freelancer";
  if (v.age_confirmed !== true) {
    throw httpError(400, `You must confirm you are at least ${POLICY.MIN_ACCOUNT_AGE} years old to create an account.`,
      "AGE_CONFIRMATION_REQUIRED");
  }

  const existing = await db.get("SELECT id FROM users WHERE email = ?", [email]);
  // DECISION LOGGED (DEV_LOG D-AUTH-1): registration currently reveals that an email is taken.
  if (existing) throw httpError(409, "An account with this email already exists. Try logging in or resetting your password.", "EMAIL_TAKEN");

  const hash = await bcrypt.hash(req.body.password, 12);
  const userId = id();
  const ts = now();
  const name = v.display_name || defaultName(email);

  const { token, rawVerify } = await db.transaction(async () => {
    await db.run(
      `INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at, is_active, is_banned,
                          active_role, age_confirmed_at, age_policy_version)
       VALUES (?, ?, ?, 0, ?, ?, 1, 0, ?, ?, ?)`,
      [userId, email, hash, ts, ts, role, ts, POLICY.AGE_POLICY_VERSION]
    );
    await ensureRole(userId, role, name);
    const rawVerify = await issueEmailToken(userId, "email_verify", POLICY.EMAIL_VERIFY_TTL_HOURS);
    const s = await sessions.createSession(userId, req);
    return { token: s.token, rawVerify };
  });

  await sendVerificationEmail(email, rawVerify);
  track("registration_completed", { userId, role, props: { role } });
  track("role_selected", { userId, role, props: { role, at: "registration" } });

  const user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);
  res.status(201).json({
    token,
    user: S.accountPrivate(user, await listRoles(userId)),
    message: "Account created. Check your email to verify your address.",
  });
});

// ── Login ─────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    throw httpError(400, "Email and password are required.", "VALIDATION_FAILED");
  }
  const user = await db.get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !ok) throw httpError(401, "Incorrect email or password.", "INVALID_CREDENTIALS");

  // Status is only revealed AFTER a correct password, so it can't be probed.
  if (user.is_banned) {
    throw httpError(403, "This account is suspended.", "ACCOUNT_SUSPENDED", { suspension: suspensionPayload(user) });
  }
  if (!user.is_active) throw httpError(403, "This account is deactivated.", "ACCOUNT_DEACTIVATED");

  await db.run("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", [now(), now(), user.id]);
  const { token } = await sessions.createSession(user.id, req);
  track("login_succeeded", { userId: user.id, role: user.active_role });
  res.json({ token, user: S.accountPrivate(user, await listRoles(user.id)) });
});

// ── Verify Email ──────────────────────────────────────────
const verifyEmail = asyncHandler(async (req, res) => {
  const record = await consumeToken(req.body?.token, "email_verify");
  if (!record) throw httpError(400, "This verification link is invalid, already used or expired. Request a new one.", "TOKEN_INVALID");
  await db.run(
    "UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
    [now(), now(), record.user_id]
  );
  track("email_verified", { userId: record.user_id });
  res.json({ message: "Email verified. You can now publish, apply and accept work." });
});

// ── Resend Verification ───────────────────────────────────
const GENERIC_RESEND = "If this email is registered and unverified, a new verification link has been sent.";
const resendVerification = asyncHandler(async (req, res) => {
  let email;
  try { email = normEmail(req.body?.email); } catch { return res.json({ message: GENERIC_RESEND }); }
  const user = await db.get("SELECT id, email_verified FROM users WHERE email = ?", [email]);
  if (user && !user.email_verified) {
    const raw = await issueEmailToken(user.id, "email_verify", POLICY.EMAIL_VERIFY_TTL_HOURS);
    await sendVerificationEmail(email, raw);
  }
  res.json({ message: GENERIC_RESEND });
});

// ── Forgot Password (non-enumerating) ─────────────────────
const GENERIC_FORGOT = "If this email is registered, a password reset link has been sent.";
const forgotPassword = asyncHandler(async (req, res) => {
  let email;
  try { email = normEmail(req.body?.email); } catch { return res.json({ message: GENERIC_FORGOT }); }
  const user = await db.get("SELECT id FROM users WHERE email = ?", [email]);
  if (user) {
    const raw = await issueEmailToken(user.id, "password_reset", POLICY.PASSWORD_RESET_TTL_HOURS);
    await sendPasswordResetEmail(email, raw);
  }
  res.json({ message: GENERIC_FORGOT });
});

// ── Reset Password ────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res) => {
  checkPassword(req.body?.password);
  const hash = await bcrypt.hash(req.body.password, 12);
  const record = await consumeToken(req.body?.token, "password_reset");
  if (!record) throw httpError(400, "This reset link is invalid, already used or expired. Request a new one.", "TOKEN_INVALID");

  const user = await db.transaction(async () => {
    await db.run("UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
      [hash, now(), now(), record.user_id]);
    await sessions.revokeAllSessions(record.user_id, "password_reset");
    await audit({ actorId: record.user_id, action: "auth.password_reset", entityType: "user",
                  entityId: record.user_id, reasonCode: "user_reset", ip: req.ip });
    return db.get("SELECT email FROM users WHERE id = ?", [record.user_id]);
  });
  await sendPasswordChangedEmail(user.email);
  track("password_reset_completed", { userId: record.user_id });
  res.json({ message: "Password reset. All devices were signed out — please log in with your new password." });
});

// ── Change Password (signed in) ───────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== "string" || !current_password) {
    throw httpError(400, "Enter your current password.", "VALIDATION_FAILED");
  }
  checkPassword(new_password);
  const user = await db.get("SELECT id, email, password_hash FROM users WHERE id = ?", [req.user.id]);
  if (!(await bcrypt.compare(current_password, user.password_hash || DUMMY_HASH))) {
    throw httpError(400, "Your current password is incorrect.", "INVALID_CREDENTIALS");
  }
  const hash = await bcrypt.hash(new_password, 12);
  const revoked = await db.transaction(async () => {
    await db.run("UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
      [hash, now(), now(), req.user.id]);
    const n = await sessions.revokeAllSessions(req.user.id, "password_changed", req.session.id);
    await audit({ actorId: req.user.id, action: "auth.password_changed", entityType: "user",
                  entityId: req.user.id, reasonCode: "user_change", ip: req.ip });
    return n;
  });
  await sendPasswordChangedEmail(user.email);
  res.json({ message: "Password changed. Other devices were signed out.", sessions_revoked: revoked });
});

// ── Switch Role ───────────────────────────────────────────
const switchRole = asyncHandler(async (req, res) => {
  const { role } = validate(req.body, { role: { type: "enum", values: ["freelancer", "client"], required: true, label: "Role" } });
  if (req.user.active_role === role) return res.json({ message: "Already in this role.", role });

  const before = req.user.active_role;
  const createdProfile = await db.transaction(async () => {
    const fp = await db.get("SELECT display_name FROM freelancer_profiles WHERE user_id = ?", [req.user.id]);
    const cp = await db.get("SELECT display_name FROM client_profiles WHERE user_id = ?", [req.user.id]);
    const name = fp?.display_name || cp?.display_name || defaultName(req.user.email);
    const created = await ensureRole(req.user.id, role, name);
    await db.run("UPDATE users SET active_role = ?, updated_at = ? WHERE id = ?", [role, now(), req.user.id]);
    await audit({ actorId: req.user.id, action: "auth.role_switched", entityType: "user", entityId: req.user.id,
                  before: { active_role: before }, after: { active_role: role }, ip: req.ip });
    return created;
  });
  if (createdProfile) track("role_selected", { userId: req.user.id, role, props: { role, at: "switch" } });
  track("role_switched", { userId: req.user.id, role, props: { from: before, to: role } });
  res.json({ message: `Switched to ${role} mode.`, role, roles: await listRoles(req.user.id) });
});

// ── Me (private view of the signed-in account) ────────────
const getMe = asyncHandler(async (req, res) => {
  const { buildOwnProfile } = require("./profileController");
  const user = await db.get("SELECT * FROM users WHERE id = ?", [req.user.id]);
  const roles = await listRoles(req.user.id);
  const account = S.accountPrivate(user, roles);

  if (user.is_banned) {
    return res.json({ user: account, suspension: suspensionPayload(user), profile: null });
  }

  const own = await buildOwnProfile(user.id, user.active_role);
  const unread = await db.get("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0", [user.id]);
  const admin = await db.get("SELECT admin_role FROM admins WHERE user_id = ?", [user.id]);

  res.json({
    user: { ...account, display_name: own?.profile?.display_name, tier: own?.profile?.tier },
    ...own,
    unread_notifications: unread?.count || 0,
    admin_role: admin?.admin_role || null,
  });
});

// ── Sessions ──────────────────────────────────────────────
const listSessions = asyncHandler(async (req, res) => {
  const rows = await sessions.listActiveSessions(req.user.id);
  res.json({ sessions: rows.map(s => ({ ...s, current: s.id === req.session.id })) });
});

const revokeOneSession = asyncHandler(async (req, res) => {
  const s = await db.get("SELECT id FROM sessions WHERE id = ? AND user_id = ?", [req.params.sessionId, req.user.id]);
  if (!s) throw httpError(404, "Session not found.", "NOT_FOUND");
  await sessions.revokeSession(s.id, "user_revoked");
  res.json({ message: "Session signed out." });
});

const logout = asyncHandler(async (req, res) => {
  await sessions.revokeSession(req.session.id, "logout");
  res.json({ message: "Logged out." });
});

const logoutAll = asyncHandler(async (req, res) => {
  const n = await sessions.revokeAllSessions(req.user.id, "user_logout_all", req.session.id);
  await audit({ actorId: req.user.id, action: "auth.sessions_revoked", entityType: "user", entityId: req.user.id,
                after: { revoked: n }, ip: req.ip });
  track("sessions_revoked", { userId: req.user.id, props: { count: n } });
  res.json({ message: `Signed out of ${n} other device${n === 1 ? "" : "s"}.`, sessions_revoked: n });
});

module.exports = {
  register, login, verifyEmail, resendVerification, forgotPassword, resetPassword, changePassword,
  switchRole, getMe, listSessions, revokeOneSession, logout, logoutAll,
};
