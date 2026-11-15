/* =========================================================
   CREOTASK — Profile Routes
   ========================================================= */
"use strict";
const express = require("express");
const router  = express.Router();
const { authenticate, optionalAuth } = require("../middleware/auth");
const ctrl = require("../controllers/profileController");

// Public (optionally authenticated so owners can view their own hidden profile)
router.get("/freelancers",                      optionalAuth, ctrl.browseFreelancers);
router.get("/freelancer/:userId",               optionalAuth, ctrl.getFreelancerProfile);
router.get("/client/:userId",                   optionalAuth, ctrl.getClientProfile);

// Own profile
router.get("/me",                               authenticate, ctrl.getOwnProfile);
router.put("/freelancer",                       authenticate, ctrl.updateFreelancerProfile);
router.put("/client",                           authenticate, ctrl.updateClientProfile);

// Skills
router.post  ("/skills",                        authenticate, ctrl.addSkill);
router.put   ("/skills/:skillId",               authenticate, ctrl.updateSkill);
router.delete("/skills/:skillId",               authenticate, ctrl.deleteSkill);
router.post  ("/skills/:skillId/verify",        authenticate, ctrl.requestSkillVerification);

// Portfolio
router.post  ("/portfolio",                     authenticate, ctrl.addPortfolioItem);
router.put   ("/portfolio/:itemId",             authenticate, ctrl.updatePortfolioItem);
router.post  ("/portfolio/:itemId/archive",     authenticate, ctrl.archivePortfolioItem);
router.post  ("/portfolio/:itemId/restore",     authenticate, ctrl.restorePortfolioItem);
router.delete("/portfolio/:itemId",             authenticate, ctrl.deletePortfolioItem);

module.exports = router;
