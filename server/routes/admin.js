/* =========================================================
   CREOTASK — Admin Routes
   ========================================================= */
"use strict";
const express = require("express");
const router  = express.Router();
const { authenticate, requireAdmin, requireAdminRole } = require("../middleware/auth");
const ctrl = require("../controllers/adminController");

// All admin routes require authentication + admin record
router.use(authenticate, requireAdmin);

router.get("/stats",                                  ctrl.getStats);

// Users
router.get("/users",                                  ctrl.listUsers);
router.put("/users/:userId/ban",                      ctrl.banUser);
router.put("/users/:userId/unban",                    ctrl.unbanUser);
router.post("/users/:userId/set-admin",               requireAdminRole("super_admin"), ctrl.setAdmin);
router.post("/users/:userId/evaluate-tier",           ctrl.evaluateUserTier);

// Projects
router.get("/projects",                               ctrl.listProjects);
router.put("/projects/:projectId/moderate",           ctrl.moderateProject);

// Skill verification queue
router.get("/skill-queue",                            ctrl.listSkillQueue);
router.put("/skill-queue/:qId",                       ctrl.reviewSkillVerification);

// Disputes
router.get("/disputes",                               ctrl.listDisputes);
router.put("/disputes/:disputeId",                    ctrl.resolveDispute);

// Ledger
router.get("/ledger",                                 requireAdminRole("super_admin", "admin", "finance"), ctrl.getLedger);

module.exports = router;
