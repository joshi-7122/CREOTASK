/* =========================================================
   Dashboard — profile, portfolio, skill tree, analytics,
   daily challenge, badges and leaderboard.
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = UI.esc;
  let me = Store.current();
  if (!me) return; // guard in <head> already redirects

  /* ---------- Static content ---------- */
  const XP = { project: 50, skill: 20, challenge: 100 };
  const SKILL_LEVELS = ["", "Beginner", "Novice", "Intermediate", "Advanced", "Expert"];

  const CHALLENGES = CreoData.CHALLENGES;


  const ACHIEVEMENTS = [
    { id: "first-project", icon: "🎨", name: "First Project", desc: "Add your first portfolio item", test: (p) => p.portfolio.length >= 1 },
    { id: "curator", icon: "🖼️", name: "Curator", desc: "Showcase 5 projects", test: (p) => p.portfolio.length >= 5 },
    { id: "first-skill", icon: "🌱", name: "Skill Seeker", desc: "Add your first skill", test: (p) => p.skills.length >= 1 },
    { id: "skill-builder", icon: "🌳", name: "Skill Builder", desc: "Grow a skill tree of 5", test: (p) => p.skills.length >= 5 },
    { id: "master", icon: "🧠", name: "Master", desc: "Reach Expert in a skill", test: (p) => p.skills.some((s) => s.level >= 5) },
    { id: "challenger", icon: "⚡", name: "Challenger", desc: "Complete a daily challenge", test: (p) => (p.challengeDates || []).length >= 1 },
    { id: "on-fire", icon: "🔥", name: "On Fire", desc: "3-day challenge streak", test: (p) => streak(p) >= 3 },
    { id: "contender", icon: "🎯", name: "Contender", desc: "Submit your first contest entry", test: (p) => Object.values(p.contests || {}).some((c) => c.submittedAt) },
    { id: "scholar", icon: "🎓", name: "Scholar", desc: "Finish an Academy course", test: (p) => (p.courses || []).length >= 1 },
    { id: "intro", icon: "👋", name: "Introduce Yourself", desc: "Add a photo and an About", test: (p) => !!(p.avatar && p.about) },
    { id: "rising-star", icon: "⭐", name: "Rising Star", desc: "Reach level 3", test: (p) => Store.level(p.xp) >= 3 },
    { id: "top-10", icon: "🏆", name: "Top 10", desc: "Enter the top 10 leaderboard", test: (p) => rankOf(p) <= 10 },
  ];

  /* ---------- Derived data ---------- */
  function leaderboard(p) {
    const rows = CreoData.CREATORS.map((c) => ({ name: c.name, city: c.city, xp: c.xp }));
    rows.push({ name: p.name, city: p.location, xp: p.xp, avatar: p.avatar, me: true });
    // Ties go to the current user — they earned it most recently.
    return rows.sort((a, b) => b.xp - a.xp || (b.me ? 1 : 0) - (a.me ? 1 : 0));
  }
  function rankOf(p) { return leaderboard(p).findIndex((r) => r.me) + 1; }

  function streak(p) {
    const days = new Set(p.challengeDates || []);
    let n = 0;
    const d = new Date();
    if (!days.has(Store.localDate(d))) d.setDate(d.getDate() - 1); // today not done yet keeps streak alive
    while (days.has(Store.localDate(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function todaysChallenge() {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const day = Math.floor((Date.now() - start) / 864e5);
    return CHALLENGES[day % CHALLENGES.length];
  }

  /* ---------- Mutations ---------- */
  const addXP = Store.award;
  const log = Store.log;
  function checkAchievements(p) {
    const got = new Set(p.achievements.map((a) => a.id));
    const fresh = [];
    ACHIEVEMENTS.forEach((a) => {
      if (!got.has(a.id) && a.test(p)) {
        p.achievements.push({ id: a.id, at: Date.now() });
        log(p, `Unlocked “${a.name}”`);
        fresh.push(a);
      }
    });
    return fresh;
  }

  /** Apply a change to the profile, persist, re-render, and celebrate new badges. */
  function commit(fn, successMsg) {
    const before = Store.level(me.xp);
    let fresh = [];
    try {
      me = Store.update((p) => { fn(p); fresh = checkAchievements(p); });
    } catch (err) {
      UI.toast(err.message, "error");
      return false;
    }
    render();
    if (successMsg) UI.toast(successMsg, "success");
    const after = Store.level(me.xp);
    if (after > before) setTimeout(() => UI.toast(`Level up! You're now level ${after} 🎉`, "success"), 300);
    fresh.forEach((a, i) => setTimeout(() => UI.toast(`${a.icon} Badge unlocked: ${a.name}`), 600 + i * 400));
    return true;
  }

  /* ---------- Rendering ---------- */
  function avatarHTML(p, cls) {
    return p.avatar ? `<img src="${esc(p.avatar)}" alt="" class="${cls || ""}">` : esc(UI.initials(p.name));
  }

  const ago = (ts) => {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  function emptyState(icon, title, text, action, label) {
    return `<div class="empty">
      <svg class="empty__icon"><use href="#${icon}"/></svg>
      <h4>${title}</h4><p>${text}</p>
      <button class="btn btn--sm" data-action="${action}">${label}</button>
    </div>`;
  }

  function renderHeader() {
    const lvl = Store.level(me.xp);
    const into = me.xp % Store.XP_PER_LEVEL;
    const pct = Math.round((into / Store.XP_PER_LEVEL) * 100);
    $("xpAvatar").innerHTML = avatarHTML(me);
    $("xpLevel").textContent = lvl;
    const tier = CreoData.tierFor(me.xp);
    $("xpTier").textContent = tier.name + (me.plan === "pro" ? " · Pro" : "");
    $("xpTier").style.color = tier.color;
    $("xpText").textContent = `${into} / ${Store.XP_PER_LEVEL}`;
    $("xpBar").style.width = pct + "%";
    $("xpBarWrap").setAttribute("aria-valuenow", pct);
    $("notifList").innerHTML = me.activity.length
      ? me.activity.slice(0, 15).map((a) => `<li><b>${esc(a.label)}</b>${a.xp ? ` · <span class="xp-plus">+${a.xp} XP</span>` : ""}<br>${ago(a.at)}</li>`).join("")
      : `<li>No activity yet — add a project to get started.</li>`;
    const seen = Number(sessionStorageGet("creotask:seen") || 0);
    $("notifDot").hidden = !me.activity.length || me.activity[0].at <= seen;
  }

  function renderSidebar() {
    $("avatar").innerHTML = avatarHTML(me);
    $("name").textContent = me.name;
    $("location").textContent = me.location || "Add your city";
    $("rating").innerHTML = me.reviews
      ? `${me.rating.toFixed(1)} <small>(${me.reviews} reviews)</small>`
      : `— <small>(no reviews yet)</small>`;
    $("rankText").textContent = `#${rankOf(me)} Leaderboard`;
    const about = $("about");
    about.textContent = me.about || "Tell clients about yourself — tap the ⓘ to edit.";
    about.classList.toggle("is-empty", !me.about);

    const done = me.challengeDoneOn === Store.today();
    $("challengeText").textContent = done ? "Challenge complete — come back tomorrow!" : todaysChallenge();
    $("challengeBtn").textContent = done ? "Done ✓" : "Start";
    $("challengeBtn").disabled = done;
    $("challengeLock").innerHTML = `<use href="#${done ? "i-check" : "i-lock"}"/>`;
    $("challengeLock").classList.toggle("is-done", done);
  }

  function renderPortfolio() {
    const n = me.portfolio.length;
    $("portfolioCount").textContent = `${n} project${n === 1 ? "" : "s"} showcased`;
    $("portfolioBody").innerHTML = n
      ? `<div class="items">${me.portfolio.map((it) => `
          <div class="item">
            <h5>${esc(it.title)}</h5>
            <button class="remove" data-remove-project="${esc(it.id)}" aria-label="Remove ${esc(it.title)}">&times;</button>
            ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}
            ${it.tags.length ? `<div class="tags">${it.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
            ${it.link ? `<p><a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">View project ↗</a></p>` : ""}
          </div>`).join("")}</div>
          <div class="card__foot"><button class="btn btn--sm" data-action="add-project">Add project</button></div>`
      : emptyState("i-hand", "No Portfolio Items yet", "Showcase your best work to attract more clients and opportunities", "add-project", "Add Your First Project");

    $("skillsBody").innerHTML = me.skills.length
      ? `<div>${me.skills.map((s) => `
          <div class="skill">
            <span class="skill__name">${esc(s.name)}</span>
            <span class="skill__lvl">${SKILL_LEVELS[s.level]}</span>
            <span class="skill__actions">
              <button class="remove" data-level-up="${esc(s.id)}" aria-label="Level up ${esc(s.name)}" title="Level up" ${s.level >= 5 ? "disabled" : ""}>+</button>
              <button class="remove" data-remove-skill="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">&times;</button>
            </span>
            <div class="bar"><div class="bar__fill bar__fill--gold" style="width:${s.level * 20}%"></div></div>
          </div>`).join("")}</div>
          <div class="card__foot"><button class="btn btn--sm" data-action="add-skill">Add skill</button></div>`
      : emptyState("i-target", "No Skills yet", "Showcase your best skills to attract more clients and opportunities", "add-skill", "Add Your Skills");

    $("activityBody").innerHTML = me.activity.length
      ? `<ul class="activity">${me.activity.slice(0, 6).map((a) => `
          <li><span>${esc(a.label)}${a.xp ? ` <span class="xp-plus">+${a.xp} XP</span>` : ""}</span><time>${ago(a.at)}</time></li>`).join("")}</ul>`
      : `<div class="empty"><p>Your activity will show up here.</p></div>`;
  }

  function renderAnalytics() {
    const earned = new Map(me.achievements.map((a) => [a.id, a.at]));
    $("achCount").textContent = `${earned.size} of ${ACHIEVEMENTS.length} achievements unlocked`;
    $("achBody").innerHTML = earned.size
      ? ACHIEVEMENTS.filter((a) => earned.has(a.id))
          .sort((a, b) => earned.get(b.id) - earned.get(a.id))
          .map((a) => `<div class="ach"><div class="ach__icon">${a.icon}</div><div><h5>${a.name}</h5><p>${a.desc} · ${ago(earned.get(a.id))}</p></div></div>`).join("")
      : emptyState("i-hand", "No Achievements yet", "Add projects, grow skills and finish daily challenges to unlock achievements", "add-project", "Add Your First Project");

    // 7-day XP chart
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = Store.localDate(d);
      days.push({ key, label: d.toLocaleDateString(undefined, { weekday: "short" }), xp: me.xpLog[key] || 0, today: i === 0 });
    }
    const max = Math.max(100, ...days.map((d) => d.xp));
    const week = days.reduce((s, d) => s + d.xp, 0);
    $("progressBody").innerHTML = `
      <div class="chart" role="img" aria-label="XP per day for the last 7 days: ${days.map((d) => `${d.label} ${d.xp}`).join(", ")}">
        ${days.map((d) => `<div class="chart__col">
          <span class="chart__val">${d.xp || ""}</span>
          <div class="chart__bar ${d.xp ? "" : "is-zero"}" style="height:${Math.max(2, (d.xp / max) * 100)}%"></div>
          <span class="chart__day ${d.today ? "is-today" : ""}">${d.label}</span>
        </div>`).join("")}
      </div>
      <div class="stats">
        <div class="stat"><b>${week}</b><span>XP this week</span></div>
        <div class="stat"><b>${streak(me)}</b><span>Day streak</span></div>
        <div class="stat"><b>${Store.level(me.xp)}</b><span>Level</span></div>
      </div>`;

    $("badgesBody").innerHTML = `<div class="badges">${ACHIEVEMENTS.map((a) => `
      <div class="badge ${earned.has(a.id) ? "is-earned" : ""}" title="${esc(a.desc)}">
        <div class="badge__icon" aria-hidden="true">${a.icon}</div>${a.name}
        <span class="sr-only">${earned.has(a.id) ? "(earned)" : "(locked)"}</span>
      </div>`).join("")}</div>`;
  }

  function renderLeaderboard() {
    $("lbBody").innerHTML = leaderboard(me).map((r, i) => `
      <tr class="${r.me ? "is-me" : ""}">
        <td class="lb__rank ${i < 3 ? "r" + (i + 1) : ""}">${i + 1}</td>
        <td><div class="lb__user">
          <span class="lb__avatar">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : esc(UI.initials(r.name))}</span>
          <span><div class="lb__name">${esc(r.name)}${r.me ? " (you)" : ""}</div><div class="lb__city">${esc(r.city || "")}</div></span>
        </div></td>
        <td class="num">${Store.level(r.xp)}</td>
        <td class="num">${r.xp.toLocaleString()}</td>
      </tr>`).join("");
  }

  function render() {
    renderHeader();
    renderSidebar();
    renderPortfolio();
    renderAnalytics();
    renderLeaderboard();
  }

  /* ---------- Tabs ---------- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).classList.toggle("is-active", on);
    });
    if (focus) tab.focus();
    history.replaceState(null, "", "#" + tab.id.replace("tab-", ""));
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) selectTab(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
  const fromHash = $("tab-" + location.hash.slice(1));
  if (fromHash) selectTab(fromHash);

  /* ---------- Modals & forms ---------- */
  UI.bindModals();
  const profileModal = $("profileModal");
  const projectModal = $("projectModal");
  const skillModal = $("skillModal");
  const challengeModal = $("challengeModal");
  let pendingAvatar = null;

  function openProfile() {
    const f = $("profileForm");
    f.name.value = me.name;
    f.location.value = me.location || "";
    f.about.value = me.about || "";
    pendingAvatar = me.avatar || "";
    $("avatarPreview").innerHTML = avatarHTML({ ...me, avatar: pendingAvatar });
    UI.openModal(profileModal);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (a) {
      const act = a.dataset.action;
      if (act === "add-project") { $("projectForm").reset(); UI.openModal(projectModal); }
      if (act === "add-skill") { $("skillForm").reset(); UI.openModal(skillModal); }
    }
    const rp = e.target.closest("[data-remove-project]");
    if (rp) {
      const id = rp.dataset.removeProject;
      commit((p) => {
        const it = p.portfolio.find((x) => x.id === id);
        p.portfolio = p.portfolio.filter((x) => x.id !== id);
        if (it) addXP(p, -XP.project, `Removed project “${it.title}”`);
      });
    }
    const rs = e.target.closest("[data-remove-skill]");
    if (rs) {
      const id = rs.dataset.removeSkill;
      commit((p) => {
        const s = p.skills.find((x) => x.id === id);
        p.skills = p.skills.filter((x) => x.id !== id);
        if (s) addXP(p, -XP.skill, `Removed skill “${s.name}”`);
      });
    }
    const lu = e.target.closest("[data-level-up]");
    if (lu) {
      const id = lu.dataset.levelUp;
      commit((p) => {
        const s = p.skills.find((x) => x.id === id);
        if (s && s.level < 5) { s.level++; addXP(p, 10, `${s.name} → ${SKILL_LEVELS[s.level]}`); }
      });
    }
  });

  $("editAvatarBtn").addEventListener("click", openProfile);
  $("aboutBtn").addEventListener("click", openProfile);
  $("rankTag").addEventListener("click", () => selectTab($("tab-leaderboard"), true));

  $("avatarInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { UI.toast("Please choose an image file.", "error"); return; }
    try {
      pendingAvatar = await resizeImage(file, 256);
      $("avatarPreview").innerHTML = `<img src="${pendingAvatar}" alt="">`;
    } catch {
      UI.toast("Couldn't read that image.", "error");
    }
  });
  $("avatarRemove").addEventListener("click", () => {
    pendingAvatar = "";
    $("avatarPreview").textContent = UI.initials($("profileForm").name.value || me.name);
  });

  $("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return; }
    const ok = commit((p) => {
      p.name = name;
      p.location = f.location.value.trim();
      p.about = f.about.value.trim();
      p.avatar = pendingAvatar;
      log(p, "Updated profile");
    }, "Profile saved");
    if (ok) UI.closeModal(profileModal);
  });

  $("projectForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    const link = f.link.value.trim();
    if (!title) { f.title.focus(); return; }
    if (link && !/^https?:\/\//i.test(link)) { UI.toast("Links must start with http:// or https://", "error"); return; }
    const ok = commit((p) => {
      p.portfolio.unshift({
        id: uid(), title, desc: f.desc.value.trim(), link,
        tags: f.tags.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 6),
        at: Date.now(),
      });
      addXP(p, XP.project, `Added project “${title}”`);
    }, `Project added · +${XP.project} XP`);
    if (ok) UI.closeModal(projectModal);
  });

  $("skillForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) { f.name.focus(); return; }
    if (me.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      UI.toast(`${name} is already in your skill tree.`, "error"); return;
    }
    const ok = commit((p) => {
      p.skills.push({ id: uid(), name, level: Number(f.level.value) });
      addXP(p, XP.skill, `Added skill “${name}”`);
    }, `Skill added · +${XP.skill} XP`);
    if (ok) UI.closeModal(skillModal);
  });

  $("challengeBtn").addEventListener("click", () => {
    $("challengeDetail").textContent = todaysChallenge();
    UI.openModal(challengeModal);
  });
  $("challengeComplete").addEventListener("click", () => {
    const today = Store.today();
    if (me.challengeDoneOn === today) return;
    commit((p) => {
      p.challengeDoneOn = today;
      p.challengeDates = [...new Set([...(p.challengeDates || []), today])].slice(-60);
      addXP(p, XP.challenge, "Completed the daily challenge");
    }, `Challenge complete · +${XP.challenge} XP`);
    UI.closeModal(challengeModal);
  });

  // Notifications dropdown
  const notifBtn = $("notifBtn");
  const notifPanel = $("notifPanel");
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = notifPanel.classList.toggle("is-open");
    notifBtn.setAttribute("aria-expanded", open);
    if (open && me.activity[0]) { sessionStorageSet("creotask:seen", me.activity[0].at); $("notifDot").hidden = true; }
  });
  document.addEventListener("click", (e) => {
    if (!notifPanel.contains(e.target)) { notifPanel.classList.remove("is-open"); notifBtn.setAttribute("aria-expanded", "false"); }
  });

  $("logoutBtn").addEventListener("click", () => { Store.signOut(); location.href = "index.html"; });

  /* ---------- Countdown to the next daily challenge ---------- */
  let lastDay = Store.today();
  function tick() {
    const now = new Date();
    const end = new Date(now); end.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((end - now) / 1000));
    const z = (n) => String(n).padStart(2, "0");
    $("timeLeft").textContent = `${z(Math.floor(s / 3600))}:${z(Math.floor((s % 3600) / 60))}:${z(s % 60)}`;
    if (Store.today() !== lastDay) { lastDay = Store.today(); render(); }
  }
  tick();
  setInterval(tick, 1000);

  /* ---------- Utils ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
  function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }

  function resizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const side = Math.min(img.width, img.height);
        c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  // Older saved profiles may predate some fields.
  me = Store.update((p) => { p.challengeDates = p.challengeDates || []; checkAchievements(p); }) || me;
  render();
})();
