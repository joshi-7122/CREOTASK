/* =========================================================
   CREOTASK — API Client & State Layer
   Connects UI directly to the Express + SQLite backend.
   ========================================================= */
(function (global) {
  "use strict";

  const TOKEN_KEY = "creotask_jwt_token";
  const CACHE_USER_KEY = "creotask_cached_user";

  const API = {
    getToken() {
      try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    },
    setToken(token) {
      try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
      } catch {}
    },
    getCachedUser() {
      try { return JSON.parse(localStorage.getItem(CACHE_USER_KEY)); } catch { return null; }
    },
    setCachedUser(user) {
      try {
        if (user) localStorage.setItem(CACHE_USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(CACHE_USER_KEY);
      } catch {}
    },

    async request(path, options = {}) {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      const token = API.getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      let res;
      try {
        res = await fetch(`/api${path}`, { ...options, headers });
      } catch (netErr) {
        const e = new Error("Can't reach CreoTask right now. Check your connection and try again.");
        e.code = "NETWORK";
        throw e;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "An unexpected error occurred.");
        err.status = res.status;
        err.code = data.code;
        err.fields = data.fields;
        err.data = data;
        const onLanding = /(^\/$|index\.html)/.test(window.location.pathname);
        if (res.status === 401 && !path.startsWith("/auth/login")) {
          API.setToken(null);
          API.setCachedUser(null);
          if (!onLanding) window.location.href = "/index.html?auth=signin&reason=session";
        }
        if (data.code === "ACCOUNT_SUSPENDED" && !path.startsWith("/auth/login")) {
          try { sessionStorage.setItem("creotask_suspension", JSON.stringify(data.suspension || {})); } catch {}
          API.setToken(null);
          API.setCachedUser(null);
          if (!onLanding) window.location.href = "/index.html?auth=signin&reason=suspended";
        }
        throw err;
      }
      return data;
    },

    async meta() {
      if (!API._meta) API._meta = API.request("/meta").catch((e) => { API._meta = null; throw e; });
      return API._meta;
    },

    // ── Authentication ──
    auth: {
      async register(email, password, role, display_name, age_confirmed) {
        const data = await API.request("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, role, display_name, age_confirmed })
        });
        API.setToken(data.token);
        API.setCachedUser(data.user);
        return data;
      },
      async login(email, password) {
        const data = await API.request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        API.setToken(data.token);
        API.setCachedUser(data.user);
        return data;
      },
      async me() {
        try {
          const data = await API.request("/auth/me");
          API.setCachedUser(data.user);
          return data;
        } catch (e) {
          if (e.code === "NETWORK") throw e;
          return null;
        }
      },
      async resendVerification(email) {
        return API.request("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      },
      async changePassword(current_password, new_password) {
        return API.request("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) });
      },
      async sessions() {
        return API.request("/auth/sessions");
      },
      async revokeSession(sessionId) {
        return API.request(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      },
      async logoutAll() {
        return API.request("/auth/logout-all", { method: "POST" });
      },
      async switchRole(role) {
        const data = await API.request("/auth/switch-role", {
          method: "POST",
          body: JSON.stringify({ role })
        });
        const current = API.getCachedUser() || {};
        current.active_role = role;
        API.setCachedUser(current);
        return data;
      },
      async forgotPassword(email) {
        return API.request("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email })
        });
      },
      async logout() {
        try { if (API.getToken()) await API.request("/auth/logout", { method: "POST" }); } catch {}
        API.setToken(null);
        API.setCachedUser(null);
        window.location.href = "/index.html";
      }
    },

    // ── Projects & Marketplace ──
    projects: {
      async browse(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return API.request(`/projects${qs ? "?" + qs : ""}`);
      },
      async get(projectId) {
        return API.request(`/projects/${projectId}`);
      },
      async my(status) {
        return API.request(`/projects/my${status ? "?status=" + status : ""}`);
      },
      async create(projectData) {
        return API.request("/projects", {
          method: "POST",
          body: JSON.stringify(projectData)
        });
      },
      async publish(projectId) {
        return API.request(`/projects/${projectId}/publish`, { method: "POST" });
      },
      async apply(projectId, applicationData) {
        return API.request(`/projects/${projectId}/apply`, {
          method: "POST",
          body: JSON.stringify(applicationData)
        });
      },
      async listApplications(projectId) {
        return API.request(`/projects/${projectId}/applications`);
      },
      async updateApplication(projectId, appId, status, client_note) {
        return API.request(`/projects/${projectId}/applications/${appId}`, {
          method: "PUT",
          body: JSON.stringify({ status, client_note })
        });
      },
      async sendOffer(projectId, offerData) {
        return API.request(`/projects/${projectId}/offer`, {
          method: "POST",
          body: JSON.stringify(offerData)
        });
      },
      async respondOffer(offerId, action, decline_reason) {
        return API.request(`/projects/offers/${offerId}`, {
          method: "PUT",
          body: JSON.stringify({ action, decline_reason })
        });
      },
      async fundMilestone(projectId, mileId) {
        return API.request(`/projects/${projectId}/milestones/${mileId}/fund`, { method: "POST" });
      },
      async submitDeliverable(projectId, mileId, deliverableData) {
        return API.request(`/projects/${projectId}/milestones/${mileId}/submit`, {
          method: "POST",
          body: JSON.stringify(deliverableData)
        });
      },
      async reviewDeliverable(projectId, mileId, action, note) {
        return API.request(`/projects/${projectId}/milestones/${mileId}/review`, {
          method: "PUT",
          body: JSON.stringify({ action, note })
        });
      },
      async sendMessage(projectId, content) {
        return API.request(`/projects/${projectId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
      },
      async submitReview(projectId, rating, comment) {
        return API.request(`/projects/${projectId}/review`, {
          method: "POST",
          body: JSON.stringify({ rating, comment })
        });
      },
      async openDispute(projectId, disputeData) {
        return API.request(`/projects/${projectId}/dispute`, {
          method: "POST",
          body: JSON.stringify(disputeData)
        });
      },
      async submitChangeOrder(projectId, mileId, data) {
        return API.request(`/projects/${projectId}/milestones/${mileId}/change-order`, {
          method: "POST",
          body: JSON.stringify(data)
        });
      },
      async respondChangeOrder(projectId, coId, action, responder_note) {
        return API.request(`/projects/${projectId}/change-orders/${coId}`, {
          method: "PUT",
          body: JSON.stringify({ action, responder_note })
        });
      }
    },

    // ── Profiles ──
    profiles: {
      async me() {
        return API.request("/profiles/me");
      },
      async skillCatalog(q = "", category = "") {
        const qs = new URLSearchParams({ q, ...(category ? { category } : {}) }).toString();
        return API.request(`/skills/catalog?${qs}`);
      },
      async updateSkill(skillId, data) {
        return API.request(`/profiles/skills/${skillId}`, { method: "PUT", body: JSON.stringify(data) });
      },
      async updatePortfolio(itemId, data) {
        return API.request(`/profiles/portfolio/${itemId}`, { method: "PUT", body: JSON.stringify(data) });
      },
      async archivePortfolio(itemId) {
        return API.request(`/profiles/portfolio/${itemId}/archive`, { method: "POST" });
      },
      async restorePortfolio(itemId) {
        return API.request(`/profiles/portfolio/${itemId}/restore`, { method: "POST" });
      },
      async browseFreelancers(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return API.request(`/profiles/freelancers${qs ? "?" + qs : ""}`);
      },
      async getFreelancer(userId) {
        return API.request(`/profiles/freelancer/${userId}`);
      },
      async updateFreelancer(profileData) {
        return API.request("/profiles/freelancer", {
          method: "PUT",
          body: JSON.stringify(profileData)
        });
      },
      async getClient(userId) {
        return API.request(`/profiles/client/${userId}`);
      },
      async updateClient(profileData) {
        return API.request("/profiles/client", {
          method: "PUT",
          body: JSON.stringify(profileData)
        });
      },
      async addSkill(skillData) {
        return API.request("/profiles/skills", {
          method: "POST",
          body: JSON.stringify(skillData)
        });
      },
      async deleteSkill(skillId) {
        return API.request(`/profiles/skills/${skillId}`, { method: "DELETE" });
      },
      async verifySkill(skillId, evidence) {
        return API.request(`/profiles/skills/${skillId}/verify`, {
          method: "POST",
          body: JSON.stringify(evidence)
        });
      },
      async addPortfolio(itemData) {
        return API.request("/profiles/portfolio", {
          method: "POST",
          body: JSON.stringify(itemData)
        });
      },
      async deletePortfolio(itemId) {
        return API.request(`/profiles/portfolio/${itemId}`, { method: "DELETE" });
      }
    },

    // ── Notifications ──
    notifications: {
      async list(unreadOnly = false) {
        return API.request(`/notifications${unreadOnly ? "?unread_only=true" : ""}`);
      },
      async markRead(id) {
        return API.request(`/notifications/${id}/read`, { method: "PUT" });
      },
      async markAllRead() {
        return API.request("/notifications/read-all", { method: "PUT" });
      }
    },

    // ── Admin ──
    admin: {
      async getStats() {
        return API.request("/admin/stats");
      },
      async listUsers(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return API.request(`/admin/users${qs ? "?" + qs : ""}`);
      },
      async banUser(userId, reason, reason_category) {
        return API.request(`/admin/users/${userId}/ban`, {
          method: "PUT",
          body: JSON.stringify({ reason, reason_category })
        });
      },
      async unbanUser(userId) {
        return API.request(`/admin/users/${userId}/unban`, { method: "PUT" });
      },
      async listProjects(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return API.request(`/admin/projects${qs ? "?" + qs : ""}`);
      },
      async moderateProject(projectId, action, note) {
        return API.request(`/admin/projects/${projectId}/moderate`, {
          method: "PUT",
          body: JSON.stringify({ action, note })
        });
      },
      async listSkillQueue(status = "pending") {
        return API.request(`/admin/skill-queue?status=${status}`);
      },
      async reviewSkill(qId, action, review_note) {
        return API.request(`/admin/skill-queue/${qId}`, {
          method: "PUT",
          body: JSON.stringify({ action, review_note })
        });
      },
      async listDisputes(status) {
        return API.request(`/admin/disputes${status ? "?status=" + status : ""}`);
      },
      async resolveDispute(disputeId, resolutionData) {
        return API.request(`/admin/disputes/${disputeId}`, {
          method: "PUT",
          body: JSON.stringify(resolutionData)
        });
      },
      async getLedger(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return API.request(`/admin/ledger${qs ? "?" + qs : ""}`);
      },
      async evaluateTier(userId) {
        return API.request(`/admin/users/${userId}/evaluate-tier`, { method: "POST" });
      }
    }
  };

  global.CreoAPI = API;
})(window);
