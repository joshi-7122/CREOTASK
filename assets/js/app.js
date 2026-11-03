/* =========================================================
   Signed-in app: hash router + views
   #home · #explore · #contests · #academy · #contact · #pro
   ========================================================= */
(function () {
  "use strict";

  const D = CreoData;
  const esc = UI.esc;
  const $ = (id) => document.getElementById(id);
  const view = $("view");
  let me = Store.current();
  if (!me) return;

  const XP = { join: 10, submit: 30, host: 25 };
  const DAY = 864e5;
  const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const firstName = (n) => (n || "").split(" ")[0] || "there";

  /* ---------- Helpers ---------- */
  function commit(fn, msg) {
    try { me = Store.update(fn); } catch (e) { UI.toast(e.message, "error"); return false; }
    renderHeader();
    if (msg) UI.toast(msg, "success");
    return true;
  }

  function allContests() {
    const mine = (me.hosted || []).map((c) => ({ ...c, client: me.name, mine: true }));
    return [...mine, ...D.CONTESTS];
  }

  /** "AI job matching" placeholder: overlap between my skills and the contest's. */
  function matchScore(c) {
    const mineSkills = new Set(me.skills.map((s) => s.name.toLowerCase()));
    if (!mineSkills.size || !c.skills.length) return 0;
    const hit = c.skills.filter((s) => mineSkills.has(s.toLowerCase())).length;
    return Math.round((hit / c.skills.length) * 100);
  }

  function timeLeft(ts) {
    const ms = ts - Date.now();
    if (ms <= 0) return "Closed";
    const d = Math.floor(ms / DAY);
    const h = Math.floor((ms % DAY) / 36e5);
    return d ? `${d}d ${h}h left` : `${h}h left`;
  }

  function canEnter(c) {
    return c.mode === "public" || me.xp >= D.TIERS[2].minXp || me.plan === "pro";
  }

  /* ---------- Header ---------- */
  function renderHeader() {
    const into = me.xp % Store.XP_PER_LEVEL;
    $("xpAvatar").innerHTML = me.avatar ? `<img src="${esc(me.avatar)}" alt="">` : esc(UI.initials(me.name));
    $("xpLevel").textContent = Store.level(me.xp);
    $("xpText").textContent = `${into} / ${Store.XP_PER_LEVEL}`;
    $("xpBar").style.width = Math.round((into / Store.XP_PER_LEVEL) * 100) + "%";
    const t = D.tierFor(me.xp);
    $("xpTier").textContent = t.name + (me.plan === "pro" ? " · Pro" : "");
    $("xpTier").style.color = t.color;
  }

  /* ---------- Views ---------- */
  function contestCard(c) {
    const st = me.contests[c.id];
    const m = matchScore(c);
    return `<button class="tile contest" data-contest="${esc(c.id)}">
      <div class="contest__top">
        <span class="pill">${esc(c.category)}</span>
        ${c.mode === "private" ? `<span class="pill pill--private">🔒 Private</span>` : c.mine ? `<span class="pill pill--gold">Hosted by you</span>` : ""}
      </div>
      <div><h3>${esc(c.title)}</h3><div class="contest__client">by ${esc(c.client)}</div></div>
      ${st ? `<span class="status ${st.submittedAt ? "status--submitted" : "status--joined"}">${st.submittedAt ? "✓ Entry submitted" : "● Joined, entry pending"}</span>` : m ? `<span class="match">${m}% skill match</span>` : ""}
      <div class="contest__meta">
        <div class="prize">${inr(c.budget)}<small>prize</small></div>
        <div class="deadline"><b>${timeLeft(c.deadline)}</b><br>${c.entries + (st && st.submittedAt ? 1 : 0)} entries</div>
      </div>
    </button>`;
  }

  function viewHome() {
    const tier = D.tierFor(me.xp);
    const next = D.TIERS[D.TIERS.indexOf(tier) + 1];
    const pct = next ? Math.round(((me.xp - tier.minXp) / (next.minXp - tier.minXp)) * 100) : 100;
    const joined = Object.keys(me.contests).length;
    const wins = 0;
    const recommended = allContests().filter((c) => c.deadline > Date.now())
      .map((c) => ({ c, m: matchScore(c) }))
      .sort((a, b) => b.m - a.m || a.c.deadline - b.c.deadline)
      .slice(0, 3).map((x) => x.c);
    const challengeDone = me.challengeDoneOn === Store.today();
    const isClient = me.role === "client";

    return `
      <section class="hello">
        <div class="tile hello__main">
          <svg class="hello__mark" aria-hidden="true"><use href="#logo"/></svg>
          <h1>Welcome back, ${esc(firstName(me.name))}</h1>
          <p>${isClient ? "Post a contest and let the best work win, not the cheapest bid." : "Compete on real client briefs, level up, and get seen."}</p>
          <div class="tier-progress">
            <div class="tier-badge" style="background:${tier.color}">${tier.name[0]}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;font-size:13px"><b>${tier.name} tier</b>
                <small>${next ? `${(next.minXp - me.xp).toLocaleString()} XP to ${next.name}` : "Top tier reached"}</small></div>
              <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${pct}%"></div></div>
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
            ${isClient
              ? `<button class="btn btn--gold" data-host>Host a contest</button><a class="btn" href="#explore">Find freelancers</a>`
              : `<a class="btn btn--light" href="#contests">Browse contests</a><a class="btn" href="dashboard.html">My profile</a>`}
          </div>
        </div>
        <div class="hello__side">
          <div class="stat-row">
            <div class="tile stat-box"><b>${me.xp.toLocaleString()}</b><span>Total XP</span></div>
            <div class="tile stat-box"><b>${joined}</b><span>Contests</span></div>
            <div class="tile stat-box"><b>${wins}</b><span>Wins</span></div>
          </div>
          <div class="tile challenge-mini">
            <div><b>Daily Challenge ⚡</b><p>${challengeDone ? "Done for today. Nice work!" : "A new challenge is waiting. Earn +100 XP."}</p></div>
            <a class="btn btn--sm ${challengeDone ? "" : "btn--light"}" href="dashboard.html">${challengeDone ? "View" : "Start"}</a>
          </div>
        </div>
      </section>

      <h2 class="section-title">Recommended for you <a href="#contests">See all contests →</a></h2>
      ${me.skills.length ? "" : `<p class="muted" style="margin:-6px 0 14px;font-size:13px">Tip: <a href="dashboard.html" style="color:var(--brand)">add skills to your profile</a> to get better matches.</p>`}
      <div class="grid grid--3">${recommended.map(contestCard).join("")}</div>

      <h2 class="section-title">Newsfeed</h2>
      <div class="tile">
        <ul class="feed">
          <li><span class="feed__icon">🎙️</span><div><h4>Webinar: Pricing your services effectively</h4><p>Live Q&amp;A with industry experts · Saturday, 6 PM IST</p></div></li>
          <li><span class="feed__icon">🏆</span><div><h4>${esc(D.CONTESTS[0].title)}</h4><p>New ${esc(D.CONTESTS[0].category.toLowerCase())} contest · ${inr(D.CONTESTS[0].budget)} prize</p></div></li>
          <li><span class="feed__icon">🎓</span><div><h4>New in Academy: ${esc(D.COURSES[0].title)}</h4><p>${D.COURSES[0].mins} min · +${D.COURSES[0].xp} XP</p></div></li>
          <li><span class="feed__icon">✨</span><div><h4>Leaderboard resets monthly</h4><p>Climb the ranks to be featured on Explore</p></div></li>
        </ul>
      </div>`;
  }

  const contestFilter = { cat: "All", mode: "all", q: "" };
  function viewContests() {
    return `
      <div class="view-head">
        <div><h1 class="view-title">Contests</h1><p class="view-sub">Only the best work wins, not the cheapest offer.</p></div>
        <button class="btn btn--gold" data-host>Host a contest</button>
      </div>
      <div class="filters">
        <input class="input" id="cq" type="search" placeholder="Search contests" value="${esc(contestFilter.q)}" aria-label="Search contests" />
        <select class="select" id="cmode" aria-label="Contest mode">
          <option value="all">All modes</option><option value="public">Public</option><option value="private">Private</option><option value="mine">Joined by me</option>
        </select>
      </div>
      <div class="chips" role="group" aria-label="Category">
        ${["All", ...D.CATEGORIES].map((c) => `<button class="chip-btn" data-cat="${c}" aria-pressed="${contestFilter.cat === c}">${c}</button>`).join("")}
      </div>
      <div class="grid grid--3" id="contestGrid"></div>`;
  }
  function fillContests() {
    const q = contestFilter.q.toLowerCase();
    const list = allContests().filter((c) =>
      (contestFilter.cat === "All" || c.category === contestFilter.cat) &&
      (contestFilter.mode === "all" || (contestFilter.mode === "mine" ? me.contests[c.id] : c.mode === contestFilter.mode)) &&
      (!q || (c.title + " " + c.client + " " + c.skills.join(" ")).toLowerCase().includes(q)));
    $("contestGrid").innerHTML = list.length ? list.map(contestCard).join("") : `<p class="empty-note">No contests match these filters.</p>`;
  }

  const exploreFilter = { q: "", skill: "", avail: false, rating: 0, sort: "xp", shortlist: false };
  function viewExplore() {
    const skills = [...new Set(D.CREATORS.flatMap((c) => c.skills))].sort();
    return `
      <div class="view-head">
        <div><h1 class="view-title">Explore talent</h1><p class="view-sub">Search freelancers by skill, location, availability and rating.</p></div>
        <button class="btn ${exploreFilter.shortlist ? "is-on" : ""}" id="showShortlist">★ Shortlist (${me.shortlist.length})</button>
      </div>
      <div class="filters">
        <input class="input" id="eq" type="search" placeholder="Name, skill or city" value="${esc(exploreFilter.q)}" aria-label="Search freelancers" />
        <select class="select" id="eskill" aria-label="Skill"><option value="">All skills</option>${skills.map((s) => `<option ${exploreFilter.skill === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <select class="select" id="erating" aria-label="Minimum rating">
          <option value="0">Any rating</option><option value="4.5">4.5+ ★</option><option value="4.8">4.8+ ★</option>
        </select>
        <select class="select" id="esort" aria-label="Sort by"><option value="xp">Top ranked</option><option value="rating">Highest rated</option><option value="reviews">Most reviewed</option></select>
        <label class="btn" style="flex:none"><input type="checkbox" id="eavail" ${exploreFilter.avail ? "checked" : ""} /> Available now</label>
      </div>
      <div class="grid grid--4" id="creatorGrid"></div>`;
  }
  function fillExplore() {
    const f = exploreFilter, q = f.q.toLowerCase();
    const list = D.CREATORS.filter((c) =>
      (!q || [c.name, c.city, c.title, ...c.skills].join(" ").toLowerCase().includes(q)) &&
      (!f.skill || c.skills.includes(f.skill)) &&
      (!f.avail || c.available) && c.rating >= f.rating &&
      (!f.shortlist || me.shortlist.includes(c.id)))
      .sort((a, b) => b[f.sort] - a[f.sort]);
    const isClient = me.role === "client";
    $("creatorGrid").innerHTML = list.length ? list.map((c) => {
      const t = D.tierFor(c.xp);
      const on = me.shortlist.includes(c.id);
      return `<article class="tile creator">
        <div class="creator__head">
          <span class="creator__avatar" style="border-color:${t.color}">${esc(UI.initials(c.name))}</span>
          <div><h3>${esc(c.name)}</h3><div class="creator__title">${esc(c.title)}</div></div>
        </div>
        <div class="creator__line">
          <span><span class="dot ${c.available ? "dot--on" : ""}"></span> ${c.available ? "Open to work" : "Busy"}</span>
          <span>📍 ${esc(c.city)}</span>
          <span class="rating">★ ${c.rating ? c.rating.toFixed(1) : "New"}</span>
          <span style="color:${t.color}">${t.name}</span>
        </div>
        <div class="creator__skills">${c.skills.map((s) => `<span class="pill ${c.verified.includes(s) ? "pill--gold" : ""}">${c.verified.includes(s) ? "✓ " : ""}${esc(s)}</span>`).join("")}</div>
        <div class="creator__actions">
          <button class="btn btn--sm ${on ? "is-on" : ""}" data-shortlist="${c.id}" aria-pressed="${on}">${on ? "★ Shortlisted" : "☆ Shortlist"}</button>
          <button class="btn btn--sm ${isClient ? "btn--light" : ""}" data-invite="${c.id}">${isClient ? "Invite" : "Message"}</button>
        </div>
      </article>`;
    }).join("") : `<p class="empty-note">${f.shortlist ? "Your shortlist is empty. Tap ☆ on a freelancer to save them." : "No freelancers match these filters."}</p>`;
  }

  function viewAcademy() {
    return `
      <div class="view-head"><div><h1 class="view-title">CreoTask Academy</h1><p class="view-sub">Courses that turn beginners into contest winners. Each one earns XP.</p></div>
        <span class="pill pill--gold">${me.courses.length} / ${D.COURSES.length} completed</span></div>
      <div class="grid grid--3">${D.COURSES.map((c) => {
        const done = me.courses.includes(c.id);
        return `<article class="tile course">
          <div class="course__meta"><span class="pill">${esc(c.kind)}</span><span class="pill">⏱ ${c.mins} min</span><span class="pill pill--gold">+${c.xp} XP</span></div>
          <h3>${esc(c.title)}</h3>
          <button class="btn btn--sm ${done ? "" : "btn--light"}" data-course="${c.id}" ${done ? "disabled" : ""}>${done ? "✓ Completed" : "Start course"}</button>
        </article>`;
      }).join("")}</div>
      <h2 class="section-title">Upcoming webinars</h2>
      <div class="grid grid--3">
        <div class="tile"><b>Building a professional portfolio</b><p class="muted" style="margin:4px 0 0;font-size:13px">Live Q&amp;A · Saturday, 6 PM IST</p></div>
        <div class="tile"><b>Pricing services effectively</b><p class="muted" style="margin:4px 0 0;font-size:13px">Live Q&amp;A · Next Wednesday, 7 PM IST</p></div>
        <div class="tile"><b>Trends in freelancing for 2027</b><p class="muted" style="margin:4px 0 0;font-size:13px">Panel · Coming soon</p></div>
      </div>`;
  }

  function viewContact() {
    const faqs = [
      ["How do contests work?", "Clients post a brief with a budget and deadline. Freelancers submit entries, and the client picks a winner. The winner is paid automatically from escrow."],
      ["What are tiers?", "Everyone starts at Bronze. Earning XP from contests, challenges and courses moves you to Silver, Gold and Platinum, and each tier unlocks perks such as private contests."],
      ["How do I get paid?", "Winnings land in your CreoTask wallet. You can withdraw via UPI, Stripe or PayPal."],
      ["Can I get a refund as a client?", "Yes. If a contest is cancelled, or a dispute is resolved in your favour, the escrowed amount is refunded."],
      ["How do I verify a skill?", "Take a platform skill test or upload a certificate. Verified skills show a gold ✓ on your profile."],
    ];
    return `
      <div class="view-head"><div><h1 class="view-title">Contact us</h1><p class="view-sub">We usually reply within 24 hours.</p></div></div>
      <div class="contact">
        <div class="tile">
          <h2 style="margin:0 0 14px;font-size:18px">Raise a support ticket</h2>
          <form class="stack" id="ticketForm">
            <div class="row-2">
              <label><span class="label">Topic</span><select class="select" name="topic"><option>Account &amp; login</option><option>Contests</option><option>Payments &amp; wallet</option><option>Report a user</option><option>Other</option></select></label>
              <label><span class="label">Priority</span><select class="select" name="priority"><option>Normal</option><option>High</option><option>Urgent</option></select></label>
            </div>
            <label><span class="label">Subject</span><input class="input" name="subject" maxlength="100" required /></label>
            <label><span class="label">Message</span><textarea class="textarea" name="message" maxlength="1000" required></textarea></label>
            <button class="btn btn--light" type="submit">Submit ticket</button>
          </form>
          <h3 style="margin:22px 0 10px;font-size:15px">Your tickets</h3>
          <div id="ticketList">${me.tickets.length ? me.tickets.map((t) => `
            <div class="ticket"><span><b>${esc(t.id)}</b> · ${esc(t.subject)}<br><span class="muted">${esc(t.topic)} · ${esc(t.priority)}</span></span><span class="pill pill--green">${esc(t.status)}</span></div>`).join("") : `<p class="muted" style="font-size:13px;margin:0">No tickets yet.</p>`}</div>
        </div>
        <div class="tile faq">
          <h2 style="margin:0 0 6px;font-size:18px">Frequently asked</h2>
          ${faqs.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}
        </div>
      </div>`;
  }

  function viewPro() {
    const cur = D.tierFor(me.xp);
    const pro = me.plan === "pro";
    return `
      <div class="view-head"><div><h1 class="view-title">Creotask Pro</h1><p class="view-sub">Climb the tiers by earning XP, or go Pro to unlock perks today.</p></div></div>
      <div class="tiers">${D.TIERS.map((t) => `
        <div class="tile tier ${t === cur ? "is-current" : ""}">
          ${t === cur ? `<span class="pill pill--gold">You</span>` : ""}
          <div class="tier-badge" style="background:${t.color}">${t.name[0]}</div>
          <h3 style="color:${t.color}">${t.name.toUpperCase()}</h3>
          <span class="muted" style="font-size:12px">${t.minXp ? t.minXp.toLocaleString() + "+ XP" : "Starting tier"}</span>
          <ul>${t.perks.map((p) => `<li>${p}</li>`).join("")}</ul>
        </div>`).join("")}
      </div>
      <div class="plans">
        <div class="tile plan">
          <h3>Free</h3><div class="price">₹0 <small>/ month</small></div>
          <ul><li>Public contests</li><li>Daily challenges &amp; Academy basics</li><li>Standard platform fee</li></ul>
          <button class="btn btn--block" ${pro ? "" : "disabled"} data-plan="free">${pro ? "Switch to Free" : "Current plan"}</button>
        </div>
        <div class="tile plan plan--pro">
          <h3>Creotask Pro ✦</h3><div class="price">₹499 <small>/ month</small></div>
          <ul><li>Enter private contests at any tier</li><li>Priority AI job matching</li><li>Full Academy and live webinars</li><li>Reduced platform fee and Pro badge</li></ul>
          <button class="btn btn--gold btn--block" ${pro ? "disabled" : ""} data-plan="pro">${pro ? "✓ You're Pro" : "Upgrade to Pro"}</button>
        </div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:12px">Demo: upgrading doesn't charge anything. Payments (UPI, Stripe, PayPal) arrive with the backend.</p>`;
  }

  /* ---------- Contest detail ---------- */
  const contestModal = $("contestModal");
  let pendingFiles = [];
  function openContest(id) {
    const c = allContests().find((x) => x.id === id);
    if (!c) return;
    pendingFiles = [];
    renderContest(c);
    UI.openModal(contestModal);
  }
  function renderContest(c) {
    const st = me.contests[c.id];
    const closed = c.deadline <= Date.now();
    let action;
    if (c.mine) action = `<p class="muted">You're hosting this contest. Submissions will show here once the backend is connected.</p>`;
    else if (closed) action = `<p class="muted">This contest has closed.</p>`;
    else if (!canEnter(c)) action = `<p class="muted">🔒 Private contests are invite-only. Reach <b style="color:${D.TIERS[2].color}">Gold</b> tier or <a href="#pro" data-close style="color:var(--brand)">go Pro</a> to enter.</p>`;
    else if (!st) action = `<button class="btn btn--light btn--block" id="joinBtn">Join contest · +${XP.join} XP</button>`;
    else if (st.submittedAt) action = `<p style="color:var(--success)">✓ Entry submitted ${new Date(st.submittedAt).toLocaleDateString()}</p><ul class="file-list">${st.files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
    else action = `
      <h4>Submit your entry</h4>
      <label class="dropzone" id="drop">
        <input type="file" multiple hidden id="fileInput" accept="image/*,video/*,.pdf,.zip,.fig,.psd,.ai,.svg,.doc,.docx" />
        <b>Drop files here or click to upload</b><span>Images, PDFs, videos, archives (up to 10 files)</span>
      </label>
      <ul class="file-list" id="fileList"></ul>
      <button class="btn btn--gold btn--block" id="submitEntry" style="margin-top:12px" disabled>Submit entry · +${XP.submit} XP</button>`;

    $("contestDetail").innerHTML = `<div class="detail">
      <div style="display:flex;gap:6px;margin-bottom:8px"><span class="pill">${esc(c.category)}</span>${c.mode === "private" ? `<span class="pill pill--private">🔒 Private</span>` : `<span class="pill">Public</span>`}</div>
      <h2 id="cmTitle">${esc(c.title)}</h2><div class="muted">by ${esc(c.client)}</div>
      <dl><div><dt>Prize</dt><dd style="color:var(--brand)">${inr(c.budget)}</dd></div><div><dt>Deadline</dt><dd>${timeLeft(c.deadline)}</dd></div><div><dt>Entries</dt><dd>${c.entries + (st && st.submittedAt ? 1 : 0)}</dd></div></dl>
      <h4>Brief</h4><p>${esc(c.desc)}</p>
      ${c.deliverables ? `<h4>Deliverables</h4><p>${esc(c.deliverables)}</p>` : ""}
      ${c.skills.length ? `<h4>Skills</h4><div class="creator__skills">${c.skills.map((s) => `<span class="pill">${esc(s)}</span>`).join("")}</div>` : ""}
      <div style="margin-top:20px">${action}</div>
    </div>`;

    const join = $("joinBtn");
    if (join) join.onclick = () => {
      if (commit((p) => { p.contests[c.id] = { joinedAt: Date.now(), files: [] }; Store.award(p, XP.join, `Joined “${c.title}”`); }, `Joined · +${XP.join} XP`)) renderContest(c);
    };
    const input = $("fileInput");
    if (input) {
      const drop = $("drop");
      const add = (files) => {
        pendingFiles = [...pendingFiles, ...[...files].map((f) => f.name)].slice(0, 10);
        $("fileList").innerHTML = pendingFiles.map((n, i) => `<li>${esc(n)} <button class="remove" data-rmfile="${i}" aria-label="Remove ${esc(n)}">&times;</button></li>`).join("");
        $("submitEntry").disabled = !pendingFiles.length;
      };
      input.onchange = () => { add(input.files); input.value = ""; };
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
      drop.addEventListener("drop", (e) => { e.preventDefault(); add(e.dataTransfer.files); });
      $("fileList").onclick = (e) => {
        const b = e.target.closest("[data-rmfile]");
        if (b) { pendingFiles.splice(+b.dataset.rmfile, 1); add([]); }
      };
      $("submitEntry").onclick = () => {
        const files = pendingFiles.slice();
        if (commit((p) => {
          p.contests[c.id] = { ...p.contests[c.id], files, submittedAt: Date.now() };
          Store.award(p, XP.submit, `Submitted an entry to “${c.title}”`);
        }, `Entry submitted · +${XP.submit} XP`)) { renderContest(c); route(); }
      };
    }
  }

  /* ---------- Host a contest ---------- */
  const hostModal = $("hostModal");
  $("hostCategory").innerHTML = D.CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  function openHost() {
    const f = $("hostForm");
    f.reset();
    const min = new Date(Date.now() + DAY);
    f.deadline.min = Store.localDate(min);
    f.deadline.value = Store.localDate(new Date(Date.now() + 7 * DAY));
    $("hostError").textContent = "";
    UI.openModal(hostModal);
  }
  $("hostForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const budget = Number(f.budget.value);
    const deadline = new Date(f.deadline.value + "T23:59:59").getTime();
    if (!f.title.value.trim() || !f.desc.value.trim()) { $("hostError").textContent = "Add a title and a description."; return; }
    if (!(budget >= 500)) { $("hostError").textContent = "The budget must be at least ₹500."; return; }
    if (!(deadline > Date.now())) { $("hostError").textContent = "Pick a deadline in the future."; return; }
    const c = {
      id: "h" + Date.now().toString(36), title: f.title.value.trim(), category: f.category.value, mode: f.mode.value,
      desc: f.desc.value.trim(), deliverables: f.deliverables.value.trim(), budget, deadline, entries: 0,
      skills: f.skills.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6),
    };
    if (commit((p) => { p.hosted.unshift(c); Store.award(p, XP.host, `Hosted “${c.title}”`); }, `Contest published · +${XP.host} XP`)) {
      UI.closeModal(hostModal);
      location.hash = "#contests";
      route();
    }
  });

  /* ---------- Router ---------- */
  const ROUTES = {
    home: { render: viewHome, title: "Home" },
    explore: { render: viewExplore, after: fillExplore, title: "Explore" },
    contests: { render: viewContests, after: fillContests, title: "Contests" },
    academy: { render: viewAcademy, title: "Academy" },
    contact: { render: viewContact, title: "Contact us" },
    pro: { render: viewPro, title: "Creotask Pro" },
  };
  let current = null;
  function route() {
    const name = (location.hash.slice(1) || "home").split("/")[0];
    const r = ROUTES[name] || ROUTES.home;
    const key = ROUTES[name] ? name : "home";
    view.innerHTML = r.render();
    if (r.after) r.after();
    document.title = `${r.title} · CREOTASK`;
    document.querySelectorAll("[data-route]").forEach((el) => {
      const on = el.dataset.route.split(" ").includes(key);
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    if (current !== key) { window.scrollTo(0, 0); current = key; }
    // restore filter controls
    if (key === "contests") $("cmode").value = contestFilter.mode;
    if (key === "explore") { $("erating").value = String(exploreFilter.rating); $("esort").value = exploreFilter.sort; }
  }
  window.addEventListener("hashchange", () => { closeMenus(); route(); });

  /* ---------- Events ---------- */
  function closeMenus() {
    document.querySelectorAll(".dock__menu.is-open").forEach((m) => m.classList.remove("is-open"));
    document.querySelectorAll("[data-menu]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }
  document.querySelectorAll("[data-menu]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = $("menu-" + btn.dataset.menu);
      const open = !menu.classList.contains("is-open");
      closeMenus();
      menu.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open);
      if (open) menu.querySelector("a").focus();
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dock__group")) closeMenus();
    const t = e.target;
    const card = t.closest("[data-contest]");
    if (card) openContest(card.dataset.contest);
    if (t.closest("[data-host]")) openHost();
    const cat = t.closest("[data-cat]");
    if (cat) { contestFilter.cat = cat.dataset.cat; document.querySelectorAll("[data-cat]").forEach((b) => b.setAttribute("aria-pressed", b === cat)); fillContests(); }
    const sl = t.closest("[data-shortlist]");
    if (sl) {
      const id = sl.dataset.shortlist;
      commit((p) => { p.shortlist = p.shortlist.includes(id) ? p.shortlist.filter((x) => x !== id) : [...p.shortlist, id]; });
      fillExplore();
      $("showShortlist").textContent = `★ Shortlist (${me.shortlist.length})`;
    }
    if (t.closest("#showShortlist")) { exploreFilter.shortlist = !exploreFilter.shortlist; route(); }
    const inv = t.closest("[data-invite]");
    if (inv) {
      const c = D.CREATORS.find((x) => x.id === inv.dataset.invite);
      UI.toast(me.role === "client" ? `Invitation sent to ${c.name}` : `Messaging opens with the backend. ${c.name} is saved to your shortlist.`);
      if (me.role !== "client" && !me.shortlist.includes(c.id)) { commit((p) => p.shortlist.push(c.id)); fillExplore(); $("showShortlist").textContent = `★ Shortlist (${me.shortlist.length})`; }
    }
    const course = t.closest("[data-course]");
    if (course) {
      const c = D.COURSES.find((x) => x.id === course.dataset.course);
      if (c && !me.courses.includes(c.id) && commit((p) => { p.courses.push(c.id); Store.award(p, c.xp, `Completed “${c.title}”`); }, `Course complete · +${c.xp} XP`)) route();
    }
    const plan = t.closest("[data-plan]");
    if (plan && commit((p) => { p.plan = plan.dataset.plan; Store.log(p, plan.dataset.plan === "pro" ? "Upgraded to Creotask Pro" : "Switched to the Free plan"); }, plan.dataset.plan === "pro" ? "Welcome to Creotask Pro ✦" : "You're on the Free plan")) route();
  });

  document.addEventListener("input", (e) => {
    const id = e.target.id;
    if (id === "cq") { contestFilter.q = e.target.value; fillContests(); }
    if (id === "eq") { exploreFilter.q = e.target.value; fillExplore(); }
  });
  document.addEventListener("change", (e) => {
    const id = e.target.id;
    if (id === "cmode") { contestFilter.mode = e.target.value; fillContests(); }
    if (id === "eskill") { exploreFilter.skill = e.target.value; fillExplore(); }
    if (id === "erating") { exploreFilter.rating = Number(e.target.value); fillExplore(); }
    if (id === "esort") { exploreFilter.sort = e.target.value; fillExplore(); }
    if (id === "eavail") { exploreFilter.avail = e.target.checked; fillExplore(); }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "ticketForm") return;
    e.preventDefault();
    const f = e.target;
    const t = { id: "#CT-" + Math.floor(1000 + Math.random() * 9000), topic: f.topic.value, priority: f.priority.value, subject: f.subject.value.trim(), message: f.message.value.trim(), status: "Open", at: Date.now() };
    if (!t.subject || !t.message) return;
    if (commit((p) => { p.tickets.unshift(t); Store.log(p, `Opened ticket ${t.id}`); }, `Ticket ${t.id} created. We'll reply by email.`)) route();
  });

  UI.bindModals();
  renderHeader();
  route();
})();
