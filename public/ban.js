(() => {
  const el = document.querySelector('[data-ban-countdown]');
  if (!el) return;
  const target = new Date(el.dataset.banUntil || '').getTime();
  if (!Number.isFinite(target)) return;

  const pad = n => String(Math.max(0, n)).padStart(2, '0');
  let redirected = false;

  const tick = () => {
    const left = Math.max(0, target - Date.now());
    const totalSeconds = Math.floor(left / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    el.textContent = days > 0 ? `${days}д ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    if (left <= 0 && !redirected) {
      redirected = true;
      el.textContent = '00:00:00';
      window.setTimeout(() => window.location.replace('/'), 900);
    }
  };

  tick();
  window.setInterval(tick, 1000);
})();
