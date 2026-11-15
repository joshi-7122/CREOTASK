# CreoTask — Architecture Assessment (Phase 0)

Audit date: 14 Nov 2026 · Source of truth: *CreoTask End-to-End PRD v2.0* (functional). UI/UX is designed in-house phase by phase and reviewed by the founder (no Figma handoff, founder decision 14 Nov 2026).

## 1. What exists today

| Layer | Current implementation | Verdict |
|---|---|---|
| Runtime | Node.js (works on v26), CommonJS | Keep |
| API | Express 4, Helmet, CORS, express-rate-limit, controller/route split | Keep — sound layering |
| DB | SQLite (WAL, FK on) via `sqlite3` promise wrapper | Keep for pilot; plan a Postgres move before public launch (see §4) |
| Schema | One `CREATE TABLE IF NOT EXISTS` block | **Replaced** with versioned migrations (Phase 1) — the old approach cannot add columns to an existing DB |
| Auth | bcrypt (12) + stateless JWT, hashed single-use verify/reset tokens | Keep the primitives; **added server-side sessions** so logout/reset actually revoke access |
| Frontend | Static HTML + vanilla JS (`api.js` → `store.js` → `app.js`/`dashboard.js`), hash routing, CSS custom properties | Keep; UI is redesigned in-house phase by phase. `app.js` (~1.5k lines) is the main maintainability risk |
| Email | Nodemailer; logs to console in development | Keep |
| Files | `multer` installed, local `uploads/` served **publicly** via `express.static` | Must change before WORK-03: private storage + signed URLs + malware scan |
| Payments | `fundMilestone` writes a `confirmed` ledger row with provider `simulated` and tells users funds are "held in escrow" | **Violates PRD §13 / OFR-03.** Guarded in Phase 1; rebuilt in Phase 5 |
| Tests | One in-process integration script (17 checks) | Kept; now runs on an isolated temp DB. Phase 1 adds a `node:test` suite |

The existing code is a reasonable base. A rewrite isn't justified. The work is to harden what's there and fill the gaps against the PRD.

## 2. Defects found in the audit

Severity reflects PRD acceptance criteria, not code style.

| # | Finding | PRD ref | Status |
|---|---|---|---|
| 1 | Unverified accounts can publish, apply, offer and fund | AUTH-01 | Fixed (Phase 1) |
| 2 | Logout is a no-op; password reset leaves existing sessions valid; no session list or revocation | AUTH-02 | Fixed (Phase 1) |
| 3 | Public profile API returns `fp.*`, which includes `kyc_status`, `total_earned_paise` and internal flags | PROF-01, §17, §19 | Fixed (Phase 1) |
| 4 | No age-eligibility acknowledgement at registration | Journey §7, User entity | Fixed (Phase 1). Min age is configurable; **18 is still an open founder decision** |
| 5 | Suspended users get a generic 401 with no reason category or appeal route | TRUST-05 | Partly fixed (structured 403 + reason category + appeal route). Appeals workflow comes in Phase 4 |
| 6 | Profile updates can't clear fields (COALESCE), aren't validated, and an invalid enum surfaces as a 500 | PROF-01 | Fixed (Phase 1) |
| 7 | No timezone, categories, engagement preference or stale-availability flag | PROF-04 | Fixed (Phase 1) |
| 8 | Skills are free text with no canonical catalogue or aliases | PROF-02, Skill entity | Fixed (Phase 1) — `skill_catalog` + aliases; free text still allowed but unmapped |
| 9 | Portfolio items can't be archived; no rights/permission declaration | PROF-03 | Fixed (Phase 1) |
| 10 | Simulated funding is reported as confirmed escrow funding | §13, OFR-03, PAY-01 | Guarded (Phase 1): disabled unless `PAYMENTS_MODE=sandbox` in a non-production env, and labelled SANDBOX everywhere. Real fix in Phase 5 |
| 11 | "Continue with Google/GitHub/LinkedIn" buttons secretly sign in as hard-coded demo accounts | Fake functionality | Fixed (Phase 1): replaced by a dev-only, clearly labelled demo-persona picker |
| 12 | Tests write to the developer's real database | Testing §25 | Fixed (Phase 1) |
| 13 | `/uploads` is publicly served (no auth, no scanning) | §14, WORK-03 | **Open** — Phase 3 |
| 14 | Newcomer exploration only reorders the current page and isn't logged | TIER-03, §11 | **Open** — Phase 6 |
| 15 | Tier thresholds in code differ from the PRD's v1.2 hypotheses and aren't versioned | TIER-01 | **Open** — Phase 6 (configurable rulebook with a version) |
| 16 | Ledger rows are mutable (no trigger guard); no webhook, provider-event or reconciliation tables | PAY-02/04 | **Open** — Phase 5 |
| 17 | Admin roles don't match the PRD (support / ops moderator / finance / admin); no dual approval | OPS-01/02 | **Open** — Phase 4 |
| 18 | Register returns 409 for existing emails, which reveals that an account exists | §18 anti-enumeration | **Accepted for now** — logged as a decision (see DEV_LOG) |

