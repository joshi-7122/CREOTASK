# CreoTask — Requirement → Module Checklist

Source: PRD v2.0 §8 (functional requirements) plus the binding rules in §9–§19. Updated **14 Nov 2026, end of Phase 1**.

**Status key**
- ✅ **Done**: UI, backend, persistence and server-side permissions are in place, and the acceptance criteria are covered by automated tests.
- 🟡 **Partial**: some of it works; the gaps are listed.
- 🔶 **Legacy**: code existed before this audit but hasn't been checked against the acceptance criteria yet. Don't count it as done.
- ⛔ **Blocked**: needs a founder, legal or provider decision (see DEV_LOG → Decisions).
- ⬜ **Not started**.
- ⏸ **Deferred** by the PRD.

Tests: `tests/phase1.test.js` (P1-*), `tests/in-memory-integration.test.js` and `tests/integration.test.js` (legacy end-to-end).

## Accounts and identity

| ID | Pri | Module | Status | Evidence / gaps |
|---|---|---|---|---|
| AUTH-01 | P0 | auth | ✅ | Registration, single-use 24h verify token (re-issue invalidates the old one), `requireVerified` on publish/apply/offer/accept-offer/fund, unverified banner with resend. Tests: AUTH-01 suite |
| AUTH-02 | P0 | auth, sessions | ✅ | Server-side sessions; logout, revoke one device, sign out others; reset revokes every session and sends a "password changed" email; change password; non-enumerating forgot/resend; equal-time login failure; strict limiter on credential routes. Tests: AUTH-02 suite |
| AUTH-03 | P0 | auth, accounts | ✅ | `user_roles` table; switch creates the second role and is audited; active role shown in the header and profile; role-guarded routes return `ROLE_REQUIRED` |
| AUTH-04 | P1 | auth | ⬜ | 2FA. Required for privileged staff before ops tools handle real cases (Phase 4) |
| — | — | age policy | ✅ | Required age acknowledgement stored with timestamp and policy version. **Min age 18 is still an open decision** |

## Profiles and verification

| ID | Pri | Module | Status | Evidence / gaps |
|---|---|---|---|---|
| PROF-01 | P0 | profiles, serializers | ✅ | Explicit public/private allow-lists (KYC, earnings and visibility never public); validated partial updates (null clears); completeness % with a missing-items checklist; hidden-profile option |
| PROF-02 | P0 | skills, catalog | ✅ | Canonical catalogue with aliases; verified vs self-declared shown distinctly; evidence goes into the queue; verified/pending claims are locked; claims with verification history are retained |
| PROF-03 | P0 | portfolio | ✅ | Add, edit, archive, restore, remove. Public display requires active + non-confidential + rights declared. Confidential items are never public. Only http(s) links are accepted |
| PROF-04 | P0 | profiles | ✅ | Availability, weekly capacity, categories, engagement, timezone. Stale flag after `AVAILABILITY_STALE_DAYS` (30, engineering default); confirm button |
| PROF-05 | P0 | profiles | ✅ | Client type, organisation, website, timezone; public allow-list shows verification state only |
| VER-01 | P0 | kyc | ⛔ | KYC status is displayed honestly. Submission is blocked on the provider and legal model (Phase 5). The old "KYC simulator" alert was removed |
| VER-02 | P0 | client verification | ⛔ | Status displayed. Flow is blocked on the provider and legal model (Phase 5) |
| VER-03 | P0 | admin, skills | 🟡 | User side done (evidence, links, queue entry, retention). Reviewer side is legacy: needs a "request more info" outcome, appeal, and a reason code on every decision (Phase 6) |

## Marketplace

| ID | Pri | Module | Status | Evidence / gaps |
|---|---|---|---|---|
| PROJ-01 | P0 | projects | 🔶 | Create with milestones exists. Must check: acceptance criteria required, selection method, eligibility fields |
| PROJ-02 | P0 | projects | 🔶 | Milestone sum = budget is tested. Must check: per-milestone due date and deliverable criteria required |
| PROJ-03 | P0 | projects | 🟡 | Draft and publish exist; publish requires a verified email. Missing: preview, pause, close, pending-review transitions, audit of each transition |
| PROJ-04 | P0 | discovery | 🔶 | Filters exist. Must check: eligibility filtering, deadline filter |
| PROJ-05 | P0 | trust | ⬜ | Reporting endpoint and queue |
| APP-01 | P0 | applications | 🟡 | Apply works (needs verification; one per project via UNIQUE). Missing: immutable evidence snapshot, confidential-portfolio guard, self-dealing guard (client ≠ freelancer) |
| APP-02 | P0 | applications | 🔶 | Statuses exist. Must check: Viewed set on open, Withdraw endpoint, timestamps per transition |
| APP-03 | P0 | applications | 🔶 | Must check: private-field protection, tier filter off by default |
| APP-04 | P1 | invitations | ⬜ | |
| OFR-01 | P0 | offers | 🔶 | Fee breakdown exists. Must check: terms snapshot, versioning, identical view for both parties |
| OFR-02 | P0 | offers | 🔶 | Accept/decline exist; offer acceptance needs a verified email. Missing: withdraw, expiry job (72h is a **proposal**) |
| OFR-03 | P0 | payments | ⛔ | Funding is **disabled by default**. A sandbox mode exists for dev only and is labelled everywhere. Real gate needs a provider (Phase 5) |

