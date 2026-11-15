/* =========================================================
   CREOTASK — Evidence-based Tier Evaluation Engine
   =========================================================
   Tiers are NEVER purchased, never unlocked by XP alone.
   They are evaluated from real delivery evidence:
     - Bronze  : Default for all new accounts
     - Silver  : 2+ verified skills OR 1 completed project + rating ≥ 4.0
     - Gold    : 5+ completed projects, 3+ unique clients, avg rating ≥ 4.3, on-time ≥ 80%
     - Platinum: 15+ completed projects, 8+ unique clients, avg rating ≥ 4.6, on-time ≥ 90%, 0 open disputes
   ========================================================= */
"use strict";

const TIER_CRITERIA = {
  bronze:   { label: "Bronze",   minProjects: 0,  minClients: 0, minRating: 0,   minOnTime: 0,    minVerifiedSkills: 0, maxOpenDisputes: Infinity },
  silver:   { label: "Silver",   minProjects: 1,  minClients: 1, minRating: 4.0, minOnTime: 0,    minVerifiedSkills: 1, maxOpenDisputes: Infinity },
  gold:     { label: "Gold",     minProjects: 5,  minClients: 3, minRating: 4.3, minOnTime: 0.80, minVerifiedSkills: 2, maxOpenDisputes: 0 },
  platinum: { label: "Platinum", minProjects: 15, minClients: 8, minRating: 4.6, minOnTime: 0.90, minVerifiedSkills: 3, maxOpenDisputes: 0 },
};

/**
 * Evaluate which tier a freelancer qualifies for based on their evidence.
 * Returns the highest tier they meet ALL criteria for.
 *
 * @param {Object} profile - freelancer_profiles row
 * @param {number} verifiedSkillCount - count of skills with verification_status = 'verified'
 * @param {number} openDisputeCount   - count of disputes in ('opened','evidence_collection','assigned','under_review')
 * @returns {{ tier: string, evidence: Object, unmetCriteria: string[] }}
 */
function evaluateTier(profile, verifiedSkillCount = 0, openDisputeCount = 0) {
  const evidence = {
    total_projects_completed: profile.total_projects_completed || 0,
    total_unique_clients:     profile.total_unique_clients || 0,
    avg_rating:               profile.avg_rating || 0.0,
    on_time_rate:             profile.on_time_rate || 1.0,
    total_reviews:            profile.total_reviews || 0,
    verified_skills:          verifiedSkillCount,
    open_disputes:            openDisputeCount,
  };

  const tiers = ["platinum", "gold", "silver", "bronze"];
  for (const tierName of tiers) {
    const c = TIER_CRITERIA[tierName];
    if (
      evidence.total_projects_completed >= c.minProjects &&
      evidence.total_unique_clients     >= c.minClients &&
      evidence.avg_rating               >= c.minRating &&
      evidence.on_time_rate             >= c.minOnTime &&
      evidence.verified_skills          >= c.minVerifiedSkills &&
      openDisputeCount                  <= c.maxOpenDisputes
    ) {
      // Compute what criteria they still need for the NEXT tier
      const nextTierName = tierName === "platinum" ? null : tiers[tiers.indexOf(tierName) - 1];
      const unmetCriteria = nextTierName ? getUnmetCriteria(evidence, TIER_CRITERIA[nextTierName]) : [];
      return { tier: tierName, evidence, unmetCriteria, nextTier: nextTierName };
    }
  }
  // Fallback — should always at least be bronze
  return { tier: "bronze", evidence, unmetCriteria: [], nextTier: "silver" };
}

function getUnmetCriteria(evidence, criteria) {
  const unmet = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (evidence.total_projects_completed < criteria.minProjects)
    unmet.push(`Complete ${plural(criteria.minProjects, "paid project")} (you have ${evidence.total_projects_completed})`);
  if (evidence.total_unique_clients < criteria.minClients)
    unmet.push(`Work with ${plural(criteria.minClients, "different client")} (you have ${evidence.total_unique_clients})`);
  if (evidence.avg_rating < criteria.minRating)
    unmet.push(evidence.total_reviews
      ? `Reach an average rating of ${criteria.minRating.toFixed(1)} or higher (yours is ${evidence.avg_rating.toFixed(1)})`
      : `Reach an average rating of ${criteria.minRating.toFixed(1)} or higher (no reviews yet)`);
  if (evidence.on_time_rate < criteria.minOnTime)
    unmet.push(`Deliver at least ${Math.round(criteria.minOnTime * 100)}% of work on time (yours is ${Math.round(evidence.on_time_rate * 100)}%)`);
  if (evidence.verified_skills < criteria.minVerifiedSkills)
    unmet.push(`Get ${plural(criteria.minVerifiedSkills, "skill")} verified (you have ${evidence.verified_skills})`);
  if (criteria.maxOpenDisputes === 0 && evidence.open_disputes > 0)
    unmet.push(`Resolve your open ${evidence.open_disputes === 1 ? "dispute" : "disputes"} (${evidence.open_disputes} open)`);
  return unmet;
}

/** Tier display metadata */
const TIER_META = {
  bronze:   { color: "#c7834a", label: "Bronze",   description: "Emerging talent — just getting started." },
  silver:   { color: "#c9ced6", label: "Silver",   description: "Rising professional with verified skills." },
  gold:     { color: "#e8b64c", label: "Gold",     description: "Proven performer with consistent delivery." },
  platinum: { color: "#b8e3ee", label: "Platinum", description: "Elite contributor — top of the platform." },
};

module.exports = { evaluateTier, TIER_CRITERIA, TIER_META };
