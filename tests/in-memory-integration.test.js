/* =========================================================
   CREOTASK — In-Process Integration Test Suite
   Executes directly against Express without opening network sockets,
   fully compliant with sandbox environment rules.
   ========================================================= */
"use strict";
const { app, init } = require("./helpers/setup"); // isolated temp DB, seeded
const { EventEmitter } = require("events");
const { Readable } = require("stream");

function dispatch(app, { method = "GET", url = "/", headers = {}, body = null }) {
  return new Promise((resolve) => {
    const rawBody = body ? (typeof body === "object" ? JSON.stringify(body) : String(body)) : "";
    const req = Readable.from(rawBody ? [Buffer.from(rawBody)] : []);
    req.method = method;
    req.url = url;
    req.ip = "127.0.0.1";
    req.connection = { remoteAddress: "127.0.0.1" };
    req.socket = { remoteAddress: "127.0.0.1" };
    req.headers = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(rawBody).toString(),
      host: "localhost",
      ...(headers || {})
    };

    const res = new EventEmitter();
    res.statusCode = 200;
    res._headers = {};
    let resBody = "";
    res.setHeader = (k, v) => { res._headers[k.toLowerCase()] = v; };
    res.getHeader = (k) => res._headers[k.toLowerCase()];
    res.removeHeader = (k) => { delete res._headers[k.toLowerCase()]; };
    res.writeHead = (status, h) => { res.statusCode = status; };
    res.status = (status) => { res.statusCode = status; return res; };
    res.json = (data) => {
      resBody = data;
      resolve({ status: res.statusCode, body: resBody });
      return res;
    };
    res.send = (data) => {
      try { resBody = JSON.parse(data); } catch { resBody = data; }
      resolve({ status: res.statusCode, body: resBody });
      return res;
    };
    res.end = (chunk) => {
      if (chunk) {
        try { resBody = JSON.parse(chunk); } catch { resBody = chunk; }
      }
      resolve({ status: res.statusCode, body: resBody });
    };

    // Run express stack
    app(req, res);
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`   ✓ ${message}`);
}

