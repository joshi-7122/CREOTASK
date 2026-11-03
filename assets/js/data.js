/* =========================================================
   CREOTASK — seed data
   Stand-in content until the backend exists. Each array maps to
   a collection the API will serve (see README → "Connecting a backend").
   ========================================================= */
(function (global) {
  "use strict";

  /** Membership tiers (pitch deck: "Tiered Membership System — Bronze to Platinum"). */
  const TIERS = [
    { id: "bronze", name: "Bronze", minXp: 0, color: "#c7834a", perks: ["Join public contests", "Daily challenges", "Portfolio & skill tree"] },
    { id: "silver", name: "Silver", minXp: 1000, color: "#c9ced6", perks: ["Everything in Bronze", "Priority in AI job matching", "Verified-skill tests"] },
    { id: "gold", name: "Gold", minXp: 2500, color: "#e8b64c", perks: ["Everything in Silver", "Invites to private contests", "Featured on Explore"] },
    { id: "platinum", name: "Platinum", minXp: 5000, color: "#b8e3ee", perks: ["Everything in Gold", "Lower platform fee", "Early access to new features"] },
  ];

  const CATEGORIES = ["Design", "Development", "Writing", "Video", "Marketing"];

  /** Freelancers shown on Explore and the leaderboard. */
  const CREATORS = [
    { id: "c1", name: "Priya Sharma", city: "Bengaluru", xp: 5240, rating: 4.9, reviews: 112, available: true, title: "Product designer", skills: ["UI/UX Design", "Figma", "Branding"], verified: ["Figma"] },
    { id: "c2", name: "Rohan Mehta", city: "Mumbai", xp: 4810, rating: 4.8, reviews: 96, available: false, title: "Full-stack developer", skills: ["React", "Node.js", "PostgreSQL"], verified: ["React", "Node.js"] },
    { id: "c3", name: "Aisha Khan", city: "Delhi", xp: 4390, rating: 4.9, reviews: 81, available: true, title: "Motion & video editor", skills: ["Video Editing", "After Effects", "Storyboarding"], verified: ["Video Editing"] },
    { id: "c4", name: "Kabir Singh", city: "Pune", xp: 3920, rating: 4.7, reviews: 64, available: true, title: "Backend engineer", skills: ["Python", "Django", "AWS"], verified: ["Python"] },
    { id: "c5", name: "Neha Gupta", city: "Hyderabad", xp: 3510, rating: 4.8, reviews: 58, available: true, title: "Copywriter", skills: ["Copywriting", "SEO", "Content Strategy"], verified: [] },
    { id: "c6", name: "Arjun Nair", city: "Kochi", xp: 3080, rating: 4.6, reviews: 47, available: false, title: "Illustrator", skills: ["Illustration", "Procreate", "Branding"], verified: ["Illustration"] },
    { id: "c7", name: "Sara Thomas", city: "Chennai", xp: 2760, rating: 4.7, reviews: 39, available: true, title: "Mobile developer", skills: ["Flutter", "Firebase", "UI/UX Design"], verified: [] },
    { id: "c8", name: "Vikram Rao", city: "Jaipur", xp: 2410, rating: 4.5, reviews: 33, available: true, title: "Performance marketer", skills: ["Google Ads", "Meta Ads", "Analytics"], verified: ["Google Ads"] },
    { id: "c9", name: "Meera Iyer", city: "Noida", xp: 2050, rating: 4.6, reviews: 27, available: true, title: "Brand designer", skills: ["Branding", "Illustrator", "Packaging"], verified: [] },
    { id: "c10", name: "Dev Patel", city: "Ahmedabad", xp: 1720, rating: 4.4, reviews: 21, available: false, title: "Data analyst", skills: ["Python", "SQL", "Power BI"], verified: ["SQL"] },
    { id: "c11", name: "Ishaan Verma", city: "Lucknow", xp: 1380, rating: 4.5, reviews: 16, available: true, title: "Frontend developer", skills: ["React", "Tailwind", "TypeScript"], verified: [] },
    { id: "c12", name: "Tanya Bose", city: "Kolkata", xp: 1040, rating: 4.3, reviews: 12, available: true, title: "Social media manager", skills: ["Content Strategy", "Canva", "Instagram"], verified: [] },
    { id: "c13", name: "Kunal Jain", city: "Indore", xp: 760, rating: 4.2, reviews: 8, available: true, title: "WordPress developer", skills: ["WordPress", "PHP", "SEO"], verified: [] },
    { id: "c14", name: "Ritika Das", city: "Bhopal", xp: 420, rating: 4.0, reviews: 4, available: true, title: "Voice-over artist", skills: ["Voice Over", "Audio Editing"], verified: [] },
    { id: "c15", name: "Aman Joshi", city: "Chandigarh", xp: 180, rating: 0, reviews: 0, available: true, title: "Junior designer", skills: ["Figma", "Canva"], verified: [] },
  ];

  const DAY = 864e5;
  const now = Date.now();
  /** Contests (the core of the marketplace: "only the best work wins, not the cheapest offer"). */
  const CONTESTS = [
    { id: "k1", title: "Logo for an organic tea brand", client: "Chai Leaf Co.", category: "Design", budget: 15000, deadline: now + 5 * DAY, entries: 38, mode: "public", skills: ["Branding", "Illustrator", "Illustration"], desc: "A warm, minimal logo mark plus wordmark for a D2C organic tea brand.", deliverables: "Logo in SVG + PNG, colour palette, 1-page usage sheet" },
    { id: "k2", title: "Landing page for a fintech waitlist", client: "Paisa Labs", category: "Development", budget: 30000, deadline: now + 9 * DAY, entries: 14, mode: "public", skills: ["React", "Tailwind", "UI/UX Design"], desc: "Responsive landing page with waitlist form and analytics events.", deliverables: "Deployed URL + source repository" },
    { id: "k3", title: "30-second launch reel", client: "FitNest", category: "Video", budget: 12000, deadline: now + 3 * DAY, entries: 22, mode: "public", skills: ["Video Editing", "After Effects"], desc: "Punchy vertical reel announcing our new app, footage provided.", deliverables: "MP4 1080×1920, captions file" },
    { id: "k4", title: "Blog series on remote work (5 posts)", client: "Workly", category: "Writing", budget: 10000, deadline: now + 12 * DAY, entries: 9, mode: "public", skills: ["Copywriting", "SEO", "Content Strategy"], desc: "Five SEO-optimised long-form posts, 1,200 words each.", deliverables: "Google Docs with meta titles & descriptions" },
    { id: "k5", title: "App onboarding redesign", client: "StudyBuddy", category: "Design", budget: 25000, deadline: now + 7 * DAY, entries: 17, mode: "private", skills: ["UI/UX Design", "Figma"], desc: "Redesign a 4-screen onboarding flow to lift activation.", deliverables: "Figma file with prototype" },
    { id: "k6", title: "Diwali ad campaign creatives", client: "Kiran Sweets", category: "Marketing", budget: 18000, deadline: now + 6 * DAY, entries: 26, mode: "public", skills: ["Meta Ads", "Canva", "Content Strategy"], desc: "Six ad creatives and copy variants for a festive campaign.", deliverables: "PNG creatives + copy sheet" },
    { id: "k7", title: "REST API for an inventory tool", client: "StockSmart", category: "Development", budget: 40000, deadline: now + 14 * DAY, entries: 6, mode: "public", skills: ["Node.js", "Python", "PostgreSQL"], desc: "CRUD API with auth, pagination and OpenAPI docs.", deliverables: "Repository, OpenAPI spec, Postman collection" },
  ];

  /** CreoTask Academy (pitch deck: "Freelancing Academy"). */
  const COURSES = [
    { id: "a1", title: "Building a portfolio that wins contests", kind: "Soft skills", mins: 25, xp: 40 },
    { id: "a2", title: "Pricing your services in India", kind: "Soft skills", mins: 18, xp: 30 },
    { id: "a3", title: "Figma fundamentals", kind: "Technical", mins: 45, xp: 60 },
    { id: "a4", title: "React in a weekend", kind: "Technical", mins: 90, xp: 80 },
    { id: "a5", title: "Client communication & negotiation", kind: "Soft skills", mins: 30, xp: 40 },
    { id: "a6", title: "SEO copywriting basics", kind: "Technical", mins: 35, xp: 50 },
  ];

  const CHALLENGES = [
    "Redesign a login screen in under 30 minutes and share a before/after.",
    "Write a 100-word pitch for your freelance services.",
    "Ship a tiny tool or script that automates something you do weekly.",
    "Sketch three logo concepts for a fictional coffee brand.",
    "Refactor one old project file and document what you improved.",
    "Record a 60-second video explaining your favourite skill.",
    "Write a case study outline for your best project.",
    "Build a responsive card component without any framework.",
    "Find and fix one accessibility issue in your portfolio.",
    "Draft a proposal template you can reuse for new clients.",
    "Learn one new keyboard shortcut in your main tool and use it 20 times.",
    "Give constructive feedback on another creator's work.",
  ];

  function tierFor(xp) {
    let t = TIERS[0];
    TIERS.forEach((x) => { if (xp >= x.minXp) t = x; });
    return t;
  }

  global.CreoData = { TIERS, CATEGORIES, CREATORS, CONTESTS, COURSES, CHALLENGES, tierFor };
})(window);
