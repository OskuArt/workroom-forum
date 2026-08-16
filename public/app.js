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

  if (chatForm && socket) {
    chatForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = chatForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const response = await fetch(chatForm.action, { method: 'POST', body: new FormData(chatForm), headers: { 'X-Requested-With': 'fetch' } });
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
      if (!belongs) return;
      if (thread.querySelector(`[data-message-id="${m.id}"]`)) return;
      const div = document.createElement('div');
      div.className = `bubble ${m.senderUsername === me ? 'mine' : ''}`;
      div.dataset.messageId = m.id;
      if (m.body) {
        const text = document.createElement('div');
        text.textContent = m.body;
        div.appendChild(text);
      }
      if (m.media_id) {
        const img = document.createElement('img');
        img.src = `/media/${m.media_id}`;
        img.alt = 'Вложение';
        div.appendChild(img);
      }
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
    });
  }

  // Swiss pill dropdowns for the job filters. Native <select> stays in the form,
  // so query strings and keyboard/form behaviour remain reliable.
  const customSelects = [];
  document.querySelectorAll('select.custom-select').forEach((select, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'custom-select-wrap';
    wrap.dataset.theme = select.dataset.theme || '';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    const list = document.createElement('div');
    list.className = 'custom-select-list';
    list.id = `custom-select-list-${index}`;
    list.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-controls', list.id);
    menu.appendChild(list);

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    const options = Array.from(select.options);
    const optionButtons = [];
    const refresh = () => {
      const selected = select.options[select.selectedIndex] || options[0];
      trigger.textContent = selected ? selected.textContent : (select.dataset.placeholder || 'Выбрать');
      optionButtons.forEach((button) => {
        const active = button.dataset.value === select.value;
        button.classList.toggle('is-selected', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    };
    const close = () => {
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      customSelects.forEach(item => { if (item.wrap !== wrap) item.close(); });
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      const selectedButton = optionButtons.find(button => button.dataset.value === select.value) || optionButtons[0];
      if (selectedButton) selectedButton.scrollIntoView({ block: 'nearest' });
    };

    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'custom-select-option';
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      button.setAttribute('role', 'option');
      button.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
        close();
        trigger.focus();
      });
      optionButtons.push(button);
      list.appendChild(button);
    });

    trigger.addEventListener('click', () => wrap.classList.contains('is-open') ? close() : open());
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
        const selectedButton = optionButtons.find(button => button.dataset.value === select.value) || optionButtons[0];
        selectedButton?.focus();
      }
      if (event.key === 'Escape') close();
    });
    list.addEventListener('keydown', (event) => {
      const current = optionButtons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        optionButtons[Math.min(optionButtons.length - 1, current + 1)]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        optionButtons[Math.max(0, current - 1)]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
        trigger.focus();
      }
    });

    customSelects.push({ wrap, close });
    refresh();
  });

  document.addEventListener('click', (event) => {
    customSelects.forEach(({ wrap, close }) => {
      if (!wrap.contains(event.target)) close();
    });
  });

  document.querySelectorAll('.salary-toggle input').forEach((input) => {
    input.addEventListener('change', () => input.closest('.salary-toggle')?.classList.toggle('is-active', input.checked));
  });

  document.querySelectorAll('[data-confirm]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (!confirm(el.dataset.confirm)) e.preventDefault();
    });
  });
})();
