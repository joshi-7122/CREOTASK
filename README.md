# CREOTASK — Independent Work Ecosystem

> **Project docs:** [Architecture assessment](docs/ARCHITECTURE.md) · [Requirement checklist](docs/REQUIREMENTS_CHECKLIST.md) · [Development log & decisions](docs/DEV_LOG.md)
> *"Where Skills Meet Opportunities. Your skills should create your opportunities, not just your existing reputation."*

Production-oriented implementation of **CreoTask PRD v1.2 / v2.0**, designed as an India-first, INR-first independent-work marketplace connecting people with marketable skills to clients and businesses.

---

## 1. Architectural Highlights

- **Direct Project Marketplace First:** Implements the complete transaction loop: Client project brief $\to$ Deterministic skill discovery $\to$ Proposals $\to$ Shortlisting $\to$ 72-hour immutable offers $\to$ Milestone funding (provider-gated; disabled until an approved payment provider exists) $\to$ Workspace collaboration & deliverables $\to$ In-scope revisions $\to$ Client acceptance $\to$ Payout release.
- **Evidence-Led Four-Tier System:** Bronze (Emerging), Silver (Rising), Gold (Proven), and Platinum (Elite). Non-purchasable, evaluated dynamically on verifiable delivery track records (unique clients, verified skills, rating, on-time delivery rate, clean dispute history).
- **CreoStart Pathway & Fair Access:** Designated entry-level opportunities for newcomers, plus a deterministic **1-in-5 Newcomer Exploration** rule that injects qualified Bronze talent into client searches without compromising skill fit.
- **Financial Ledger (foundation):** Integer paise (INR minor units) with idempotency keys and fee disclosure. **Payments are disabled by default** (`PAYMENTS_MODE=disabled`). A dev-only `sandbox` mode records clearly labelled test entries. No real money moves until a provider, fund flow, legal and tax review are approved (PRD §13).
- **Project Workspace & Governance:** In-workspace communication with anti-leakage guards, deliverable versioning, revision tracking (capped at 2 in-scope iterations by default), mutual Change Orders, and formal Dispute arbitration workflows.
- **Operations & Trust Console:** Comprehensive admin workspace with queues for skill verification, project moderation, dispute arbitration, and full ledger inspection.

---

## 2. Tech Stack

- **Runtime:** Node.js (v20+)
- **Server:** Express.js with Helmet security headers, CORS, and Express-Rate-Limit
- **Database:** SQLite with full relational integrity, foreign key cascades, WAL journal mode, and automated schema migrations (`server/config/migrate.js`)
- **Authentication:** JWT session tokens + bcrypt password hashing (12 rounds) + single-use email verification and password reset tokens
- **Email Service:** Nodemailer (console-logging in dev mode, SMTP-ready for production)
- **Frontend:** Responsive vanilla JavaScript (`CreoAPI` client layer), CSS custom properties, Outfit typography for UI and Cinzel for brand wordmark.

---

## 3. Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy the example environment file:
```bash
cp .env.example .env
```
Default development settings are preconfigured in `.env`.

### 3. Seed Database with Test Personas
```bash
npm run db:seed
```
This generates the SQLite database (`server/data/creotask.db`) and seeds 4 test accounts:

| Persona | Email | Password | Role & Purpose |
|---|---|---|---|
| **Platform Admin** | `admin@creotask.in` | `Admin@1234` | Super Admin (Moderation, Disputes, Skill Queue, Ledger Audit) |
| **Elite Freelancer** | `priya@demo.in` | `Test@1234` | Platinum Tier Product Designer (verified skills, ratings) |
| **Newcomer Freelancer** | `aman@demo.in` | `Test@1234` | Bronze Tier CreoStart fresher (bootcamp graduate) |
| **Verified Client** | `chai@demo.in` | `Test@1234` | Client account (Chai Leaf Co. - project postings; sandbox funding in dev only) |

