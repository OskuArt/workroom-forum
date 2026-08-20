/* CONSTELLATION V7 interaction features */

const V7_REACTION_OPTIONS=["❤️","😂","🥹","😮","😢","😡","🔥","👏","😍","🤝"];
let v7OpenChoice=null;
let v7ChatCursor=null;
let v7PollingUser=null;
let v7AchievementBusy=false;

function v7IsoToMask(v){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||"")))return "";
  const [y,m,d]=v.split("-");
  return `${d}.${m}.${y}`;
}
function v7BirthToIso(text){
  const digits=String(text||"").replace(/\D/g,"").slice(0,8);
  if(digits.length!==8)return "";
  const d=+digits.slice(0,2),m=+digits.slice(2,4),y=+digits.slice(4,8);
  if(y<1900||m<1||m>12||d<1||d>31)return "";
  const dt=new Date(y,m-1,d,12,0,0,0);
  if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d)return "";
  return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function v7MaskBirthInput(el){
  const d=el.value.replace(/\D/g,"").slice(0,8);
  let out=d.slice(0,2);
  if(d.length>2)out+="."+d.slice(2,4);
  if(d.length>4)out+="."+d.slice(4,8);
  el.value=out;
  const hidden=document.getElementById("pBirth");
  if(hidden)hidden.value=v7BirthToIso(out);
}
function v7InstallBirthInput(){
  const hidden=document.getElementById("pBirth"),btn=document.getElementById("birthButton");
  if(!hidden||!btn)return;
  const inp=document.createElement("input");
  inp.id="birthText";
  inp.className="input maskedDateInput";
  inp.inputMode="numeric";
  inp.autocomplete="bday";
  inp.maxLength=10;
  inp.placeholder="ДД.ММ.ГГГГ";
  inp.value=v7IsoToMask(hidden.value);
  inp.addEventListener("input",()=>v7MaskBirthInput(inp));
  btn.replaceWith(inp);
}

function v7ChoiceSummary(chosen){
  const arr=[...chosen];
  if(!arr.length)return "";
  const shown=arr.slice(0,4).map(x=>`<span class="miniChoice">${esc(x)}</span>`).join("");
  return shown+(arr.length>4?`<span class="miniChoice">+${arr.length-4}</span>`:"");
}
function v7RenderChoice(kind,options,chosen,boxId,countId,max,toggleName){
  const box=document.getElementById(boxId);if(!box)return;
  const input=box.parentElement?.querySelector?.("input")||document.getElementById(kind+"Search");
  const q=(input?.value||"").trim().toLowerCase();
  const rows=[...options].sort((a,b)=>a.localeCompare(b,"ru",{sensitivity:"base"})).filter(x=>!q||x.toLowerCase().includes(q));
  box.innerHTML=rows.length?rows.map(x=>`<button type="button" class="choiceOptionRow ${chosen.has(x)?"on":""}" onclick="${toggleName}('${esc(x)}')"><span>${esc(x)}</span><span class="choiceCheck"><span>${chosen.has(x)?"✓":""}</span></span></button>`).join(""):`<div class="choiceEmpty">Ничего не найдено</div>`;
  choiceCount(countId,chosen.size,max);
  const wrap=box.closest(".choiceDropdown");
  if(wrap){
    wrap.classList.toggle("is-open",v7OpenChoice===kind);
    const summary=wrap.querySelector(".choiceSelectedSummary");if(summary)summary.innerHTML=v7ChoiceSummary(chosen);
  }
}
renderTagPicker=function(){v7RenderChoice("tags",V5_TAG_OPTIONS,window.__tags||new Set(),"tagOptions","tagCount",15,"toggleTag")};
renderLanguagePicker=function(){v7RenderChoice("languages",V5_LANGUAGES,window.__languages||new Set(),"languageOptions","languageCount",12,"toggleLanguage")};
renderFetishPicker=function(){v7RenderChoice("fetishes",V5_FETISHES,window.__fetishes||new Set(),"fetishOptions","fetishCount",10,"toggleFetish")};
function v7OpenChoiceMenu(kind){
  v7OpenChoice=kind;
  document.querySelectorAll(".choiceDropdown").forEach(w=>w.classList.toggle("is-open",w.dataset.choiceKind===kind));
}
function v7SetupChoiceDropdown(inputId,boxId,kind,renderFn){
  const input=document.getElementById(inputId),box=document.getElementById(boxId);if(!input||!box)return;
  let wrap=input.closest(".choiceDropdown");
  if(!wrap){
    wrap=document.createElement("div");wrap.className="choiceDropdown";wrap.dataset.choiceKind=kind;
    input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
    const summary=document.createElement("div");summary.className="choiceSelectedSummary";wrap.appendChild(summary);wrap.appendChild(box);
  }
  input.addEventListener("focus",()=>{v7OpenChoiceMenu(kind);renderFn()});
  input.addEventListener("click",()=>{v7OpenChoiceMenu(kind);renderFn()});
  input.addEventListener("input",()=>{v7OpenChoiceMenu(kind);renderFn()});
  renderFn();
}
function v7SetupProfilePickers(){
  v7OpenChoice=null;
  v7SetupChoiceDropdown("languageSearch","languageOptions","languages",renderLanguagePicker);
  v7SetupChoiceDropdown("tagSearch","tagOptions","tags",renderTagPicker);
  v7SetupChoiceDropdown("fetishSearch","fetishOptions","fetishes",renderFetishPicker);
}
document.addEventListener("pointerdown",e=>{
  if(e.target.closest?.(".choiceDropdown"))return;
  v7OpenChoice=null;document.querySelectorAll(".choiceDropdown.is-open").forEach(x=>x.classList.remove("is-open"));
});