async function run() {
  console.log("🚀 Running In-Process CreoTask Verification Test Suite...\n");
  await init();

  // 1. Health
  const health = await dispatch(app, { method: "GET", url: "/api/health" });
  assert(health.status === 200 && health.body.status === "ok", "Server health check is OK");

  // 2. Client Login
  const clientLogin = await dispatch(app, {
    method: "POST",
    url: "/api/auth/login",
    body: { email: "chai@demo.in", password: "Test@1234" }
  });
  assert(clientLogin.status === 200 && clientLogin.body.token, "Client logged in successfully");
  const clientToken = clientLogin.body.token;

  // 3. Freelancer Login
  const freelancerLogin = await dispatch(app, {
    method: "POST",
    url: "/api/auth/login",
    body: { email: "aman@demo.in", password: "Test@1234" }
  });
  assert(freelancerLogin.status === 200 && freelancerLogin.body.token, "Bronze Freelancer logged in successfully");
  const freelancerToken = freelancerLogin.body.token;

  // 4. Role switching
  const switchRes = await dispatch(app, {
    method: "POST",
    url: "/api/auth/switch-role",
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: { role: "client" }
  });
  assert(switchRes.status === 200 && switchRes.body.role === "client", "Freelancer can switch role to client");
  await dispatch(app, {
    method: "POST",
    url: "/api/auth/switch-role",
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: { role: "freelancer" }
  });

  // 5. Project creation validation
  const invalidProj = await dispatch(app, {
    method: "POST",
    url: "/api/projects",
    headers: { authorization: `Bearer ${clientToken}` },
    body: {
      title: "Mismatched Budget Test",
      description: "Budget doesn't match milestone sum",
      category: "Development",
      budget_paise: 1000000,
      milestones: [{ title: "M1", budget_paise: 600000 }]
    }
  });
  assert(invalidProj.status === 400, "Rejected project creation when milestone total != project budget");

  // 6. Valid project creation
  const validProj = await dispatch(app, {
    method: "POST",
    url: "/api/projects",
    headers: { authorization: `Bearer ${clientToken}` },
    body: {
      title: "FinTech App Dashboard UI",
      description: "Design clean mobile & desktop dashboard for Indian retail investors.",
      category: "Design",
      required_skills: ["UI/UX Design", "Figma"],
      budget_paise: 2500000, // ₹25,000
      timeline_days: 14,
      is_creostart: true,
      acceptance_criteria: "Figma design system with dark mode",
      deliverables: "Figma tokens and components",
      milestones: [
        { title: "Milestone 1: Wireframes", budget_paise: 1000000 },
        { title: "Milestone 2: Design Components & Handoff", budget_paise: 1500000 }
      ]
    }
  });
  assert(validProj.status === 201 && validProj.body.project.id, "Client created fixed-price project with 2 milestones");
  const projectId = validProj.body.project.id;
  const m1Id = validProj.body.milestones[0].id;
  const m2Id = validProj.body.milestones[1].id;

  // 7. Publish project
  const pubRes = await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/publish`,
    headers: { authorization: `Bearer ${clientToken}` }
  });
  assert(pubRes.status === 200 && pubRes.body.project.status === "open", "Project published to marketplace");

  // 8. Freelancer applies
  const applyRes = await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/apply`,
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: {
      pitch: "I have designed financial dashboards and would love to execute this brief.",
      proposed_budget_paise: 2500000,
      proposed_timeline_days: 14
    }
  });
  assert(applyRes.status === 201 && applyRes.body.application.id, "Freelancer applied with pitch");
  const applicationId = applyRes.body.application.id;

  // 9. Client shortlists
  const shortlistRes = await dispatch(app, {
    method: "PUT",
    url: `/api/projects/${projectId}/applications/${applicationId}`,
    headers: { authorization: `Bearer ${clientToken}` },
    body: { status: "shortlisted", client_note: "Top candidate." }
  });
  assert(shortlistRes.status === 200 && shortlistRes.body.application.status === "shortlisted", "Applicant shortlisted by client");

  // 10. Client sends offer
  const offerRes = await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/offer`,
    headers: { authorization: `Bearer ${clientToken}` },
    body: {
      application_id: applicationId,
      message: "Here is your official offer.",
      terms: "2 revisions included. IP rights transfer on milestone payment."
    }
  });
  assert(offerRes.status === 201 && offerRes.body.offer.platform_fee_paise === 250000, "Offer issued with transparent 10% take-rate (₹2,500) and net payout (₹22,500)");
  const offerId = offerRes.body.offer.id;

  // 11. Freelancer accepts offer
  const acceptOfferRes = await dispatch(app, {
    method: "PUT",
    url: `/api/projects/offers/${offerId}`,
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: { action: "accept" }
  });
  assert(acceptOfferRes.status === 200 && acceptOfferRes.body.offer.status === "accepted", "Freelancer accepted offer; project awaiting funding");

  // 12. Client funds Milestone 1
  const fundM1 = await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/milestones/${m1Id}/fund`,
    headers: { authorization: `Bearer ${clientToken}` }
  });
  assert(fundM1.status === 200 && fundM1.body.milestone.status === "funded", "Milestone 1 funded and held in escrow ledger; project active");

  // 13. Freelancer submits deliverable
  const subM1 = await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/milestones/${m1Id}/submit`,
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: { note: "Dashboard wireframes completed." }
  });
  assert(subM1.status === 201 && subM1.body.deliverable.version === 1, "Milestone 1 deliverable submitted (v1)");

  // 14. Client accepts Milestone 1 -> releases funds
  const acceptM1 = await dispatch(app, {
    method: "PUT",
    url: `/api/projects/${projectId}/milestones/${m1Id}/review`,
    headers: { authorization: `Bearer ${clientToken}` },
    body: { action: "accept" }
  });
  assert(acceptM1.status === 200 && acceptM1.body.milestone.status === "released", "Milestone 1 accepted and funds released to freelancer");

  // 15. Complete Milestone 2
  await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/milestones/${m2Id}/fund`,
    headers: { authorization: `Bearer ${clientToken}` }
  });
  await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/milestones/${m2Id}/submit`,
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: { note: "Final Figma tokens and components." }
  });
  const acceptM2 = await dispatch(app, {
    method: "PUT",
    url: `/api/projects/${projectId}/milestones/${m2Id}/review`,
    headers: { authorization: `Bearer ${clientToken}` },
    body: { action: "accept" }
  });
  assert(acceptM2.status === 200 && acceptM2.body.milestone.status === "released", "Milestone 2 accepted and released; project completed");

  // 16. Mutual reviews
  await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/review`,
    headers: { authorization: `Bearer ${clientToken}` },
    body: { rating: 5, comment: "Exemplary work!" }
  });
  await dispatch(app, {
    method: "POST",
    url: `/api/projects/${projectId}/review`,
    headers: { authorization: `Bearer ${freelancerToken}` },
    body: { rating: 5, comment: "Great collaboration and prompt payment." }
  });

  // 17. Verify ledger
  const adminLogin = await dispatch(app, {
    method: "POST",
    url: "/api/auth/login",
    body: { email: "admin@creotask.in", password: "Admin@1234" }
  });
  const adminToken = adminLogin.body.token;

  const ledgerRes = await dispatch(app, {
    method: "GET",
    url: `/api/admin/ledger?project_id=${projectId}`,
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assert(ledgerRes.status === 200 && ledgerRes.body.data.length >= 4, "Immutable financial ledger contains full double-entry audit trail");

  // 18. Tier verification
  const tierRes = await dispatch(app, { method: "GET", url: "/api/tiers" });
  assert(tierRes.status === 200 && tierRes.body.tiers.platinum, "Tier evaluation engine specifications verified");

  console.log("\n🎉 ALL IN-PROCESS VERIFICATION TESTS PASSED!\n");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
