(() => {
  const socket = typeof io !== 'undefined' ? io() : null;

  document.querySelectorAll('[data-cv-counter]').forEach((el) => {
    const cvId = el.dataset.cvCounter;
    if (!socket || !cvId) return;
    socket.emit('watch_cv', cvId);
    socket.on('cv_view_count', (payload) => {
      if (String(payload.cvId) === String(cvId)) el.textContent = payload.count;
    });
  });

  const thread = document.querySelector('[data-chat-thread]');
  const chatForm = document.querySelector('[data-chat-form]');
  if (thread) thread.scrollTop = thread.scrollHeight;

  function formatMessageTime(value) {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
  }

  function buildMessageBubble(m, me) {
    const mine = m.senderUsername === me || Number(m.sender_id) === Number(thread?.dataset.meId);
    const div = document.createElement('div');
    div.className = `bubble ${mine ? 'mine' : ''}`;
    div.dataset.messageId = m.id;
    div.dataset.mine = mine ? '1' : '0';

    if (m.shared_job_id) {
      const card = document.createElement('a');
      card.className = 'shared-job-message';
      card.href = `/jobs/${m.shared_job_id}`;
      const kicker = document.createElement('span');
      kicker.className = 'shared-job-kicker';
      kicker.textContent = 'ВАКАНСИЯ ↗';
      const title = document.createElement('strong');
      title.textContent = m.body || 'Открыть вакансию';
      card.append(kicker, title);
      div.appendChild(card);
    } else if (m.body) {
      const text = document.createElement('div');
      text.className = 'bubble-main';
      text.textContent = m.body;
      div.appendChild(text);
    }
    if (m.media_id) {
      const img = document.createElement('img');
      img.src = `/media/${m.media_id}`;
      img.alt = 'Вложение';
      div.appendChild(img);
    }
    if (mine) {
      const actions = document.createElement('div');
      actions.className = 'bubble-actions';
      if (m.body && !m.shared_job_id) {
        const edit = document.createElement('button');
        edit.type = 'button'; edit.className = 'bubble-action'; edit.dataset.messageEdit = ''; edit.title = 'Редактировать'; edit.textContent = '✎';
        actions.appendChild(edit);
      }
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'bubble-action'; del.dataset.messageDelete = ''; del.title = 'Удалить'; del.textContent = '🗑';
      actions.appendChild(del);
      div.appendChild(actions);
    }

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    const edited = document.createElement('span');
    edited.dataset.editedLabel = '';
    edited.hidden = !m.edited_at;
    edited.textContent = 'изменено';
    meta.appendChild(edited);
    const time = document.createElement('time');
    time.textContent = formatMessageTime(m.created_at);
    meta.appendChild(time);
    if (mine) {
      const mark = document.createElement('span');
      mark.className = `delivery-mark ${m.read_at ? 'is-read' : ''}`;
      mark.dataset.deliveryMark = '';
      mark.textContent = m.read_at ? '✓✓' : '✓';
      meta.appendChild(mark);
    }
    div.appendChild(meta);
    return div;
  }

  async function markConversationRead() {
    if (!thread || !thread.dataset.peer || document.hidden) return;
    try {
      await fetch(`/api/messages/${encodeURIComponent(thread.dataset.peer)}/read`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{}' });
    } catch (_) {}
  }

  async function refreshReceipts() {
    if (!thread || !thread.dataset.peer || document.hidden) return;
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(thread.dataset.peer)}/status`, { headers:{ 'X-Requested-With':'fetch' } });
      if (!response.ok) return;
      const data = await response.json();
      (data.messages || []).forEach((item) => {
        const bubble = thread.querySelector(`[data-message-id="${CSS.escape(String(item.id))}"]`);
        if (!bubble) return;
        const mark = bubble.querySelector('[data-delivery-mark]');
        if (mark) {
          mark.textContent = item.readAt ? '✓✓' : '✓';
          mark.classList.toggle('is-read', Boolean(item.readAt));
        }
        const label = bubble.querySelector('[data-edited-label]');
        if (label) label.hidden = !item.editedAt;
      });
    } catch (_) {}
  }

  if (chatForm && socket && thread) {
    chatForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = chatForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const response = await fetch(chatForm.action, { method:'POST', body:new FormData(chatForm), headers:{ 'X-Requested-With':'fetch' } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось отправить сообщение');
        chatForm.reset();
      } catch (err) {
        alert(err.message);
      } finally {
        submit.disabled = false;
      }
    });

    const me = thread.dataset.me;
    const peer = thread.dataset.peer;
    socket.on('message:new', (m) => {
      const belongs = (m.senderUsername === me && m.receiverUsername === peer) || (m.senderUsername === peer && m.receiverUsername === me);
      if (!belongs || thread.querySelector(`[data-message-id="${m.id}"]`)) return;
      thread.appendChild(buildMessageBubble(m, me));
      thread.scrollTop = thread.scrollHeight;
      if (m.senderUsername === peer) markConversationRead().then(refreshReceipts);
    });

    thread.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-message-edit]');
      const deleteButton = event.target.closest('[data-message-delete]');
      const bubble = event.target.closest('[data-message-id]');
      if (!bubble) return;
      const id = bubble.dataset.messageId;

      if (editButton) {
        const body = bubble.querySelector('.bubble-main');
        if (!body) return;
        const next = prompt('Редактировать сообщение:', body.textContent);
        if (next == null || !next.trim()) return;
        try {
          const response = await fetch(`/api/messages/${id}/edit`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ body:next }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Не удалось изменить сообщение.');
          body.textContent = data.message.body;
          const label = bubble.querySelector('[data-edited-label]');
          if (label) label.hidden = false;
        } catch (err) { alert(err.message); }
      }

      if (deleteButton) {
        const mine = bubble.dataset.mine === '1';
        let scope = 'self';
        if (mine) {
          const both = confirm('OK = удалить у обоих. Отмена = выбрать удаление только у себя.');
          scope = both ? 'both' : 'self';
          if (!both && !confirm('Удалить сообщение только у себя?')) return;
        } else if (!confirm('Удалить это сообщение только у себя?')) return;
        try {
          const response = await fetch(`/api/messages/${id}/delete`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ scope }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Не удалось удалить сообщение.');
          bubble.remove();
        } catch (err) { alert(err.message); }
      }
    });

    markConversationRead().then(refreshReceipts);
    window.setInterval(refreshReceipts, 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) markConversationRead().then(refreshReceipts);
    });
  }

  // Vacancy sharing: accepted contacts are loaded only when the panel opens.
  document.querySelectorAll('[data-job-share]').forEach((panel) => {
    const jobId = panel.dataset.jobId;
    const strip = panel.querySelector('[data-job-share-contacts]');
    const status = panel.querySelector('[data-job-share-status]');
    let loaded = false;

    const renderContacts = (contacts) => {
      strip.innerHTML = '';
      if (!contacts.length) {
        const empty = document.createElement('div');
        empty.className = 'contact-strip-empty';
        empty.textContent = 'В контактах пока никого нет.';
        strip.appendChild(empty);
        return;
      }
      contacts.forEach((contact) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'share-contact';
        button.dataset.shareContact = contact.id;
        button.title = `Отправить @${contact.username}`;

        if (contact.avatarMediaId) {
          const img = document.createElement('img');
          img.src = `/media/${contact.avatarMediaId}`;
          img.alt = '';
          button.appendChild(img);
        } else {
          const avatar = document.createElement('span');
          avatar.className = 'share-contact-avatar';
          avatar.textContent = '@';
          button.appendChild(avatar);
        }
        const name = document.createElement('strong');
        name.textContent = contact.name || `@${contact.username}`;
        const nick = document.createElement('span');
        nick.textContent = `@${contact.username}`;
        button.append(name, nick);
        if (contact.profession) {
          const profession = document.createElement('small');
          profession.textContent = contact.profession;
          button.appendChild(profession);
        }
        strip.appendChild(button);
      });
    };

    const load = async () => {
      if (loaded || !jobId) return;
      loaded = true;
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/contacts`, { headers:{ 'X-Requested-With':'fetch' } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить контакты.');
        renderContacts(data.contacts || []);
      } catch (err) {
        loaded = false;
        strip.innerHTML = `<div class="contact-strip-empty"></div>`;
        strip.firstElementChild.textContent = err.message;
      }
    };

    panel.addEventListener('toggle', () => { if (panel.open) load(); });
    strip?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-share-contact]');
      if (!button || button.disabled) return;
      button.disabled = true;
      status.textContent = 'Отправляю…';
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/share`, {
          method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ userId:button.dataset.shareContact }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Не удалось переслать вакансию.');
        button.classList.add('is-sent');
        button.title = 'Вакансия отправлена';
        status.textContent = `Отправлено @${data.sent?.[0]?.username || ''} ✓`;
      } catch (err) {
        button.disabled = false;
        status.textContent = err.message;
      }
    });
  });

  const customSelects = [];
  document.querySelectorAll('select.custom-select').forEach((select, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'custom-select-wrap';
    wrap.dataset.theme = select.dataset.theme || '';
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'custom-select-trigger'; trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
    const menu = document.createElement('div'); menu.className = 'custom-select-menu';
    const list = document.createElement('div'); list.className = 'custom-select-list'; list.id = `custom-select-list-${index}`; list.setAttribute('role','listbox');
    trigger.setAttribute('aria-controls', list.id); menu.appendChild(list);
    select.parentNode.insertBefore(wrap, select); wrap.appendChild(select); wrap.appendChild(trigger); wrap.appendChild(menu);
    const options = Array.from(select.options); const optionButtons = [];
    const refresh = () => {
      const selected = select.options[select.selectedIndex] || options[0];
      trigger.textContent = selected ? selected.textContent : (select.dataset.placeholder || 'Выбрать');
      optionButtons.forEach(button => { const active = button.dataset.value === select.value; button.classList.toggle('is-selected', active); button.setAttribute('aria-selected', active ? 'true':'false'); });
    };
    const close = () => { wrap.classList.remove('is-open'); trigger.setAttribute('aria-expanded','false'); };
    const open = () => { customSelects.forEach(item => { if (item.wrap !== wrap) item.close(); }); wrap.classList.add('is-open'); trigger.setAttribute('aria-expanded','true'); (optionButtons.find(button => button.dataset.value === select.value) || optionButtons[0])?.scrollIntoView({ block:'nearest' }); };
    options.forEach(option => {
      const button = document.createElement('button'); button.type='button'; button.className='custom-select-option'; button.dataset.value=option.value; button.textContent=option.textContent; button.setAttribute('role','option');
      button.addEventListener('click', () => { select.value=option.value; select.dispatchEvent(new Event('change',{ bubbles:true })); refresh(); close(); trigger.focus(); });
      optionButtons.push(button); list.appendChild(button);
    });
    trigger.addEventListener('click', () => wrap.classList.contains('is-open') ? close() : open());
    trigger.addEventListener('keydown', event => { if (['ArrowDown','Enter',' '].includes(event.key)) { event.preventDefault(); open(); (optionButtons.find(button => button.dataset.value===select.value)||optionButtons[0])?.focus(); } if (event.key==='Escape') close(); });
    list.addEventListener('keydown', event => { const current=optionButtons.indexOf(document.activeElement); if(event.key==='ArrowDown'){event.preventDefault();optionButtons[Math.min(optionButtons.length-1,current+1)]?.focus();}else if(event.key==='ArrowUp'){event.preventDefault();optionButtons[Math.max(0,current-1)]?.focus();}else if(event.key==='Escape'){event.preventDefault();close();trigger.focus();} });
    customSelects.push({ wrap, close }); refresh();
  });

  document.addEventListener('click', event => { customSelects.forEach(({wrap,close}) => { if(!wrap.contains(event.target)) close(); }); });
  document.querySelectorAll('.salary-toggle input').forEach(input => input.addEventListener('change', () => input.closest('.salary-toggle')?.classList.toggle('is-active', input.checked)));
  document.querySelectorAll('[data-confirm]').forEach(el => el.addEventListener('click', e => { if(!confirm(el.dataset.confirm)) e.preventDefault(); }));
})();
