/* =========================================================
   CREOTASK — Audit log helper
   PRD §16: privileged / consequential actions record actor, action,
   target, timestamp, before/after values, reason code and approval.
   Audit writes must NOT be silently dropped: they run inside the
   caller's transaction when there is one, and errors propagate.
   ========================================================= */
"use strict";
const db = require("../config/db");
const { id, now } = require("./helpers");

async function audit({ actorId = null, action, entityType = null, entityId = null,
                       before = null, after = null, reasonCode = null, note = null, ip = null }) {
  if (!action) throw new Error("audit(): action is required");
  await db.run(
    `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, before_state, after_state, note, reason_code, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id(), actorId, action, entityType, entityId,
     before == null ? null : JSON.stringify(before),
     after == null ? null : JSON.stringify(after),
     note, reasonCode, ip, now()]
  );
}

module.exports = { audit };
