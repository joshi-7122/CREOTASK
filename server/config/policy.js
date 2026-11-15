/* =========================================================
   CREOTASK — Policy configuration
   ---------------------------------------------------------
   Every value the PRD marks PROPOSED / DECISION REQUIRED lives
   here, not as a magic number in business logic. Each entry
   records its status so nobody mistakes a working default for
   an approved founder decision. See docs/DEV_LOG.md → Decisions.
   ========================================================= */
"use strict";

const int = (v, d) => (v === undefined || v === "" || isNaN(parseInt(v, 10)) ? d : parseInt(v, 10));

const ENV = process.env.NODE_ENV || "development";

const POLICY = {
  // ── Accounts ────────────────────────────────────────────
  /** PRD §27 "Minimum age — 18+ earning accounts proposed pending legal advice". STATUS: OPEN */
  MIN_ACCOUNT_AGE: int(process.env.MIN_ACCOUNT_AGE, 18),
  /** Version tag stored with each user's age acknowledgement so a policy change is traceable. */
  AGE_POLICY_VERSION: process.env.AGE_POLICY_VERSION || "2026-11-draft",

  /** Engineering defaults (not PRD-specified). */
  SESSION_TTL_DAYS: int(process.env.SESSION_TTL_DAYS, 7),
  EMAIL_VERIFY_TTL_HOURS: 24,
  PASSWORD_RESET_TTL_HOURS: 1,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_BYTES: 72, // bcrypt silently truncates beyond 72 bytes

  /** Where suspended users are told to appeal (PRD TRUST-05). Appeals workflow ships in Phase 4. */
  APPEALS_CONTACT: process.env.APPEALS_CONTACT || "",

  // ── Profiles ────────────────────────────────────────────
  /** PRD PROF-04 "stale availability is flagged" — window not specified. STATUS: ENGINEERING DEFAULT */
  AVAILABILITY_STALE_DAYS: int(process.env.AVAILABILITY_STALE_DAYS, 30),
  MAX_SKILLS_PER_USER: 30,
  MAX_WORK_CATEGORIES: 5,
  MAX_PORTFOLIO_LINKS: 5,

  // ── Payments ────────────────────────────────────────────
  /**
   * PRD §13 CRITICAL LAUNCH GATE. Values:
   *   disabled — default. No funding/payout endpoints move state.
   *   sandbox  — development/test only. Records clearly-labelled test
   *              ledger entries; no provider, no real money.
   * There is intentionally no "live" value until a provider, fund flow,
   * legal and tax review are approved (Phase 5).
   */
  PAYMENTS_MODE: (() => {
    const m = (process.env.PAYMENTS_MODE || "disabled").toLowerCase();
    if (m === "sandbox" && ENV === "production") return "disabled";
    return m === "sandbox" ? "sandbox" : "disabled";
  })(),

  /** PRD §27 Fee model — STATUS: OPEN. Existing repo value retained as a placeholder. */
  PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT || "10"),
};

/** Values safe to expose to the frontend via GET /api/meta. */
function publicPolicy() {
  return {
    min_account_age: POLICY.MIN_ACCOUNT_AGE,
    age_policy_version: POLICY.AGE_POLICY_VERSION,
    password_min_length: POLICY.PASSWORD_MIN_LENGTH,
    availability_stale_days: POLICY.AVAILABILITY_STALE_DAYS,
    max_skills_per_user: POLICY.MAX_SKILLS_PER_USER,
    max_work_categories: POLICY.MAX_WORK_CATEGORIES,
    payments_mode: POLICY.PAYMENTS_MODE,
  };
}

module.exports = { POLICY, publicPolicy, ENV };
