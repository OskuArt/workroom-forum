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

  document.querySelectorAll('img.avatar').forEach((img) => {
    if (/\.gif(?:$|\?)/i.test(img.src)) img.dataset.animatedAvatar = 'true';
  });

  const appBoard = document.querySelector('[data-applications-board]');
  if (appBoard) {
    const tabs = Array.from(appBoard.querySelectorAll('[data-application-filter]'));
    const cards = Array.from(appBoard.querySelectorAll('[data-application-status]'));
    const empty = appBoard.querySelector('[data-application-filter-empty]');

    const applyFilter = (status, push = true) => {
      const normalized = ['waiting','interview','offer','rejected','not_fit'].includes(status) ? status : 'all';
      let visible = 0;
      cards.forEach((card) => {
        const show = normalized === 'all' || card.dataset.applicationStatus === normalized;
        card.hidden = !show;
        if (show) visible += 1;
      });
      tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.applicationFilter === normalized));
      if (empty) empty.hidden = visible !== 0;
      if (push) history.replaceState(null, '', normalized === 'all' ? '/applications' : `/applications#${normalized}`);
    };

    tabs.forEach((tab) => tab.addEventListener('click', (event) => {
      event.preventDefault();
      applyFilter(tab.dataset.applicationFilter);
    }));

    applyFilter(location.hash.replace('#','') || 'all', false);

    appBoard.querySelectorAll('.status-select').forEach((select) => {
      select.addEventListener('change', () => {
        select.className = select.className.replace(/status-bg-[^\s]+/g, '').trim();
        select.classList.add(`status-bg-${select.value}`);
      });
    });
  }

  const startRefreshCountdown = () => {
    const timers = Array.from(document.querySelectorAll('[data-job-refresh-timer]'));
    if (!timers.length) return;

    const getTarget = () => {
      const now = new Date();
      const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      return Date.UTC(
        moscow.getUTCFullYear(),
        moscow.getUTCMonth(),
        moscow.getUTCDate() + 1,
        0, 0, 0
      ) - 3 * 60 * 60 * 1000;
    };

    let target = getTarget();
    const tick = () => {
      const now = Date.now();
      if (!Number.isFinite(target) || now >= target) target = getTarget();
      const total = Math.max(0, Math.floor((target - now) / 1000));
      const h = String(Math.floor(total / 3600)).padStart(2, '0');
      const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const s = String(total % 60).padStart(2, '0');
      timers.forEach(el => { el.textContent = `${h}:${m}:${s}`; });
    };

    tick();
    window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  };

  startRefreshCountdown();
})();
