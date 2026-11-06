/* 知隙 GapCoach · project site interactions */
document.documentElement.classList.add("js");

(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];

  function selectTab(tab, focus = false) {
    tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
      if (active && focus) item.focus();
    });
    panels.forEach((panel) => {
      panel.hidden = panel.id !== tab.getAttribute("aria-controls");
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        selectTab(next, true);
      }
    });
  });

  /* Lightbox */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = lightbox?.querySelector("img");
  const lightboxCaption = lightbox?.querySelector("figcaption");
  const closeButton = lightbox?.querySelector(".lightbox__close");
  let lastFocus = null;

  function openLightbox(button) {
    if (!lightbox || !lightboxImg) return;
    const img = button.querySelector("img");
    const full = button.dataset.full || img?.src || "";
    const caption = button.dataset.caption || img?.alt || "";
    lastFocus = button;
    lightboxImg.src = full;
    lightboxImg.alt = img?.alt || caption;
    if (lightboxCaption) lightboxCaption.textContent = caption;
    lightbox.hidden = false;
    document.body.classList.add("is-locked");
    closeButton?.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    lightboxImg.src = "";
    document.body.classList.remove("is-locked");
    lastFocus?.focus();
  }

  document.querySelectorAll(".shot__button").forEach((button) => {
    button.addEventListener("click", () => openLightbox(button));
  });

  closeButton?.addEventListener("click", closeLightbox);
  lightbox?.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });

  /* Copy buttons */
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copy);
      const text = target?.innerText?.trim();
      if (!text) return;
      const original = button.textContent;
      const fallbackCopy = () => {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const copied = document.execCommand("copy");
        area.remove();
        return copied;
      };
      try {
        let copied = false;
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            copied = true;
          } catch {
            copied = fallbackCopy();
          }
        } else {
          copied = fallbackCopy();
        }
        button.textContent = copied ? "已复制" : "复制失败";
      } catch {
        button.textContent = "复制失败";
      }
      window.setTimeout(() => {
        button.textContent = original;
      }, 1600);
    });
  });

  /* Reveal on scroll */
  const reveals = [...document.querySelectorAll(".reveal")];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach((el) => revealObserver.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* Active nav */
  const navLinks = [...document.querySelectorAll(".site-nav a")];
  const targets = navLinks
    .map((link) => {
      const id = link.getAttribute("href")?.slice(1);
      const section = id ? document.getElementById(id) : null;
      return section ? { link, section } : null;
    })
    .filter(Boolean);

  let ticking = false;
  function paintNav() {
    const mark = window.scrollY + 140;
    let current = null;
    targets.forEach((item) => {
      if (item.section.offsetTop <= mark) current = item;
    });
    navLinks.forEach((link) => link.classList.toggle("is-active", current?.link === link));
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(paintNav);
      }
    },
    { passive: true }
  );
  paintNav();
})();
