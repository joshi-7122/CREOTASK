/* =========================================================
   CREOTASK — Notification Routes
   ========================================================= */
"use strict";
const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");

router.get("/",                        authenticate, ctrl.listNotifications);
router.put("/read-all",                authenticate, ctrl.markAllRead);
router.put("/:notifId/read",           authenticate, ctrl.markRead);

module.exports = router;