const v7BaseRenderOnboarding=renderOnboarding;
renderOnboarding=function(m){
  v7BaseRenderOnboarding(m);
  v7InstallBirthInput();
  v7SetupProfilePickers();
};

function v7TimeMaskValue(hour,minute){return `${String(hour??0).padStart(2,"0")}:${String(minute??0).padStart(2,"0")}`}
function v7MaskTimeInput(el){
  const d=el.value.replace(/\D/g,"").slice(0,4);
  el.value=d.length<=2?d:d.slice(0,2)+":"+d.slice(2);
}
function v7ParseTime(text){
  const d=String(text||"").replace(/\D/g,"");
  if(d.length!==4)return null;
  const h=+d.slice(0,2),m=+d.slice(2,4);
  if(h<0||h>23||m<0||m>59)return null;
  return {hour:h,minute:m};
}
function v7InstallTimeInput(){
  const row=document.querySelector(".timeSelects");if(!row)return;
  const value=v7TimeMaskValue(meetingDraft?.hour,meetingDraft?.minute);
  row.innerHTML=`<input id="meetingTime" class="input maskedTimeInput" inputmode="numeric" maxlength="5" value="${value}" placeholder="ЧЧ:ММ" oninput="v7MaskTimeInput(this)">`;
}
const v7BaseMeetingPicker=renderMeetingPicker;
renderMeetingPicker=function(){v7BaseMeetingPicker();v7InstallTimeInput()};
const v7BaseMeetingEditPicker=renderMeetingEditPicker;
renderMeetingEditPicker=function(){
  v7BaseMeetingEditPicker();v7InstallTimeInput();
  const picker=document.querySelector(".picker");
  if(picker&&meetingDraft?.editId){
    const note=picker.querySelector("p.muted");
    if(note&&(meetingDraft.status==="completed"||meetingDraft.status==="cancelled"))note.textContent="Историческую встречу можно редактировать. Отметка о том, состоялась она или нет, сохранится.";
    const target=picker.querySelector(".pickerHead");
    if(target)target.insertAdjacentHTML("beforebegin",`<div style="margin:10px 0 14px">${v7OutcomeToggle({id:meetingDraft.editId,status:meetingDraft.status})}</div>`);
  }
};
async function saveMeetingDraft(){
  const t=v7ParseTime(document.getElementById("meetingTime")?.value),place=document.getElementById("meetingPlace")?.value.trim();
  if(!t)return toast("Введи время в формате ЧЧ:ММ");
  if(!place)return toast("Укажи место встречи");
  meetingDraft.hour=t.hour;meetingDraft.minute=t.minute;meetingDraft.place=place;
  const when=new Date(`${meetingDraft.selected}T${String(t.hour).padStart(2,"0")}:${String(t.minute).padStart(2,"0")}:00`);
  if(when<=new Date())return toast("Выбери время в будущем");
  try{await api("/api/dates",{method:"POST",body:JSON.stringify({matchId:meetingDraft.matchId,when:when.toISOString(),place})});closeOverlay();toast("Встреча отправлена на согласование");go("calendar");checkAchievementsNow()}catch(e){toast("Не удалось отправить встречу")}
}
editDate=async function(id){
  const all=(await api("/api/dates")).dates,e=all.find(x=>x.id===id);if(!e)return;
  const d=new Date(e.when);
  meetingDraft={editId:id,name:e.person,selected:localKey(d),y:d.getFullYear(),m:d.getMonth(),hour:d.getHours(),minute:d.getMinutes(),place:e.place,status:e.status};
  renderMeetingEditPicker();
};
async function saveMeetingEditDraft(){
  const t=v7ParseTime(document.getElementById("meetingTime")?.value),place=document.getElementById("meetingPlace")?.value.trim();
  if(!t||!place)return toast("Проверь время и место");
  const when=new Date(`${meetingDraft.selected}T${String(t.hour).padStart(2,"0")}:${String(t.minute).padStart(2,"0")}:00`);
  if(!Number.isFinite(+when))return toast("Проверь дату встречи");
  try{const d=await api(`/api/dates/${meetingDraft.editId}/edit-v7`,{method:"PATCH",body:JSON.stringify({when:when.toISOString(),place})});meetingDraft.status=d.status;closeOverlay();toast(d.status==="pending"?"Изменения отправлены на согласование":"Встреча обновлена");renderCalendar()}catch(e){toast("Не удалось изменить встречу")}
}
statusHtml=function(s){const l={pending:"На согласовании",confirmed:"Подтверждена",declined:"Отклонена",completed:"Состоялась",cancelled:"Не состоялась"}[s]||s;return `<span class="status ${s}">${l}</span>`};
function v7OutcomeToggle(e){
  return `<div class="meetingOutcome" aria-label="Итог встречи"><button class="did ${e.status==="completed"?"on":""}" onclick="setMeetingOutcome('${e.id}','completed')">Состоялась</button><button class="didNot ${e.status==="cancelled"?"on":""}" onclick="setMeetingOutcome('${e.id}','cancelled')">Не состоялась</button></div>`;
}
async function setMeetingOutcome(id,status){
  try{await api(`/api/dates/${id}/outcome-v7`,{method:"PATCH",body:JSON.stringify({status})});closeOverlay();toast(status==="completed"?"Отмечено: встреча состоялась":"Отмечено: встреча не состоялась");renderCalendar();checkAchievementsNow()}catch(e){toast("Не удалось изменить итог встречи")}
}
completeDate=async function(id){return setMeetingOutcome(id,"completed")};
openDay=async function(key){
  const ev=(await api("/api/dates")).dates.filter(d=>localKey(d.when)===key),date=new Date(key+"T12:00:00");
  modal(`<h2>${date.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</h2>${ev.length?`<div class="meetingList">${ev.map(e=>`<div class="meetingRow"><img src="${e.photo}" alt=""><div><h4>${esc(e.person)}</h4><p>${new Date(e.when).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})} · ${esc(cap(e.place))}</p>${statusHtml(e.status)}</div><div class="actions">${e.direction==="incoming"&&e.status==="pending"?`<button class="btn accent" onclick="respondDate('${e.id}','confirmed')">Принять</button><button class="btn ghost" onclick="respondDate('${e.id}','declined')">Отказаться</button>`:""}<button class="iconBtn" title="Редактировать" onclick="editDate('${e.id}')">✎</button>${v7OutcomeToggle(e)}</div></div>`).join("")}</div>`:`<p class="muted">На эту дату встреч нет.</p>`}`);
};
const v7BaseRenderCalendar=renderCalendar;
renderCalendar=async function(){
  await v7BaseRenderCalendar();
  try{
    const dates=(await api("/api/dates")).dates;
    const next=dates.filter(d=>["pending","confirmed"].includes(d.status)&&new Date(d.when)>new Date()).sort((a,b)=>new Date(a.when)-new Date(b.when))[0];
    const box=document.querySelector(".next");
    if(next&&box&&!box.querySelector(".nextMeetingControls"))box.insertAdjacentHTML("beforeend",`<div class="nextMeetingControls"><button class="btn ghost compact" onclick="editDate('${next.id}')">Редактировать</button>${v7OutcomeToggle(next)}</div>`);
  }catch{}
};

