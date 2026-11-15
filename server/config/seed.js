/* =========================================================
   CREOTASK — Database Seed (dev only)
   Creates a super admin account and sample data.
   Run: npm run db:seed
   ========================================================= */
"use strict";
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db  = require("./db");
const { migrate } = require("./migrate");
const { id, now, addDays } = require("../utils/helpers");
const { POLICY } = require("./policy");

async function seed({ quiet = false } = {}) {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const log = quiet ? () => {} : console.log;
  await migrate({ quiet });
  log("🌱  Seeding database… (DEMO DATA — development/test only)");

  const ts = now();

  // ── Create super admin user ──────────────────────────────
  const adminId = id();
  const adminHash = await bcrypt.hash("Admin@1234", 12);
  try {
    await db.run(
      `INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at, is_active, is_banned, active_role)
       VALUES (?, ?, ?, 1, ?, ?, 1, 0, 'freelancer')`,
      [adminId, "admin@creotask.in", adminHash, ts, ts]
    );
    await db.run(
      `INSERT INTO freelancer_profiles (user_id, display_name, headline, tier, kyc_status, created_at, updated_at)
       VALUES (?, 'CreoTask Admin', 'Platform Administrator', 'platinum', 'verified', ?, ?)`,
      [adminId, ts, ts]
    );
    await db.run(
      `INSERT INTO admins (user_id, admin_role, created_at) VALUES (?, 'super_admin', ?)`,
      [adminId, ts]
    );
    log("   ✅ Admin:      admin@creotask.in / Admin@1234");
  } catch (e) {
    if (e.message.includes("UNIQUE")) log("   ⏭️  Admin already exists, skipping.");
    else throw e;
  }

  // ── Create freelancer 1 (Platinum) ───────────────────────
  const f1Id = id();
  const f1Hash = await bcrypt.hash("Test@1234", 12);
  try {
    await db.run(
      `INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at, is_active, is_banned, active_role)
       VALUES (?, ?, ?, 1, ?, ?, 1, 0, 'freelancer')`,
      [f1Id, "priya@demo.in", f1Hash, ts, ts]
    );
    await db.run(
      `INSERT INTO freelancer_profiles (user_id, display_name, headline, bio, location_city, location_state, tier, availability, avg_rating, total_reviews, total_projects_completed, total_unique_clients, on_time_rate, total_earned_paise, kyc_status, creostart_eligible, created_at, updated_at)
       VALUES (?, 'Priya Sharma', 'Product Designer specialising in SaaS & FinTech', 'I help startups turn complex workflows into elegant, user-centred products. 8+ years of experience.', 'Bengaluru', 'Karnataka', 'platinum', 'available', 4.9, 112, 48, 32, 0.98, 285000000, 'verified', 0, ?, ?)`,
      [f1Id, ts, ts]
    );
    for (const skill of [
      { name: "UI/UX Design", proficiency: "expert", status: "verified" },
      { name: "Figma",         proficiency: "expert", status: "verified" },
      { name: "Branding",      proficiency: "advanced", status: "verified" },
      { name: "Prototyping",   proficiency: "advanced", status: "self_declared" },
    ]) {
      await db.run(
        `INSERT INTO skills (id, user_id, name, proficiency, verification_status, years_exp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id(), f1Id, skill.name, skill.proficiency, skill.status, 7, ts]
      );
    }
    log("   ✅ Freelancer: priya@demo.in / Test@1234 (Platinum)");
  } catch (e) {
    if (e.message.includes("UNIQUE")) log("   ⏭️  Priya already exists, skipping.");
    else throw e;
  }

  // ── Create freelancer 2 (Bronze/CreoStart) ───────────────
  const f2Id = id();
  const f2Hash = await bcrypt.hash("Test@1234", 12);
  try {
    await db.run(
      `INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at, is_active, is_banned, active_role)
       VALUES (?, ?, ?, 1, ?, ?, 1, 0, 'freelancer')`,
      [f2Id, "aman@demo.in", f2Hash, ts, ts]
    );
    await db.run(
      `INSERT INTO freelancer_profiles (user_id, display_name, headline, bio, location_city, location_state, tier, availability, avg_rating, total_reviews, total_projects_completed, total_unique_clients, on_time_rate, total_earned_paise, kyc_status, creostart_eligible, created_at, updated_at)
       VALUES (?, 'Aman Joshi', 'Junior Designer looking for my first real project', 'Fresh out of a design bootcamp, eager to build real work experience through CreoStart projects.', 'Chandigarh', 'Punjab', 'bronze', 'available', 0.0, 0, 0, 0, 1.0, 0, 'not_started', 1, ?, ?)`,
      [f2Id, ts, ts]
    );
    for (const skill of [
      { name: "Figma", proficiency: "intermediate", status: "self_declared" },
      { name: "Canva", proficiency: "intermediate", status: "self_declared" },
    ]) {
      await db.run(
        `INSERT INTO skills (id, user_id, name, proficiency, verification_status, years_exp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id(), f2Id, skill.name, skill.proficiency, skill.status, 0.5, ts]
      );
    }
    log("   ✅ Freelancer: aman@demo.in / Test@1234 (Bronze/CreoStart)");
  } catch (e) {
    if (e.message.includes("UNIQUE")) log("   ⏭️  Aman already exists, skipping.");
    else throw e;
  }

  // ── Create client ─────────────────────────────────────────
  const c1Id = id();
  const c1Hash = await bcrypt.hash("Test@1234", 12);
  try {
    await db.run(
      `INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at, is_active, is_banned, active_role)
       VALUES (?, ?, ?, 1, ?, ?, 1, 0, 'client')`,
      [c1Id, "chai@demo.in", c1Hash, ts, ts]
    );
    await db.run(
      `INSERT INTO client_profiles (user_id, display_name, bio, organization_name, organization_type, location_city, location_state, verification_status, total_projects_posted, total_projects_completed, created_at, updated_at)
       VALUES (?, 'Chai Leaf Co.', 'Organic D2C tea brand from Assam.', 'Chai Leaf Co.', 'startup', 'Guwahati', 'Assam', 'verified', 3, 2, ?, ?)`,
      [c1Id, ts, ts]
    );

    // Create a sample open project with milestones
    const proj1Id = id();
    await db.run(
      `INSERT INTO projects (id, client_id, title, description, category, required_skills, budget_paise, timeline_days, is_creostart, is_remote, acceptance_criteria, deliverables, status, visibility, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'open', 'public', ?, ?, ?)`,
      [proj1Id, c1Id,
       "Brand identity for an organic tea brand",
       "We're a D2C organic tea brand from Assam looking for a warm, minimal brand identity. We need a logo mark + wordmark, colour palette, and a 1-page brand usage guide. The feeling should be earthy, premium, and authentic.",
       "Design",
       JSON.stringify(["Branding", "Illustration", "Figma"]),
       1500000,  // ₹15,000 in paise
       20,
       0,  // not creostart
       "Final deliverables must include SVG + PNG logo, brand colour hex codes, and typography recommendations.",
       "SVG + PNG logo, colour palette PDF, 1-page brand usage guide",
       ts, ts, ts]
    );
    // Milestones
    await db.run(
      `INSERT INTO milestones (id, project_id, title, description, sort_order, budget_paise, timeline_days, status, max_revisions, revisions_used, created_at, updated_at)
       VALUES (?, ?, 'Concept & Mood Board', 'Present 3 initial concepts with mood boards for client selection.', 0, 500000, 7, 'not_funded', 2, 0, ?, ?)`,
      [id(), proj1Id, ts, ts]
    );
    await db.run(
      `INSERT INTO milestones (id, project_id, title, description, sort_order, budget_paise, timeline_days, status, max_revisions, revisions_used, created_at, updated_at)
       VALUES (?, ?, 'Final Logo & Assets', 'Deliver final approved logo with all file formats and brand guide.', 1, 1000000, 13, 'not_funded', 2, 0, ?, ?)`,
      [id(), proj1Id, ts, ts]
    );

    // A CreoStart project
    const proj2Id = id();
    await db.run(
      `INSERT INTO projects (id, client_id, title, description, category, required_skills, budget_paise, timeline_days, is_creostart, is_remote, deliverables, status, visibility, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'open', 'public', ?, ?, ?)`,
      [proj2Id, c1Id,
       "[CreoStart] Social media kit for Instagram",
       "Looking for a junior designer to create 5 social media post templates for our Instagram. This is a CreoStart project — ideal for new designers building their portfolio. Clear brief, structured feedback, and a good reference for your portfolio.",
       "Design",
       JSON.stringify(["Canva", "Figma"]),
       300000, // ₹3,000
       10,
       "5 Canva or Figma templates: 1080×1080 and 1080×1920 sizes",
       ts, ts, ts]
    );
    await db.run(
      `INSERT INTO milestones (id, project_id, title, description, sort_order, budget_paise, timeline_days, status, max_revisions, revisions_used, created_at, updated_at)
       VALUES (?, ?, 'All 5 Templates', 'Deliver all 5 editable templates in Canva or Figma.', 0, 300000, 10, 'not_funded', 3, 0, ?, ?)`,
      [id(), proj2Id, ts, ts]
    );

    log("   ✅ Client:     chai@demo.in / Test@1234");
    log("   ✅ 2 sample projects created (1 standard, 1 CreoStart)");
  } catch (e) {
    if (e.message.includes("UNIQUE")) log("   ⏭️  Client already exists, skipping.");
    else throw e;
  }

  // ── Phase 1 fields for demo accounts ─────────────────────
  await db.run(
    `UPDATE users SET age_confirmed_at = COALESCE(age_confirmed_at, created_at),
                      age_policy_version = COALESCE(age_policy_version, ?),
                      email_verified_at = CASE WHEN email_verified = 1 THEN COALESCE(email_verified_at, created_at) END
     WHERE email IN ('admin@creotask.in','priya@demo.in','aman@demo.in','chai@demo.in')`,
    [POLICY.AGE_POLICY_VERSION]
  );
  await db.run(`INSERT OR IGNORE INTO user_roles (user_id, role, status, created_at)
                SELECT user_id, 'freelancer', 'active', created_at FROM freelancer_profiles`);
  await db.run(`INSERT OR IGNORE INTO user_roles (user_id, role, status, created_at)
                SELECT user_id, 'client', 'active', created_at FROM client_profiles`);
  await db.run(`UPDATE skills SET catalog_skill_id =
                  (SELECT sc.id FROM skill_catalog sc WHERE sc.canonical_name = skills.name COLLATE NOCASE)
                WHERE catalog_skill_id IS NULL`);
  await db.run(`UPDATE freelancer_profiles SET availability_updated_at = COALESCE(availability_updated_at, updated_at),
                  work_categories = CASE WHEN work_categories = '[]' THEN '["Design"]' ELSE work_categories END
                WHERE user_id IN (SELECT id FROM users WHERE email IN ('priya@demo.in','aman@demo.in'))`);

  if (quiet) return;
  console.log("\n✅  Seed complete.\n");
  console.log("   Test accounts:");
  console.log("   admin@creotask.in / Admin@1234  (super admin)");
  console.log("   priya@demo.in     / Test@1234  (Platinum freelancer)");
  console.log("   aman@demo.in      / Test@1234  (Bronze/CreoStart freelancer)");
  console.log("   chai@demo.in      / Test@1234  (Verified client)\n");
}

module.exports = { seed };

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => { console.error("❌  Seed failed:", err.message); process.exit(1); });
}
