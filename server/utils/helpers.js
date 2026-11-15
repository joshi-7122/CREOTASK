/* =========================================================
   CREOTASK — Utility helpers
   ========================================================= */
"use strict";
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

/** Generate a UUID v4 */
const id = () => uuidv4();

/** Current timestamp in Unix milliseconds */
const now = () => Date.now();

/**
 * Compute platform fee and freelancer net for a given gross amount.
 * All values in paise (INR minor unit, 100 paise = ₹1).
 */
function computeFees(grossPaise) {
  const feePct = parseFloat(process.env.PLATFORM_FEE_PERCENT || "10");
  const platformFeePaise = Math.round(grossPaise * (feePct / 100));
  const taxPaise = 0; // GST computed server-side when rates are known; 0 for MVP
  const netPaise = grossPaise - platformFeePaise - taxPaise;
  return { grossPaise, platformFeePaise, taxPaise, netPaise, feePct };
}

/** Format paise to human-readable INR string */
function formatINR(paise) {
  const rupees = paise / 100;
  return "₹" + rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Safely parse a JSON column (falls back to defaultVal) */
function parseJSON(raw, defaultVal = []) {
  try { return JSON.parse(raw); }
  catch { return defaultVal; }
}

/** Generate a secure random token (hex) */
function secureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Hash a token for safe storage */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Capitalise first letter */
function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Add days to a Date (returns ms timestamp) */
function addDays(ms, days) {
  return ms + days * 86_400_000;
}

/** Add hours to a Date (returns ms timestamp) */
function addHours(ms, hours) {
  return ms + hours * 3_600_000;
}

/**
 * Remove sensitive fields from a user object before sending to client.
 */
function sanitiseUser(user) {
  if (!user) return null;
  const { password_hash, ...safe } = user;
  return safe;
}

/**
 * Deterministic 1-in-5 Newcomer Exploration slot injection.
 * Given a list of search results, ensures that up to 1 in every 5 slots
 * is a qualified Bronze-tier (creostart_eligible) freelancer — without
 * violating skill relevance (the newcomer must still match required skills).
 *
 * @param {Array} results - Full ordered results array
 * @param {Array} newcomers - Qualified Bronze newcomers subset
 * @returns {Array} - Re-ordered results with newcomer slots injected
 */
function injectNewcomerSlots(results, newcomers) {
  if (!newcomers.length) return results;
  const output = [];
  let ni = 0;
  for (let i = 0; i < results.length; i++) {
    // Every 5th slot (0-indexed positions 4, 9, 14, …), inject a newcomer if available
    if ((i + 1) % 5 === 0 && ni < newcomers.length) {
      // Only inject if not already in results
      const candidate = newcomers[ni++];
      if (!output.find(r => r.user_id === candidate.user_id)) {
        output.push({ ...candidate, _newcomer_slot: true });
        continue;
      }
    }
    output.push(results[i]);
  }
  return output;
}

module.exports = {
  id,
  now,
  computeFees,
  formatINR,
  parseJSON,
  secureToken,
  hashToken,
  capitalise,
  addDays,
  addHours,
  sanitiseUser,
  injectNewcomerSlots,
};