function v7MessageHtml(m,matchId){
  if(m.kind==="system")return `<div class="sys">${esc(m.body)}</div>`;
  const mine=m.senderId===me.id;
  const reacts=(m.reactions||[]).map(r=>`<button class="reactionPill ${r.mine?"mine":""}" onclick="reactToMessage('${matchId}','${m.id}','${r.emoji}')"><span>${r.emoji}</span><small>${r.count}</small></button>`).join("");
  return `<div class="msg ${mine?"me":""}" data-message-id="${m.id}" oncontextmenu="openReactionMenu(event,'${matchId}','${m.id}')">${m.body?esc(m.body):""}${m.image?`<img src="${m.image}" alt="Фото">`:""}${reacts?`<div class="messageReactions">${reacts}</div>`:""}<div class="messageMeta"><span>${new Date(m.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>${mine?`<span class="readTicks ${m.readAt?"read":""}" title="${m.readAt?"Прочитано":"Доставлено"}">${m.readAt?"✓✓":"✓"}</span>`:""}</div></div>`;
}
loadMessages=async function(matchId,silent=false){
  if(page!=="chat")return;
  try{
    const all=(await api(`/api/matches?mode=${mode}`)).matches,meta=all.find(x=>x.matchId===matchId);
    if(!meta){activeChat=null;if(!silent)renderChats();return}
    const d=await api(`/api/matches/${matchId}/messages-v7`),room=document.getElementById("chatRoom");if(!room)return;
    room.innerHTML=`<div class="chatHead"><div class="chatHeadPerson"><div class="avatarWrap"><img src="${meta.person.photo}" alt="">${meta.online?'<span class="onlineDot"></span>':""}</div><div><b>${esc(meta.person.name)}</b><div class="small muted">${meta.online?"Онлайн":meta.muted?"Уведомления выключены":"Не в сети"}</div></div></div><div class="actions"><button class="btn ghost compact" onclick="openDateModal('${matchId}','${esc(meta.person.name)}')">${calendarGlyph()} Встреча</button><button class="iconBtn" onclick="chatMenu('${matchId}','${meta.person.id}','${esc(meta.person.name)}',${meta.pinned},${meta.muted})">•••</button></div></div><div class="messages" id="msgs">${d.messages.map(m=>v7MessageHtml(m,matchId)).join("")}</div><div class="composer"><label class="btn ghost">＋<input class="hidden" type="file" accept="image/*" onchange="sendChatPhoto('${matchId}',this)"></label><input id="msgText" class="input" placeholder="Сообщение" onkeydown="if(event.key==='Enter')sendText('${matchId}')"><button class="btn accent" onclick="sendText('${matchId}')">→</button></div>`;
    const box=document.getElementById("msgs");box.scrollTop=box.scrollHeight;
  }catch(e){if(!silent)toast("Не удалось открыть чат")}
};
function closeReactionMenu(){document.getElementById("v7ReactionMenu")?.remove()}
function openReactionMenu(event,matchId,messageId){
  event.preventDefault();event.stopPropagation();closeReactionMenu();
  const menu=document.createElement("div");menu.id="v7ReactionMenu";menu.className="reactionMenu";
  menu.innerHTML=V7_REACTION_OPTIONS.map(x=>`<button type="button" title="Реакция" onclick="reactToMessage('${matchId}','${messageId}','${x}')">${x}</button>`).join("");
  document.body.appendChild(menu);
  const r=menu.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(event.clientX,window.innerWidth-r.width-8))+"px";
  menu.style.top=Math.max(8,Math.min(event.clientY,window.innerHeight-r.height-8))+"px";
  setTimeout(()=>document.addEventListener("click",closeReactionMenu,{once:true}),0);
}
async function reactToMessage(matchId,messageId,emoji){
  try{await api(`/api/matches/${matchId}/messages/${messageId}/reaction-v7`,{method:"PUT",body:JSON.stringify({emoji})});closeReactionMenu();if(page==="chat"&&activeChat===matchId)loadMessages(matchId,true)}catch(e){toast("Не удалось поставить реакцию")}
}

