/* =========================================================
   CREOTASK — Database Reset (dev only — destructive!)
   Run: npm run db:reset
   ========================================================= */
"use strict";
require("dotenv").config();
const path = require("path");
const fs   = require("fs");

const DB_PATH = process.env.DB_PATH || "./server/data/creotask.db";
const resolved = path.resolve(DB_PATH);

if (fs.existsSync(resolved)) {
  fs.unlinkSync(resolved);
  console.log(`🗑️   Deleted ${resolved}`);
} else {
  console.log("ℹ️   No database file found — nothing to delete.");
}
console.log("   Run `npm run db:seed` to recreate and seed.");
