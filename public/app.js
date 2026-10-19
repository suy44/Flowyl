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

  // ─── Telemetry: Record Page Visit ───────────────────────────────
  try {
    fetch("/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {});
  } catch (_) {}
})();
