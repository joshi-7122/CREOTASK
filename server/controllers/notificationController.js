/* =========================================================
   CREOTASK — Notifications Controller
   GET  /api/notifications
   PUT  /api/notifications/:id/read
   PUT  /api/notifications/read-all
   ========================================================= */
"use strict";
const db = require("../config/db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { now } = require("../utils/helpers");

const listNotifications = asyncHandler(async (req, res) => {
  const { page = "1", limit = "20", unread_only } = req.query;
  const pg  = Math.max(1, parseInt(page));
  const lim = Math.min(50, parseInt(limit));
  const offset = (pg - 1) * lim;

  const where = unread_only === "true"
    ? "WHERE user_id = ? AND is_read = 0"
    : "WHERE user_id = ?";

  const total = (await db.get(`SELECT COUNT(*) as n FROM notifications ${where}`, [req.user.id]))?.n || 0;
  const rows  = await db.all(
    `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [req.user.id, lim, offset]
  );
  const unread = (await db.get("SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND is_read = 0", [req.user.id]))?.n || 0;

  res.json({ data: rows, pagination: { page: pg, limit: lim, total }, unread_count: unread });
});

const markRead = asyncHandler(async (req, res) => {
  const { notifId } = req.params;
  const n = await db.get("SELECT id FROM notifications WHERE id = ? AND user_id = ?", [notifId, req.user.id]);
  if (!n) throw httpError(404, "Notification not found.");
  await db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [notifId]);
  res.json({ message: "Marked as read." });
});

const markAllRead = asyncHandler(async (req, res) => {
  await db.run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
  res.json({ message: "All notifications marked as read." });
});

module.exports = { listNotifications, markRead, markAllRead };