## 3. Target architecture (incremental, same stack)

```
Browser (static HTML + vanilla JS modules, hash routes)
   │  fetch /api/*  (Bearer JWT carrying a session id)
   ▼
Express app ── middleware: helmet · cors · rate limits · authenticate(session check) · requireVerified · requireRole · requireAdminRole
   │
   ├── routes/      thin HTTP mapping
   ├── controllers/ request validation + orchestration
   ├── services/    (Phase 2+) domain logic: state machines, pricing, eligibility, tier rules — unit-testable
   ├── utils/       validation, serializers (public vs private), audit, analytics, email, notify
   └── config/      db, versioned migrations (server/migrations/NNN_*.sql), seed
   │
   ▼
SQLite (pilot) → Postgres (pre-launch)    ·    later: private object storage, malware scanner, payment provider, KYC provider
```

Principles carried into every phase:
- **The server enforces everything.** Every field leaving the API passes through an explicit public or private serializer.
- **Money**: integer minor units plus an ISO currency, append-only ledger, provider-confirmed states only, idempotent webhooks.
- **State machines** live in `services/` as explicit transition tables. Every transition is authorised, timestamped and audited.
- **Configurable hypotheses**: anything the PRD marks PROPOSED (offer expiry, revision count, tier thresholds, exploration share, min age, stale-availability window) lives in `server/config/policy.js`, never as magic numbers.

## 4. Implementation sequence

| Phase | Scope | Depends on |
|---|---|---|
| **1 — Foundation (this change)** | Migrations, sessions and revocation, verification gate, age acknowledgement, account-status responses, public/private profile split, PROF-04 preferences, skill catalogue, portfolio archive and rights declaration, audit and analytics helpers, payment guard, isolated tests | — |
| 2 — Marketplace | Project state machine (draft → pending review → open → …), eligibility checks, discovery filters, application lifecycle (viewed, withdraw), self-dealing guard, offer versioning and expiry job, invitations (P1) | 1 |
| 3 — Execution | Workspace, private file storage with signed URLs and scanning, deliverable versions, revisions, change orders, pause/cancel | 2; storage and scanner choice |
| 4 — Trust and ops | Reviews (blind release), reports, support tickets, disputes, suspension and appeals, PRD admin roles, dual approval, ops dashboards | 2–3 |
| 5 — Payment readiness | Provider adapter, payment intents, signed webhooks, idempotent provider events, immutable ledger (DB triggers), KYC, payouts, refunds, reconciliation | **Provider + legal + tax approval** |
| 6 — Fair access | Versioned tier rulebook, tier history and appeals, CreoStart listing types, logged exploration slots, anti-gaming flags | 2, 4 |
| 7 — Beta hardening | E2E, permissions matrix tests, a11y and responsive checks, performance, backup and restore drill | all |

Deferred until their gates clear: paid contests, CreoScore, AI matching, XP, Academy, community.

## 5. Blocking decisions (founder / external)

| Decision | Blocks | Working default in code |
|---|---|---|
| Payment provider and fund-flow model (critical) | All of Phase 5; real `OFR-03` | Payments **disabled**. Sandbox only, clearly labelled |
| Legal structure and contracting parties (critical) | Phase 5, ToS, offer terms copy | None |
| GST / tax treatment, fee model (take rate vs fixed) | PAY-03 disclosures | `PLATFORM_FEE_PERCENT=10` (existing value, **unapproved**), tax 0 |
| Minimum earning age | Registration copy, KYC | `MIN_ACCOUNT_AGE=18` (proposed) |
| Launch categories (2–3) | Discovery, skill verification queues | Existing category list kept; all open |
| Tier thresholds and assessed Silver entry | Phase 6 | v1.2 hypotheses to be encoded as rulebook `v0-hypothesis` |
| Newcomer exploration share | Phase 6 | 1-in-5, flagged experimental |
| Offer expiry, revisions, auto-accept, review window | Phases 2–3 | 72h / 2 / auto-accept **off** / 14 days |
| File limits, storage and malware scanning vendor | Phase 3 | 25 MB / 100 MB proposed |
| Production DB (Postgres) and hosting | Public launch | SQLite for pilot |
