/* =========================================================
   CREOTASK — Project Routes
   ========================================================= */
"use strict";
const express = require("express");
const router  = express.Router();
const { authenticate, optionalAuth, requireRole, requireVerified } = require("../middleware/auth");
const ctrl = require("../controllers/projectController");

// Browse (public)
router.get("/",                                               optionalAuth,  ctrl.browseProjects);

// My projects (auth)
router.get("/my",                                             authenticate,  ctrl.myProjects);

// Project CRUD (client)
router.post("/",                                              authenticate, requireRole("client"), ctrl.createProject);
router.get ("/:projectId",                                    optionalAuth,  ctrl.getProject);
router.post("/:projectId/publish",                            authenticate, requireVerified, requireRole("client"), ctrl.publishProject);

// Applications
router.post("/:projectId/apply",                              authenticate, requireVerified, requireRole("freelancer"), ctrl.applyToProject);
router.get ("/:projectId/applications",                       authenticate, requireRole("client"),     ctrl.listApplications);
router.put ("/:projectId/applications/:appId",                authenticate, requireRole("client"),     ctrl.updateApplication);

// Offers
router.post("/:projectId/offer",                              authenticate, requireVerified, requireRole("client"),     ctrl.sendOffer);
router.put ("/offers/:offerId",                               authenticate, requireVerified, requireRole("freelancer"), ctrl.respondToOffer);

// Workspace
router.post("/:projectId/messages",                           authenticate,  ctrl.sendMessage);
router.post("/:projectId/milestones/:mileId/fund",            authenticate, requireVerified, requireRole("client"),     ctrl.fundMilestone);
router.post("/:projectId/milestones/:mileId/submit",          authenticate, requireRole("freelancer"), ctrl.submitDeliverable);
router.put ("/:projectId/milestones/:mileId/review",          authenticate, requireRole("client"),     ctrl.reviewDeliverable);

// Change orders
router.post("/:projectId/milestones/:mileId/change-order",    authenticate,  ctrl.submitChangeOrder);
router.put ("/:projectId/change-orders/:coId",                authenticate,  ctrl.respondToChangeOrder);

// Reviews & Disputes
router.post("/:projectId/review",                             authenticate,  ctrl.submitReview);
router.post("/:projectId/dispute",                            authenticate,  ctrl.openDispute);

module.exports = router;
