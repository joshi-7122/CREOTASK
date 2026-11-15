/* =========================================================
   CREOTASK — Phase 1 Foundation tests (node:test)
   Covers AUTH-01/02/03, PROF-01..05, VER-03 queue entry, TRUST-05
   foundation, payment gate, static exposure, DB transactions.
   Run: node --test tests/phase1.test.js
   ========================================================= */
"use strict";
const { app, db, init, cleanup, outbox } = require("./helpers/setup");
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

let server, base;
before(async () => {
  await init();
  await new Promise(r => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); await cleanup(); });

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

let seq = 0;
const uniqueEmail = (p = "user") => `${p}.${Date.now()}.${++seq}@example.test`;
const PW = "Str0ngPass!";

function tokenFromOutbox(email, path) {
  const mail = [...outbox].reverse().find(m => m.to === email && m.text.includes(path));
  assert.ok(mail, `expected an email to ${email} containing ${path}`);
  return new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
}

async function register(opts = {}) {
  const email = opts.email || uniqueEmail();
  const r = await call("POST", "/api/auth/register", {
    body: { email, password: PW, role: opts.role || "freelancer", age_confirmed: true, display_name: opts.name },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { email, token: r.body.token, user: r.body.user };
}

async function registerVerified(opts) {
  const u = await register(opts);
  const t = tokenFromOutbox(u.email, "/verify-email");
  assert.equal((await call("POST", "/api/auth/verify-email", { body: { token: t } })).status, 200);
  return u;
}

async function login(email, password = PW) {
  return call("POST", "/api/auth/login", { body: { email, password } });
}

async function openProjectId() {
  const r = await call("GET", "/api/projects");
  assert.equal(r.status, 200);
  const list = r.body.data || r.body.projects || [];
  assert.ok(list.length, "seed should have an open project");
  return list[0].id;
}

// ═══════════════════════════════════════════════════════════
describe("AUTH-01 registration & email verification", () => {
  test("registration requires the age-policy acknowledgement", async () => {
    const r = await call("POST", "/api/auth/register", { body: { email: uniqueEmail(), password: PW } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "VALIDATION_FAILED");
    const r2 = await call("POST", "/api/auth/register", { body: { email: uniqueEmail(), password: PW, age_confirmed: false } });
    assert.equal(r2.body.code, "AGE_CONFIRMATION_REQUIRED");
  });

  test("weak and over-long passwords are rejected", async () => {
    const weak = await call("POST", "/api/auth/register", { body: { email: uniqueEmail(), password: "short", age_confirmed: true } });
    assert.equal(weak.body.code, "WEAK_PASSWORD");
    const letters = await call("POST", "/api/auth/register", { body: { email: uniqueEmail(), password: "onlyletters", age_confirmed: true } });
    assert.equal(letters.body.code, "WEAK_PASSWORD");
    const long = await call("POST", "/api/auth/register", { body: { email: uniqueEmail(), password: "a1".repeat(40), age_confirmed: true } });
    assert.equal(long.body.code, "PASSWORD_TOO_LONG");
  });

  test("new account is unverified, holds its role and gets a verification email", async () => {
    const u = await register({ role: "client" });
    assert.equal(u.user.email_verified, false);
    assert.deepEqual(u.user.roles, ["client"]);
    assert.equal(u.user.age_confirmed, true);
    assert.equal(u.user.password_hash, undefined);
    tokenFromOutbox(u.email, "/verify-email");
  });

  test("unverified accounts cannot apply; verifying unlocks it", async () => {
    const u = await register();
    const projectId = await openProjectId();
    const blocked = await call("POST", `/api/projects/${projectId}/apply`, { token: u.token, body: { pitch: "I would love to help with this project brief." } });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");

    const t = tokenFromOutbox(u.email, "/verify-email");
    assert.equal((await call("POST", "/api/auth/verify-email", { body: { token: t } })).status, 200);
    const me = await call("GET", "/api/auth/me", { token: u.token });
    assert.equal(me.body.user.email_verified, true);

    const allowed = await call("POST", `/api/projects/${projectId}/apply`, { token: u.token, body: { pitch: "I would love to help with this project brief." } });
    assert.notEqual(allowed.body?.code, "EMAIL_NOT_VERIFIED");
  });

  test("unverified clients cannot publish", async () => {
    const u = await register({ role: "client" });
    const r = await call("POST", "/api/projects/does-not-matter/publish", { token: u.token });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "EMAIL_NOT_VERIFIED");
  });

  test("verification tokens are single-use and expire", async () => {
    const u = await register();
    const t = tokenFromOutbox(u.email, "/verify-email");
    assert.equal((await call("POST", "/api/auth/verify-email", { body: { token: t } })).status, 200);
    const again = await call("POST", "/api/auth/verify-email", { body: { token: t } });
    assert.equal(again.status, 400);
    assert.equal(again.body.code, "TOKEN_INVALID");

    const u2 = await register();
    const t2 = tokenFromOutbox(u2.email, "/verify-email");
    await db.run("UPDATE auth_tokens SET expires_at = ? WHERE user_id = ? AND purpose = 'email_verify'", [Date.now() - 1000, u2.user.id]);
    assert.equal((await call("POST", "/api/auth/verify-email", { body: { token: t2 } })).body.code, "TOKEN_INVALID");
  });

  test("resending a verification link invalidates the previous link", async () => {
    const u = await register();
    const first = tokenFromOutbox(u.email, "/verify-email");
    await call("POST", "/api/auth/resend-verification", { body: { email: u.email } });
    const second = tokenFromOutbox(u.email, "/verify-email");
    assert.notEqual(first, second);
    assert.equal((await call("POST", "/api/auth/verify-email", { body: { token: first } })).status, 400);
    assert.equal((await call("POST", "/api/auth/verify-email", { body: { token: second } })).status, 200);
  });
});

// ═══════════════════════════════════════════════════════════
describe("AUTH-02 login, sessions, reset", () => {
  test("wrong password and unknown email give the same error", async () => {
    const u = await register();
    const a = await login(u.email, "Wrong1234");
    const b = await login(uniqueEmail("nobody"), "Wrong1234");
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.equal(a.body.code, "INVALID_CREDENTIALS"); assert.equal(b.body.code, a.body.code);
    assert.equal(a.body.error, b.body.error);
  });

  test("logout revokes the session server-side", async () => {
    const u = await register();
    assert.equal((await call("GET", "/api/auth/me", { token: u.token })).status, 200);
    assert.equal((await call("POST", "/api/auth/logout", { token: u.token })).status, 200);
    const after = await call("GET", "/api/auth/me", { token: u.token });
    assert.equal(after.status, 401);
    assert.equal(after.body.code, "SESSION_REVOKED");
  });

  test("tokens without a session id (pre-Phase-1 tokens) are rejected", async () => {
    const u = await register();
    const legacy = jwt.sign({ sub: u.user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const r = await call("GET", "/api/auth/me", { token: legacy });
    assert.equal(r.status, 401);
    assert.equal(r.body.code, "SESSION_INVALID");
  });

  test("forgot-password does not reveal whether an account exists", async () => {
    const u = await register();
    const before = outbox.length;
    const known = await call("POST", "/api/auth/forgot-password", { body: { email: u.email } });
    const unknown = await call("POST", "/api/auth/forgot-password", { body: { email: uniqueEmail("ghost") } });
    const malformed = await call("POST", "/api/auth/forgot-password", { body: { email: "not-an-email" } });
    assert.equal(known.status, 200); assert.equal(unknown.status, 200); assert.equal(malformed.status, 200);
    assert.equal(known.body.message, unknown.body.message);
    assert.equal(outbox.length, before + 1, "only the real account gets mail");
  });

  test("password reset is single-use and signs out every session", async () => {
    const u = await register();
    const second = (await login(u.email)).body.token;
    await call("POST", "/api/auth/forgot-password", { body: { email: u.email } });
    const t = tokenFromOutbox(u.email, "/reset-password");
    const NEW = "N3wPassword!";
    assert.equal((await call("POST", "/api/auth/reset-password", { body: { token: t, password: NEW } })).status, 200);
    assert.equal((await call("POST", "/api/auth/reset-password", { body: { token: t, password: "An0therOne!" } })).body.code, "TOKEN_INVALID");

    assert.equal((await call("GET", "/api/auth/me", { token: u.token })).status, 401);
    assert.equal((await call("GET", "/api/auth/me", { token: second })).status, 401);
    assert.equal((await login(u.email, PW)).status, 401);
    assert.equal((await login(u.email, NEW)).status, 200);
    assert.ok(outbox.some(m => m.to === u.email && /password was changed/i.test(m.subject)));
  });

  test("change-password keeps this session and revokes the others", async () => {
    const u = await register();
    const other = (await login(u.email)).body.token;
    const bad = await call("POST", "/api/auth/change-password", { token: u.token, body: { current_password: "Nope12345", new_password: "Brand1New!" } });
    assert.equal(bad.body.code, "INVALID_CREDENTIALS");
    const ok = await call("POST", "/api/auth/change-password", { token: u.token, body: { current_password: PW, new_password: "Brand1New!" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.sessions_revoked, 1);
    assert.equal((await call("GET", "/api/auth/me", { token: u.token })).status, 200);
    assert.equal((await call("GET", "/api/auth/me", { token: other })).status, 401);
  });

  test("session list, revoke one, and sign out other devices", async () => {
    const u = await register();
    const t2 = (await login(u.email)).body.token;
    const t3 = (await login(u.email)).body.token;
    const list = await call("GET", "/api/auth/sessions", { token: u.token });
    assert.equal(list.body.sessions.length, 3);
    assert.equal(list.body.sessions.filter(s => s.current).length, 1);
    assert.equal(list.body.sessions[0].ip_address, undefined, "IP is not echoed back");

    const sid2 = jwt.decode(t2).sid;
    assert.equal((await call("DELETE", `/api/auth/sessions/${sid2}`, { token: u.token })).status, 200);
    assert.equal((await call("GET", "/api/auth/me", { token: t2 })).status, 401);

    const all = await call("POST", "/api/auth/logout-all", { token: u.token });
    assert.equal(all.body.sessions_revoked, 1);
    assert.equal((await call("GET", "/api/auth/me", { token: t3 })).status, 401);
    assert.equal((await call("GET", "/api/auth/me", { token: u.token })).status, 200);
  });

  test("a user cannot revoke someone else's session", async () => {
    const a = await register(); const b = await register();
    const sidB = jwt.decode(b.token).sid;
    assert.equal((await call("DELETE", `/api/auth/sessions/${sidB}`, { token: a.token })).status, 404);
    assert.equal((await call("GET", "/api/auth/me", { token: b.token })).status, 200);
  });
});

// ═══════════════════════════════════════════════════════════
describe("AUTH-03 roles", () => {
  test("switching role adds the second role and protects role-specific routes", async () => {
    const u = await registerVerified();
    const asFreelancer = await call("POST", "/api/projects", { token: u.token, body: {} });
    assert.equal(asFreelancer.status, 403);
    assert.equal(asFreelancer.body.code, "ROLE_REQUIRED");

    const sw = await call("POST", "/api/auth/switch-role", { token: u.token, body: { role: "client" } });
    assert.equal(sw.status, 200);
    assert.deepEqual(sw.body.roles.sort(), ["client", "freelancer"]);
    const me = await call("GET", "/api/auth/me", { token: u.token });
    assert.equal(me.body.user.active_role, "client");
    assert.ok(me.body.profile && me.body.completeness, "client profile + completeness returned");

    const skill = await call("POST", "/api/profiles/skills", { token: u.token, body: { name: "Figma" } });
    assert.equal(skill.body.code, "ROLE_REQUIRED");
    const bad = await call("POST", "/api/auth/switch-role", { token: u.token, body: { role: "admin" } });
    assert.equal(bad.status, 400);

    const audit = await db.get("SELECT * FROM audit_log WHERE action = 'auth.role_switched' AND entity_id = ?", [u.user.id]);
    assert.ok(audit, "role switch is audited");
  });
});

// ═══════════════════════════════════════════════════════════
describe("TRUST-05 foundation: suspension", () => {
  test("suspended users see a reason category and appeal route; sessions are revoked; audited", async () => {
    const admin = (await login("admin@creotask.in", "Admin@1234")).body.token;
    const u = await register();

    const noCat = await call("PUT", `/api/admin/users/${u.user.id}/ban`, { token: admin, body: { reason: "spam" } });
    assert.equal(noCat.status, 400);
    const ban = await call("PUT", `/api/admin/users/${u.user.id}/ban`, { token: admin, body: { reason: "Repeated spam applications", reason_category: "policy_violation" } });
    assert.equal(ban.status, 200);

    assert.equal((await call("GET", "/api/auth/me", { token: u.token })).status, 401, "existing session revoked");

    const wrongPw = await login(u.email, "Wrong1234");
    assert.equal(wrongPw.status, 401, "status not revealed without the right password");

    const r = await login(u.email);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "ACCOUNT_SUSPENDED");
    assert.equal(r.body.suspension.reason_category, "policy_violation");
    assert.ok(r.body.suspension.reason_label);
    assert.ok(r.body.suspension.appeal.instructions);
    assert.equal(r.body.suspension.internal_note, undefined);
    assert.ok(!JSON.stringify(r.body).includes("Repeated spam"), "internal note is never shown to the user");

    const row = await db.get("SELECT * FROM audit_log WHERE action = 'user.suspended' AND entity_id = ?", [u.user.id]);
    assert.equal(row.reason_code, "policy_violation");

    assert.equal((await call("PUT", `/api/admin/users/${u.user.id}/unban`, { token: admin })).status, 200);
    assert.equal((await login(u.email)).status, 200);
  });

  test("non-staff cannot suspend", async () => {
    const a = await register(); const b = await register();
    const r = await call("PUT", `/api/admin/users/${b.user.id}/ban`, { token: a.token, body: { reason: "x", reason_category: "other" } });
    assert.equal(r.status, 403);
  });
});

// ═══════════════════════════════════════════════════════════
describe("PROF-01 / PROF-05 public vs private fields", () => {
  test("public freelancer profile never exposes KYC, earnings or internal flags", async () => {
    const priya = await db.get("SELECT id FROM users WHERE email = 'priya@demo.in'");
    const r = await call("GET", `/api/profiles/freelancer/${priya.id}`);
    assert.equal(r.status, 200);
    const json = JSON.stringify(r.body);
    for (const k of ["kyc_status", "total_earned_paise", "public_visibility", "kyc_updated_at", "password_hash", "email\""]) {
      assert.ok(!json.includes(k), `public profile leaked ${k}`);
    }
    const browse = JSON.stringify((await call("GET", "/api/profiles/freelancers")).body);
    for (const k of ["kyc_status", "total_earned_paise"]) assert.ok(!browse.includes(k), `browse leaked ${k}`);
  });

  test("own profile (private) includes KYC status and completeness", async () => {
    const t = (await login("priya@demo.in", "Test@1234")).body.token;
    const r = await call("GET", "/api/profiles/me", { token: t });
    assert.equal(r.body.profile.kyc_status, "verified");
    assert.equal(typeof r.body.completeness.percent, "number");
  });

  test("public client profile uses the allow-list", async () => {
    const chai = await db.get("SELECT id FROM users WHERE email = 'chai@demo.in'");
    const r = await call("GET", `/api/profiles/client/${chai.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.profile.verification_status, "verified");
    assert.equal(r.body.profile.updated_at, undefined);
  });

  test("hidden profiles are 404 to the public, visible to the owner, excluded from browse", async () => {
    const u = await registerVerified({ name: "Hidden Person" });
    await call("PUT", "/api/profiles/freelancer", { token: u.token, body: { public_visibility: "hidden" } });
    assert.equal((await call("GET", `/api/profiles/freelancer/${u.user.id}`)).status, 404);
    assert.equal((await call("GET", `/api/profiles/freelancer/${u.user.id}`, { token: u.token })).status, 200);
    const browse = await call("GET", "/api/profiles/freelancers?q=Hidden%20Person");
    assert.equal(browse.body.data.length, 0);
  });
});

describe("PROF-01 / PROF-04 validation, preferences, completeness", () => {
  test("invalid values are rejected with per-field errors (no 500s)", async () => {
    const u = await register();
    const cases = [
      [{ availability: "sometimes" }, "availability"],
      [{ timezone: "Mars/Olympus" }, "timezone"],
      [{ website_url: "javascript:alert(1)" }, "website_url"],
      [{ work_categories: ["Astrology"] }, "work_categories"],
      [{ display_name: "" }, "display_name"],
      [{ weekly_capacity_hours: 500 }, "weekly_capacity_hours"],
    ];
    for (const [body, field] of cases) {
      const r = await call("PUT", "/api/profiles/freelancer", { token: u.token, body });
      assert.equal(r.status, 400, `${field} should be rejected`);
      assert.equal(r.body.code, "VALIDATION_FAILED");
      assert.ok(r.body.fields[field], `fields.${field} present`);
    }
    const rates = await call("PUT", "/api/profiles/freelancer", { token: u.token, body: { hourly_rate_min: 900, hourly_rate_max: 100 } });
    assert.equal(rates.status, 400);
  });

  test("partial updates: absent fields untouched, null clears", async () => {
    const u = await register();
    await call("PUT", "/api/profiles/freelancer", { token: u.token, body: { headline: "Motion designer for startups", location_city: "Pune" } });
    let me = (await call("GET", "/api/profiles/me", { token: u.token })).body.profile;
    assert.equal(me.headline, "Motion designer for startups");
    await call("PUT", "/api/profiles/freelancer", { token: u.token, body: { headline: null } });
    me = (await call("GET", "/api/profiles/me", { token: u.token })).body.profile;
    assert.equal(me.headline, null);
    assert.equal(me.location_city, "Pune");
  });

  test("stale availability is flagged and cleared by re-confirming", async () => {
    const u = await register();
    await db.run("UPDATE freelancer_profiles SET availability_updated_at = ? WHERE user_id = ?", [Date.now() - 45 * 864e5, u.user.id]);
    let p = (await call("GET", `/api/profiles/freelancer/${u.user.id}`)).body.profile;
    assert.equal(p.availability_stale, true);
    await call("PUT", "/api/profiles/freelancer", { token: u.token, body: { availability: p.availability } });
    p = (await call("GET", `/api/profiles/freelancer/${u.user.id}`)).body.profile;
    assert.equal(p.availability_stale, false);
  });

  test("completeness reports what's missing and records profile_completed once", async () => {
    const u = await register();
    let me = (await call("GET", "/api/profiles/me", { token: u.token })).body;
    assert.equal(me.completeness.complete, false);
    assert.ok(me.completeness.missing.some(m => m.key === "skills"));

    await call("PUT", "/api/profiles/freelancer", { token: u.token, body: {
      headline: "Brand designer for D2C startups",
      bio: "I design brand identities for consumer startups: logos, packaging and launch kits, with a strong research process.",
      location_city: "Jaipur", work_categories: ["Design"], timezone: "Asia/Kolkata",
    } });
    for (const name of ["Figma", "Branding", "Canva"]) await call("POST", "/api/profiles/skills", { token: u.token, body: { name } });
    await call("POST", "/api/profiles/portfolio", { token: u.token, body: { title: "Tea brand identity", rights_declared: true } });

    me = (await call("GET", "/api/profiles/me", { token: u.token })).body;
    assert.equal(me.completeness.percent, 100, JSON.stringify(me.completeness.missing));
    await call("GET", "/api/profiles/me", { token: u.token });
    const ev = await db.all("SELECT * FROM analytics_events WHERE event_name = 'profile_completed' AND user_id = ?", [u.user.id]);
    assert.equal(ev.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════
describe("PROF-02 skills & VER-03 evidence", () => {
  test("aliases resolve to the canonical catalogue; duplicates are blocked", async () => {
    const u = await register();
    const r = await call("POST", "/api/profiles/skills", { token: u.token, body: { name: "reactjs", proficiency: "advanced" } });
    assert.equal(r.status, 201);
    assert.equal(r.body.skill.name, "React");
    assert.equal(r.body.mapped_to_catalog, true);
    assert.equal(r.body.skill.is_verified, false);
    const dup = await call("POST", "/api/profiles/skills", { token: u.token, body: { name: "React.js" } });
    assert.equal(dup.status, 409);
    const free = await call("POST", "/api/profiles/skills", { token: u.token, body: { name: "Kathak choreography" } });
    assert.equal(free.body.mapped_to_catalog, false);
    const bad = await call("POST", "/api/profiles/skills", { token: u.token, body: { name: "Go", proficiency: "god-tier" } });
    assert.equal(bad.status, 400);
  });

  test("catalogue search matches names and aliases", async () => {
    const r = await call("GET", "/api/skills/catalog?q=postgres");
    assert.ok(r.body.skills.some(s => s.name === "PostgreSQL"));
  });

  test("evidence submission enters the queue and locks the claim", async () => {
    const u = await register();
    const s = (await call("POST", "/api/profiles/skills", { token: u.token, body: { name: "Figma" } })).body.skill;
    const thin = await call("POST", `/api/profiles/skills/${s.id}/verify`, { token: u.token, body: { evidence_note: "trust me" } });
    assert.equal(thin.status, 400);
    const badLink = await call("POST", `/api/profiles/skills/${s.id}/verify`, { token: u.token, body: {
      evidence_note: "Three shipped product redesigns, linked below.", external_links: ["ftp://x"] } });
    assert.equal(badLink.status, 400);
    const ok = await call("POST", `/api/profiles/skills/${s.id}/verify`, { token: u.token, body: {
      evidence_note: "Three shipped product redesigns, linked below.", external_links: ["https://example.com/case-study"] } });
    assert.equal(ok.status, 201);
    const q = await db.get("SELECT * FROM skill_verification_queue WHERE skill_id = ?", [s.id]);
    assert.equal(q.status, "pending");
    assert.equal((await call("PUT", `/api/profiles/skills/${s.id}`, { token: u.token, body: { proficiency: "expert" } })).body.code, "SKILL_LOCKED");
    assert.equal((await call("DELETE", `/api/profiles/skills/${s.id}`, { token: u.token })).body.code, "SKILL_LOCKED");
  });

  test("users cannot touch other users' skills", async () => {
    const a = await register(); const b = await register();
    const s = (await call("POST", "/api/profiles/skills", { token: a.token, body: { name: "SEO" } })).body.skill;
    assert.equal((await call("PUT", `/api/profiles/skills/${s.id}`, { token: b.token, body: { proficiency: "expert" } })).status, 404);
    assert.equal((await call("DELETE", `/api/profiles/skills/${s.id}`, { token: b.token })).status, 404);
  });
});

// ═══════════════════════════════════════════════════════════
describe("PROF-03 portfolio", () => {
  test("public work needs a rights declaration; confidential work is never public", async () => {
    const u = await register();
    const noRights = await call("POST", "/api/profiles/portfolio", { token: u.token, body: { title: "Client app redesign" } });
    assert.equal(noRights.status, 400);
    assert.equal(noRights.body.code, "RIGHTS_DECLARATION_REQUIRED");

    const secret = await call("POST", "/api/profiles/portfolio", { token: u.token, body: { title: "NDA fintech dashboard", is_confidential: true } });
    assert.equal(secret.status, 201);
    assert.equal(secret.body.item.is_public, false);
    const pub = await call("POST", "/api/profiles/portfolio", { token: u.token, body: {
      title: "Open-source icon set", rights_declared: true, external_url: "https://example.com/icons" } });
    assert.equal(pub.body.item.is_public, true);

    const view = await call("GET", `/api/profiles/freelancer/${u.user.id}`);
    const titles = view.body.portfolio.map(p => p.title);
    assert.deepEqual(titles, ["Open-source icon set"]);
    assert.equal(view.body.portfolio[0].is_confidential, undefined, "private flags not in public shape");

    const js = await call("POST", "/api/profiles/portfolio", { token: u.token, body: { title: "XSS attempt", rights_declared: true, external_url: "javascript:alert(1)" } });
    assert.equal(js.status, 400);
  });

  test("archive hides from public; restore brings it back; delete removes", async () => {
    const u = await register();
    const item = (await call("POST", "/api/profiles/portfolio", { token: u.token, body: { title: "Packaging concept", rights_declared: true } })).body.item;
    const arch = await call("POST", `/api/profiles/portfolio/${item.id}/archive`, { token: u.token });
    assert.equal(arch.body.item.status, "archived");
    assert.equal((await call("GET", `/api/profiles/freelancer/${u.user.id}`)).body.portfolio.length, 0);
    const own = (await call("GET", "/api/profiles/me", { token: u.token })).body.profile.portfolio;
    assert.equal(own[0].status, "archived");
    assert.equal((await call("POST", `/api/profiles/portfolio/${item.id}/archive`, { token: u.token })).status, 409);

    await call("POST", `/api/profiles/portfolio/${item.id}/restore`, { token: u.token });
    assert.equal((await call("GET", `/api/profiles/freelancer/${u.user.id}`)).body.portfolio.length, 1);

    const other = await register();
    assert.equal((await call("DELETE", `/api/profiles/portfolio/${item.id}`, { token: other.token })).status, 404);
    assert.equal((await call("POST", `/api/profiles/portfolio/${item.id}/archive`, { token: other.token })).status, 404);
    assert.equal((await call("DELETE", `/api/profiles/portfolio/${item.id}`, { token: u.token })).status, 200);
  });

  test("withdrawing the rights declaration on public work is refused", async () => {
    const u = await register();
    const item = (await call("POST", "/api/profiles/portfolio", { token: u.token, body: { title: "Poster series", rights_declared: true } })).body.item;
    const r = await call("PUT", `/api/profiles/portfolio/${item.id}`, { token: u.token, body: { rights_declared: false } });
    assert.equal(r.body.code, "RIGHTS_DECLARATION_REQUIRED");
    const ok = await call("PUT", `/api/profiles/portfolio/${item.id}`, { token: u.token, body: { rights_declared: false, is_confidential: true } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.item.is_public, false);
  });
});

// ═══════════════════════════════════════════════════════════
describe("Safety guards", () => {
  test("payments are refused unless sandbox mode is on", async () => {
    const { POLICY } = require("../server/config/policy");
    const chai = (await login("chai@demo.in", "Test@1234")).body.token;
    const prev = POLICY.PAYMENTS_MODE;
    POLICY.PAYMENTS_MODE = "disabled";
    try {
      const r = await call("POST", "/api/projects/any/milestones/any/fund", { token: chai });
      assert.equal(r.status, 503);
      assert.equal(r.body.code, "PAYMENTS_DISABLED");
    } finally { POLICY.PAYMENTS_MODE = prev; }
  });

  test("sandbox mode can never be enabled in production", () => {
    const path = require.resolve("../server/config/policy");
    const saved = { env: process.env.NODE_ENV, mode: process.env.PAYMENTS_MODE };
    delete require.cache[path];
    process.env.NODE_ENV = "production"; process.env.PAYMENTS_MODE = "sandbox";
    try { assert.equal(require(path).POLICY.PAYMENTS_MODE, "disabled"); }
    finally {
      process.env.NODE_ENV = saved.env; process.env.PAYMENTS_MODE = saved.mode;
      delete require.cache[path]; require(path);
    }
  });

  test("the database, server source and config are not served statically", async () => {
    for (const p of ["/server/data/creotask.db", "/server/config/seed.js", "/package.json", "/.env", "/docs/ARCHITECTURE.md"]) {
      const r = await fetch(base + p);
      assert.notEqual(r.status, 200, `${p} must not be served`);
    }
    for (const p of ["/", "/index.html", "/app.html", "/dashboard.html", "/assets/css/app.css", "/assets/js/api.js"]) {
      assert.equal((await fetch(base + p)).status, 200, `${p} should be served`);
    }
  });

  test("unknown pages return the branded 404 page, not a stack trace or listing", async () => {
    const r = await fetch(base + "/no/such/page");
    assert.equal(r.status, 404);
    assert.match(await r.text(), /This page doesn't exist/);
  });

  test("tier criteria are written in plain language with no-history as neutral", () => {
    const { evaluateTier } = require("../server/utils/tierEngine");
    const t = evaluateTier({ total_projects_completed: 0, total_unique_clients: 0, avg_rating: 0, on_time_rate: 1, total_reviews: 0 }, 0, 0);
    assert.ok(t.unmetCriteria.includes("Reach an average rating of 4.0 or higher (no reviews yet)"));
    assert.ok(!t.unmetCriteria.some((c) => /≥|have 0\.0/.test(c)));
  });

  test("unknown API routes return JSON 404", async () => {
    const r = await call("GET", "/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.body.code, "NOT_FOUND");
  });

  test("analytics never stores personal data keys", async () => {
    const { track } = require("../server/utils/analytics");
    await track("skill_added", { userId: "u-test", props: { email: "x@y.z", display_name: "X", mapped: true } });
    const row = await db.get("SELECT properties FROM analytics_events WHERE user_id = 'u-test'");
    assert.deepEqual(JSON.parse(row.properties), { mapped: true });
  });
});

// ═══════════════════════════════════════════════════════════
describe("DB transactions", () => {
  test("rollback discards writes", async () => {
    await db.run("CREATE TABLE IF NOT EXISTS _tx_test (v TEXT)");
    await assert.rejects(db.transaction(async () => {
      await db.run("INSERT INTO _tx_test (v) VALUES ('rolled-back')");
      throw new Error("boom");
    }));
    assert.equal((await db.get("SELECT COUNT(*) n FROM _tx_test WHERE v = 'rolled-back'")).n, 0);
  });

  test("statements from other requests do not leak into an open transaction", async () => {
    await db.run("CREATE TABLE IF NOT EXISTS _tx_test2 (v TEXT)");
    let release;
    const gate = new Promise(r => { release = r; });
    const tx = db.transaction(async () => {
      await db.run("INSERT INTO _tx_test2 (v) VALUES ('inside')");
      await gate;
      throw new Error("rollback inside");
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 10));
    const outside = db.run("INSERT INTO _tx_test2 (v) VALUES ('outside')"); // must wait, not join the tx
    release();
    await tx; await outside;
    const rows = (await db.all("SELECT v FROM _tx_test2")).map(r => r.v);
    assert.deepEqual(rows, ["outside"]);
  });
});
