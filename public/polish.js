(() => {
  const loader = document.querySelector('[data-site-loader]');
  if (loader) {
    const started = performance.now();
    const hide = () => {
      const elapsed = performance.now() - started;
      const delay = Math.max(0, 1100 - elapsed);
      window.setTimeout(() => loader.classList.add('is-hidden'), delay);
    };
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide, { once: true });
    window.setTimeout(() => loader.classList.add('is-hidden'), 2400);
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('main .card, main .empty, main .cv-sheet, main .job-detail, main .profile-head');
    targets.forEach((el, index) => {
      el.classList.add('reveal-item');
      el.style.transitionDelay = `${Math.min((index % 4) * 45, 135)}ms`;
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -24px 0px' });
    targets.forEach(el => observer.observe(el));
  }

  // Make animated avatars explicit for browsers and future styling hooks.
  document.querySelectorAll('img.avatar').forEach((img) => {
    if (/\.gif(?:$|\?)/i.test(img.src)) img.dataset.animatedAvatar = 'true';
  });
})();
