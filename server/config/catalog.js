/* =========================================================
   CREOTASK — Reference catalogue (categories, skills, enums)
   ---------------------------------------------------------
   Launch categories are an OPEN founder decision (PRD §3, §27:
   "choose 2–3 from paid-demand evidence"). Until then the
   existing project categories are kept so nothing breaks.
   ========================================================= */
"use strict";

const CATEGORIES = ["Design", "Development", "Writing", "Video", "Marketing", "Data & Analytics", "Other"];

const PROFICIENCY = ["beginner", "intermediate", "advanced", "expert"];
const AVAILABILITY = ["available", "limited", "unavailable"];
/** PRD PROF-04 "preferred engagement" */
const ENGAGEMENT = ["one_off", "ongoing", "either"];
/** PRD ClientProfile "client type" */
const CLIENT_TYPES = ["individual", "startup", "small_business", "enterprise", "agency", "nonprofit", "education"];

/** Suspension reason categories shown to the affected user (PRD TRUST-05, §15). */
const SUSPENSION_REASONS = {
  policy_violation: "Violation of CreoTask policies",
  fraud_risk: "Suspected fraud or account misuse",
  payment_risk: "Payment or chargeback risk",
  impersonation: "Impersonation or misrepresented identity",
  harassment: "Harassment or abusive conduct",
  off_platform_payment: "Off-platform payment solicitation",
  legal_request: "Legal or regulatory request",
  other: "Other policy reason",
};

/**
 * Canonical skill catalogue (PRD Skill entity: id, canonical name, category, aliases).
 * IDs are stable slugs so migrations and seeds are deterministic.
 */
const SKILLS = [
  ["ui-ux-design", "UI/UX Design", "Design", ["ui design", "ux design", "ui/ux", "product design"]],
  ["figma", "Figma", "Design", []],
  ["branding", "Branding", "Design", ["brand identity", "brand design"]],
  ["graphic-design", "Graphic Design", "Design", ["graphics"]],
  ["illustration", "Illustration", "Design", ["illustrator art", "digital illustration"]],
  ["adobe-illustrator", "Adobe Illustrator", "Design", ["illustrator", "ai"]],
  ["adobe-photoshop", "Adobe Photoshop", "Design", ["photoshop", "ps"]],
  ["canva", "Canva", "Design", []],
  ["packaging-design", "Packaging Design", "Design", ["packaging"]],
  ["react", "React", "Development", ["reactjs", "react.js"]],
  ["nodejs", "Node.js", "Development", ["node", "nodejs", "node js"]],
  ["javascript", "JavaScript", "Development", ["js", "es6"]],
  ["typescript", "TypeScript", "Development", ["ts"]],
  ["python", "Python", "Development", ["py"]],
  ["django", "Django", "Development", []],
  ["flutter", "Flutter", "Development", []],
  ["firebase", "Firebase", "Development", []],
  ["postgresql", "PostgreSQL", "Development", ["postgres", "psql"]],
  ["sql", "SQL", "Data & Analytics", ["mysql"]],
  ["aws", "AWS", "Development", ["amazon web services"]],
  ["wordpress", "WordPress", "Development", ["wp"]],
  ["php", "PHP", "Development", []],
  ["tailwind", "Tailwind CSS", "Development", ["tailwind", "tailwindcss"]],
  ["html-css", "HTML & CSS", "Development", ["html", "css", "html/css"]],
  ["copywriting", "Copywriting", "Writing", ["copy writing", "ad copy"]],
  ["content-writing", "Content Writing", "Writing", ["blog writing", "article writing"]],
  ["content-strategy", "Content Strategy", "Marketing", []],
  ["technical-writing", "Technical Writing", "Writing", ["documentation"]],
  ["seo", "SEO", "Marketing", ["search engine optimization", "search engine optimisation"]],
  ["social-media", "Social Media Management", "Marketing", ["social media", "instagram", "smm"]],
  ["google-ads", "Google Ads", "Marketing", ["adwords", "google adwords"]],
  ["meta-ads", "Meta Ads", "Marketing", ["facebook ads", "instagram ads"]],
  ["video-editing", "Video Editing", "Video", ["video editor", "editing"]],
  ["after-effects", "After Effects", "Video", ["ae", "adobe after effects"]],
  ["motion-graphics", "Motion Graphics", "Video", ["motion design"]],
  ["storyboarding", "Storyboarding", "Video", []],
  ["voice-over", "Voice Over", "Video", ["voiceover", "vo"]],
  ["audio-editing", "Audio Editing", "Video", ["sound editing"]],
  ["data-analysis", "Data Analysis", "Data & Analytics", ["data analytics", "analytics"]],
  ["power-bi", "Power BI", "Data & Analytics", ["powerbi"]],
  ["excel", "Microsoft Excel", "Data & Analytics", ["excel", "spreadsheets"]],
];

module.exports = { CATEGORIES, PROFICIENCY, AVAILABILITY, ENGAGEMENT, CLIENT_TYPES, SUSPENSION_REASONS, SKILLS };
