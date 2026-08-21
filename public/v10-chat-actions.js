/* CONSTELLATION V10 chat actions */

const V10_REACTION_OPTIONS=[
  ["❤️","Сердце"],["😂","Смех"],["😊","Улыбка"],["😮","Удивление"],["😢","Грусть"],
  ["😡","Злость"],["🔥","Огонь"],["👍","Нравится"],["😍","Влюблённость"],["😏","Флирт"]
];

function v10MessageHtml(m,matchId){
  if(m.kind==="system")return `<div class="sys">${esc(m.body)}</div>`;
  const mine=m.senderId===me.id;
  const reacts=(m.reactions||[]).map(r=>`<button class="reactionPill ${r.mine?"mine":""}" onclick="reactToMessage('${matchId}','${m.id}','${r.emoji}')"><span>${r.emoji}</span><small>${r.count}</small></button>`).join("");
  return `<div class="msg ${mine?"me":""}" data-message-id="${m.id}" oncontextmenu="openReactionMenu(event,'${matchId}','${m.id}')">${mine?`<button type="button" class="msgActionButton" aria-label="Действия с сообщением" title="Действия" onclick="openMessageMenuFromButton(event,'${matchId}','${m.id}')">•••</button>`:""}${m.body?esc(m.body):""}${m.image?`<img src="${m.image}" alt="Фото">`:""}${reacts?`<div class="messageReactions">${reacts}</div>`:""}<div class="messageMeta"><span>${new Date(m.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>${mine?v8ReadTicks(!!m.readAt):""}</div></div>`;
}

loadMessages=async function(matchId,silent=false){
  if(page!=="chat")return;
  try{
    const draft=document.getElementById("msgText")?.value||"";
    const all=(await api(`/api/matches?mode=${mode}`)).matches,meta=all.find(x=>x.matchId===matchId);
    if(!meta){activeChat=null;if(!silent)renderChats();return}
    const d=await api(`/api/matches/${matchId}/messages-v10`),room=document.getElementById("chatRoom");if(!room)return;
    const inputName=`message-${matchId}-${Math.floor(Date.now()/1000)}`;
    room.innerHTML=`<div class="chatHead"><div class="chatHeadPerson"><div class="avatarWrap"><img src="${meta.person.photo}" alt="">${meta.online?'<span class="onlineDot"></span>':""}</div><div><b>${esc(meta.person.name)}</b><div class="small muted">${meta.online?"Онлайн":meta.muted?"Уведомления выключены":"Не в сети"}</div></div></div><div class="actions"><button class="btn ghost compact" onclick="openDateModal('${matchId}','${esc(meta.person.name)}')">${calendarGlyph()} Встреча</button><button class="iconBtn" onclick="chatMenu('${matchId}','${meta.person.id}','${esc(meta.person.name)}',${meta.pinned},${meta.muted})">•••</button></div></div><div class="messages" id="msgs">${d.messages.map(m=>v10MessageHtml(m,matchId)).join("")}</div><div class="composer" autocomplete="off"><label class="btn ghost">＋<input class="hidden" type="file" accept="image/*" onchange="sendChatPhoto('${matchId}',this)"></label><input id="msgText" class="input" name="${inputName}" value="${esc(draft)}" placeholder="Сообщение" autocomplete="off" aria-autocomplete="none" autocorrect="off" spellcheck="true" onkeydown="if(event.key==='Enter')sendText('${matchId}')"><button class="btn accent" onclick="sendText('${matchId}')">→</button></div>`;
    const box=document.getElementById("msgs");box.scrollTop=box.scrollHeight;
  }catch(e){if(!silent)toast("Не удалось открыть чат")}
};

function v10PositionMenu(menu,x,y){
  document.body.appendChild(menu);
  const r=menu.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(x,window.innerWidth-r.width-8))+"px";
  menu.style.top=Math.max(8,Math.min(y,window.innerHeight-r.height-8))+"px";
  setTimeout(()=>document.addEventListener("click",closeReactionMenu,{once:true}),0);
}

openReactionMenu=function(event,matchId,messageId){
  event.preventDefault();event.stopPropagation();closeReactionMenu();
  const bubble=event.target.closest?.(".msg");
  const mine=!!bubble?.classList.contains("me");
  const menu=document.createElement("div");menu.id="v7ReactionMenu";menu.className="reactionMenu v10MessageMenu";
  menu.innerHTML=`<div class="reactionChoices">${V10_REACTION_OPTIONS.map(([emoji,label])=>`<button type="button" class="reactionChoice" aria-label="${label}" title="${label}" onclick="reactToMessage('${matchId}','${messageId}','${emoji}')">${emoji}</button>`).join("")}</div>${mine?`<div class="messageMenuDivider"></div><button type="button" class="messageDeleteAction" onclick="openDeleteMessageDialog('${matchId}','${messageId}')"><span>Удалить сообщение</span><b>⌫</b></button>`:""}`;
  v10PositionMenu(menu,event.clientX,event.clientY);
};

function openMessageMenuFromButton(event,matchId,messageId){
  event.preventDefault();event.stopPropagation();
  const r=event.currentTarget.getBoundingClientRect();
  const synthetic={preventDefault(){},stopPropagation(){},target:event.currentTarget,clientX:r.right,clientY:r.bottom};
  openReactionMenu(synthetic,matchId,messageId);
}

function openDeleteMessageDialog(matchId,messageId){
  closeReactionMenu();
  modal(`<div class="deleteMessageDialog"><div class="kicker">удаление сообщения</div><h2>Где удалить?</h2><p class="muted">Сообщение принадлежит тебе. Можно скрыть его только в своей переписке или удалить у обоих участников.</p><div class="deleteMessageChoices"><button class="btn ghost" onclick="deleteOwnMessage('${matchId}','${messageId}','self')">Удалить только у меня</button><button class="btn danger" onclick="deleteOwnMessage('${matchId}','${messageId}','all')">Удалить у всех</button></div><button class="btn ghost compact cancelDeleteMessage" onclick="closeOverlay()">Отмена</button></div>`);
}

async function deleteOwnMessage(matchId,messageId,scope){
  try{
    await api(`/api/matches/${matchId}/messages/${messageId}-v10`,{method:"DELETE",body:JSON.stringify({scope})});
    closeOverlay();
    toast(scope==="all"?"Сообщение удалено у всех":"Сообщение удалено у тебя");
    if(page==="chat"&&activeChat===matchId)await loadMessages(matchId,true);
  }catch(e){
    toast("Не удалось удалить сообщение");
  }
}
