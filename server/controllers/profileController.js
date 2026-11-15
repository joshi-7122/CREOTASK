/* =========================================================
   CREOTASK — Profile Controller (PROF-01…05, PROF-02 skills, PROF-03 portfolio)
   Public endpoints return ONLY allow-listed fields (utils/serializers).
   ---------------------------------------------------------
   GET    /api/profiles/freelancers                 browse (public)
   GET    /api/profiles/freelancer/:userId          public profile
   GET    /api/profiles/me                          own private profile (+ completeness)
   PUT    /api/profiles/freelancer                  update own (partial; null clears)
   GET    /api/profiles/client/:userId              public client profile
   PUT    /api/profiles/client                      update own
   POST   /api/profiles/skills                      add (catalogue-resolved)
   PUT    /api/profiles/skills/:skillId             update self-declared skill
   DELETE /api/profiles/skills/:skillId
   POST   /api/profiles/skills/:skillId/verify      submit evidence (VER-03 queue)
   POST   /api/profiles/portfolio                   add
   PUT    /api/profiles/portfolio/:itemId           edit
   POST   /api/profiles/portfolio/:itemId/archive   archive
   POST   /api/profiles/portfolio/:itemId/restore   restore
   DELETE /api/profiles/portfolio/:itemId           remove
   GET    /api/skills/catalog?q=                    canonical skill search (public)
   ========================================================= */
