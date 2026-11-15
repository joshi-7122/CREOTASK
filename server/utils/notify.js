/* =========================================================
   CREOTASK — Notification helper
   Creates in-app notification records.
   ========================================================= */
"use strict";
const db = require("../config/db");
const { id, now } = require("../utils/helpers");

const TYPES = {
  APPLICATION_RECEIVED:   "application_received",
  APPLICATION_SHORTLISTED:"application_shortlisted",
  APPLICATION_DECLINED:   "application_declined",
  OFFER_SENT:             "offer_sent",
  OFFER_ACCEPTED:         "offer_accepted",
  OFFER_DECLINED:         "offer_declined",
  OFFER_EXPIRED:          "offer_expired",
  MILESTONE_FUNDED:       "milestone_funded",
  MILESTONE_SUBMITTED:    "milestone_submitted",
  MILESTONE_ACCEPTED:     "milestone_accepted",
  REVISION_REQUESTED:     "revision_requested",
  CHANGE_ORDER_RECEIVED:  "change_order_received",
  CHANGE_ORDER_ACCEPTED:  "change_order_accepted",
  CHANGE_ORDER_REJECTED:  "change_order_rejected",
  DISPUTE_OPENED:         "dispute_opened",
  DISPUTE_RESOLVED:       "dispute_resolved",
  REVIEW_RECEIVED:        "review_received",
  TIER_UPGRADED:          "tier_upgraded",
  SKILL_VERIFIED:         "skill_verified",
  PROJECT_PUBLISHED:      "project_published",
  MESSAGE_RECEIVED:       "message_received",
};

async function notify(userId, type, title, body, link) {
  if (!userId) return;
  try {
    await db.run(
      `INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [id(), userId, type, title, body || null, link || null, now()]
    );
  } catch (err) {
    console.error("Notification insert failed:", err.message);
  }
}

module.exports = { notify, TYPES };
