/* =========================================================
   CREOTASK — Social sign-in tests (Google / GitHub / LinkedIn)
   The provider's token and profile calls are stubbed, so these run
   without real keys or network access to the providers.
   ========================================================= */
"use strict";
process.env.GOOGLE_CLIENT_ID = "test-google-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
// Empty (not deleted) so keys in a developer's .env can't switch these on during the test.
process.env.GITHUB_CLIENT_ID = "";
process.env.GITHUB_CLIENT_SECRET = "";
process.env.LINKEDIN_CLIENT_ID = "";
process.env.LINKEDIN_CLIENT_SECRET = "";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { app, db, init, cleanup } = require("./helpers/setup");
const oauth = require("../server/services/oauth");

let server, base;
let nextProfile = null;
oauth.fetchProfile = async () => nextProfile; // stub the provider

before(async () => {
  await init();
  await new Promise((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await cleanup();
});

const get = (path, headers = {}) => fetch(base + path, { redirect: "manual", headers });

/** Runs start → provider → callback and returns the final redirect location. */
async function roundTrip({ mode = "signup", role = "freelancer", age = "1", profile, tamper = false }) {
  const s = await get(`/api/auth/oauth/google/start?mode=${mode}&role=${role}&age=${age}`);
  assert.equal(s.status, 302);
  const to = new URL(s.headers.get("location"));
  assert.equal(to.host, "accounts.google.com");
  const state = to.searchParams.get("state");
  const cookie = s.headers.get("set-cookie").split(";")[0];
  nextProfile = profile;
  const c = await get(`/api/auth/oauth/google/callback?code=abc&state=${encodeURIComponent(state)}`,
    { cookie: tamper ? "creo_oauth_nonce=wrong" : cookie });
  assert.equal(c.status, 302);
  return c.headers.get("location");
}

test("providers endpoint reports only configured providers", async () => {
  const r = await (await get("/api/auth/oauth/providers")).json();
  assert.deepEqual(r.providers, { google: true, github: false, linkedin: false });
});

test("an unconfigured provider sends the visitor back with a clear error", async () => {
  const r = await get("/api/auth/oauth/github/start?mode=signup");
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location"), /oauth_error=unavailable/);
});

test("new account via Google: created verified, with the chosen role", async () => {
  const loc = await roundTrip({ role: "client", profile: { id: "g-1", email: "New.Person@Example.com", emailVerified: true, name: "New Person" } });
  assert.match(loc, /^\/index\.html#auth_token=.+&new=1$/);
  const u = await db.get("SELECT * FROM users WHERE email = ?", ["new.person@example.com"]);
  assert.ok(u);
  assert.equal(u.email_verified, 1);
  assert.equal(u.active_role, "client");
  assert.equal(u.password_hash, null);
  assert.ok(u.age_confirmed_at);
  const ident = await db.get("SELECT * FROM user_identities WHERE provider = 'google' AND provider_user_id = 'g-1'");
  assert.equal(ident.user_id, u.id);

  // The token works for /api/auth/me
  const token = decodeURIComponent(loc.match(/auth_token=([^&]+)/)[1]);
  const me = await (await get("/api/auth/me", { authorization: `Bearer ${token}` })).json();
  assert.equal(me.user.email, "new.person@example.com");
});

test("the same Google account logs straight back in", async () => {
  const loc = await roundTrip({ mode: "login", age: "0", profile: { id: "g-1", email: "new.person@example.com", emailVerified: true } });
  assert.match(loc, /^\/index\.html#auth_token=[^&]+$/);
});

test("new account without the 18+ confirmation is refused", async () => {
  const loc = await roundTrip({ age: "0", profile: { id: "g-2", email: "young@example.com", emailVerified: true } });
  assert.match(loc, /oauth_error=age_required/);
  assert.equal(await db.get("SELECT id FROM users WHERE email = 'young@example.com'"), undefined);
});

test("log in mode with no matching account does not create one", async () => {
  const loc = await roundTrip({ mode: "login", age: "0", profile: { id: "g-3", email: "nobody@example.com", emailVerified: true } });
  assert.match(loc, /oauth_error=no_account/);
});

test("an unverified provider email is refused", async () => {
  const loc = await roundTrip({ profile: { id: "g-4", email: "unverified@example.com", emailVerified: false } });
  assert.match(loc, /oauth_error=no_verified_email/);
});

test("an existing email account is linked, not duplicated", async () => {
  const existing = await db.get("SELECT id, email FROM users WHERE password_hash IS NOT NULL LIMIT 1");
  const loc = await roundTrip({ mode: "login", age: "0", profile: { id: "g-5", email: existing.email, emailVerified: true } });
  assert.match(loc, /auth_token=/);
  const link = await db.get("SELECT user_id FROM user_identities WHERE provider_user_id = 'g-5'");
  assert.equal(link.user_id, existing.id);
  const n = await db.get("SELECT COUNT(*) AS n FROM users WHERE email = ?", [existing.email]);
  assert.equal(n.n, 1);
});

test("a callback from another browser (nonce mismatch) is rejected", async () => {
  const loc = await roundTrip({ tamper: true, profile: { id: "g-6", email: "x@example.com", emailVerified: true } });
  assert.match(loc, /oauth_error=expired/);
});

test("a forged state is rejected", async () => {
  const r = await get("/api/auth/oauth/google/callback?code=abc&state=not-a-real-state");
  assert.match(r.headers.get("location"), /oauth_error=expired/);
});
