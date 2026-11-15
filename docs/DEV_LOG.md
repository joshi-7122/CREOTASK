# CreoTask — Development Log

## 2026-11-14 · Walkthrough audit

I clicked through every screen built so far in the browser and captured each state. The walkthrough with 31 screenshots is at `docs/audit/index.html`.

Fixed during the audit:
- Anchor links landed under the sticky header.
- The CreoStart heading wrapped awkwardly.
- The marketplace subtitle claimed "verified" and "milestone-funded" contracts.
- Signed-in users got the anonymous resend wording.
- The verify-email error page repeated itself.
- Red outlines stayed on the reset form after a correction.
- Tier criteria read like a database ("have 0.0"); they're plain sentences now, with "no reviews yet".
- The rights checkbox had no invalid state.
- The client profile checklist had the wrong subtitle.
- The auth notice had no spacing.
- The signed-out notice used the danger style.
- Unknown addresses showed a bare "Cannot GET". There's a branded `404.html` now, with a test.

Tests: 65/65 (42 Phase 1 + 23 legacy). The walkthrough account was removed from the dev database afterwards.

---

## 2026-11-14 · Design system ("Indigo & Zari")

The founder asked for UI/UX designed in-house rather than from Figma. This step lays the visual foundation before Phase 2.

### Direction
- **Colour:** indigo-ink grounds with zari-gold accents. The logo gold (`#C9A464`/`#C4A265`) is unchanged; it moved off the generic flat near-black.
- **Type:** Anek Latin (an Indian type foundry, with Indic scripts for later localisation), wide for display and normal for text. Cinzel is kept for the wordmark only.
- **Signature element:** a stitched gold thread for anything that moves through stages (hero, milestones, progress). Gold is reserved for primary actions, progress and earned status.

### Delivered
- `assets/css/ds.css`: tokens (semantic roles), base styles, layout, buttons, forms (field, input, select, textarea, check, segmented, chips), card, rows, key-value, badge, tier, alert, empty, skeleton, toast, progress, thread, checklist, tabs, native `<dialog>`, menu, avatar, table, reduced motion. Every class is prefixed `ui-`. A **legacy bridge** remaps the old variable names so the not-yet-redesigned marketplace views match the new palette.
- `styleguide.html`: every component on one page, served **only outside production** at `/styleguide.html`.
- **Landing page:** rewritten with honest copy.
  - Hero, how it works for each side, principles, tier ladder, and a CreoStart paid-versus-practice comparison.
  - Removed the XP, leaderboard, "gamified" and contest claims (all deferred by the PRD).
- **Sign-up and log-in:** a native dialog with role preselected from the button clicked, visible labels, and a show/hide password control.
- **Verify-email and reset-password pages:** redesigned. Their inline scripts moved to `assets/js/auth-pages.js`, and verify-email now offers a resend form when the link is bad.
- **App shell (`assets/js/shell.js`, `pages/shell.css`):** shared by the app and profile pages.
  - Top bar with role-aware navigation, a "Working as" role switch, tier badge, and notifications and account menus.
  - Bottom tab bar on phones.
  - Notification links mapped to real app routes; the old links pointed at non-existent paths.
- **Profile page:** rebuilt on the system (header with stitched completeness bar, three tabs, two-column layout, dialogs).
- `UI` helpers: native `<dialog>` support, design-system toasts, and a `UI.busy()` button helper.

### Bugs fixed along the way
- `app.html` loaded `app.js` **twice** through an old fallback script. Every listener was bound twice (menus opened and closed on one click) and every startup API call ran twice.
- Modal autofocus landed on hidden inputs.

### Not changed yet (Phase 2 redesigns these)
- Marketplace views inside `app.js` (browse, my projects, applications, workspace, ledger, admin) and their legacy `.modal` dialogs still use `styles.css` and `app.css`, recoloured through the bridge.
- `assets/css/landing.css`, `assets/css/dashboard.css` and `assets/js/data.js` are no longer loaded by any page. I kept them because they contain your earlier uncommitted edits; delete them when you're happy.

### Verified
- `npm test`: 63/63 pass.
- Browser check at desktop and 375px for the landing page, sign-up dialog, app shell and menus, and the profile page. No horizontal overflow.

---

## 2026-11-14 · Phase 0 audit + Phase 1 Foundation

Branch: `phase-1-foundation`, cut from `main`. Your earlier uncommitted work in 10 files came across with the branch unchanged, except where Phase 1 had to edit those files (`app.html`, `index.html`, `dashboard.html`, `assets/js/*`, `assets/css/app.css`, `README.md`).

