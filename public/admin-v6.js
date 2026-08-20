// CONSTELLATION V6 admin appeal controls
appeals=async function(){
  try{
    const d=await api('/api/admin/appeals');
    cache.appeals=d.appeals;
    adminMain.innerHTML=`<div class="sectionTitle"><div><h1>Апелляции</h1><p>Принятие апелляции сразу снимает связанный бан.</p></div></div><div class="adminList">${cache.appeals.map(a=>{const p=a.profile?.common||{};const closed=['accepted','rejected'].includes(a.status);return `<div class="adminRow"><img src="${p.photo||''}" alt=""><div><h3>${esc(p.name||a.user_email||a.email||'Пользователь')}</h3><p>${esc(a.text)}</p><p>Причина бана: ${esc(a.reason)} · до ${new Date(a.banned_until).toLocaleString('ru-RU')}</p><span class="statusAdmin ${a.status}">${esc(a.status)}</span></div><div class="adminActions">${closed?'':`<button class="btn ghost" onclick="appealStatus('${a.id}','reviewing',this)">В работу</button><button class="btn yellow" onclick="appealStatus('${a.id}','accepted',this)">Снять бан и принять</button><button class="btn danger" onclick="appealStatus('${a.id}','rejected',this)">Отклонить</button>`}</div></div>`}).join('')||'<div class="adminCard muted">Апелляций нет.</div>'}</div>`;
  }catch(e){toast('Не удалось загрузить апелляции: '+(e.message||'ошибка'))}
};

appealStatus=async function(id,status,button){
  const old=button?.textContent;
  if(button){button.disabled=true;button.textContent=status==='accepted'?'Снимаю бан…':'Сохраняю…'}
  try{
    const result=await api(`/api/admin/appeals/${id}/decision`,{method:'POST',body:JSON.stringify({status})});
    if(status==='accepted') toast(result.banRevoked?'Бан снят, апелляция принята':'Апелляция принята. Бан уже был снят.');
    else if(status==='rejected') toast('Апелляция отклонена');
    else toast('Апелляция взята в работу');
    await appeals();
  }catch(e){
    if(button){button.disabled=false;button.textContent=old}
    toast('Не удалось выполнить действие: '+(e.message||'ошибка'));
  }
};

revokeBan=async function(id){
  try{
    await api(`/api/admin/bans/${id}/revoke`,{method:'POST',body:'{}'});
    toast('Бан снят');
    await bans();
  }catch(e){toast('Не удалось снять бан: '+(e.message||'ошибка'))}
};
