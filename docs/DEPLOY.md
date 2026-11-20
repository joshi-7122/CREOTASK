# Deploying CreoTask

The site runs in two parts:

| Part | Where | What it serves |
|---|---|---|
| Pages | Vercel (`creotask.vercel.app`) | `index.html`, `app.html`, `assets/`, the email-link pages |
| Server | Render (`creotask-api`) | everything under `/api` — accounts, sign-in, profiles, projects — and the SQLite database |

`vercel.json` forwards every `/api/...` request from the Vercel site to the Render server, so the
browser only ever talks to `creotask.vercel.app` (same origin, no CORS setup needed).

Configuration lives in `render.yaml` (server) and `vercel.json` (forwarding). Secrets are entered in
the Render dashboard and are never committed.

## 1. Create the server on Render

1. Sign in at render.com with GitHub and allow access to the `CREOTASK` repository.
2. **New → Blueprint**, pick the repository. Render reads `render.yaml` and proposes the
   `creotask-api` web service on the free plan (no card needed).
3. Fill in the values it asks for (all marked `sync: false`):
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from Google Auth Platform → Clients
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — from GitHub → Developer settings → OAuth Apps
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` — an email provider for verification and
     password-reset emails. Without them accounts still work, but no emails are sent (the server
     logs "Not sent").
4. **Apply.**
5. When it is live, open `https://<your-service>.onrender.com/api/health` — it should return
   `{"status":"ok", ...}`.

If Render gives the service a different address than `creotask-api.onrender.com`, change the
destination in `vercel.json` to match and push.

## 2. Register the live sign-in addresses

Add these alongside the existing localhost ones:

- **Google** (Google Auth Platform → Clients → your client → Authorized redirect URIs):
  `https://creotask.vercel.app/api/auth/oauth/google/callback`
- **GitHub** (your OAuth App → Add redirect URI):
  `https://creotask.vercel.app/api/auth/oauth/github/callback`

## 3. Check the live site

After pushing, Vercel redeploys with the forwarding rules. Then:

- `https://creotask.vercel.app/api/health` returns `{"status":"ok", ...}`
- `https://creotask.vercel.app/api/auth/oauth/providers` shows `"google": true, "github": true`
- The sign-in dialog shows Continue with Google and GitHub lit, and both complete sign-in
- Creating an account with email works, and the verification email arrives (once SMTP is set)

## Notes

- **Free plan limits:** there is no persistent disk, so the SQLite database starts empty after every
  redeploy or restart (accounts created on the live site disappear), and the service sleeps after
  about 15 minutes idle, so the next visit takes up to a minute. Good for a preview, not for real users.
- **Moving to persistent data:** either a paid Render plan with a disk (set `plan: starter`, add a
  `disk` mounted at `/var/data`, and point `DB_PATH` there), or a hosted database with a free tier
  (Turso or Neon), which needs the server's storage code changed.
- **Proxy:** `TRUST_PROXY=2` tells the server that requests pass through Vercel and Render, so rate
  limits see each visitor's own address.
- **Payments** stay disabled (`PAYMENTS_MODE=disabled`) until a provider and legal review are approved.
- **Changing the site address** (a custom domain): update `CLIENT_ORIGIN` and `OAUTH_REDIRECT_BASE`
  on Render, and add the new callback addresses at Google and GitHub.
