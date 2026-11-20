/* =========================================================
   003 — Social sign-in (Google, GitHub, LinkedIn)
   One row per linked provider account. A CreoTask account can have a
   password, linked providers, or both.
   ========================================================= */
"use strict";

const SQL = `
CREATE TABLE user_identities (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google','github','linkedin')),
  provider_user_id TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  last_used_at     INTEGER,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_identities_user ON user_identities(user_id);
`;

module.exports = {
  id: "003_social_signin",
  async up(db) {
    await db.exec(SQL);
  },
};
