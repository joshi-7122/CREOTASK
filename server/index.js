/* =========================================================
   CREOTASK — Express Server Entry Point
   ========================================================= */
"use strict";
require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const helmet      = require("helmet");
const rateLimit   = require("express-rate-limit");
const path        = require("path");

const { migrate }      = require("./config/migrate");
const { errorHandler } = require("./middleware/errorHandler");

const authRoutes          = require("./routes/auth");
const profileRoutes       = require("./routes/profiles");
const projectRoutes       = require("./routes/projects");
const notificationRoutes  = require("./routes/notifications");
const adminRoutes         = require("./routes/admin");

const app  = express();
const PORT = parseInt(process.env.PORT || "3000");
const ENV  = process.env.NODE_ENV || "development";

// ── Security ──────────────────────────────────────────────
const isProd = ENV === "production";
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:        ["'self'", "data:", "blob:"],
      connectSrc:    ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Rate Limiting ─────────────────────────────────────────
// Credential endpoints have their own strict limiter (routes/auth.js).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: ENV === "test" ? 100000 : 600,
  message: { error: "Too many requests. Please slow down.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── Static Assets ─────────────────────────────────────────
// Dedicated, explicit static routes with guaranteed Content-Type headers
app.use("/assets", express.static(path.join(__dirname, "../assets"), {
  maxAge: isProd ? "1d" : 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
    } else if (filePath.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else if (filePath.endsWith(".svg")) {
      res.setHeader("Content-Type", "image/svg+xml");
    }
  }
}));
// KNOWN GAP (Phase 3, PRD §14): uploads are publicly served with no auth or malware scan.
// No Phase 1 endpoint writes here. Must move to private storage + signed URLs before WORK-03.
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
// Serve ONLY the public pages. (Previously the whole repo root was static, which exposed
// server/data/creotask.db — password hashes included — and all server source.)
const ROOT = path.join(__dirname, "..");
const PAGES = { "/": "index.html", "/index.html": "index.html", "/app.html": "app.html", "/dashboard.html": "dashboard.html" };
// Design-system reference page: development only, never in production.
if (!isProd) PAGES["/styleguide.html"] = "styleguide.html";
for (const [route, file] of Object.entries(PAGES)) {
  app.get(route, (req, res) => {
    res.set("Cache-Control", isProd ? "public, max-age=3600" : "no-store");
    res.sendFile(path.join(ROOT, file));
  });
}

// ── API Routes ────────────────────────────────────────────
app.use("/api/auth",          apiLimiter,  authRoutes);
app.use("/api/profiles",      apiLimiter,  profileRoutes);
app.use("/api/projects",      apiLimiter,  projectRoutes);
app.use("/api/notifications", apiLimiter,  notificationRoutes);
app.use("/api/admin",         apiLimiter,  adminRoutes);

// ── Health & public reference data ───────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: ENV, timestamp: new Date().toISOString() });
});

app.get("/api/meta", (req, res) => {
  const C = require("./config/catalog");
  const { publicPolicy } = require("./config/policy");
  res.json({
    env: ENV,
    policy: publicPolicy(),
    categories: C.CATEGORIES,
    proficiency: C.PROFICIENCY,
    availability: C.AVAILABILITY,
    engagement: C.ENGAGEMENT,
    client_types: C.CLIENT_TYPES,
  });
});

app.get("/api/skills/catalog", apiLimiter, require("./controllers/profileController").searchSkillCatalog);

// ── Tier Info (public, no auth) ───────────────────────────
app.get("/api/tiers", (req, res) => {
  const { TIER_CRITERIA, TIER_META } = require("./utils/tierEngine");
  res.json({ tiers: TIER_META, criteria: TIER_CRITERIA });
});

// ── SPA Fallback — serve the client app for all unknown routes ─
// (The existing index.html, app.html, dashboard.html continue to work
//  for the demo pages; the new client pages will be in /client/)
app.get("/verify-email", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/pages/verify-email.html"));
});
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/pages/reset-password.html"));
});

// Unknown API routes → JSON 404 (never the HTML fallback)
app.use("/api", (req, res) => res.status(404).json({ error: "Not found.", code: "NOT_FOUND" }));

// Any other unknown address → branded 404 page (never a directory listing or source file)
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, "404.html")));

// ── Error Handler (must be last) ──────────────────────────
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  try {
    console.log("⚙️   Running database migrations…");
    await migrate();
    app.listen(PORT, () => {
      console.log(`\n🚀  CreoTask server running at http://localhost:${PORT}`);
      console.log(`    Environment : ${ENV}`);
      console.log(`    API base    : http://localhost:${PORT}/api`);
      console.log(`    Frontend    : http://localhost:${PORT}/index.html`);
      if (ENV === "development") {
        console.log(`\n    ⚠️  Running in DEVELOPMENT mode.`);
        console.log(`    - Emails are logged to console (not sent).`);
        console.log(`    - Payments mode: ${require("./config/policy").POLICY.PAYMENTS_MODE} (no real money in any mode).`);
        console.log(`    - JWT secret is insecure. Set JWT_SECRET in .env before production.\n`);
      }
    });
  } catch (err) {
    console.error("❌  Failed to start server:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  boot();
}

module.exports = app; // for testing
