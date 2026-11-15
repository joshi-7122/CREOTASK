/* =========================================================
   Test bootstrap — MUST be required before any server module.
   Points the app at a throwaway SQLite file so tests never
   touch the developer database, then migrates + seeds it.
   ========================================================= */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creotask-test-"));
process.env.NODE_ENV = "test";
process.env.DB_PATH = path.join(dir, "test.db");
process.env.JWT_SECRET = "test-secret-" + Math.random().toString(36).slice(2);
process.env.PAYMENTS_MODE = process.env.PAYMENTS_MODE || "sandbox";
require("dotenv").config({ override: false }); // keep the overrides above

const app = require("../../server/index");
const db = require("../../server/config/db");
const { seed } = require("../../server/config/seed");
const { outbox } = require("../../server/utils/email");

let ready;
function init() {
  ready = ready || seed({ quiet: true });
  return ready;
}

async function cleanup() {
  try { await db.close(); } catch { /* ignore */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { app, db, init, cleanup, outbox, dir };
