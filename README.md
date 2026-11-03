# CREOTASK — Connect · Create · Compete

A gamified freelancing platform front end, built from the CREOTASK Figma mocks and brand assets.

## Pages

| Page | What's there |
| --- | --- |
| `index.html` | Landing hero ("Connect **Create** Compete"), how-it-works pillars, teal brand band, and the **Sign Up or Login** modal with the rainbow glow border (email/password + Google/GitHub/LinkedIn). |
| `app.html` | Signed-in app with the floating bottom dock (**Home · Explore · Resources ▸ Contests / Academy · Connect ▸ Contact us · Creotask Pro**). Home has tier progress, AI-style recommended contests, the daily challenge and a newsfeed. **Contests**: browse, filter, join, submit multi-file entries, and host your own (public or private). **Explore**: freelancer search with skill, rating and availability filters, plus a shortlist. **Academy**: courses that earn XP. **Contact us**: support tickets and FAQ. **Pro**: Bronze → Platinum tiers and the Pro plan. |
| `dashboard.html` | Profile sidebar (gold-ring avatar, `#N Leaderboard` tag, name/location/rating, About, Daily Challenges with live countdown, Logout), XP card with level and Exp bar, notifications, and three tabs: **Portfolio** (Featured Work, Skill Tree, Recent Activity), **Analytics** (Achievement, Daily Progress chart, Badges), **LeaderBoard**. |

## Run it

There's no build step. You can open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## How it works

- **Stack:** plain HTML, CSS and JavaScript. Fonts come from Google Fonts: Cinzel for the wordmark and Outfit for the UI.
- **Design tokens** live in `assets/css/styles.css` (`--gold`, `--teal`, `--panel` and others). Page styles are in `landing.css` and `dashboard.css`.
- **Logo:** the spire mark is an inline SVG `<symbol id="logo">` that uses `currentColor`, so it renders silver in the header and gold on the brand band. `assets/img/logo.svg` is the gold favicon.
- **Seed data** (freelancers, contests, courses, tiers) lives in `assets/js/data.js`.
- **Data:** `assets/js/store.js` is a small localStorage store, so every flow works without a server.

### Gamification rules

| Action | XP |
| --- | --- |
| Add a portfolio project | +50 |
| Add a skill | +20 |
| Level up a skill | +10 |
| Complete the daily challenge (once per day) | +100 |
| Join a contest / submit an entry / host a contest | +10 / +30 / +25 |
| Finish an Academy course | +30 to +80 |

Each level takes 500 XP. Tiers follow total XP: Bronze (0), Silver (1,000), Gold (2,500), Platinum (5,000). Private contests need Gold or Pro. Twelve achievements and badges unlock automatically, for example First Project, Contender, Scholar, On Fire (a 3-day streak) and Top 10.

## Connecting a backend

`Store` is the only data layer, and each method maps directly to an API endpoint:

| Store method | Suggested endpoint |
| --- | --- |
| `signUp(email, password)` | `POST /api/auth/signup` (sends the verification email) |
| `signIn(email, password)` | `POST /api/auth/login` |
| `socialSignIn(provider)` | `GET /api/auth/oauth/:provider` (OAuth redirect) |
| `current()` | `GET /api/me` |
| `update(fn)` | `PATCH /api/me`, `POST /api/me/portfolio`, `POST /api/me/skills`, … |
| leaderboard (in `dashboard.js`) | `GET /api/leaderboard` |
| `CreoData.CONTESTS`, join / submit / host | `GET /api/contests`, `POST /api/contests/:id/join`, `POST /api/contests/:id/submissions` (multipart), `POST /api/contests` |
| `CreoData.CREATORS`, shortlist | `GET /api/freelancers?skill=&rating=&available=`, `PUT /api/me/shortlist` |
| tickets | `POST /api/support/tickets` |

### Spec coverage

This front end covers most of the user-facing parts of the 42-feature spec: sign-up, profiles, portfolio, contests (create, public/private, multi-file entries), achievements, points, leaderboards, skill tracker, freelancer search and shortlist, Academy, newsfeed, tickets and notifications. Anything that needs a server is still to come: phone OTP, 2FA, login history, account deactivation, payments (Stripe, PayPal, UPI), wallet, escrow and payouts, refunds, multi-currency, real-time chat, winner selection, ratings, the chatbot and real AI matching.

> ⚠️ Password hashing in the browser and the seeded leaderboard are for the demo only. Real authentication, email verification, XP awards and rankings must be enforced server-side.