"use strict";
const db = require("../config/db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { id, now, parseJSON, injectNewcomerSlots } = require("../utils/helpers");
const { evaluateTier } = require("../utils/tierEngine");
const { validate } = require("../utils/validate");
const { track } = require("../utils/analytics");
const { POLICY } = require("../config/policy");
const C = require("../config/catalog");
const S = require("../utils/serializers");

const notFound = (what) => httpError(404, `${what} not found.`, "NOT_FOUND");

function requireActiveRole(req, role) {
  if (req.user.active_role !== role) {
    throw httpError(403, `Switch to your ${role} role to do this.`, "ROLE_REQUIRED", { required_roles: [role] });
  }
}

/** Build a dynamic UPDATE from validated values. Column names come from the schema, never the request. */
async function updateColumns(table, keyCol, keyVal, values, extra = {}) {
  const all = { ...values, ...extra };
  const cols = Object.keys(all);
  if (!cols.length) return 0;
  const set = cols.map(c => `${c} = ?`).join(", ");
  const r = await db.run(`UPDATE ${table} SET ${set} WHERE ${keyCol} = ?`, [...cols.map(c => all[c]), keyVal]);
  return r.changes;
}

// ═════════════════════════════════════════════════════════
//  Own profile (private view)
// ═════════════════════════════════════════════════════════

async function loadFreelancerBundle(userId) {
  const fp = await db.get(
    `SELECT fp.*, u.email_verified FROM freelancer_profiles fp JOIN users u ON u.id = fp.user_id WHERE fp.user_id = ?`,
    [userId]
  );
  if (!fp) return null;
  const skills = await db.all(
    "SELECT * FROM skills WHERE user_id = ? ORDER BY (verification_status = 'verified') DESC, created_at", [userId]
  );
  const portfolio = await db.all(
    "SELECT * FROM portfolio_items WHERE user_id = ? ORDER BY status, is_featured DESC, sort_order, created_at DESC", [userId]
  );
  return { fp, skills, portfolio };
}

/**
 * Private profile bundle for the signed-in user. Also records the first time a
 * freelancer profile reaches 100% (PRD §22 "profile completed" event).
 */
async function buildOwnProfile(userId, role) {
  if (role === "freelancer") {
    const b = await loadFreelancerBundle(userId);
    if (!b) return { profile: null };
    const completeness = S.freelancerCompleteness(b.fp, b.skills, b.portfolio);
    if (completeness.complete && !b.fp.profile_completed_at) {
      const r = await db.run(
        "UPDATE freelancer_profiles SET profile_completed_at = ? WHERE user_id = ? AND profile_completed_at IS NULL",
        [now(), userId]
      );
      if (r.changes) { b.fp.profile_completed_at = now(); track("profile_completed", { userId, role }); }
    }
    const verified = b.skills.filter(s => s.verification_status === "verified").length;
    const tierEval = evaluateTier(b.fp, verified, 0);
    return {
      profile: {
        ...S.freelancerPrivate(b.fp),
        skills: b.skills.map(S.skillPrivate),
        portfolio: b.portfolio.map(S.portfolioPrivate),
      },
      completeness,
      tier_info: { tier: b.fp.tier, next_tier: tierEval.nextTier, unmet_criteria: tierEval.unmetCriteria },
    };
  }
  const cp = await db.get("SELECT * FROM client_profiles WHERE user_id = ?", [userId]);
  if (!cp) return { profile: null };
  return { profile: S.clientPrivate(cp), completeness: S.clientCompleteness(cp) };
}

const getOwnProfile = asyncHandler(async (req, res) => {
  res.json(await buildOwnProfile(req.user.id, req.user.active_role));
});

// ═════════════════════════════════════════════════════════
//  Public freelancer profiles
// ═════════════════════════════════════════════════════════

const browseFreelancers = asyncHandler(async (req, res) => {
  const { q, skills, tier, availability, creostart, min_rating, category, page = "1", limit = "20" } = req.query;

  const pg  = Math.max(1, parseInt(page) || 1);
  const lim = Math.min(50, Math.max(1, parseInt(limit) || 20));
  const offset = (pg - 1) * lim;

  const where = ["fp.public_visibility = 'public'"];
  const params = [];

  if (q && typeof q === "string") {
    const like = `%${q.slice(0, 80)}%`;
    where.push("(fp.display_name LIKE ? OR fp.headline LIKE ? OR fp.bio LIKE ?)");
    params.push(like, like, like);
  }
  if (tier && ["bronze", "silver", "gold", "platinum"].includes(tier)) { where.push("fp.tier = ?"); params.push(tier); }
  if (availability && C.AVAILABILITY.includes(availability)) { where.push("fp.availability = ?"); params.push(availability); }
  if (creostart === "true") where.push("fp.creostart_eligible = 1");
  if (min_rating && !isNaN(parseFloat(min_rating))) { where.push("fp.avg_rating >= ?"); params.push(parseFloat(min_rating)); }
  if (category && C.CATEGORIES.includes(category)) {
    where.push("EXISTS (SELECT 1 FROM json_each(fp.work_categories) WHERE value = ?)");
    params.push(category);
  }
  if (skills && typeof skills === "string") {
    const list = skills.split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
    if (list.length) {
      where.push(`fp.user_id IN (SELECT DISTINCT user_id FROM skills
                  WHERE name IN (${list.map(() => "?").join(",")}) COLLATE NOCASE AND verification_status != 'rejected')`);
      params.push(...list);
    }
  }

  const baseSQL = `
    FROM freelancer_profiles fp
    JOIN users u ON u.id = fp.user_id AND u.is_active = 1 AND u.is_banned = 0
    WHERE ${where.join(" AND ")}`;

  const total = (await db.get(`SELECT COUNT(*) as n ${baseSQL}`, params))?.n || 0;
  const rows = await db.all(
    `SELECT fp.*, u.email_verified ${baseSQL}
     ORDER BY fp.avg_rating DESC, fp.total_projects_completed DESC
     LIMIT ? OFFSET ?`,
    [...params, lim, offset]
  );

  const results = [];
  for (const r of rows) {
    const out = S.freelancerPublic(r);
    out.skills = (await db.all(
      `SELECT * FROM skills WHERE user_id = ? AND verification_status != 'rejected'
       ORDER BY (verification_status = 'verified') DESC, created_at LIMIT 5`, [r.user_id]
    )).map(S.skillPublic);
    results.push(out);
  }

  // NOTE (Phase 6): exploration is a page-local reorder today and is not logged.
  // PRD TIER-03/§11 require logged slot types and eligibility-first ranking.
  let finalResults = results;
  if (pg === 1 && !tier && !creostart) {
    const newcomers = results.filter(r => r.creostart_eligible === 1 && r.tier === "bronze");
    const veterans  = results.filter(r => !(r.creostart_eligible === 1 && r.tier === "bronze"));
    finalResults = injectNewcomerSlots(veterans, newcomers);
  }

  res.json({ data: finalResults, pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

const getFreelancerProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const isOwner = req.user?.id === userId;
  const fp = await db.get(
    `SELECT fp.*, u.email_verified FROM freelancer_profiles fp
     JOIN users u ON u.id = fp.user_id
     WHERE fp.user_id = ? AND u.is_active = 1 AND u.is_banned = 0`,
    [userId]
  );
  if (!fp || (fp.public_visibility === "hidden" && !isOwner)) throw notFound("Freelancer profile");

  const skills = await db.all(
    `SELECT * FROM skills WHERE user_id = ? AND verification_status != 'rejected'
     ORDER BY (verification_status = 'verified') DESC, created_at`, [userId]
  );
  const portfolio = (await db.all(
    "SELECT * FROM portfolio_items WHERE user_id = ? ORDER BY is_featured DESC, sort_order, created_at DESC", [userId]
  )).filter(S.portfolioIsPublic);
  const reviews = await db.all(
    `SELECT r.rating, r.comment, r.created_at, r.reviewer_role, cp.display_name as reviewer_name
     FROM reviews r LEFT JOIN client_profiles cp ON cp.user_id = r.reviewer_id
     WHERE r.reviewee_id = ? AND r.is_visible = 1 ORDER BY r.created_at DESC LIMIT 20`, [userId]
  );
  const verifiedCount = skills.filter(s => s.verification_status === "verified").length;
  const { nextTier, unmetCriteria } = evaluateTier(fp, verifiedCount, 0);

  res.json({
    profile: S.freelancerPublic(fp),
    skills: skills.map(S.skillPublic),
    portfolio: portfolio.map(S.portfolioPublic),
    reviews,
    tier_info: { tier: fp.tier, next_tier: nextTier, unmet_criteria: unmetCriteria },
  });
});

// ── Update Own Freelancer Profile ─────────────────────────
const FREELANCER_SCHEMA = {
  display_name:          { type: "string", min: 2, max: 60, nullable: false, label: "Name" },
  headline:              { type: "string", max: 120, label: "Headline" },
  bio:                   { type: "text", max: 2000, label: "Bio" },
  location_city:         { type: "string", max: 60, label: "City" },
  location_state:        { type: "string", max: 60, label: "State" },
  availability:          { type: "enum", values: C.AVAILABILITY, nullable: false, label: "Availability" },
  timezone:              { type: "timezone", nullable: false, label: "Timezone" },
  work_categories:       { type: "array", max: POLICY.MAX_WORK_CATEGORIES, items: { type: "enum", values: C.CATEGORIES, label: "Category" }, nullable: false, label: "Work categories" },
  engagement_preference: { type: "enum", values: C.ENGAGEMENT, nullable: false, label: "Engagement preference" },
  weekly_capacity_hours: { type: "int", min: 1, max: 80, label: "Weekly capacity" },
  hourly_rate_min:       { type: "int", min: 0, max: 10_000_000, label: "Minimum rate" },
  hourly_rate_max:       { type: "int", min: 0, max: 10_000_000, label: "Maximum rate" },
  languages:             { type: "array", max: 10, items: { type: "string", min: 2, max: 30 }, nullable: false, label: "Languages" },
  public_visibility:     { type: "enum", values: ["public", "hidden"], nullable: false, label: "Profile visibility" },
  portfolio_url:         { type: "url", label: "Portfolio link" },
  github_url:            { type: "url", label: "GitHub link" },
  linkedin_url:          { type: "url", label: "LinkedIn link" },
  website_url:           { type: "url", label: "Website" },
};

const updateFreelancerProfile = asyncHandler(async (req, res) => {
  requireActiveRole(req, "freelancer");
  const existing = await db.get("SELECT * FROM freelancer_profiles WHERE user_id = ?", [req.user.id]);
  if (!existing) throw notFound("Freelancer profile");

  const v = validate(req.body, FREELANCER_SCHEMA, { partial: true });
  const min = v.hourly_rate_min !== undefined ? v.hourly_rate_min : existing.hourly_rate_min;
  const max = v.hourly_rate_max !== undefined ? v.hourly_rate_max : existing.hourly_rate_max;
  if (min != null && max != null && min > max) {
    throw httpError(400, "Minimum rate can't be higher than maximum rate.", "VALIDATION_FAILED",
      { fields: { hourly_rate_min: "Minimum rate can't be higher than maximum rate." } });
  }
  if (v.work_categories) v.work_categories = JSON.stringify(v.work_categories);
  if (v.languages) v.languages = JSON.stringify(v.languages);

  const extra = { updated_at: now() };
  // Any explicit availability save (even unchanged) counts as confirming it is current.
  if ("availability" in v || "weekly_capacity_hours" in v) extra.availability_updated_at = now();

  await updateColumns("freelancer_profiles", "user_id", req.user.id, v, extra);
  res.json(await buildOwnProfile(req.user.id, "freelancer"));
});

// ═════════════════════════════════════════════════════════
//  Client profiles
// ═════════════════════════════════════════════════════════

const CLIENT_SCHEMA = {
  display_name:      { type: "string", min: 2, max: 60, nullable: false, label: "Name" },
  bio:               { type: "text", max: 2000, label: "About" },
  organization_name: { type: "string", max: 100, label: "Organisation name" },
  organization_type: { type: "enum", values: C.CLIENT_TYPES, label: "Client type" },
  website_url:       { type: "url", label: "Website" },
  location_city:     { type: "string", max: 60, label: "City" },
  location_state:    { type: "string", max: 60, label: "State" },
  timezone:          { type: "timezone", nullable: false, label: "Timezone" },
};

const updateClientProfile = asyncHandler(async (req, res) => {
  requireActiveRole(req, "client");
  const v = validate(req.body, CLIENT_SCHEMA, { partial: true });
  const n = await updateColumns("client_profiles", "user_id", req.user.id, v, { updated_at: now() });
  if (!n) throw notFound("Client profile");
  res.json(await buildOwnProfile(req.user.id, "client"));
});

const getClientProfile = asyncHandler(async (req, res) => {
  const cp = await db.get(
    `SELECT cp.* FROM client_profiles cp JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = ? AND u.is_active = 1 AND u.is_banned = 0`, [req.params.userId]
  );
  if (!cp) throw notFound("Client profile");
  const reviews = await db.all(
    `SELECT r.rating, r.comment, r.created_at, fp.display_name as reviewer_name
     FROM reviews r LEFT JOIN freelancer_profiles fp ON fp.user_id = r.reviewer_id
     WHERE r.reviewee_id = ? AND r.is_visible = 1 ORDER BY r.created_at DESC LIMIT 10`, [req.params.userId]
  );
  res.json({ profile: S.clientPublic(cp), reviews });
});

// ═════════════════════════════════════════════════════════
//  Skills (PROF-02) — self-declared vs verified kept distinct
// ═════════════════════════════════════════════════════════

/** Resolve free text to a catalogue entry by canonical name or alias (case-insensitive). */
async function resolveCatalogSkill(name) {
  const lower = name.trim().toLowerCase();
  const direct = await db.get("SELECT * FROM skill_catalog WHERE canonical_name = ? COLLATE NOCASE AND is_active = 1", [name.trim()]);
  if (direct) return direct;
  return db.get(
    `SELECT sc.* FROM skill_catalog sc, json_each(sc.aliases) a
     WHERE sc.is_active = 1 AND lower(a.value) = ? LIMIT 1`, [lower]
  );
}

const searchSkillCatalog = asyncHandler(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
  const category = C.CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const like = `%${q.toLowerCase()}%`;
  const rows = await db.all(
    `SELECT DISTINCT sc.id, sc.canonical_name, sc.category, sc.aliases FROM skill_catalog sc
     LEFT JOIN json_each(sc.aliases) a
     WHERE sc.is_active = 1 ${category ? "AND sc.category = ?" : ""}
       AND (? = '' OR lower(sc.canonical_name) LIKE ? OR lower(a.value) LIKE ?)
     ORDER BY sc.canonical_name LIMIT 50`,
    [...(category ? [category] : []), q, like, like]
  );
  res.json({ skills: rows.map(r => ({ id: r.id, name: r.canonical_name, category: r.category, aliases: parseJSON(r.aliases, []) })) });
});

const SKILL_SCHEMA = {
  name:        { type: "string", min: 2, max: 60, required: true, label: "Skill name" },
  proficiency: { type: "enum", values: C.PROFICIENCY, label: "Proficiency" },
  years_exp:   { type: "number", min: 0, max: 60, label: "Years of experience" },
};

const addSkill = asyncHandler(async (req, res) => {
  requireActiveRole(req, "freelancer");
  const v = validate(req.body, SKILL_SCHEMA);
  const count = (await db.get("SELECT COUNT(*) AS n FROM skills WHERE user_id = ?", [req.user.id])).n;
  if (count >= POLICY.MAX_SKILLS_PER_USER) {
    throw httpError(400, `You can list up to ${POLICY.MAX_SKILLS_PER_USER} skills.`, "LIMIT_REACHED");
  }

  const cat = await resolveCatalogSkill(v.name);
  const name = cat ? cat.canonical_name : v.name;
  const dup = await db.get(
    `SELECT id FROM skills WHERE user_id = ? AND (name = ? COLLATE NOCASE ${cat ? "OR catalog_skill_id = ?" : ""})`,
    cat ? [req.user.id, name, cat.id] : [req.user.id, name]
  );
  if (dup) throw httpError(409, `"${name}" is already on your profile.`, "DUPLICATE_SKILL");

  const skillId = id();
  await db.run(
    `INSERT INTO skills (id, user_id, name, catalog_skill_id, proficiency, verification_status, years_exp, created_at)
     VALUES (?, ?, ?, ?, ?, 'self_declared', ?, ?)`,
    [skillId, req.user.id, name, cat?.id || null, v.proficiency || "intermediate", v.years_exp ?? null, now()]
  );
  track("skill_added", { userId: req.user.id, role: "freelancer", props: { catalog_skill_id: cat?.id || null, mapped: !!cat } });
  const skill = await db.get("SELECT * FROM skills WHERE id = ?", [skillId]);
  res.status(201).json({ skill: S.skillPrivate(skill), mapped_to_catalog: !!cat });
});

const updateSkill = asyncHandler(async (req, res) => {
  const skill = await db.get("SELECT * FROM skills WHERE id = ? AND user_id = ?", [req.params.skillId, req.user.id]);
  if (!skill) throw notFound("Skill");
  // A verified badge certifies a specific claim; editing the claim would make the badge lie.
  if (["verified", "pending_verification"].includes(skill.verification_status)) {
    throw httpError(409, "Verified or under-review skills can't be edited. Add a new claim or contact support.", "SKILL_LOCKED");
  }
  const v = validate(req.body, { proficiency: SKILL_SCHEMA.proficiency, years_exp: SKILL_SCHEMA.years_exp }, { partial: true });
  await updateColumns("skills", "id", skill.id, v);
  res.json({ skill: S.skillPrivate(await db.get("SELECT * FROM skills WHERE id = ?", [skill.id])) });
});

const deleteSkill = asyncHandler(async (req, res) => {
  const skill = await db.get("SELECT * FROM skills WHERE id = ? AND user_id = ?", [req.params.skillId, req.user.id]);
  if (!skill) throw notFound("Skill");
  if (skill.verification_status === "verified") {
    throw httpError(409, "Verified skills can't be removed here — their verification record is retained. Contact support.", "SKILL_LOCKED");
  }
  if (skill.verification_status === "pending_verification") {
    throw httpError(409, "This skill is under verification review and can't be removed until a decision is made.", "SKILL_LOCKED");
  }
  // VER-03: evidence, reviewer, outcome and reason are retained. A skill with any verification
  // history (e.g. rejected) stays on record; rejected skills are already hidden from public views.
  const history = await db.get("SELECT COUNT(*) AS n FROM skill_verification_queue WHERE skill_id = ?", [skill.id]);
  if (history.n > 0) throw httpError(409, "This skill has a verification history that must be retained.", "SKILL_LOCKED");
  await db.run("DELETE FROM skills WHERE id = ?", [skill.id]);
  res.json({ message: "Skill removed." });
});

const requestSkillVerification = asyncHandler(async (req, res) => {
  const skill = await db.get("SELECT * FROM skills WHERE id = ? AND user_id = ?", [req.params.skillId, req.user.id]);
  if (!skill) throw notFound("Skill");
  if (skill.verification_status === "verified") throw httpError(409, "This skill is already verified.", "ALREADY_VERIFIED");
  if (skill.verification_status === "pending_verification") throw httpError(409, "A verification request is already pending.", "ALREADY_PENDING");

  const v = validate(req.body, {
    evidence_note:  { type: "text", min: 20, max: 2000, required: true, label: "Evidence description" },
    external_links: { type: "array", max: POLICY.MAX_PORTFOLIO_LINKS, items: { type: "url", label: "Evidence link" }, label: "Evidence links" },
  });

  await db.transaction(async () => {
    await db.run(
      `INSERT INTO skill_verification_queue (id, skill_id, user_id, evidence_note, evidence_files, external_links, status, created_at)
       VALUES (?, ?, ?, ?, '[]', ?, 'pending', ?)`,
      [id(), skill.id, req.user.id, v.evidence_note, JSON.stringify(v.external_links || []), now()]
    );
    await db.run("UPDATE skills SET verification_status = 'pending_verification' WHERE id = ?", [skill.id]);
  });
  track("skill_evidence_submitted", { userId: req.user.id, role: "freelancer", props: { catalog_skill_id: skill.catalog_skill_id } });
  res.status(201).json({ message: "Evidence submitted. A reviewer will record a decision and reason; you'll be notified." });
});

// ═════════════════════════════════════════════════════════
//  Portfolio (PROF-03)
// ═════════════════════════════════════════════════════════

const PORTFOLIO_SCHEMA = {
  title:           { type: "string", min: 3, max: 120, required: true, nullable: false, label: "Title" },
  description:     { type: "text", max: 2000, label: "Description" },
  category:        { type: "enum", values: C.CATEGORIES, label: "Category" },
  skills_used:     { type: "array", max: 10, items: { type: "string", min: 1, max: 60 }, label: "Skills used" },
  external_url:    { type: "url", label: "Link" },
  is_confidential: { type: "bool", label: "Confidential" },
  is_featured:     { type: "bool", label: "Featured" },
  rights_declared: { type: "bool", label: "Rights declaration" },
  sort_order:      { type: "int", min: 0, max: 1000, label: "Sort order" },
};

/** Public (non-confidential) work requires the owner to declare they may display it (PRD §9 IP). */
function assertRights(item) {
  if (!item.is_confidential && !item.rights_declared) {
    throw httpError(400,
      "Confirm you have the right to show this work publicly, or mark it confidential (confidential items are never shown publicly).",
      "RIGHTS_DECLARATION_REQUIRED", { fields: { rights_declared: "Required for public work." } });
  }
}

const addPortfolioItem = asyncHandler(async (req, res) => {
  requireActiveRole(req, "freelancer");
  const v = validate(req.body, PORTFOLIO_SCHEMA);
  const item = { is_confidential: !!v.is_confidential, rights_declared: !!v.rights_declared };
  assertRights(item);

  const itemId = id();
  const ts = now();
  await db.run(
    `INSERT INTO portfolio_items (id, user_id, title, description, category, skills_used, external_url, images, files,
       is_confidential, is_featured, sort_order, status, rights_declared, rights_declared_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [itemId, req.user.id, v.title, v.description ?? null, v.category ?? null, JSON.stringify(v.skills_used || []),
     v.external_url ?? null, item.is_confidential ? 1 : 0, v.is_featured ? 1 : 0, v.sort_order ?? 0,
     item.rights_declared ? 1 : 0, item.rights_declared ? ts : null, ts, ts]
  );
  track("portfolio_item_created", { userId: req.user.id, role: "freelancer", props: { confidential: item.is_confidential, category: v.category || null } });
  res.status(201).json({ item: S.portfolioPrivate(await db.get("SELECT * FROM portfolio_items WHERE id = ?", [itemId])) });
});

async function ownItem(req) {
  const item = await db.get("SELECT * FROM portfolio_items WHERE id = ? AND user_id = ?", [req.params.itemId, req.user.id]);
  if (!item) throw notFound("Portfolio item");
  return item;
}

const updatePortfolioItem = asyncHandler(async (req, res) => {
  const item = await ownItem(req);
  const v = validate(req.body, PORTFOLIO_SCHEMA, { partial: true });
  const next = {
    is_confidential: v.is_confidential !== undefined ? v.is_confidential : !!item.is_confidential,
    rights_declared: v.rights_declared !== undefined ? v.rights_declared : !!item.rights_declared,
  };
  assertRights(next);

  const cols = { ...v };
  if (cols.skills_used) cols.skills_used = JSON.stringify(cols.skills_used);
  for (const b of ["is_confidential", "is_featured", "rights_declared"]) if (b in cols) cols[b] = cols[b] ? 1 : 0;
  const extra = { updated_at: now() };
  if (v.rights_declared === true && !item.rights_declared) extra.rights_declared_at = now();
  if (v.rights_declared === false) extra.rights_declared_at = null;
  await updateColumns("portfolio_items", "id", item.id, cols, extra);
  res.json({ item: S.portfolioPrivate(await db.get("SELECT * FROM portfolio_items WHERE id = ?", [item.id])) });
});

const archivePortfolioItem = asyncHandler(async (req, res) => {
  const item = await ownItem(req);
  if (item.status === "archived") throw httpError(409, "This item is already archived.", "ALREADY_ARCHIVED");
  await db.run("UPDATE portfolio_items SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?", [now(), now(), item.id]);
  track("portfolio_item_archived", { userId: req.user.id, role: "freelancer" });
  res.json({ item: S.portfolioPrivate(await db.get("SELECT * FROM portfolio_items WHERE id = ?", [item.id])) });
});

const restorePortfolioItem = asyncHandler(async (req, res) => {
  const item = await ownItem(req);
  if (item.status !== "archived") throw httpError(409, "This item isn't archived.", "NOT_ARCHIVED");
  await db.run("UPDATE portfolio_items SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?", [now(), item.id]);
  res.json({ item: S.portfolioPrivate(await db.get("SELECT * FROM portfolio_items WHERE id = ?", [item.id])) });
});

const deletePortfolioItem = asyncHandler(async (req, res) => {
  const item = await ownItem(req);
  await db.run("DELETE FROM portfolio_items WHERE id = ?", [item.id]);
  res.json({ message: "Portfolio item removed." });
});

module.exports = {
  buildOwnProfile, getOwnProfile,
  browseFreelancers, getFreelancerProfile, updateFreelancerProfile,
  updateClientProfile, getClientProfile,
  searchSkillCatalog, addSkill, updateSkill, deleteSkill, requestSkillVerification,
  addPortfolioItem, updatePortfolioItem, archivePortfolioItem, restorePortfolioItem, deletePortfolioItem,
};
