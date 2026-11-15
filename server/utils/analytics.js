/* =========================================================
   CREOTASK — Product event instrumentation (AN-01)
   ---------------------------------------------------------
   Privacy minimisation: only allow-listed event names; property
   values must be primitives and are filtered against a deny-list
   of personal-data keys. Never put email, name, phone, message
   text, document numbers or free text into properties.
   Analytics failures never break the user's request.
   ========================================================= */
"use strict";
const db = require("../config/db");
const { id, now } = require("./helpers");

const EVENTS = new Set([
  // Phase 1 (PRD §22)
  "registration_completed", "email_verified", "role_selected", "role_switched",
  "profile_completed", "skill_added", "skill_evidence_submitted",
  "portfolio_item_created", "portfolio_item_archived",
  "login_succeeded", "password_reset_completed", "sessions_revoked",
]);

const DENY_KEYS = /email|name|phone|address|pan|aadhaar|password|token|message|text|note|bio|ip/i;

function cleanProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (DENY_KEYS.test(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
      out[k] = typeof v === "string" ? v.slice(0, 64) : v;
    }
  }
  return out;
}

async function track(eventName, { userId = null, role = null, props = {} } = {}) {
  if (!EVENTS.has(eventName)) {
    if (process.env.NODE_ENV !== "production") console.warn(`[analytics] unknown event "${eventName}" dropped`);
    return;
  }
  try {
    await db.run(
      `INSERT INTO analytics_events (id, event_name, user_id, role, properties, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id(), eventName, userId, role, JSON.stringify(cleanProps(props)), now()]
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("[analytics] insert failed:", err.message);
  }
}

module.exports = { track, EVENTS };
