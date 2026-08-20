/* CONSTELLATION V9 permanent account deletion */

const v9BaseRenderOnboarding=renderOnboarding;
renderOnboarding=function(m){
  v9BaseRenderOnboarding(m);
  const host=document.querySelector('.onboardInner');
  if(!host||!(me?.completedHarmony||me?.completedAfter))return;
  const zone=document.createElement('section');
  zone.className='deleteAccountZone';
  zone.innerHTML=`
    <div>
      <div class="kicker">опасная зона</div>
      <h3>Удаление аккаунта</h3>
      <p>Аккаунт и все связанные с ним данные будут удалены без возможности восстановления.</p>
    </div>
    <button type="button" class="btn deleteForeverBtn" onclick="openDeleteAccountWarning()">Удалить анкету навсегда</button>`;
  host.appendChild(zone);
};

function openDeleteAccountWarning(){
  modal(`
    <div class="deleteWarning">
      <div class="deleteWarningIcon">!</div>
      <div class="kicker">необратимое действие</div>
      <h2>Удалить аккаунт и анкету навсегда?</h2>
      <p>Будет полностью удалена информация об аккаунте: анкеты Harmony и After Dark, фото и данные профиля, мэтчи, чаты и сообщения, встречи, результаты тестов, ачивки, настройки и остальные связанные данные.</p>
      <div class="deleteWarningBox"><b>Восстановить удалённые данные будет невозможно.</b><span>После удаления ты сможешь зарегистрироваться заново с этой же почтой, но это будет совершенно новый аккаунт с нулевым прогрессом.</span></div>
      <div class="deleteWarningActions">
        <button type="button" class="btn ghost" onclick="closeOverlay()">Отмена</button>
        <button type="button" id="confirmDeleteAccount" class="btn deleteForeverBtn" onclick="deleteAccountForever()">Да, удалить всё</button>
      </div>
    </div>`);
}

async function deleteAccountForever(){
  const btn=document.getElementById('confirmDeleteAccount');
  if(btn){btn.disabled=true;btn.textContent='Удаляем…'}
  try{
    await api('/api/account',{method:'DELETE',body:JSON.stringify({confirm:'DELETE_FOREVER'})});
    me=null;activeChat=null;
    closeOverlay();
    document.body.className='harmony';
    root.innerHTML=`<div class="accountDeletedScreen"><div class="accountDeletedCard">${logoHtml()}<div class="deletedMark">✓</div><h1>Аккаунт удалён</h1><p>Все данные этого аккаунта удалены. С этой же почтой можно зарегистрироваться заново.</p><button class="btn accent" onclick="location.reload()">На страницу входа</button></div></div>`;
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='Да, удалить всё'}
    toast('Не удалось удалить аккаунт. Попробуй ещё раз.');
  }
}