function v7EnsureLiveStack(){
  let x=document.getElementById("v7LiveStack");if(x)return x;
  x=document.createElement("div");x.id="v7LiveStack";document.body.appendChild(x);return x;
}
function v7RemovePopup(el){if(!el||el.classList.contains("leaving"))return;el.classList.add("leaving");setTimeout(()=>el.remove(),230)}
function v7PreviewSeven(text){const words=String(text||"").trim().split(/\s+/).filter(Boolean);if(!words.length)return "Новое сообщение";return words.slice(0,7).join(" ")+(words.length>7?"…":"")}
function v7ShowChatPopup(e){
  const stack=v7EnsureLiveStack(),el=document.createElement("div");el.className="v7Popup chatPopup";
  el.innerHTML=`<img src="${esc(e.sender.photo||"")}" alt=""><div><strong>${esc(e.sender.name)}</strong><p>${esc(v7PreviewSeven(e.preview))}</p></div>`;
  el.addEventListener("click",()=>{v7RemovePopup(el);openChatFromPopup(e.matchId,e.mode)});stack.appendChild(el);setTimeout(()=>v7RemovePopup(el),12000);
}
async function openChatFromPopup(matchId,targetMode){
  try{if(mode!==targetMode)await switchMode(targetMode);activeChat=matchId;go("chat")}catch{toast("Не удалось открыть чат")}
}
async function pollChatEvents(){
  if(!me)return;
  try{
    const url=v7ChatCursor===null?"/api/chat-events-v7":`/api/chat-events-v7?after=${encodeURIComponent(v7ChatCursor)}`;
    const d=await api(url);
    v7ChatCursor=d.cursor;
    for(const e of d.events||[]){if(page==="chat"&&activeChat===e.matchId)continue;v7ShowChatPopup(e)}
  }catch{}
}
function v7ShowAchievementPopup(a){
  const stack=v7EnsureLiveStack(),el=document.createElement("div");el.className="v7Popup achievementPopup";
  el.innerHTML=`<div class="achPopIcon">${esc(a.icon||"✦")}</div><div><strong>Новое достижение.</strong><div class="achievementHint">Зайди в раздел «Ачивки»!</div></div>`;
  el.title=a.title||"Новое достижение";
  el.addEventListener("click",()=>{v7RemovePopup(el);go("achievements")});stack.appendChild(el);setTimeout(()=>v7RemovePopup(el),9000);
}
async function checkAchievementsNow(){
  if(!me||v7AchievementBusy)return;v7AchievementBusy=true;
  try{const d=await api("/api/achievements/check-v7",{method:"POST",body:"{}"});(d.newAchievements||[]).forEach((a,i)=>setTimeout(()=>v7ShowAchievementPopup(a),i*450))}catch{}finally{v7AchievementBusy=false}
}

const V7_ORIENTATION_CLASSES={hetero:"flag-hetero",gay:"flag-gay",lesbian:"flag-lesbian",bi:"flag-bi",pan:"flag-pan",queer:"flag-queer",other:"flag-other"};
function v7DecorateOrientationFlags(scope=document){
  const byLabel=Object.fromEntries(Object.entries(ORI).map(([k,v])=>[v,k]));
  scope.querySelectorAll?.(".badge").forEach(el=>{
    const key=byLabel[el.textContent.trim()];if(!key||el.classList.contains("orientationFlag"))return;
    el.classList.add("orientationFlag",V7_ORIENTATION_CLASSES[key]||"flag-other");
  });
}
const v7Observer=new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)if(n.nodeType===1)v7DecorateOrientationFlags(n)});
v7Observer.observe(document.documentElement,{childList:true,subtree:true});

setInterval(()=>{
  const uid=me?.id||null;
  if(uid!==v7PollingUser){v7PollingUser=uid;v7ChatCursor=null}
  if(!uid)return;
  pollChatEvents();checkAchievementsNow();v7DecorateOrientationFlags();
},4000);
setTimeout(()=>{v7DecorateOrientationFlags();if(me){pollChatEvents();checkAchievementsNow()}},500);
