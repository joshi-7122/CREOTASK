#!/usr/bin/env node
/* =========================================================
   CREOTASK — Static build for Vercel
   Copies only the public site into dist/ (pages, assets, email-link pages), so
   server code, tests and docs are never published. Every /assets/... reference
   in the pages and stylesheets gets a content hash (?v=...), which lets
   vercel.json cache those files for a year: a changed file gets a new hash, so
   visitors always load the current version.
   No dependencies; run with `node scripts/build-static.js`.
   ========================================================= */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const PAGES = ["index.html", "app.html", "dashboard.html", "404.html"];
const DIRS = ["assets", "client/pages"];

fs.rmSync(OUT, { recursive: true, force: true });

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;                 // .DS_Store and friends
    const r = path.join(rel, ent.name);
    if (ent.isDirectory()) copyDir(r);
    else {
      fs.mkdirSync(path.join(OUT, rel), { recursive: true });
      fs.copyFileSync(path.join(ROOT, r), path.join(OUT, r));
    }
  }
}
DIRS.forEach(copyDir);
PAGES.forEach((p) => fs.copyFileSync(path.join(ROOT, p), path.join(OUT, p)));

// Content hash for every asset
const hashes = new Map();
function hashDir(rel) {
  for (const ent of fs.readdirSync(path.join(OUT, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, ent.name);
    if (ent.isDirectory()) hashDir(r);
    else hashes.set("/" + r, crypto.createHash("sha1").update(fs.readFileSync(path.join(OUT, r))).digest("hex").slice(0, 10));
  }
}
hashDir("assets");

// Stamp references: src="/assets/x", href="/assets/x", url(/assets/x)
const REF = /(["'(])(\/assets\/[^"')?#\s]+)(?=["')])/g;
let stamped = 0;
function stamp(file) {
  const abs = path.join(OUT, file);
  const before = fs.readFileSync(abs, "utf8");
  const after = before.replace(REF, (m, q, url) => {
    const h = hashes.get(url);
    if (!h) return m;
    stamped++;
    return `${q}${url}?v=${h}`;
  });
  if (after !== before) fs.writeFileSync(abs, after);
}
PAGES.forEach(stamp);
for (const f of fs.readdirSync(path.join(OUT, "client/pages"))) if (f.endsWith(".html")) stamp(path.join("client/pages", f));
for (const [url] of hashes) if (url.endsWith(".css")) stamp(url.slice(1));

console.log(`Built dist/: ${PAGES.length} pages, ${hashes.size} assets, ${stamped} references stamped.`);