## Workspace

| ID | Pri | Module | Status | Evidence / gaps |
|---|---|---|---|---|
| WORK-01 | P0 | workspace | 🔶 | |
| WORK-02 | P0 | messaging | 🔶 | Must check: case-handler access, report and block controls |
| WORK-03 | P0 | files | ⬜ | **Known gap:** `/uploads` is publicly served with no scanning. Needs private storage, signed URLs and a malware scanner (vendor decision) |
| WORK-04 | P0 | deliverables | 🔶 | Revision cap exists (2, a **proposal**) |
| WORK-05 | P0 | change orders | 🔶 | |
| WORK-06 | P0 | workspace | ⬜ | Pause and cancellation |

## Payments (all P0-GATED)

| ID | Status | Notes |
|---|---|---|
| PAY-01 | ⛔ | Provider and fund-flow approval |
| PAY-02 | 🟡 | Ledger exists with an idempotency key and integer paise. Missing: DB-level immutability triggers, status and occurred/recorded fields, provider event link |
| PAY-03 | 🔶 | Fee shown on offer; tax is 0 pending GST decision; no statements yet |
| PAY-04 | ⬜ | Webhooks and reconciliation |
| PAY-05 | ⬜ | Refunds, chargebacks, payout failures |

## Trust and operations

| ID | Pri | Status | Notes |
|---|---|---|---|
| TRUST-01 | P0 | 🔶 | Mutual-reveal reviews exist; 14-day window not implemented |
| TRUST-02 | P0 | 🔶 | Dispute table and states exist; evidence, appeal and audit incomplete |
| TRUST-03 | P0 | ⬜ | Support tickets |
| TRUST-04 | P0 | ⬜ | Reports with reason codes |
| TRUST-05 | P0 | 🟡 | Foundation done: suspension needs a reason category, revokes sessions, is audited; the user sees the reason and appeal route; status isn't revealed without the correct password. Missing: appeal workflow, in-flight work handling (Phase 4) |
| OPS-01 | P0 | 🟡 | Audit helper with reason codes. Admin roles don't yet match the PRD's support / ops / finance / admin split |
| OPS-02 | P0 | ⬜ | Dual approval |
| OPS-03 | P0 | 🔶 | Basic stats only |

## Fair access

| ID | Pri | Status | Notes |
|---|---|---|---|
| TIER-01 | P0 | 🟡 | Tier display and unmet criteria shown. Missing: rule version on every decision, tier history UI. Code thresholds differ from the PRD hypotheses |
| TIER-02 | P0 | 🔶 | Considers projects, clients, rating, on-time, verified skills. Missing: portfolio quality, complexity/value, repeat-client cap |
| TIER-03 | P0 | 🟡 | Page-local 1-in-5 reorder. Missing: logged slot types, eligibility-first ranking, ranking version |
| START-01 | P0-lite | 🟡 | CreoStart flag on projects. Missing: Paid Entry vs Practice Challenge listing types. Misleading "guaranteed escrow" copy removed |

## Platform

| ID | Pri | Status | Notes |
|---|---|---|---|
| NOTIF-01 | P0 | 🟡 | In-app notifications exist; email only for auth, offers and password change. Catalogue coverage pending |
| NOTIF-02 | P1 | ⬜ | |
| AN-01 | P0 | 🟡 | Privacy-minimised `analytics_events` with allow-listed names; Phase 1 funnel events instrumented. Later phases add their own |
| CON-01 | P1 | ⏸ | Contests |
| FUT-01 | P2 | ⏸ | CreoScore, AI matching, XP, Academy, community. Leftover XP/leaderboard UI was removed from the profile page |

## Cross-cutting (§17–§20)

| Rule | Status | Notes |
|---|---|---|
| Money in integer minor units + currency | 🟡 | `*_paise` + `currency` columns. Audit any float use when Phase 5 starts |
| UTC storage, local rendering | ✅ | Epoch ms in DB; UI uses `toLocale*`; per-user timezone stored |
| Public API never exposes KYC or financial data | ✅ | Serializer allow-lists + tests |
| Server-side authorisation | 🟡 | Phase 1 routes covered. Legacy project routes need the Phase 2 permission matrix tests |
| Repo and DB not publicly served | ✅ | **Fixed critical exposure** of `server/data/creotask.db`. Test asserts it |
| Versioned migrations | ✅ | `server/migrations/NNN_*.js` + `schema_migrations` |
| Transactional writes | ✅ | `db.transaction()` with a cross-request lock; tested |
| Accessibility (WCAG 2.2 AA) | 🟡 | Design system: visible focus ring, labelled fields, native dialogs (focus trap and Esc), keyboard tabs, skip links, reduced motion, text contrast at least 4.5:1 for body and secondary text. No formal audit yet |
| Responsive | 🟡 | Landing, auth, app shell (phone tab bar) and profile checked at 375px. Legacy marketplace views are redesigned in Phase 2 |
