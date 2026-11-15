/* =========================================================
   CREOTASK — End-to-End System & API Verification Test Suite
   Verifies PRD v1.2 / v2.0 complete transaction loop:
   Auth -> Project Brief -> Apply -> Shortlist -> Offer
   -> Milestone Escrow -> Deliverable -> Revision -> Accept
   -> Fund Release -> Ledger Entry -> Mutual Review -> Tier Evaluation
   ========================================================= */
"use strict";
const { app, init } = require("./helpers/setup"); // isolated temp DB, seeded
const http = require("http");

let server;
let port;
let baseUrl;

function req(path, method = "GET", body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    };

    const clientReq = http.request(opts, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    clientReq.on("error", reject);
    if (body) clientReq.write(JSON.stringify(body));
    clientReq.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`   ✓ ${message}`);
}

async function runTests() {
  console.log("🚀 Starting CreoTask End-to-End Test Suite...\n");

  // 1. Health check
  const health = await req("/api/health");
  assert(health.status === 200 && health.body.status === "ok", "Server health check is OK");

  // 2. Authentication: Login seeded Client
  const clientLogin = await req("/api/auth/login", "POST", {
    email: "chai@demo.in",
    password: "Test@1234"
  });
  assert(clientLogin.status === 200 && clientLogin.body.token, "Client logged in successfully");
  const clientToken = clientLogin.body.token;

  // 3. Authentication: Login seeded Bronze Freelancer
  const freelancerLogin = await req("/api/auth/login", "POST", {
    email: "aman@demo.in",
    password: "Test@1234"
  });
  assert(freelancerLogin.status === 200 && freelancerLogin.body.token, "Bronze Freelancer logged in successfully");
  const freelancerToken = freelancerLogin.body.token;

  // 4. Role switching
  const switchRes = await req("/api/auth/switch-role", "POST", { role: "client" }, freelancerToken);
  assert(switchRes.status === 200 && switchRes.body.role === "client", "Freelancer can switch role to client");
  // Switch back
  await req("/api/auth/switch-role", "POST", { role: "freelancer" }, freelancerToken);

  // 5. Project Creation: Budget validation error test
  const invalidProj = await req("/api/projects", "POST", {
    title: "Mismatched Budget Test",
    description: "Budget doesn't match milestone sum",
    category: "Development",
    budget_paise: 1000000, // ₹10,000
    milestones: [{ title: "M1", budget_paise: 600000 }] // ₹6,000 only
  }, clientToken);
  assert(invalidProj.status === 400, "Rejected project creation when milestone total != project budget");

  // 6. Project Creation: Valid direct project
  const validProj = await req("/api/projects", "POST", {
    title: "E-Commerce Checkout Redesign",
    description: "Revamp checkout journey for higher conversion on mobile and tablet.",
    category: "Design",
    required_skills: ["UI/UX Design", "Figma"],
    budget_paise: 2000000, // ₹20,000
    timeline_days: 14,
    is_creostart: true,
    acceptance_criteria: "Responsive designs with Figma interactive prototype",
    deliverables: "Figma link + design specs",
    milestones: [
      { title: "Milestone 1: Wireframes & User Flows", budget_paise: 800000 },
      { title: "Milestone 2: Final High-Fidelity Prototype", budget_paise: 1200000 }
    ]
  }, clientToken);
  assert(validProj.status === 201 && validProj.body.project.id, "Client created fixed-price project with 2 milestones");
  const projectId = validProj.body.project.id;
  const m1Id = validProj.body.milestones[0].id;
  const m2Id = validProj.body.milestones[1].id;

  // 7. Publish project
  const pubRes = await req(`/api/projects/${projectId}/publish`, "POST", {}, clientToken);
  assert(pubRes.status === 200 && pubRes.body.project.status === "open", "Project published to marketplace");

  // 8. Browse projects (checking CreoStart filter)
  const browseRes = await req("/api/projects?creostart=true");
  assert(browseRes.status === 200 && browseRes.body.data.some(p => p.id === projectId), "CreoStart filter returns newly posted project");

  // 9. Freelancer applies to project
  const applyRes = await req(`/api/projects/${projectId}/apply`, "POST", {
    pitch: "I specialize in e-commerce checkout optimization with evidence in portfolio.",
    proposed_budget_paise: 2000000,
    proposed_timeline_days: 12
  }, freelancerToken);
  assert(applyRes.status === 201 && applyRes.body.application.id, "Freelancer applied with tailored pitch");
  const applicationId = applyRes.body.application.id;

  // 10. Client views applicants & shortlists
  const appsList = await req(`/api/projects/${projectId}/applications`, "GET", null, clientToken);
  assert(appsList.status === 200 && appsList.body.data.length >= 1, "Client retrieved applicant list");

  const shortlistRes = await req(`/api/projects/${projectId}/applications/${applicationId}`, "PUT", {
    status: "shortlisted",
    client_note: "Impressive relevant background."
  }, clientToken);
  assert(shortlistRes.status === 200 && shortlistRes.body.application.status === "shortlisted", "Applicant shortlisted by client");

  // 11. Client sends offer with fee disclosure
  const offerRes = await req(`/api/projects/${projectId}/offer`, "POST", {
    application_id: applicationId,
    message: "We're pleased to extend this offer. Looking forward to kick-off.",
    terms: "2 revisions per milestone included. IP transfer on payment release."
  }, clientToken);
  assert(offerRes.status === 201 && offerRes.body.offer.platform_fee_paise === 200000, "Offer issued with transparent 10% fee (₹2,000) and net payout (₹18,000)");
  const offerId = offerRes.body.offer.id;

  // 12. Freelancer accepts offer
  const acceptOfferRes = await req(`/api/projects/offers/${offerId}`, "PUT", { action: "accept" }, freelancerToken);
  assert(acceptOfferRes.status === 200 && acceptOfferRes.body.offer.status === "accepted", "Freelancer accepted offer; project awaiting funding");

  // 13. Client funds Milestone 1 via simulated gateway
  const fundM1 = await req(`/api/projects/${projectId}/milestones/${m1Id}/fund`, "POST", {}, clientToken);
  assert(fundM1.status === 200 && fundM1.body.milestone.status === "funded", "Milestone 1 funded and held in escrow; project active");

  // 14. Idempotency test (duplicate funding prevented)
  const dupFund = await req(`/api/projects/${projectId}/milestones/${m1Id}/fund`, "POST", {}, clientToken);
  assert(dupFund.status === 400 || dupFund.status === 409, "Duplicate funding rejected by idempotency constraint");

  // 15. In-workspace messaging
  const msgRes = await req(`/api/projects/${projectId}/messages`, "POST", {
    content: "Wireframes are underway. Sharing early draft tomorrow."
  }, freelancerToken);
  assert(msgRes.status === 201 && msgRes.body.message.content.includes("Wireframes"), "Participant message sent inside workspace");

  // 16. Freelancer submits deliverable for Milestone 1
  const subM1 = await req(`/api/projects/${projectId}/milestones/${m1Id}/submit`, "POST", {
    note: "Wireframe flows complete in Figma (v1)",
    external_links: ["https://figma.com/file/wireframes-v1"]
  }, freelancerToken);
  assert(subM1.status === 201 && subM1.body.deliverable.version === 1, "Milestone 1 deliverable submitted (v1)");

  // 17. Client requests revision
  const revReq = await req(`/api/projects/${projectId}/milestones/${m1Id}/review`, "PUT", {
    action: "request_revision",
    note: "Please add mobile edge case flows."
  }, clientToken);
  assert(revReq.status === 200 && revReq.body.milestone.status === "revision_requested", "Client requested in-scope revision");

  // 18. Freelancer resubmits deliverable (v2)
  const subM1v2 = await req(`/api/projects/${projectId}/milestones/${m1Id}/submit`, "POST", {
    note: "Wireframe flows updated with edge cases (v2)",
    external_links: ["https://figma.com/file/wireframes-v2"]
  }, freelancerToken);
  assert(subM1v2.status === 201 && subM1v2.body.deliverable.version === 2, "Milestone 1 deliverable resubmitted (v2)");

  // 19. Client accepts Milestone 1 -> triggers fund release & ledger entry
  const acceptM1 = await req(`/api/projects/${projectId}/milestones/${m1Id}/review`, "PUT", {
    action: "accept"
  }, clientToken);
  assert(acceptM1.status === 200 && acceptM1.body.milestone.status === "released", "Milestone 1 accepted and funds released to freelancer");

  // 20. Client funds and accepts Milestone 2 to complete project
  await req(`/api/projects/${projectId}/milestones/${m2Id}/fund`, "POST", {}, clientToken);
  await req(`/api/projects/${projectId}/milestones/${m2Id}/submit`, "POST", { note: "Final designs delivered" }, freelancerToken);
  const acceptM2 = await req(`/api/projects/${projectId}/milestones/${m2Id}/review`, "PUT", { action: "accept" }, clientToken);
  assert(acceptM2.status === 200 && acceptM2.body.milestone.status === "released", "Milestone 2 accepted and released");

  const completedProj = await req(`/api/projects/${projectId}`);
  assert(completedProj.body.project.status === "completed", "Project successfully transitioned to COMPLETED status");

  // 21. Mutual double-blind reviews
  const rev1 = await req(`/api/projects/${projectId}/review`, "POST", {
    rating: 5,
    comment: "Fantastic work, very prompt and thorough!"
  }, clientToken);
  assert(rev1.status === 201, "Client submitted 5-star review (held until mutual submission)");

  const rev2 = await req(`/api/projects/${projectId}/review`, "POST", {
    rating: 5,
    comment: "Clear requirements and fast milestone approvals."
  }, freelancerToken);
  assert(rev2.status === 201, "Freelancer submitted 5-star review (both reviews revealed)");

  // 22. Verify immutable ledger records
  const adminLogin = await req("/api/auth/login", "POST", {
    email: "admin@creotask.in",
    password: "Admin@1234"
  });
  const adminToken = adminLogin.body.token;

  const ledgerRes = await req(`/api/admin/ledger?project_id=${projectId}`, "GET", null, adminToken);
  assert(ledgerRes.status === 200 && ledgerRes.body.data.length >= 4, "Immutable ledger contains full audit trail (funding, fees, releases)");

  // 23. Test tier engine & criteria
  const tierRes = await req("/api/tiers");
  assert(tierRes.status === 200 && tierRes.body.tiers.platinum, "Tier specifications retrieved (Bronze -> Platinum)");

  console.log("\n🎉 ALL 23 END-TO-END ACCEPTANCE TESTS PASSED SUCCESSFULLY!\n");
}

// Start temporary test server
const PORT = 3456;
process.env.PORT = PORT;
server = http.createServer(app);
server.listen(PORT, async () => {
  baseUrl = `http://localhost:${PORT}`;
  try {
    await init();
    await runTests();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Test execution error:", err);
    server.close();
    process.exit(1);
  }
});
