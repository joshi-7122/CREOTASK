/* =========================================================
   CREOTASK — Server-side sessions (AUTH-02)
   ---------------------------------------------------------
   The JWT is only a signed pointer to a session row. Logout,
   "sign out other devices", password reset/change and suspension
   revoke the row, which immediately invalidates the token.
   ========================================================= */
"use strict";
const jwt = require("jsonwebtoken");
const db  = require("../config/db");
const { id, now, addDays } = require("../utils/helpers");
const { POLICY } = require("../config/policy");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || JWT_SECRET.length < 32 || /CHANGE_ME/.test(JWT_SECRET))) {
  throw new Error("JWT_SECRET must be set to a strong random value (≥32 chars) in production.");
}

function clientMeta(req) {
  return {
    userAgent: (req.get?.("user-agent") || req.headers?.["user-agent"] || "").slice(0, 200) || null,
    ip: req.ip || req.socket?.remoteAddress || null,
  };
}

async function createSession(userId, req) {
  const sid = id();
  const ts = now();
  const expiresAt = addDays(ts, POLICY.SESSION_TTL_DAYS);
  const { userAgent, ip } = clientMeta(req || {});
  await db.run(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sid, userId, ts, ts, expiresAt, userAgent, ip]
  );
  const token = jwt.sign({ sub: userId, sid }, JWT_SECRET, { expiresIn: `${POLICY.SESSION_TTL_DAYS}d` });
  return { sid, token, expiresAt };
}

/** Short-lived signed value for the social sign-in round trip (state parameter). */
function signState(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m", audience: "oauth-state" });
}
function verifyState(state) {
  return jwt.verify(state, JWT_SECRET, { audience: "oauth-state" }); // throws if forged or expired
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws on bad signature / expiry
}

async function getActiveSession(sid, userId) {
  const s = await db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sid, userId]);
  if (!s) return { error: "SESSION_INVALID" };
  if (s.revoked_at) return { error: "SESSION_REVOKED" };
  if (s.expires_at <= now()) return { error: "SESSION_EXPIRED" };
  return { session: s };
}

async function touchSession(s) {
  if (now() - s.last_seen_at > 5 * 60_000) {
    await db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", [now(), s.id]);
  }
}

async function revokeSession(sid, reason) {
  const r = await db.run(
    "UPDATE sessions SET revoked_at = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL",
    [now(), reason, sid]
  );
  return r.changes;
}

/** Revoke every active session for a user, optionally keeping one (the caller's). */
async function revokeAllSessions(userId, reason, exceptSid = null) {
  const r = await db.run(
    `UPDATE sessions SET revoked_at = ?, revoke_reason = ?
     WHERE user_id = ? AND revoked_at IS NULL ${exceptSid ? "AND id != ?" : ""}`,
    exceptSid ? [now(), reason, userId, exceptSid] : [now(), reason, userId]
  );
  return r.changes;
}

async function listActiveSessions(userId) {
  return db.all(
    `SELECT id, created_at, last_seen_at, expires_at, user_agent
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY last_seen_at DESC`,
    [userId, now()]
  );
}

module.exports = {
  createSession, verifyToken, signState, verifyState, getActiveSession, touchSession,
  revokeSession, revokeAllSessions, listActiveSessions,
};
