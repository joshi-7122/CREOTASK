# Turning on Google, GitHub and LinkedIn sign-in

The sign-in code is already built (`server/services/oauth.js`, `server/controllers/oauthController.js`).
A button on the sign-in dialog stays faded until its provider's **client ID and secret** are in `.env`.
Each provider issues these to the account owner, so they have to be created in your own developer accounts.

Never commit `.env`. It is already listed in `.gitignore`.

## Callback addresses

Every provider asks where to send people back after they approve. Register the address for each place
the site runs:

| Provider | Local (your Mac) | Live site |
|---|---|---|
| Google | `http://localhost:3000/api/auth/oauth/google/callback` | `https://YOUR-DOMAIN/api/auth/oauth/google/callback` |
| GitHub | `http://localhost:3000/api/auth/oauth/github/callback` | `https://YOUR-DOMAIN/api/auth/oauth/github/callback` |
| LinkedIn | `http://localhost:3000/api/auth/oauth/linkedin/callback` | `https://YOUR-DOMAIN/api/auth/oauth/linkedin/callback` |

The live addresses only work once the CreoTask server runs at that domain (Vercel currently serves the
pages only, so `/api/...` returns 404 there).

## Google

1. Open Google Cloud Console and create a project (for example "CreoTask").
2. Go to **APIs & Services → OAuth consent screen** (shown as *Google Auth Platform* in newer consoles).
   Set the app name, support email and logo, and choose **External** as the audience.
3. Go to **Clients → Create client**, choose **Web application**, and add the Google callback
   addresses above under **Authorized redirect URIs**.
4. Copy the **Client ID** and **Client secret**.
5. While the app is in **Testing**, only the test users you list can sign in. To let **anyone** sign in,
   choose **Publish app** on the audience page. CreoTask only asks for name, email and profile
   (`openid email profile`), which normally doesn't need Google's extra verification review.

## GitHub

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: your site address. Authorization callback URL: the GitHub callback above.
   A GitHub OAuth app takes **one** callback address, so make one app for local testing and one for the
   live site.
3. Register, copy the **Client ID**, then **Generate a new client secret** and copy it.
4. Anyone with a GitHub account can sign in straight away. CreoTask reads their primary **verified** email.

## LinkedIn

1. Go to the LinkedIn Developer portal and **Create app**. LinkedIn requires the app to be linked to a
   LinkedIn **Company Page** (create one for CreoTask if needed).
2. On the **Products** tab, add **Sign In with LinkedIn using OpenID Connect**.
3. On the **Auth** tab, add the LinkedIn callback addresses under **Authorized redirect URLs**,
   then copy the **Client ID** and **Primary client secret**.
4. Anyone with a LinkedIn account can then sign in.

## Add the keys

Put them in `.env` (copy the names from `.env.example`), then restart the server:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
```

On the live server, also set `CLIENT_ORIGIN` (or `OAUTH_REDIRECT_BASE`) to the public address, for example
`https://creotask.example`, so the callback addresses match what you registered.

You can turn on one provider at a time. `GET /api/auth/oauth/providers` shows which are active.

## What happens when someone signs in

- Only an email the provider has **verified** is accepted.
- If a CreoTask account already uses that email, the provider is linked to it; no duplicate is made.
- A new account needs the 18+ box ticked and uses the role picked in the dialog. Its email counts as
  verified.
- **Log in** mode never creates an account; it asks the person to choose **Sign up**.
