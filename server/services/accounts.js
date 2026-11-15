/* =========================================================
   CREOTASK — Account roles & profiles (AUTH-03, UserRole entity)
   One verified account may hold both freelancer and client roles.
   ========================================================= */
"use strict";
const db = require("../config/db");
const { now } = require("../utils/helpers");

function defaultName(email) {
  return (email || "").split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim() || "Member";
}

/** Ensure the user holds `role` (user_roles row + matching profile). Idempotent. */
async function ensureRole(userId, role, displayName) {
  if (!["freelancer", "client"].includes(role)) throw new Error(`Unknown role ${role}`);
  const ts = now();
  let created = false;
  if (role === "freelancer") {
    const fp = await db.get("SELECT user_id FROM freelancer_profiles WHERE user_id = ?", [userId]);
    if (!fp) {
      await db.run(
        `INSERT INTO freelancer_profiles (user_id, display_name, tier, creostart_eligible, kyc_status, availability_updated_at, created_at, updated_at)
         VALUES (?, ?, 'bronze', 1, 'not_started', ?, ?, ?)`,
        [userId, displayName, ts, ts, ts]
      );
      created = true;
    }
  } else {
    const cp = await db.get("SELECT user_id FROM client_profiles WHERE user_id = ?", [userId]);
    if (!cp) {
      await db.run(
        `INSERT INTO client_profiles (user_id, display_name, verification_status, created_at, updated_at)
         VALUES (?, ?, 'unverified', ?, ?)`,
        [userId, displayName, ts, ts]
      );
      created = true;
    }
  }
  await db.run(
    `INSERT OR IGNORE INTO user_roles (user_id, role, status, created_at) VALUES (?, ?, 'active', ?)`,
    [userId, role, ts]
  );
  return created;
}

async function listRoles(userId) {
  return (await db.all(
    "SELECT role FROM user_roles WHERE user_id = ? AND status = 'active' ORDER BY created_at", [userId]
  )).map(r => r.role);
}

module.exports = { ensureRole, listRoles, defaultName };