### Completed
- **Architecture assessment**: `docs/ARCHITECTURE.md`.
- **Requirement checklist**: `docs/REQUIREMENTS_CHECKLIST.md`.
- **Versioned migrations** (`server/migrations`, `schema_migrations`). Your dev DB was backed up to `server/data/creotask.pre-phase1.db`, then migrated.
- **`db.transaction()`** that is safe on the single shared SQLite connection.
- **Auth**: server-side sessions and revocation, verification gate, age acknowledgement, change password, session list, sign out other devices, suspension responses with reason and appeal route, structured error codes.
- **Profiles**: public/private serializers, validated partial updates, PROF-04 preferences, stale availability, completeness checklist, hidden profiles.
- **Skills**: canonical catalogue with aliases and `/api/skills/catalog`; locks on verified and pending claims; evidence validation.
- **Portfolio**: archive and restore, rights declaration, confidential items never public.
- **Audit and analytics helpers** (privacy-minimised).
- **Frontend**:
  - Sign-up has age confirmation.
  - The fake social sign-in buttons are replaced by a dev-only demo picker.
  - Unverified and sandbox banners added.
  - The profile page was rebuilt with real data only: profile, preferences, and account & security tabs; loading, empty and error states; keyboard tabs.
- **Tests**:
  - `tests/phase1.test.js`: 40 tests.
  - The legacy suites now run on an isolated temp DB.
  - `npm test` runs all three (63 checks).
  - Two guards were mutation-checked (deliberately broken, then confirmed the tests fail).

### Security fixes found in the audit
1. **Critical:** `express.static` served the whole repo root, so `/server/data/creotask.db` (password hashes, KYC state) and all server source were downloadable. Only the four pages and `/assets` are served now.
2. `/api/auth` had a 20-requests-per-15-minutes limiter on *every* route, including `/me`, so normal browsing would lock users out. The strict limiter now applies to credential endpoints only.
3. Login revealed suspension status before checking the password. It now checks the password first, and failed logins take the same time whether or not the email exists.
4. Passwords longer than 72 bytes were silently truncated by bcrypt. They're rejected now.
5. Profile and portfolio URLs accepted `javascript:` links (stored XSS through `href`). Only http(s) is accepted now.
6. The public profile API returned `kyc_status` and `total_earned_paise`.
7. Tests wrote to the developer database.

### In progress / next (Phase 2: marketplace)
- Project state machine: preview, pause, close, pending review, with audited transitions.
- Application lifecycle: viewed, withdraw, evidence snapshot, self-dealing guard.
- Offer versioning, withdraw and expiry job.
- A permission-matrix test for every legacy project route.

### Known issues
- `/uploads` is still publicly served. Nothing writes to it yet; it must be fixed before WORK-03.
- Old browser sessions (JWTs without a session id) are invalid after this change. Users just log in again.
- `client/pages/verify-email.html` and `reset-password.html` are the old pages. They work, but haven't been restyled or checked against the new error codes.
- The admin console UI (`app.js`) still calls `banUser(userId, reason)` without a reason category; the API now rejects that. The admin UI is Phase 4.
- The tier thresholds in `tierEngine.js` don't match the PRD v1.2 hypotheses (Phase 6).
- `app.js` is about 1.5k lines and should be split by route as each phase redesigns its screens.
- The preview launcher in the Claude app couldn't start the server, so I started it with `node server/index.js` from the repo and verified in the browser directly.

### Founder direction (14 Nov 2026)
- **No Figma.** UI/UX is designed in-house from start to finish, one phase at a time. The founder reviews each phase and requests changes. The existing CreoTask logo and name are kept.

### Technical decisions
| ID | Decision | Why |
|---|---|---|
| T-1 | Keep Express + SQLite + vanilla JS | Working base and tests; the PRD forbids rewrites without a reason. Revisit Postgres before public launch |
| T-2 | JWT carries only `sub` + `sid`; the session row is the authority | Gives real revocation (AUTH-02) without changing the client token flow |
| T-3 | Payments mode `disabled` \| `sandbox`, with no `live` value | PRD §13 gate. Sandbox is forced off in production. Ledger rows are labelled `sandbox` |
| T-4 | Allow-list serializers for every profile response | A new column can't leak by accident |
| T-5 | Portfolio public display = active ∧ ¬confidential ∧ rights declared | PRD §9 IP default plus PROF-03 "confidential never public" |
| T-6 | Verified and pending skills can't be edited or deleted | A verified badge certifies a specific claim; VER-03 retention |
| T-7 | Password rule: ≥8 chars, a letter and a number, ≤72 bytes | Engineering default; not in the PRD |

### Decisions needing a founder (not treated as approved)
| ID | Question | Working default | Where |
|---|---|---|---|
| D-AUTH-1 | Should sign-up hide whether an email is already registered? (Hiding it needs an email-first flow) | Reveals "email already exists" | `authController.register` |
| D-AGE | Minimum account age | 18 | `MIN_ACCOUNT_AGE` |
| D-CAT | 2–3 launch categories | All 7 existing categories open | `config/catalog.js` |
| D-FEE | Fee model and GST | 10%, tax 0 (pre-existing placeholder) | `PLATFORM_FEE_PERCENT` |
| D-PAY | Provider and fund flow | Payments disabled | `PAYMENTS_MODE` |
| D-STALE | Stale-availability window | 30 days | `AVAILABILITY_STALE_DAYS` |
| D-APPEAL | Appeals contact | Generic "contact support" | `APPEALS_CONTACT` |
| D-TIER | Tier thresholds and assessed Silver entry | Unchanged legacy values | Phase 6 |

### External dependencies
Payment provider · KYC provider · email delivery (SMTP) · object storage + malware scanner · legal and tax counsel · production DB and hosting.
