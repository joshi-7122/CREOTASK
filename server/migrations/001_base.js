/* 001 — Base schema (the original CREATE TABLE IF NOT EXISTS block).
   Idempotent so databases created before versioned migrations adopt it safely. */
"use strict";
const SQL = `
/* ── Users & Authentication ──────────────────────────── */
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_login_at   INTEGER,
  is_active       INTEGER NOT NULL DEFAULT 1,
  is_banned       INTEGER NOT NULL DEFAULT 0,
  ban_reason      TEXT,
  active_role     TEXT NOT NULL DEFAULT 'freelancer'
    CHECK (active_role IN ('freelancer','client'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

/* ── Freelancer Profiles ──────────────────────────────── */
CREATE TABLE IF NOT EXISTS freelancer_profiles (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  headline          TEXT,
  bio               TEXT,
  location_city     TEXT,
  location_state    TEXT,
  country           TEXT NOT NULL DEFAULT 'IN',
  avatar_url        TEXT,
  availability      TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available','limited','unavailable')),
  hourly_rate_min   INTEGER,
  hourly_rate_max   INTEGER,
  languages         TEXT NOT NULL DEFAULT '["en"]',
  tier              TEXT NOT NULL DEFAULT 'bronze'
    CHECK (tier IN ('bronze','silver','gold','platinum')),
  tier_updated_at   INTEGER,
  creostart_eligible INTEGER NOT NULL DEFAULT 1,
  kyc_status        TEXT NOT NULL DEFAULT 'not_started'
    CHECK (kyc_status IN ('not_started','pending','verified','action_required')),
  kyc_updated_at    INTEGER,
  total_projects_completed INTEGER NOT NULL DEFAULT 0,
  total_unique_clients     INTEGER NOT NULL DEFAULT 0,
  avg_rating               REAL NOT NULL DEFAULT 0.0,
  total_reviews            INTEGER NOT NULL DEFAULT 0,
  on_time_rate             REAL NOT NULL DEFAULT 1.0,
  total_earned_paise       INTEGER NOT NULL DEFAULT 0,
  portfolio_url     TEXT,
  github_url        TEXT,
  linkedin_url      TEXT,
  website_url       TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  proficiency         TEXT NOT NULL DEFAULT 'intermediate'
    CHECK (proficiency IN ('beginner','intermediate','advanced','expert')),
  verification_status TEXT NOT NULL DEFAULT 'self_declared'
    CHECK (verification_status IN ('self_declared','pending_verification','verified','rejected')),
  verified_at         INTEGER,
  verified_by         TEXT REFERENCES users(id),
  verification_note   TEXT,
  years_exp           REAL,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  skills_used     TEXT NOT NULL DEFAULT '[]',
  external_url    TEXT,
  images          TEXT NOT NULL DEFAULT '[]',
  files           TEXT NOT NULL DEFAULT '[]',
  is_confidential INTEGER NOT NULL DEFAULT 0,
  is_featured     INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio_items(user_id);

/* ── Client Profiles ─────────────────────────────────── */
CREATE TABLE IF NOT EXISTS client_profiles (
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name          TEXT NOT NULL,
  bio                   TEXT,
  avatar_url            TEXT,
  organization_name     TEXT,
  organization_type     TEXT,
  website_url           TEXT,
  location_city         TEXT,
  location_state        TEXT,
  country               TEXT NOT NULL DEFAULT 'IN',
  verification_status   TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified')),
  total_projects_posted    INTEGER NOT NULL DEFAULT 0,
  total_projects_completed INTEGER NOT NULL DEFAULT 0,
  avg_rating               REAL NOT NULL DEFAULT 0.0,
  total_reviews            INTEGER NOT NULL DEFAULT 0,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

/* ── Projects ────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS projects (
  id                  TEXT PRIMARY KEY,
  client_id           TEXT NOT NULL REFERENCES users(id),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  category            TEXT NOT NULL,
  required_skills     TEXT NOT NULL DEFAULT '[]',
  budget_paise        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  timeline_days       INTEGER,
  deadline_at         INTEGER,
  is_creostart        INTEGER NOT NULL DEFAULT 0,
  is_remote           INTEGER NOT NULL DEFAULT 1,
  attachments         TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria TEXT,
  deliverables        TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','open','shortlisting','offer_sent','awaiting_funding','active','paused','completed','disputed','cancelled','rejected')),
  visibility          TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','unlisted','private')),
  hired_freelancer_id TEXT REFERENCES users(id),
  hired_at            INTEGER,
  moderation_status   TEXT NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('approved','pending','flagged','rejected')),
  moderation_note     TEXT,
  moderated_by        TEXT REFERENCES users(id),
  moderated_at        INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  published_at        INTEGER,
  completed_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_projects_client     ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_freelancer ON projects(hired_freelancer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_creostart  ON projects(is_creostart);

CREATE TABLE IF NOT EXISTS milestones (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  budget_paise    INTEGER NOT NULL,
  timeline_days   INTEGER,
  due_at          INTEGER,
  status          TEXT NOT NULL DEFAULT 'not_funded'
    CHECK (status IN ('not_funded','funding_pending','funded','in_progress','submitted','revision_requested','accepted','released','refunded','disputed')),
  max_revisions   INTEGER NOT NULL DEFAULT 2,
  revisions_used  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  funded_at       INTEGER,
  submitted_at    INTEGER,
  accepted_at     INTEGER,
  released_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

/* ── Applications ────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS applications (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pitch                  TEXT NOT NULL,
  proposed_budget_paise  INTEGER,
  proposed_timeline_days INTEGER,
  portfolio_evidence     TEXT NOT NULL DEFAULT '[]',
  status                 TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','viewed','shortlisted','hired','declined','withdrawn')),
  client_note            TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  UNIQUE (project_id, freelancer_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_project    ON applications(project_id);
CREATE INDEX IF NOT EXISTS idx_applications_freelancer ON applications(freelancer_id);

/* ── Offers ──────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS offers (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id),
  application_id      TEXT NOT NULL REFERENCES applications(id),
  client_id           TEXT NOT NULL REFERENCES users(id),
  freelancer_id       TEXT NOT NULL REFERENCES users(id),
  gross_paise         INTEGER NOT NULL,
  platform_fee_paise  INTEGER NOT NULL,
  tax_paise           INTEGER NOT NULL DEFAULT 0,
  net_paise           INTEGER NOT NULL,
  platform_fee_pct    REAL NOT NULL,
  message             TEXT,
  terms               TEXT,
  expires_at          INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','expired','withdrawn','cancelled')),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  accepted_at         INTEGER,
  declined_at         INTEGER,
  decline_reason      TEXT
);
CREATE INDEX IF NOT EXISTS idx_offers_project    ON offers(project_id);
CREATE INDEX IF NOT EXISTS idx_offers_freelancer ON offers(freelancer_id);

/* ── Messages ────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('freelancer','client','system')),
  content     TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  is_flagged  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);

/* ── Deliverables ────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS deliverables (
  id            TEXT PRIMARY KEY,
  milestone_id  TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  submitted_by  TEXT NOT NULL REFERENCES users(id),
  version       INTEGER NOT NULL DEFAULT 1,
  note          TEXT,
  files         TEXT NOT NULL DEFAULT '[]',
  external_links TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revision_requested','rejected')),
  reviewer_note TEXT,
  created_at    INTEGER NOT NULL,
  reviewed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_deliverables_milestone ON deliverables(milestone_id);

CREATE TABLE IF NOT EXISTS change_orders (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id),
  milestone_id        TEXT REFERENCES milestones(id),
  requested_by        TEXT NOT NULL REFERENCES users(id),
  requester_role      TEXT NOT NULL CHECK (requester_role IN ('freelancer','client')),
  scope_note          TEXT,
  budget_delta_paise  INTEGER NOT NULL DEFAULT 0,
  timeline_delta_days INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','cancelled')),
  responder_note      TEXT,
  created_at          INTEGER NOT NULL,
  resolved_at         INTEGER,
  resolved_by         TEXT REFERENCES users(id)
);

/* ── Immutable Financial Ledger ──────────────────────── */
CREATE TABLE IF NOT EXISTS ledger (
  id               TEXT PRIMARY KEY,
  idempotency_key  TEXT UNIQUE NOT NULL,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  milestone_id     TEXT REFERENCES milestones(id),
  payer_id         TEXT REFERENCES users(id),
  payee_id         TEXT REFERENCES users(id),
  entry_type       TEXT NOT NULL
    CHECK (entry_type IN ('funding','platform_fee','tax_withholding','milestone_release','payout','refund','compensating_adjustment')),
  amount_paise     INTEGER NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'INR',
  provider         TEXT,
  provider_ref     TEXT,
  provider_status  TEXT,
  note             TEXT,
  actor_id         TEXT REFERENCES users(id),
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_project     ON ledger(project_id);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency ON ledger(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_payee       ON ledger(payee_id);

/* ── Reviews ─────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS reviews (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  reviewer_id  TEXT NOT NULL REFERENCES users(id),
  reviewee_id  TEXT NOT NULL REFERENCES users(id),
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('client','freelancer')),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  is_visible   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  UNIQUE (project_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project  ON reviews(project_id);

/* ── Disputes ────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS disputes (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id),
  milestone_id   TEXT REFERENCES milestones(id),
  raised_by      TEXT NOT NULL REFERENCES users(id),
  raiser_role    TEXT NOT NULL CHECK (raiser_role IN ('client','freelancer')),
  reason         TEXT NOT NULL,
  description    TEXT,
  evidence_files TEXT NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'opened'
    CHECK (status IN ('opened','evidence_collection','assigned','under_review','decision','appealed','closed')),
  assigned_to    TEXT REFERENCES users(id),
  decision       TEXT,
  decision_note  TEXT,
  resolution     TEXT CHECK (resolution IN ('client_refund','freelancer_payout','partial','dismissed')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  resolved_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_disputes_project ON disputes(project_id);

/* ── Reports ─────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL REFERENCES users(id),
  target_type  TEXT NOT NULL CHECK (target_type IN ('user','project','message','portfolio_item')),
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolved_by  TEXT REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  resolved_at  INTEGER
);

/* ── Notifications ───────────────────────────────────── */
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

/* ── Admins & Audit ──────────────────────────────────── */
CREATE TABLE IF NOT EXISTS admins (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  admin_role TEXT NOT NULL DEFAULT 'moderator'
    CHECK (admin_role IN ('super_admin','admin','moderator','finance')),
  granted_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT REFERENCES users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  before_state TEXT,
  after_state  TEXT,
  note         TEXT,
  ip_address   TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

/* ── Skill Verification Queue ────────────────────────── */
CREATE TABLE IF NOT EXISTS skill_verification_queue (
  id             TEXT PRIMARY KEY,
  skill_id       TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id),
  evidence_note  TEXT,
  evidence_files TEXT NOT NULL DEFAULT '[]',
  external_links TEXT NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','under_review','approved','rejected')),
  reviewed_by    TEXT REFERENCES users(id),
  review_note    TEXT,
  created_at     INTEGER NOT NULL,
  reviewed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_svq_user ON skill_verification_queue(user_id);

/* ── Tier Events ─────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS tier_events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  from_tier     TEXT,
  to_tier       TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  evaluated_by  TEXT NOT NULL DEFAULT 'system'
    CHECK (evaluated_by IN ('system','admin')),
  admin_id      TEXT REFERENCES users(id),
  evidence      TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tier_events_user ON tier_events(user_id);
`;
module.exports = { id: "001_base", async up(db) { await db.exec(SQL); } };
