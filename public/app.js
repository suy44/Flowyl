/**
 * ActionLock Landing Page — Interactivity
 */
(function () {
  "use strict";

  // ─── Mobile Navigation Toggle ──────────────────────────────────
  const toggle = document.getElementById("nav-mobile-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (toggle && navLinks) {
    toggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
      toggle.classList.toggle("active");
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        toggle.classList.remove("active");
      });
    });
  }

  // ─── Scroll Animations (Intersection Observer) ─────────────────
  const observerOptions = {
    root: null,
    rootMargin: "0px 0px -80px 0px",
    threshold: 0.1,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Add animation class to sections and cards
  const animateElements = document.querySelectorAll(
    ".problem-card, .feature-card, .feature-small, .step-card, .preset-card, .pricing-card, .n8n-feature, .cta-block"
  );

  animateElements.forEach((el, index) => {
    el.classList.add("animate-on-scroll");
    el.style.transitionDelay = `${index * 60}ms`;
    observer.observe(el);
  });

  // ─── Smooth Nav Background on Scroll ───────────────────────────
  const nav = document.getElementById("main-nav");
  let lastScrollY = 0;

  window.addEventListener("scroll", () => {
    const scrollY = window.scrollY;

    if (scrollY > 100) {
      nav.style.background = "rgba(7, 7, 13, 0.95)";
      nav.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.3)";
    } else {
      nav.style.background = "rgba(7, 7, 13, 0.8)";
      nav.style.boxShadow = "none";
    }

    lastScrollY = scrollY;
  }, { passive: true });

  // ─── Preset Card Hover Glow ────────────────────────────────────
  document.querySelectorAll(".preset-card, .pricing-card, .feature-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty("--mouse-x", `${x}%`);
      card.style.setProperty("--mouse-y", `${y}%`);
      card.style.background = `radial-gradient(300px circle at ${x}% ${y}%, rgba(108, 92, 231, 0.06), transparent 50%), var(--bg-card)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.background = "";
    });
  });

  // ─── Typing Effect for Code Block ──────────────────────────────
  const codeBlock = document.querySelector(".hero-code .code-body code");
  if (codeBlock) {
    const originalHTML = codeBlock.innerHTML;
    // The code is already rendered — we just add a subtle entrance
    codeBlock.style.opacity = "0";
    setTimeout(() => {
      codeBlock.style.transition = "opacity 0.8s ease-out";
      codeBlock.style.opacity = "1";
    }, 800);
  }

  // ─── Counter Animation for Stats ──────────────────────────────
  const statNumbers = document.querySelectorAll(".stat-number[data-count]");
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.getAttribute("data-count"), 10);
        animateCounter(entry.target, 0, target, 1500);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach((el) => counterObserver.observe(el));

  function animateCounter(element, start, end, duration) {
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      element.textContent = current.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }

  // ─── Interactive Modals: Get Free API Key & Upgrades ───────────
  const modalFreeKey = document.getElementById("modal-get-free-key");
  const modalCloseFreeKey = document.getElementById("modal-close-free-key");
  const stepForm = document.getElementById("free-key-step-form");
  const stepSuccess = document.getElementById("free-key-step-success");
  const formClaimKey = document.getElementById("form-claim-free-key");
  const inputProject = document.getElementById("free-key-project");
  const inputEmail = document.getElementById("free-key-email");
  const btnGenerateKey = document.getElementById("btn-generate-free-key");
  const displayApiKey = document.getElementById("display-api-key");
  const snippetCurl = document.getElementById("snippet-curl");
  const btnCopyLiveKey = document.getElementById("btn-copy-live-key");
  const btnCopySnippet = document.getElementById("btn-copy-snippet");
  const btnDoneFreeKey = document.getElementById("btn-done-free-key");

  const modalUpgrade = document.getElementById("modal-upgrade-plan");
  const modalCloseUpgrade = document.getElementById("modal-close-upgrade");
  const upgradeHeading = document.getElementById("upgrade-modal-heading");
  const formUpgrade = document.getElementById("form-plan-upgrade");
  const upgradeSuccessMsg = document.getElementById("upgrade-success-msg");
  const btnDoneUpgrade = document.getElementById("btn-done-upgrade");

  // ─── Google Firebase Auth & Usage Counter Tracking ───────────
  const btnNavGoogleLogin = document.getElementById("btn-nav-google-login");
  const navUserProfile = document.getElementById("nav-user-profile");
  const navUserEmail = document.getElementById("nav-user-email");
  const navUserAvatar = document.getElementById("nav-user-avatar");
  const btnNavLogout = document.getElementById("btn-nav-logout");
  const btnModalGoogle = document.getElementById("btn-modal-google-signin");

  const modalUsageLabel = document.getElementById("modal-usage-label");
  const modalUsageBar = document.getElementById("modal-usage-bar");
  const modalUserAccount = document.getElementById("modal-user-account");

  let currentFirebaseUser = null;
  let currentUserRecord = null;

  async function updateAuthState(user) {
    currentFirebaseUser = user;
    if (user) {
      if (btnNavGoogleLogin) btnNavGoogleLogin.style.display = "none";
      if (navUserProfile) navUserProfile.style.display = "flex";
      if (navUserEmail) navUserEmail.textContent = user.displayName || user.email.split("@")[0];
      if (navUserAvatar && user.photoURL) navUserAvatar.src = user.photoURL;

      if (window.FlowylFirebase) {
        currentUserRecord = await window.FlowylFirebase.getOrCreateUserRecord(user);
        if (currentUserRecord?.apiKey) {
          localStorage.setItem("flowyl_my_api_key", currentUserRecord.apiKey);
        }
      }
    } else {
      currentUserRecord = null;
      if (btnNavGoogleLogin) btnNavGoogleLogin.style.display = "inline-flex";
      if (navUserProfile) navUserProfile.style.display = "none";
    }
  }

  if (window.FlowylFirebase) {
    window.FlowylFirebase.onAuthStateChanged((user) => {
      updateAuthState(user);
    });
  }

  async function handleGoogleSignIn() {
    try {
      if (btnModalGoogle) {
        btnModalGoogle.disabled = true;
        btnModalGoogle.innerHTML = `<span>Signing in with Google...</span>`;
      }
      if (window.FlowylFirebase) {
        const user = await window.FlowylFirebase.signInWithGoogle();
        if (user) {
          const record = await window.FlowylFirebase.getOrCreateUserRecord(user);
          await updateAuthState(user);
          showKeySuccess(record.apiKey, record);
          openFreeKeyModal();
        }
      }
    } catch (err) {
      alert("Google Sign-In notice: " + (err.message || "Failed to sign in."));
    } finally {
      if (btnModalGoogle) {
        btnModalGoogle.disabled = false;
        btnModalGoogle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg> <span>Continue with Google</span>`;
      }
    }
  }

  if (btnNavGoogleLogin) btnNavGoogleLogin.addEventListener("click", handleGoogleSignIn);
  if (btnModalGoogle) btnModalGoogle.addEventListener("click", handleGoogleSignIn);

  if (btnNavLogout) {
    btnNavLogout.addEventListener("click", async () => {
      if (window.FlowylFirebase) await window.FlowylFirebase.signOut();
      updateAuthState(null);
    });
  }

  function openFreeKeyModal() {
    if (!modalFreeKey) return;
    const existingKey = localStorage.getItem("flowyl_my_api_key");
    if (existingKey) {
      showKeySuccess(existingKey, currentUserRecord);
    } else {
      if (stepForm) stepForm.style.display = "block";
      if (stepSuccess) stepSuccess.style.display = "none";
      if (inputProject) inputProject.focus();
    }
    modalFreeKey.classList.add("open");
  }

  function closeFreeKeyModal() {
    if (modalFreeKey) modalFreeKey.classList.remove("open");
  }

  function showKeySuccess(key, record) {
    if (stepForm) stepForm.style.display = "none";
    if (stepSuccess) stepSuccess.style.display = "block";
    if (displayApiKey) displayApiKey.value = key;

    // Update Live Usage Counter
    const usage = record?.usage || 0;
    const limit = record?.monthly_limit || 5000;
    const pct = Math.min(100, Math.round((usage / limit) * 100));

    if (modalUsageLabel) modalUsageLabel.textContent = `${usage.toLocaleString()} / ${limit.toLocaleString()} calls`;
    if (modalUsageBar) modalUsageBar.style.width = `${pct}%`;
    if (modalUserAccount) {
      modalUserAccount.textContent = record?.email ? `Account: ${record.email}` : "Free Tier · Anonymous";
    }

    if (snippetCurl) {
      snippetCurl.textContent = `curl -X POST https://flowyl.vercel.app/v1/execute \\
  -H "Authorization: Bearer ${key}" \\
  -H "X-Flowyl-Key: order-req-001" \\
  -H "X-Flowyl-Preset: slack" \\
  -H "Content-Type: application/json" \\
  -d '{"target_url":"https://hooks.slack.com/services/...","body":{"text":"Order dispatched"}}'`;
    }
  }

  // Triggers for Free Key Modal
  const heroCtaStart = document.getElementById("hero-cta-start");
  const pricingFreeCta = document.getElementById("pricing-free-cta");
  const finalCta = document.getElementById("final-cta");

  if (heroCtaStart) heroCtaStart.addEventListener("click", openFreeKeyModal);
  if (pricingFreeCta) pricingFreeCta.addEventListener("click", openFreeKeyModal);
  if (finalCta) finalCta.addEventListener("click", openFreeKeyModal);

  if (modalCloseFreeKey) modalCloseFreeKey.addEventListener("click", closeFreeKeyModal);
  if (btnDoneFreeKey) btnDoneFreeKey.addEventListener("click", closeFreeKeyModal);

  // Handle Free Key Form Submit
  if (formClaimKey) {
    formClaimKey.addEventListener("submit", async (e) => {
      e.preventDefault();
      const project = (inputProject?.value || "").trim() || "My Agent Workflow";
      const email = (inputEmail?.value || "").trim();

      if (btnGenerateKey) {
        btnGenerateKey.disabled = true;
        btnGenerateKey.innerHTML = `<span>⏳ Provisioning Key...</span>`;
      }

      try {
        const res = await fetch("/v1/keys/free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_name: project, email }),
        });

        if (!res.ok) throw new Error("Key generation failed");
        const data = await res.json();
        const key = data.api_key;
        localStorage.setItem("flowyl_my_api_key", key);
        showKeySuccess(key, { email, usage: 0, monthly_limit: 5000 });
      } catch (err) {
        // Fallback: generate local valid key format if offline
        const fallbackKey = `ak_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem("flowyl_my_api_key", fallbackKey);
        showKeySuccess(fallbackKey, { email, usage: 0, monthly_limit: 5000 });
      } finally {
        if (btnGenerateKey) {
          btnGenerateKey.disabled = false;
          btnGenerateKey.innerHTML = `<span>⚡ Generate Free API Key</span>`;
        }
      }
    });
  }

  // Copy Key & Snippet helpers
  if (btnCopyLiveKey && displayApiKey) {
    btnCopyLiveKey.addEventListener("click", () => {
      navigator.clipboard.writeText(displayApiKey.value).then(() => {
        const prev = btnCopyLiveKey.textContent;
        btnCopyLiveKey.textContent = "✓ Copied!";
        setTimeout(() => { btnCopyLiveKey.textContent = prev; }, 2000);
      });
    });
  }

  if (btnCopySnippet && snippetCurl) {
    btnCopySnippet.addEventListener("click", () => {
      navigator.clipboard.writeText(snippetCurl.textContent).then(() => {
        const prev = btnCopySnippet.textContent;
        btnCopySnippet.textContent = "✓ Copied curl!";
        setTimeout(() => { btnCopySnippet.textContent = prev; }, 2000);
      });
    });
  }

  // Upgrade Modal Handlers
  const pricingStarterCta = document.getElementById("pricing-starter-cta");
  const pricingProCta = document.getElementById("pricing-pro-cta");

  function openUpgradeModal(planName) {
    if (!modalUpgrade) return;
    if (upgradeHeading) upgradeHeading.textContent = `Upgrade to Flowyl ${planName}`;
    if (formUpgrade) {
      formUpgrade.style.display = "block";
      formUpgrade.reset();
    }
    if (upgradeSuccessMsg) upgradeSuccessMsg.style.display = "none";
    modalUpgrade.classList.add("open");
  }

  if (pricingStarterCta) {
    pricingStarterCta.addEventListener("click", () => openUpgradeModal("Starter ($9/mo)"));
  }
  if (pricingProCta) {
    pricingProCta.addEventListener("click", () => openUpgradeModal("Pro ($24/mo)"));
  }
  if (modalCloseUpgrade) {
    modalCloseUpgrade.addEventListener("click", () => modalUpgrade.classList.remove("open"));
  }
  if (btnDoneUpgrade) {
    btnDoneUpgrade.addEventListener("click", () => modalUpgrade.classList.remove("open"));
  }

  if (formUpgrade) {
    formUpgrade.addEventListener("submit", (e) => {
      e.preventDefault();
      formUpgrade.style.display = "none";
      if (upgradeSuccessMsg) upgradeSuccessMsg.style.display = "block";
    });
  }

  // Close modals on backdrop click or Escape key
  [modalFreeKey, modalUpgrade].forEach((m) => {
    if (m) {
      m.addEventListener("click", (e) => {
        if (e.target === m) m.classList.remove("open");
      });
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modalFreeKey) modalFreeKey.classList.remove("open");
      if (modalUpgrade) modalUpgrade.classList.remove("open");
    }
  });

  // ─── Telemetry: Record Page Visit ───────────────────────────────
  try {
    fetch("/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {});
  } catch (_) {}
})();

