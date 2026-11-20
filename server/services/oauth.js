/* =========================================================
   CREOTASK — Social sign-in providers (OAuth 2.0 / OpenID Connect)
   ---------------------------------------------------------
   A provider is enabled only when both its client ID and secret are set
   in the environment; otherwise its button stays disabled on the site.
   Only a provider-verified email is ever accepted.
   ========================================================= */
"use strict";

const PROVIDERS = {
  google: {
    label: "Google",
    env: "GOOGLE",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    extraAuthParams: { prompt: "select_account" },
    async profile(accessToken) {
      const u = await getJson("https://openidconnect.googleapis.com/v1/userinfo", accessToken);
      return { id: String(u.sub || ""), email: u.email, emailVerified: u.email_verified === true, name: u.name };
    },
  },
  github: {
    label: "GitHub",
    env: "GITHUB",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    extraAuthParams: { allow_signup: "true" },
    async profile(accessToken) {
      const u = await getJson("https://api.github.com/user", accessToken);
      const emails = await getJson("https://api.github.com/user/emails", accessToken);
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : null;
      return { id: String(u.id || ""), email: primary?.email, emailVerified: !!primary, name: u.name || u.login };
    },
  },
  linkedin: {
    label: "LinkedIn",
    env: "LINKEDIN",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "openid profile email",
    extraAuthParams: {},
    async profile(accessToken) {
      const u = await getJson("https://api.linkedin.com/v2/userinfo", accessToken);
      return { id: String(u.sub || ""), email: u.email, emailVerified: u.email_verified === true, name: u.name };
    },
  },
};

async function getJson(url, accessToken) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "User-Agent": "CreoTask" },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Provider request failed (${r.status})`);
  return r.json();
}

function credentials(name) {
  const p = PROVIDERS[name];
  if (!p) return null;
  const clientId = process.env[`${p.env}_CLIENT_ID`];
  const clientSecret = process.env[`${p.env}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function isEnabled(name) { return !!credentials(name); }

function enabledMap() {
  return Object.fromEntries(Object.keys(PROVIDERS).map((k) => [k, isEnabled(k)]));
}

function publicBase() {
  return (process.env.OAUTH_REDIRECT_BASE || process.env.CLIENT_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
}

function redirectUri(name) { return `${publicBase()}/api/auth/oauth/${name}/callback`; }

function authorizeUrl(name, state) {
  const p = PROVIDERS[name];
  const { clientId } = credentials(name);
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(name),
    response_type: "code",
    scope: p.scope,
    state,
    ...p.extraAuthParams,
  });
  return `${p.authorizeUrl}?${q}`;
}

/** Exchange the authorisation code, then read the account's id, verified email and name. */
async function fetchProfile(name, code) {
  const p = PROVIDERS[name];
  const { clientId, clientSecret } = credentials(name);
  const r = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(name),
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error("Token exchange failed");
  const prof = await p.profile(data.access_token);
  if (!prof.id) throw new Error("Provider returned no account id");
  return prof;
}

module.exports = { PROVIDERS, isEnabled, enabledMap, authorizeUrl, fetchProfile, publicBase };
