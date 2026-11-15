/* =========================================================
   CREOTASK — Database helper (sqlite3 promise wrapper)
   Provides: db.run(), db.get(), db.all(), db.exec(), db.transaction()
   ---------------------------------------------------------
   SQLite here uses ONE shared connection. A naive BEGIN…COMMIT
   would silently absorb statements from other concurrent requests
   into the open transaction. db.transaction() therefore takes a
   process-wide lock: while a transaction is open, queries from any
   other async context wait until it commits or rolls back.
   (AsyncLocalStorage tells us which context owns the transaction.)
   ========================================================= */
"use strict";
const sqlite3 = require("sqlite3");
const path = require("path");
const fs = require("fs");
const { AsyncLocalStorage } = require("async_hooks");

const DB_PATH = process.env.DB_PATH || "./server/data/creotask.db";
const resolved = DB_PATH === ":memory:" ? DB_PATH : path.resolve(DB_PATH);
if (resolved !== ":memory:") {
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const raw = new sqlite3.Database(resolved, (err) => {
  if (err) { console.error("❌  Failed to open DB:", err.message); process.exit(1); }
});

raw.serialize(() => {
  raw.run("PRAGMA journal_mode = WAL");
  raw.run("PRAGMA foreign_keys = ON");
  raw.run("PRAGMA busy_timeout = 5000");
});

const txContext = new AsyncLocalStorage();
let txLock = Promise.resolve(); // resolves when no transaction is open

/** Wait for any open transaction owned by a different async context. */
async function gate() {
  if (txContext.getStore()) return; // we are inside the owning transaction
  // Loop: a new transaction may start between our await and our query.
  let current;
  do { current = txLock; await current; } while (current !== txLock);
}

const rawRun = (sql, params) => new Promise((resolve, reject) => {
  raw.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
  });
});
const rawGet = (sql, params) => new Promise((resolve, reject) => {
  raw.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
const rawAll = (sql, params) => new Promise((resolve, reject) => {
  raw.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const rawExec = (sql) => new Promise((resolve, reject) => {
  raw.exec(sql, (err) => (err ? reject(err) : resolve()));
});

const db = {
  _raw: raw,
  path: resolved,

  async run(sql, params = []) { await gate(); return rawRun(sql, params); },
  async get(sql, params = []) { await gate(); return rawGet(sql, params); },
  async all(sql, params = []) { await gate(); return rawAll(sql, params); },
  async exec(sql)             { await gate(); return rawExec(sql); },

  /**
   * Run fn() atomically. All db calls made (directly or indirectly) inside fn
   * are part of the transaction; everything else waits. Nested calls reuse the
   * outer transaction. Throwing inside fn rolls back.
   */
  async transaction(fn) {
    if (txContext.getStore()) return fn(); // nested → join outer transaction
    await gate();
    let release;
    const prev = txLock;
    txLock = new Promise(r => { release = r; });
    await prev;
    try {
      return await txContext.run({ tx: true }, async () => {
        await rawExec("BEGIN IMMEDIATE");
        try {
          const result = await fn();
          await rawExec("COMMIT");
          return result;
        } catch (err) {
          try { await rawExec("ROLLBACK"); } catch { /* already rolled back */ }
          throw err;
        }
      });
    } finally {
      release();
    }
  },

  close() {
    return new Promise((resolve, reject) => raw.close(err => (err ? reject(err) : resolve())));
  },
};

module.exports = db;
