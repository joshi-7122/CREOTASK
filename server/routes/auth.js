/* =========================================================
   CREOTASK — Auth Routes
   Credential endpoints are rate-limited strictly (anti-brute-force,
   anti-enumeration); session endpoints use the general API limiter.
   ========================================================= */
"use strict";
const express   = require("express");
const rateLimit = require("express-rate-limit");
const router    = express.Router();
const { authenticate, authenticateAllowSuspended } = require("../middleware/auth");
const ctrl = require("../controllers/authController");
const social = require("../controllers/oauthController");

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 20,
  message: { error: "Too many attempts. Please try again in 15 minutes.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register",             credentialLimiter, ctrl.register);
router.post("/login",                credentialLimiter, ctrl.login);
router.post("/verify-email",         credentialLimiter, ctrl.verifyEmail);
router.post("/resend-verification",  credentialLimiter, ctrl.resendVerification);
router.post("/forgot-password",      credentialLimiter, ctrl.forgotPassword);
router.post("/reset-password",       credentialLimiter, ctrl.resetPassword);
router.post("/change-password",      credentialLimiter, authenticate, ctrl.changePassword);

// Social sign-in (Google, GitHub, LinkedIn); see controllers/oauthController.js
router.get ("/oauth/providers",          social.providers);
router.get ("/oauth/:provider/start",    credentialLimiter, social.start);
router.get ("/oauth/:provider/callback", credentialLimiter, social.callback);

router.get ("/me",                   authenticateAllowSuspended, ctrl.getMe);
router.post("/logout",               authenticateAllowSuspended, ctrl.logout);
router.post("/logout-all",           authenticate, ctrl.logoutAll);
router.get ("/sessions",             authenticate, ctrl.listSessions);
router.delete("/sessions/:sessionId", authenticate, ctrl.revokeOneSession);
router.post("/switch-role",          authenticate, ctrl.switchRole);

module.exports = router;
