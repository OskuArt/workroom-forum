(() => {
  const elements = () => Array.from(document.querySelectorAll('[data-presence-user]'));
  let state = new Map();

  function relativeLastSeen(value) {
    if (!value) return 'давно не заходил(а)';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'давно не заходил(а)';
    const diff = Math.max(0, Date.now() - date.getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 3) return 'онлайн';
    if (mins < 60) return `был(а) ${mins} мин. назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `был(а) ${hours} ч. назад`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `был(а) ${days} дн. назад`;
    return `был(а) ${date.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'})}`;
  }

  function apply() {
    elements().forEach(el => {
      const key = String(el.dataset.presenceUser || '').toLowerCase();
      const item = state.get(key);
      if (!item) { el.textContent = 'статус скрыт'; el.classList.remove('is-online'); return; }
      el.textContent = item.online ? 'онлайн' : relativeLastSeen(item.lastSeenAt);
      el.classList.toggle('is-online', Boolean(item.online));
    });

    document.querySelectorAll('.share-contact').forEach(button => {
      const match = String(button.title || '').match(/@([^\s]+)/);
      const key = match?.[1]?.toLowerCase();
      if (!key || button.querySelector('.presence-dot')) return;
      const item = state.get(key);
      if (!item) return;
      const dot = document.createElement('span');
      dot.className = `presence-dot ${item.online ? 'is-online' : ''}`;
      dot.title = item.online ? 'Онлайн' : relativeLastSeen(item.lastSeenAt);
      button.appendChild(dot);
    });
  }

  async function refresh() {
    if (document.hidden || !elements().length && !document.querySelector('[data-job-share]')) return;
    try {
      const response = await fetch('/api/presence/contacts', { headers:{ 'X-Requested-With':'fetch' } });
      if (!response.ok) return;
      const data = await response.json();
      state = new Map((data.contacts || []).filter(x=>x.username).map(x=>[String(x.username).toLowerCase(),x]));
      apply();
    } catch (_) {}
  }

  const observer = new MutationObserver(() => apply());
  observer.observe(document.body, { childList:true, subtree:true });
  refresh();
  window.setInterval(refresh, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
