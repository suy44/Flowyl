/**
 * ActionLock — Founder Admin Dashboard Logic
 */
(function () {
  "use strict";

  const STORAGE_KEY = "flowyl_admin_secret";
  let adminSecret =
    localStorage.getItem(STORAGE_KEY) ||
    localStorage.getItem("actionlock_admin_secret") ||
    "admin123";

  // Elements
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
  const btnAdminKey = document.getElementById("btn-admin-key");
  const adminKeyLabel = document.getElementById("admin-key-label");

  // Modals
  const modalCreateKey = document.getElementById("modal-create-key");
  const btnOpenCreateKey = document.getElementById("btn-open-create-key");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const formCreateKey = document.getElementById("form-create-key");

  const modalAdminKey = document.getElementById("modal-admin-key");
  const formAdminKey = document.getElementById("form-admin-key");
  const inputAdminSecret = document.getElementById("input-admin-secret");

  function updateKeyLabel() {
    if (adminKeyLabel) {
      const masked = adminSecret.length > 4 ? `Key: ${adminSecret.substring(0, 3)}***` : `Key: ${adminSecret}`;
      adminKeyLabel.textContent = masked;
    }
  }

  updateKeyLabel();

  // Fetch Dashboard Overview
  async function loadDashboard() {
    try {
      const res = await fetch("/v1/admin/overview", {
        headers: {
          "X-Flowyl-Admin-Key": adminSecret,
          "X-ActionLock-Admin-Key": adminSecret,
        },
      });

      if (res.status === 401) {
        modalAdminKey.classList.add("open");
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

  if (btnAdminKey) {
    btnAdminKey.addEventListener("click", () => {
      inputAdminSecret.value = adminSecret;
      modalAdminKey.classList.add("open");
    });
  }

  if (formAdminKey) {
    formAdminKey.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = inputAdminSecret.value.trim();
      if (val) {
        adminSecret = val;
        localStorage.setItem(STORAGE_KEY, adminSecret);
        updateKeyLabel();
        modalAdminKey.classList.remove("open");
        loadDashboard();
      }
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

  // Initial load + interval poll
  loadDashboard();
  setInterval(loadDashboard, 15000);
})();
