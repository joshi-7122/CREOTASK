/* =========================================================
   002 — Phase 1 Foundation
   - Server-side sessions (AUTH-02 revocation)
   - Age-policy acknowledgement, verification timestamp, suspension
     reason category (AUTH-01, TRUST-05, User entity)
   - user_roles (PRD UserRole entity; AUTH-03)
   - Freelancer preferences: timezone, categories, engagement,
     capacity, availability freshness, visibility (PROF-01/04)
   - Canonical skill catalogue with aliases (PROF-02, Skill entity)
   - Portfolio archive + rights declaration (PROF-03)
   - Audit reason codes; privacy-minimised analytics events (AN-01)
   ========================================================= */
"use strict";
const { SKILLS } = require("../config/catalog");

const SQL = `
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN age_confirmed_at INTEGER;
ALTER TABLE users ADD COLUMN age_policy_version TEXT;
ALTER TABLE users ADD COLUMN suspension_reason_category TEXT;
ALTER TABLE users ADD COLUMN suspended_at INTEGER;
ALTER TABLE users ADD COLUMN password_changed_at INTEGER;
UPDATE users SET email_verified_at = updated_at WHERE email_verified = 1;
UPDATE users SET suspension_reason_category = 'policy_violation', suspended_at = updated_at WHERE is_banned = 1;

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  revoke_reason TEXT,
  user_agent    TEXT,
  ip_address    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id, revoked_at);

CREATE TABLE user_roles (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('freelancer','client')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, role)
);
INSERT OR IGNORE INTO user_roles (user_id, role, status, created_at)
  SELECT user_id, 'freelancer', 'active', created_at FROM freelancer_profiles;
INSERT OR IGNORE INTO user_roles (user_id, role, status, created_at)
  SELECT user_id, 'client', 'active', created_at FROM client_profiles;

ALTER TABLE freelancer_profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE freelancer_profiles ADD COLUMN work_categories TEXT NOT NULL DEFAULT '[]';
ALTER TABLE freelancer_profiles ADD COLUMN engagement_preference TEXT NOT NULL DEFAULT 'either'
  CHECK (engagement_preference IN ('one_off','ongoing','either'));
ALTER TABLE freelancer_profiles ADD COLUMN weekly_capacity_hours INTEGER;
ALTER TABLE freelancer_profiles ADD COLUMN availability_updated_at INTEGER;
ALTER TABLE freelancer_profiles ADD COLUMN public_visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (public_visibility IN ('public','hidden'));
ALTER TABLE freelancer_profiles ADD COLUMN profile_completed_at INTEGER;
UPDATE freelancer_profiles SET availability_updated_at = updated_at;

ALTER TABLE client_profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

CREATE TABLE skill_catalog (
  id             TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category       TEXT NOT NULL,
  aliases        TEXT NOT NULL DEFAULT '[]',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL
);
ALTER TABLE skills ADD COLUMN catalog_skill_id TEXT REFERENCES skill_catalog(id);
CREATE INDEX idx_skills_catalog ON skills(catalog_skill_id);

ALTER TABLE portfolio_items ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','archived'));
ALTER TABLE portfolio_items ADD COLUMN archived_at INTEGER;
ALTER TABLE portfolio_items ADD COLUMN rights_declared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE portfolio_items ADD COLUMN rights_declared_at INTEGER;

ALTER TABLE audit_log ADD COLUMN reason_code TEXT;

CREATE TABLE analytics_events (
  id          TEXT PRIMARY KEY,
  event_name  TEXT NOT NULL,
  user_id     TEXT,
  role        TEXT,
  properties  TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_analytics_name_time ON analytics_events(event_name, created_at);
`;

module.exports = {
  id: "002_phase1_foundation",
  async up(db) {
    await db.exec(SQL);
    const ts = Date.now();
    for (const [id, name, category, aliases] of SKILLS) {
      await db.run(
        `INSERT OR IGNORE INTO skill_catalog (id, canonical_name, category, aliases, is_active, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`,
        [id, name, category, JSON.stringify(aliases), ts]
      );
    }
    // Map existing free-text skills onto the catalogue where names match exactly.
    await db.run(
      `UPDATE skills SET catalog_skill_id =
         (SELECT sc.id FROM skill_catalog sc WHERE sc.canonical_name = skills.name COLLATE NOCASE)
       WHERE catalog_skill_id IS NULL`
    );
  },
};
