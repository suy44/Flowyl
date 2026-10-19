/**
 * Flowyl — Founder Admin Dashboard Logic
 * Strict authentication, session storage, and telemetry.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "flowyl_admin_secret";
  let adminSecret = sessionStorage.getItem(STORAGE_KEY) || "";
  let pollIntervalId = null;

  // Screens
  const authScreen = document.getElementById("admin-auth-screen");
  const dashboardWrapper = document.getElementById("admin-dashboard-wrapper");
  const formAuthLogin = document.getElementById("form-auth-login");
  const inputAuthSecret = document.getElementById("input-auth-secret");
  const authErrorBanner = document.getElementById("auth-error-banner");
  const authErrorText = document.getElementById("auth-error-text");
  const btnAuthSubmit = document.getElementById("btn-auth-submit");
  const btnLogout = document.getElementById("btn-logout");

  // Metrics Elements
  const metricUsers = document.getElementById("metric-users-count");
  const metricVisitors = document.getElementById("metric-visitors-count");
  const metricPageviewsSub = document.getElementById("metric-pageviews-sub");
  const metricRequests = document.getElementById("metric-requests-count");
  const metricExecutedSub = document.getElementById("metric-executed-sub");
  const metricDedup = document.getElementById("metric-dedup-count");

  const usersTbody = document.getElementById("users-tbody");
  const presetsContainer = document.getElementById("presets-container");
  const activityTbody = document.getElementById("activity-tbody");

  const btnRefresh = document.getElementById("btn-refresh");

  // Modals
  const modalCreateKey = document.getElementById("modal-create-key");
  const btnOpenCreateKey = document.getElementById("btn-open-create-key");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const formCreateKey = document.getElementById("form-create-key");

  // Authentication & View Management
  function showAuthScreen() {
    if (authScreen) authScreen.style.display = "flex";
    if (dashboardWrapper) dashboardWrapper.style.display = "none";
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (inputAuthSecret) {
      inputAuthSecret.value = "";
      inputAuthSecret.focus();
    }
    if (authErrorBanner) authErrorBanner.style.display = "none";
  }

  function showDashboard() {
    if (authScreen) authScreen.style.display = "none";
    if (dashboardWrapper) dashboardWrapper.style.display = "block";
    loadDashboard();
    if (!pollIntervalId) {
      pollIntervalId = setInterval(loadDashboard, 15000);
    }
  }

  function handleLogout() {
    adminSecret = "";
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("actionlock_admin_secret");
    showAuthScreen();
  }

  // Handle Login Form Submission
  if (formAuthLogin) {
    formAuthLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const entered = inputAuthSecret.value.trim();
      if (!entered) return;

      if (btnAuthSubmit) {
        btnAuthSubmit.disabled = true;
        btnAuthSubmit.textContent = "Verifying credentials...";
      }
      if (authErrorBanner) authErrorBanner.style.display = "none";

      try {
        const res = await fetch("/v1/admin/overview", {
          headers: {
            "X-Flowyl-Admin-Key": entered,
            "X-ActionLock-Admin-Key": entered,
          },
        });

        if (res.status === 401 || !res.ok) {
          throw new Error("Invalid admin secret key. Access denied.");
        }

        const data = await res.json();
        adminSecret = entered;
        sessionStorage.setItem(STORAGE_KEY, adminSecret);
        renderDashboard(data);
        showDashboard();
      } catch (err) {
        if (authErrorBanner && authErrorText) {
          authErrorText.textContent = err.message || "Unauthorized access.";
          authErrorBanner.style.display = "flex";
        }
        if (inputAuthSecret) {
          inputAuthSecret.select();
        }
      } finally {
        if (btnAuthSubmit) {
          btnAuthSubmit.disabled = false;
          btnAuthSubmit.innerHTML = `<span>Unlock Command Center</span> <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", handleLogout);
  }

  // Fetch Dashboard Overview
  async function loadDashboard() {
    if (!adminSecret) {
      showAuthScreen();
      return;
    }

    try {
      const res = await fetch("/v1/admin/overview", {
        headers: {
          "X-Flowyl-Admin-Key": adminSecret,
          "X-ActionLock-Admin-Key": adminSecret,
        },
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load metrics: ${res.status}`);
      }

      const data = await res.json();
      renderDashboard(data);
    } catch (err) {
      console.error("Dashboard load error:", err);
    }
  }

  function renderDashboard(data) {
    // 1. Render Metrics
    if (metricUsers) metricUsers.textContent = (data.active_users_count || 0).toLocaleString();
    if (metricVisitors) metricVisitors.textContent = (data.website_visitors?.unique_visitors || 0).toLocaleString();
    if (metricPageviewsSub) metricPageviewsSub.textContent = `${(data.website_visitors?.total_page_views || 0).toLocaleString()} total page views`;

    if (metricRequests) metricRequests.textContent = (data.api_metrics?.total_requests || 0).toLocaleString();
    if (metricExecutedSub) metricExecutedSub.textContent = `${(data.api_metrics?.executed_requests || 0).toLocaleString()} fresh calls`;

    if (metricDedup) metricDedup.textContent = (data.api_metrics?.duplicates_prevented || 0).toLocaleString();

    // 2. Render Users & API Keys
    if (usersTbody) {
      if (!data.api_keys || data.api_keys.length === 0) {
        usersTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:2rem;">No keys found.</td></tr>`;
      } else {
        usersTbody.innerHTML = data.api_keys.map((k) => {
          const tierClass = `badge-${k.tier}`;
          const usagePercent = Math.min(100, Math.round((k.usage / (k.monthly_limit || 1)) * 100));
          const dateStr = k.created_at ? new Date(k.created_at).toLocaleDateString() : "Just now";

          return `
            <tr>
              <td><strong>${escapeHtml(k.owner_id)}</strong></td>
              <td>
                <span class="code-cell">${escapeHtml(k.key_preview)}</span>
                ${k.full_key ? `<button class="btn btn-secondary" style="padding:0.15rem 0.4rem;font-size:0.75rem;margin-left:0.3rem;" onclick="copyText('${k.full_key}')" title="Copy full key">📋</button>` : ""}
              </td>
              <td><span class="badge ${tierClass}">${escapeHtml(k.tier)}</span></td>
              <td>
                <div style="font-size:0.8rem;font-weight:600;">${k.usage.toLocaleString()} / ${(k.monthly_limit || 0).toLocaleString()}</div>
                <div class="usage-bar"><div class="usage-fill" style="width: ${usagePercent}%"></div></div>
              </td>
              <td style="color:var(--text-tertiary);">${dateStr}</td>
              <td>
                ${k.full_key ? `<button class="btn btn-secondary" style="color:var(--accent-red);padding:0.25rem 0.6rem;font-size:0.75rem;" onclick="revokeKey('${k.full_key}')">Revoke</button>` : "--"}
              </td>
            </tr>
          `;
        }).join("");
      }
    }

    // 3. Render Presets Breakdown
    if (presetsContainer) {
      const presets = data.preset_distribution || {};
      const totalPresetCalls = Object.values(presets).reduce((a, b) => a + b, 0) || 1;

      const items = Object.entries(presets).sort((a, b) => b[1] - a[1]);
      if (items.length === 0) {
        presetsContainer.innerHTML = `<div style="color:var(--text-tertiary);font-size:0.85rem;">No preset calls recorded yet.</div>`;
      } else {
        presetsContainer.innerHTML = items.map(([name, count]) => {
          const pct = Math.round((count / totalPresetCalls) * 100);
          return `
            <div class="preset-item">
              <div class="preset-label-row">
                <span style="text-transform: capitalize; font-weight:600;">${escapeHtml(name)}</span>
                <span class="preset-count">${count.toLocaleString()} <span style="font-size:0.75rem;color:var(--text-tertiary);">(${pct}%)</span></span>
              </div>
              <div class="bar-track">
                <div class="bar-progress" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // 4. Render Live Activity Feed
    if (activityTbody) {
      if (!data.recent_activity || data.recent_activity.length === 0) {
        activityTbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary);padding:2rem;">No recent activity.</td></tr>`;
      } else {
        activityTbody.innerHTML = data.recent_activity.slice(0, 30).map((act) => {
          const time = act.timestamp ? new Date(act.timestamp).toLocaleTimeString() : "--";
          let badgeClass = "badge-executed";
          let label = "Executed";

          if (act.type === "deduplicate") {
            badgeClass = "badge-deduplicated";
            label = "Deduplicated";
          } else if (act.type === "rate_limit") {
            badgeClass = "badge-queued";
            label = "Rate Limit 429";
          } else if (act.type === "page_view") {
            badgeClass = "badge-visit";
            label = "Page View";
          }

          const targetUrl = act.target_url ? escapeHtml(act.target_url) : "--";

          return `
            <tr>
              <td style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:0.8rem;">${time}</td>
              <td><span class="badge ${badgeClass}">${label}</span></td>
              <td style="font-weight:600;">${escapeHtml(act.owner_id || "Anonymous")}</td>
              <td><span class="code-cell">${escapeHtml(act.key_preview || "--")}</span></td>
              <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${targetUrl}">${targetUrl}</td>
              <td><span style="font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(act.preset || "--")}</span></td>
              <td style="font-family:var(--font-mono);font-size:0.8rem;color:var(--accent-green);">${act.latency_ms || 12}ms</td>
            </tr>
          `;
        }).join("");
      }
    }
  }

  // Window helpers
  window.copyText = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      alert("API Key copied to clipboard:\n" + text);
    });
  };

  window.revokeKey = async function (key) {
    if (!confirm(`Are you sure you want to revoke key: ${key}?`)) return;

    try {
      const res = await fetch(`/v1/admin/keys/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: {
          "X-Flowyl-Admin-Key": adminSecret,
          "X-ActionLock-Admin-Key": adminSecret,
        },
      });
      if (!res.ok) throw new Error("Revocation failed");
      loadDashboard();
    } catch (err) {
      alert("Failed to revoke key: " + err.message);
    }
  };

  // Event Listeners
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      btnRefresh.textContent = "⏳...";
      loadDashboard().finally(() => {
        btnRefresh.textContent = "🔄 Refresh";
      });
    });
  }

  if (btnOpenCreateKey) {
    btnOpenCreateKey.addEventListener("click", () => {
      modalCreateKey.classList.add("open");
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", () => {
      modalCreateKey.classList.remove("open");
    });
  }

  if (formCreateKey) {
    formCreateKey.addEventListener("submit", async (e) => {
      e.preventDefault();
      const owner = document.getElementById("input-owner").value.trim();
      const tier = document.getElementById("select-tier").value;

      try {
        const res = await fetch("/v1/admin/keys", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Flowyl-Admin-Key": adminSecret,
            "X-ActionLock-Admin-Key": adminSecret,
          },
          body: JSON.stringify({ owner_id: owner, tier }),
        });

        if (!res.ok) throw new Error(`Create key failed (${res.status})`);

        const created = await res.json();
        modalCreateKey.classList.remove("open");
        formCreateKey.reset();
        alert(`🎉 New API Key Generated for ${created.metadata.owner_id}!\n\nKey: ${created.api_key}\nTier: ${created.metadata.tier}`);
        loadDashboard();
      } catch (err) {
        alert("Error creating key: " + err.message);
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initial Check: If user already authenticated this session, show dashboard; else show login
  if (adminSecret) {
    showDashboard();
  } else {
    showAuthScreen();
  }
})();