### 4. Run the Server
Migrations in `server/migrations/` run automatically on boot (`npm run db:migrate` to run them alone).

```bash
npm start
```
Or for auto-reload during development:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 4. Automated Test Suite

Run everything (Phase 1 suite plus the legacy end-to-end suites). Tests use a throwaway SQLite file and never touch your dev database:
```bash
npm test
```
Phase 1 only:
```bash
npm run test:phase1
```
The test suite verifies:
1. Health and security endpoints
2. Client and Freelancer authentication & token generation
3. Role switching between Freelancer $\leftrightarrow$ Client
4. Milestone budget mismatch rejection ($\sum \text{Milestones} = \text{Project Budget}$)
5. Structured project creation & marketplace publication
6. Application submission with tailored pitch & proposed budget
7. Client shortlisting & applicant comparison
8. Offer generation with fee breakdown disclosure (gross, 10% take-rate, net payout)
9. Freelancer offer acceptance
10. Milestone 1 sandbox funding (test mode only) & duplicate funding prevention
11. Workspace participant messaging with security notices
12. Deliverable submission (v1)
13. In-scope revision request logging (v1 $\to$ v2)
14. Deliverable approval & immediate funds release to freelancer
15. Milestone 2 completion & project transition to `COMPLETED`
16. Mutual double-blind 5-star reviews
17. Immutable financial ledger audit trail
18. Evidence-based Four-Tier criteria verification

---

## 5. API Reference

### Authentication (`/api/auth`)
- `POST /register` — Create new freelancer or client account
- `POST /login` — Authenticate and receive JWT
- `POST /verify-email` — Verify email via single-use token
- `POST /switch-role` — Toggle active role between `freelancer` and `client`
- `GET  /me` — Retrieve current authenticated session and profile data

### Direct Projects (`/api/projects`)
- `GET  /` — Browse projects with category, skill, budget, and CreoStart filters
- `POST /` — Create fixed-price project with structured milestone schedule (Client)
- `GET  /:id` — Get project details, milestones, and participant context
- `POST /:id/publish` — Publish draft project to open marketplace
- `POST /:id/apply` — Apply with pitch, timeline, and portfolio links (Freelancer)
- `GET  /:id/applications` — Review applicants (Client)
- `PUT  /:id/applications/:appId` — Shortlist or decline applicants
- `POST /:id/offer` — Issue official offer with 72h expiry
- `PUT  /offers/:offerId` — Accept or decline offer (Freelancer)
- `POST /:id/milestones/:mileId/fund` — Fund milestone via provider gateway (Client)
- `POST /:id/milestones/:mileId/submit` — Submit milestone deliverable (Freelancer)
- `PUT  /:id/milestones/:mileId/review` — Accept deliverable or request revision (Client)
- `POST /:id/messages` — Send project-linked workspace message
- `POST /:id/dispute` — Raise formal dispute
- `POST /:id/review` — Submit double-blind post-completion review

### Profiles & Skills (`/api/profiles`)
- `GET  /freelancers` — Search talent with 1-in-5 Newcomer Exploration
- `GET  /freelancer/:id` — Public profile with verified skills, portfolio, and reviews
- `PUT  /freelancer` — Update headline, bio, availability, and location
- `POST /skills` — Add self-declared skill
- `POST /skills/:id/verify` — Submit evidence to skill verification queue
- `POST /portfolio` — Add portfolio project with external links and tags

### Operations & Trust Console (`/api/admin`)
- `GET  /stats` — Platform health metrics (users, active contracts, disputes)
- `GET  /skill-queue` & `PUT /skill-queue/:id` — Audit and approve/reject skill evidence
- `GET  /projects` & `PUT /projects/:id/moderate` — Content moderation queue
- `GET  /disputes` & `PUT /disputes/:id` — Dispute resolution desk
- `GET  /ledger` — Immutable financial ledger inspector
