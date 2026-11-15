/* =========================================================
   CREOTASK — Versioned migration runner
   ---------------------------------------------------------
   Migrations live in server/migrations/NNN_name.js and export
   { id, up(db) }. Each runs once, inside a transaction, and is
   recorded in schema_migrations. Never edit an applied migration;
   add a new one.
   ========================================================= */
"use strict";
require("dotenv").config();
const fs   = require("fs");
const path = require("path");
const db   = require("./db");

const DIR = path.join(__dirname, "../migrations");

function loadMigrations() {
  return fs.readdirSync(DIR)
    .filter(f => /^\d{3}_.+\.js$/.test(f))
    .sort()
    .map(f => require(path.join(DIR, f)));
}

async function migrate({ quiet = false } = {}) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL
  )`);
  const applied = new Set((await db.all("SELECT id FROM schema_migrations")).map(r => r.id));
  const pending = loadMigrations().filter(m => !applied.has(m.id));

  for (const m of pending) {
    await db.transaction(async () => {
      await m.up(db);
      await db.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [m.id, Date.now()]);
    });
    if (!quiet) console.log(`   ✅ migration ${m.id}`);
  }
  if (!quiet) console.log(pending.length ? "✅  Database migrated." : "✅  Database schema up to date.");
  return pending.map(m => m.id);
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(err => { console.error("❌  Migration failed:", err.message); process.exit(1); });
}
