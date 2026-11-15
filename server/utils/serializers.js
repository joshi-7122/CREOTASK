/* =========================================================
   CREOTASK — Response serializers (public vs private)
   ---------------------------------------------------------
   PRD PROF-01 / §17 / §19: public profile APIs must never expose
   KYC state, earnings, internal flags or contact data. Every
   profile response goes through an explicit ALLOW-list here —
   adding a DB column never leaks it by accident.
   ========================================================= */
"use strict";
const { parseJSON } = require("./helpers");
const { POLICY } = require("../config/policy");

const DAY = 86_400_000;

function pick(row, keys) {
  const out = {};
  for (const k of keys) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

function availabilityStale(fp, at = Date.now()) {
  const ref = fp.availability_updated_at || fp.updated_at || fp.created_at;
  return !ref || at - ref > POLICY.AVAILABILITY_STALE_DAYS * DAY;
}

const FREELANCER_PUBLIC = [
  "user_id", "display_name", "headline", "bio", "location_city", "location_state", "country",
  "avatar_url", "availability", "availability_updated_at", "timezone", "engagement_preference",
  "weekly_capacity_hours", "hourly_rate_min", "hourly_rate_max",
  "tier", "creostart_eligible",
  "total_projects_completed", "total_unique_clients", "avg_rating", "total_reviews", "on_time_rate",
  "portfolio_url", "github_url", "linkedin_url", "website_url", "created_at",
];

/** Fields only the owner (and authorised staff) may see. */
const FREELANCER_PRIVATE_EXTRA = [
  "kyc_status", "kyc_updated_at", "total_earned_paise", "public_visibility",
  "profile_completed_at", "tier_updated_at", "updated_at",
];

function freelancerPublic(fp) {
  if (!fp) return null;
  const out = pick(fp, FREELANCER_PUBLIC);
  out.languages = parseJSON(fp.languages, ["en"]);
  out.work_categories = parseJSON(fp.work_categories, []);
  out.availability_stale = availabilityStale(fp);
  out.email_verified = !!fp.email_verified;
  out.member_since = fp.created_at;
  return out;
}

function freelancerPrivate(fp) {
  if (!fp) return null;
  return { ...freelancerPublic(fp), ...pick(fp, FREELANCER_PRIVATE_EXTRA) };
}

const CLIENT_PUBLIC = [
  "user_id", "display_name", "bio", "avatar_url", "organization_name", "organization_type",
  "website_url", "location_city", "location_state", "country", "timezone",
  "verification_status", "total_projects_posted", "total_projects_completed",
  "avg_rating", "total_reviews", "created_at",
];

function clientPublic(cp) {
  if (!cp) return null;
  const out = pick(cp, CLIENT_PUBLIC);
  out.member_since = cp.created_at;
  return out;
}
function clientPrivate(cp) {
  if (!cp) return null;
  return { ...clientPublic(cp), ...pick(cp, ["updated_at"]) };
}

/** Skill as shown publicly: verified and self-declared are explicitly distinct (PROF-02). */
function skillPublic(s) {
  return {
    id: s.id,
    name: s.name,
    catalog_skill_id: s.catalog_skill_id || null,
    proficiency: s.proficiency,
    years_exp: s.years_exp,
    verification_status: s.verification_status,
    is_verified: s.verification_status === "verified",
    verified_at: s.verification_status === "verified" ? s.verified_at : null,
  };
}
function skillPrivate(s) {
  return { ...skillPublic(s), verification_note: s.verification_note || null, created_at: s.created_at };
}

/** A portfolio item is publicly visible only if active, non-confidential AND rights declared. */
function portfolioIsPublic(p) {
  return p.status === "active" && !p.is_confidential && !!p.rights_declared;
}

function portfolioPublic(p) {
  return {
    id: p.id, title: p.title, description: p.description, category: p.category,
    skills_used: parseJSON(p.skills_used, []), external_url: p.external_url,
    images: parseJSON(p.images, []), is_featured: !!p.is_featured,
    created_at: p.created_at, updated_at: p.updated_at,
  };
}
function portfolioPrivate(p) {
  return {
    ...portfolioPublic(p),
    files: parseJSON(p.files, []),
    status: p.status,
    archived_at: p.archived_at,
    is_confidential: !!p.is_confidential,
    rights_declared: !!p.rights_declared,
    rights_declared_at: p.rights_declared_at,
    sort_order: p.sort_order,
    is_public: portfolioIsPublic(p),
  };
}

/**
 * Profile completeness (PROF-01). The checklist is deliberately explicit
 * so the UI can tell users exactly what's missing.
 */
function freelancerCompleteness(fp, skills = [], portfolio = []) {
  const checks = [
    ["display_name", "Add your name", !!(fp.display_name && fp.display_name.trim())],
    ["headline", "Write a headline", !!(fp.headline && fp.headline.trim().length >= 10)],
    ["bio", "Write a bio (at least 80 characters)", !!(fp.bio && fp.bio.trim().length >= 80)],
    ["location", "Add your city", !!(fp.location_city && fp.location_city.trim())],
    ["work_categories", "Choose your work categories", parseJSON(fp.work_categories, []).length > 0],
    ["timezone", "Set your timezone", !!fp.timezone],
    ["skills", "Add at least 3 skills", skills.length >= 3],
    ["portfolio", "Add a public portfolio item", portfolio.some(portfolioIsPublic)],
  ];
  const done = checks.filter(c => c[2]).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    complete: done === checks.length,
    missing: checks.filter(c => !c[2]).map(([key, label]) => ({ key, label })),
  };
}

function clientCompleteness(cp) {
  const checks = [
    ["display_name", "Add your name", !!(cp.display_name && cp.display_name.trim())],
    ["organization_type", "Tell freelancers who you are (individual, startup, business…)", !!cp.organization_type],
    ["bio", "Describe what you hire for", !!(cp.bio && cp.bio.trim().length >= 40)],
    ["location", "Add your city", !!(cp.location_city && cp.location_city.trim())],
  ];
  const done = checks.filter(c => c[2]).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    complete: done === checks.length,
    missing: checks.filter(c => !c[2]).map(([key, label]) => ({ key, label })),
  };
}

/** Account-level fields for the signed-in user. Never includes password hash or tokens. */
function accountPrivate(u, roles = []) {
  return {
    id: u.id,
    email: u.email,
    email_verified: !!u.email_verified,
    email_verified_at: u.email_verified_at || null,
    active_role: u.active_role,
    roles,
    account_status: accountStatus(u),
    age_confirmed: !!u.age_confirmed_at,
    created_at: u.created_at,
    last_login_at: u.last_login_at || null,
  };
}

function accountStatus(u) {
  if (u.is_banned) return "suspended";
  if (!u.is_active) return "deactivated";
  return "active";
}

module.exports = {
  freelancerPublic, freelancerPrivate, clientPublic, clientPrivate,
  skillPublic, skillPrivate, portfolioPublic, portfolioPrivate, portfolioIsPublic,
  freelancerCompleteness, clientCompleteness, accountPrivate, accountStatus, availabilityStale,
};
