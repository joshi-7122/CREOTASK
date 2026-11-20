/* =========================================================
   CREOTASK — Social sign-in (Google, GitHub, LinkedIn)
   GET /api/auth/oauth/providers              which providers are configured
   GET /api/auth/oauth/:provider/start        redirects to the provider
   GET /api/auth/oauth/:provider/callback     provider returns here
   ---------------------------------------------------------
   - The round trip is bound to the browser: a random nonce goes into an
     HttpOnly cookie and into the signed, 10-minute state parameter; both
     must match on return.
   - Only a provider-verified email is accepted. A matching CreoTask account
     is linked; otherwise a new account is created, which needs the same
     18+ confirmation and role choice as the email sign-up.
   - The session token is handed to the page in the URL fragment, which is
     never sent to a server.
   ========================================================= */
"use strict";
const crypto = require("crypto");
const db = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const { id, now } = require("../utils/helpers");
const { audit } = require("../utils/audit");
const { track } = require("../utils/analytics");
const sessions = require("../services/sessions");
const oauth = require("../services/oauth");
const { ensureRole, defaultName } = require("../services/accounts");
const { POLICY } = require("../config/policy");

const COOKIE = "creo_oauth_nonce";
const isProd = (process.env.NODE_ENV || "development") === "production";

function setNonceCookie(res, value, maxAgeSec) {
  const parts = [`${COOKIE}=${value}`, "Path=/api/auth/oauth", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function backWithError(res, code, mode) {
  const q = new URLSearchParams({ auth: mode === "login" ? "signin" : "signup", oauth_error: code });
  res.redirect(302, `/index.html?${q}`);
}

// ── Which buttons can work ──
const providers = (req, res) => res.json({ providers: oauth.enabledMap() });

// ── Start: send the browser to the provider ──
const start = (req, res) => {
  const name = req.params.provider;
  const mode = req.query.mode === "login" ? "login" : "signup";
  if (!oauth.PROVIDERS[name] || !oauth.isEnabled(name)) return backWithError(res, "unavailable", mode);

  const nonce = crypto.randomBytes(18).toString("base64url");
  const state = sessions.signState({
    n: nonce,
    p: name,
    mode,
    role: req.query.role === "client" ? "client" : "freelancer",
    age: req.query.age === "1",
  });
  setNonceCookie(res, nonce, 600);
  res.redirect(302, oauth.authorizeUrl(name, state));
};

// ── Callback: the provider sends the browser back here ──
const callback = asyncHandler(async (req, res) => {
  const name = req.params.provider;
  let st;
  try { st = sessions.verifyState(String(req.query.state || "")); } catch { return backWithError(res, "expired"); }
  const cookieNonce = readCookie(req, COOKIE);
  setNonceCookie(res, "", 0); // one use
  if (st.p !== name || !cookieNonce || cookieNonce !== st.n) return backWithError(res, "expired", st.mode);
  if (req.query.error) return backWithError(res, "cancelled", st.mode);
  if (!oauth.isEnabled(name) || typeof req.query.code !== "string") return backWithError(res, "failed", st.mode);

  let prof;
  try { prof = await oauth.fetchProfile(name, req.query.code); }
  catch (err) {
    console.error(`[oauth] ${name} sign-in failed:`, err.message);
    return backWithError(res, "failed", st.mode);
  }
  const email = typeof prof.email === "string" ? prof.email.trim().toLowerCase() : "";
  if (!email || !prof.emailVerified) return backWithError(res, "no_verified_email", st.mode);

  const ts = now();
  let user = null;
  let created = false;
  const linked = await db.get(
    "SELECT u.* FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.provider_user_id = ?",
    [name, prof.id]
  );

  if (linked) {
    user = linked;
  } else {
    user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      if (st.mode === "login") return backWithError(res, "no_account", "login");
      if (st.age !== true) return backWithError(res, "age_required", "signup");
      const userId = id();
      const displayName = (typeof prof.name === "string" && prof.name.trim().slice(0, 60)) || defaultName(email);
      await db.transaction(async () => {
        await db.run(
          `INSERT INTO users (id, email, password_hash, email_verified, email_verified_at, created_at, updated_at,
                              is_active, is_banned, active_role, age_confirmed_at, age_policy_version)
           VALUES (?, ?, NULL, 1, ?, ?, ?, 1, 0, ?, ?, ?)`,
          [userId, email, ts, ts, ts, st.role, ts, POLICY.AGE_POLICY_VERSION]
        );
        await ensureRole(userId, st.role, displayName);
      });
      user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);
      created = true;
    }
    await db.run(
      "INSERT OR IGNORE INTO user_identities (id, user_id, provider, provider_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
      [id(), user.id, name, prof.id, ts]
    );
    await audit({ actorId: user.id, action: "auth.identity_linked", entityType: "user", entityId: user.id,
                  after: { provider: name }, reasonCode: created ? "social_signup" : "social_link", ip: req.ip });
  }

  if (user.is_banned) return backWithError(res, "suspended", "login");
  if (!user.is_active) return backWithError(res, "deactivated", "login");

  // The provider has verified this email address.
  await db.run(
    `UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?),
                      last_login_at = ?, updated_at = ? WHERE id = ?`,
    [ts, ts, ts, user.id]
  );
  await db.run("UPDATE user_identities SET last_used_at = ? WHERE provider = ? AND provider_user_id = ?", [ts, name, prof.id]);

  const { token } = await sessions.createSession(user.id, req);
  if (created) {
    track("registration_completed", { userId: user.id, role: st.role, props: { role: st.role, method: name } });
    track("role_selected", { userId: user.id, role: st.role, props: { role: st.role, at: "registration" } });
  } else {
    track("login_succeeded", { userId: user.id, role: user.active_role, props: { method: name } });
  }
  res.redirect(302, `/index.html#auth_token=${encodeURIComponent(token)}${created ? "&new=1" : ""}`);
});

module.exports = { providers, start, callback };
