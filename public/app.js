
const root = document.getElementById("root");
const overlay = document.getElementById("overlay");
const toastRoot = document.getElementById("toast");

const LOGO = `<svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
<path d="M4.5 14C4.5 9.6 8.1 6 12.5 6c3.2 0 6 1.9 7.3 4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
<path d="M23.5 14c0 4.4-3.6 8-8 8-3.2 0-6-1.9-7.3-4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
<path d="M14 8.6l1.15 3.25L18.4 13l-3.25 1.15L14 17.4l-1.15-3.25L9.6 13l3.25-1.15L14 8.6Z" fill="currentColor"/>
</svg>`;
const logo = () => `<div class="logo"><div class="logoIcon">${LOGO}</div><span>CONSTELLATION</span></div>`;

const ORI={hetero:"Гетеро",gay:"Гомо",lesbian:"Лесби",bi:"Би",pan:"Пан",queer:"Квир",other:"Другое"};
const GEN={woman:"Женщина",man:"Мужчина",nonbinary:"Небинарный",other:"Другое"};
const FETISHES=["Ролевые сценарии","BDSM","Доминирование","Подчинение","Бондаж","Сенсорные игры","Массаж","Латекс","Кожа","Нижнее бельё","Униформа","Обувь","Перчатки","Маски","Татуировки","Запахи","Голос","Dirty talk","Игры с властью","Игры с образом","Косплей","Эстетика pin-up","Медленный темп","Спонтанность","Публичный флирт","Фотосессии","Танцы","Флирт в переписке"];

const RANKS=[
  {name:"Новичок",days:7},{name:"Опытный",days:30},{name:"Профи",days:180},
  {name:"Мастер",days:365},{name:"Ветеран",days:1095},{name:"Легенда",days:1825}
];

const TESTS={
  mbti:{title:"MBTI",subtitle:"20 утверждений",questions:[
    ["Мне легко первым(ой) начать разговор с незнакомым человеком","EI",1],["После большого количества общения мне нужно побыть одному(ой)","EI",-1],["Я часто думаю вслух, чтобы лучше понять собственную мысль","EI",1],["В новой компании я скорее сначала наблюдаю","EI",-1],["Новые знакомства обычно дают мне энергию","EI",1],
    ["Меня особенно увлекают идеи, которые пока трудно реализовать","NS",1],["Я скорее доверяю конкретному опыту, чем красивой концепции","NS",-1],["Мне нравится искать скрытые связи между разными темами","NS",1],["В рассказах я быстро замечаю фактические несостыковки","NS",-1],["Мне интересно представлять несколько возможных сценариев будущего","NS",1],
    ["При сложном решении я прежде всего думаю о логике последствий","TF",1],["Мне трудно игнорировать эмоциональное состояние людей вокруг","TF",-1],["Даже неприятную правду лучше сформулировать максимально точно","TF",1],["Для меня важно, чтобы решение ощущалось человечным","TF",-1],["В споре последовательность аргументов важнее атмосферы разговора","TF",1],
    ["Мне спокойнее, когда планы определены заранее","JP",1],["Я легко меняю планы в последний момент","JP",-1],["Мне нравится закрывать одну задачу перед переходом к следующей","JP",1],["Свободный день без плана кажется мне подарком","JP",-1],["Я чаще заранее готовлюсь к важным событиям","JP",1]
  ]},
  attachment:{title:"Тип привязанности",subtitle:"18 утверждений",questions:[
    ["Я могу прямо сказать близкому человеку, что мне нужна поддержка","secure"],["Пауза в переписке часто заставляет меня сомневаться в отношении человека ко мне","anxious"],["Когда отношения становятся очень близкими, мне хочется увеличить дистанцию","avoidant"],["Во время конфликта я могу обсуждать проблему, не ставя под сомнение сами отношения","secure"],["Мне важно регулярно получать подтверждение, что человек всё ещё заинтересован во мне","anxious"],["Мне проще справляться с переживаниями самостоятельно, чем делиться ими","avoidant"],["Я могу попросить о пространстве, не исчезая без объяснения","secure"],["Отмена встречи легко воспринимается мной как признак снижения интереса","anxious"],["Если от меня ожидают много эмоциональной открытости, я чувствую давление","avoidant"],["Мне комфортно обсуждать ожидания и границы заранее","secure"],["После хорошего свидания мне трудно не анализировать каждую мелочь","anxious"],["Я иногда специально показываю меньше интереса, чем чувствую","avoidant"],["Я могу спокойно пережить разницу во мнениях с близким человеком","secure"],["Когда человек отвечает короче обычного, я быстро замечаю это","anxious"],["Во время напряжённого разговора мне хочется как можно скорее его закончить","avoidant"],["Я доверяю отношениям, когда слова и поступки достаточно последовательны","secure"],["Мне трудно не думать о том, насколько я важен(на) человеку","anxious"],["Независимость для меня часто важнее эмоциональной близости","avoidant"]
  ]},
  enneagram:{title:"Эннеаграмма",subtitle:"18 утверждений",questions:[
    ["Мне важно поступать правильно, даже когда никто не видит","1"],["Я быстро замечаю, что можно улучшить или исправить","1"],["Мне естественно заботиться о людях и быть нужным(ой)","2"],["Я хорошо замечаю чужие потребности раньше собственных","2"],["Мне важно ощущать, что я двигаюсь к заметному результату","3"],["Я легко подстраиваю подачу себя под контекст и задачу","3"],["Я ценю уникальность и сильную эмоциональную глубину","4"],["Мне важно чувствовать, что моя жизнь имеет особенный личный смысл","4"],["Я люблю сначала разобраться и накопить информацию","5"],["Мне нужно достаточно личного пространства для мыслей и интересов","5"],["Я заранее думаю о рисках и возможных проблемах","6"],["Надёжность людей для меня особенно важна","6"],["Я легко увлекаюсь новыми идеями, планами и впечатлениями","7"],["Ограничения быстро вызывают у меня желание найти другой путь","7"],["Мне проще говорить прямо, чем обходить острые темы","8"],["Я не люблю чувствовать, что кто-то контролирует мои решения","8"],["Я стараюсь не раздувать конфликты и искать спокойный вариант","9"],["Мне бывает проще согласиться, чем долго спорить о мелочах","9"]
  ]},
  care:{title:"Стиль заботы",subtitle:"15 утверждений",questions:[
    ["Совместно проведённое время для меня ценнее большинства подарков","time"],["Мне особенно важно, когда человек откладывает дела ради времени со мной","time"],["Хороший совместный вечер я долго вспоминаю","time"],
    ["Точные и искренние слова поддержки сильно на меня влияют","words"],["Мне важно слышать, что мои усилия замечают","words"],["Тёплое сообщение может заметно изменить мой день","words"],
    ["Я особенно ценю, когда человек сам помогает с делами","acts"],["Практическая помощь для меня часто убедительнее обещаний","acts"],["Я замечаю маленькие поступки, которые облегчают мне жизнь","acts"],
    ["Небольшой подарок без повода кажется мне очень личным жестом","gifts"],["Мне нравится сохранять вещи, связанные с важными моментами","gifts"],["Мне особенно приятно, когда подарок показывает, что меня хорошо знают","gifts"],
    ["Тактильная близость помогает мне чувствовать контакт","touch"],["Объятие часто говорит мне больше длинного разговора","touch"],["Мне важно физически ощущать присутствие близкого человека рядом","touch"]
  ]}
};

let me=null, mode="harmony", page="home", tutorialIndex=0, activeChat=null, testSession=null, discover=[], currentCard=null;
let filters={ageMin:18,ageMax:45,city:"",gender:"all",orientation:"all",tag:""};
let calendarMonth=new Date();calendarMonth.setDate(1);
let polling=null;

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function cap(s=""){s=String(s).trim();return s?s[0].toUpperCase()+s.slice(1):""}
function toast(s){toastRoot.innerHTML=`<div class="toast">${esc(s)}</div>`;setTimeout(()=>toastRoot.innerHTML="",2600)}
function closeOverlay(){overlay.innerHTML=""}
function modal(html){overlay.innerHTML=`<div class="modalBack" onclick="if(event.target===this)closeOverlay()"><div class="modal">${html}</div></div>`}
function age(b){if(!b)return"";const d=new Date(b),n=new Date();let a=n.getFullYear()-d.getFullYear();const md=n.getMonth()-d.getMonth();if(md<0||(md===0&&n.getDate()<d.getDate()))a--;return a}
function zodiac(b){if(!b)return"";const d=new Date(b),m=d.getMonth()+1,x=d.getDate();const z=[["Козерог","♑",1,19],["Водолей","♒",2,18],["Рыбы","♓",3,20],["Овен","♈",4,19],["Телец","♉",5,20],["Близнецы","♊",6,20],["Рак","♋",7,22],["Лев","♌",8,22],["Дева","♍",9,22],["Весы","♎",10,22],["Скорпион","♏",11,21],["Стрелец","♐",12,21]];for(const [n,s,mo,end] of z)if(m===mo&&x<=end)return s+" "+n;const p=z[(m+10)%12];return p[1]+" "+p[0]}
function fmt(ms){return new Date(ms).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
function localKey(ms){const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function statusHtml(s){const l={pending:"На согласовании",confirmed:"Подтверждена",declined:"Отклонена",completed:"Состоялась"}[s]||s;return `<span class="status ${s}">${l}</span>`}

async function api(url,opts={}){
  const r=await fetch(url,{credentials:"same-origin",headers:{"content-type":"application/json",...(opts.headers||{})},...opts});
  const data=await r.json().catch(()=>({}));
  if(r.status===403&&data.error==="banned"){showBan(data.ban);throw new Error("banned")}
  if(!r.ok){const e=new Error(data.error||"request_failed");e.data=data;e.status=r.status;throw e}
  return data;
}
function logoHtml(){return logo()}

async function boot(){
  try{
    const ban=await fetch("/api/ban-status",{credentials:"same-origin"}).then(r=>r.json());
    if(ban.ban){showBan(ban.ban);return}
    const data=await api("/api/me");
    me=data.user;mode=me.completedHarmony?"harmony":me.completedAfter?"after":"harmony";
    document.body.className=mode;
    if(!me.completedHarmony&&!me.completedAfter){showTutorial();return}
    renderApp();startPolling();
  }catch(e){
    if(e.message==="banned")return;
    renderAuth();
  }
}
function renderAuth(){
  document.body.className="harmony";
  root.innerHTML=`<div class="auth"><div class="authVisual"><div class="kicker">CONSTELLATION</div><h1>FIND<br>YOUR<br>PEOPLE.</h1><div class="authPlanet"></div></div>
  <div class="authBoxWrap"><div class="authBox">${logoHtml()}<h2>Войти или создать аккаунт</h2><p class="muted">Укажи почту. Мы отправим одноразовый код для входа.</p>
  <div id="authEmailStep"><input id="email" class="input" type="email" placeholder="you@example.com"><div style="height:10px"></div><button class="btn yellow" onclick="requestCode()">Получить код</button></div>
  <div id="authCodeStep" class="hidden"><p class="muted">Введите 6-значный код из письма.</p><div id="demoCodeNote"></div><input id="code" class="input" inputmode="numeric" maxlength="6" placeholder="Код"><div style="height:10px"></div><button class="btn" onclick="verifyCode()">Продолжить</button><button class="btn ghost" onclick="backEmail()">Изменить почту</button></div>
  </div></div></div>`;
}
async function requestCode(){
  try{
    const email=document.getElementById("email").value.trim();
    const d=await api("/api/auth/request-code",{method:"POST",body:JSON.stringify({email})});
    window.__email=email;document.getElementById("authEmailStep").classList.add("hidden");document.getElementById("authCodeStep").classList.remove("hidden");
    if(d.demoCode)document.getElementById("demoCodeNote").innerHTML=`<div class="panel" style="padding:12px;margin-bottom:10px;background:#fff8d7"><b>Тестовый вход:</b> код ${d.demoCode}</div>`;
  }catch(e){toast(e.message==="invalid_email"?"Введите корректный email":"Не удалось отправить код")}
}
function backEmail(){document.getElementById("authCodeStep").classList.add("hidden");document.getElementById("authEmailStep").classList.remove("hidden")}
async function verifyCode(){
  try{
    await api("/api/auth/verify-code",{method:"POST",body:JSON.stringify({email:window.__email,code:document.getElementById("code").value.trim()})});
    me=(await api("/api/me")).user;showTutorial();
  }catch(e){if(e.message!=="banned")toast("Код не подошёл")}
}

const tutorial=[
  ["Поиск людей","Смотри анкеты, меняй фильтры в любой момент и отмечай тех, с кем хочешь познакомиться.","⌕"],
  ["Мэтч открывает общение","Написать человеку можно только после взаимного лайка. После мэтча чат открывается для вас обоих.","♥"],
  ["Чаты работают привычно","Текст и фото, закрепление, отключение уведомлений, блокировка и жалобы. Настройки чата видишь только ты.","💬"],
  ["Встречи живут в календаре","Предложи время и место. Второй человек подтвердит или отклонит встречу. Напоминание настраивается один раз для всех встреч.","🗓"],
  ["Два режима — два пространства","Harmony — для отношений и дружбы. After Dark — для 18+ флирта и быстрых свиданий. У каждого режима свои анкеты, мэтчи и переписки.","↔"]
];
function showTutorial(){tutorialIndex=0;renderTutorial()}
function renderTutorial(){
  const [t,p,i]=tutorial[tutorialIndex];
  overlay.innerHTML=`<div class="tutorialBack"><div class="tutorial"><div class="tutSlide"><div class="kicker">как всё устроено · ${tutorialIndex+1}/5</div><h2>${t}</h2><p>${p}</p><div class="tutVisual">${i}</div></div><div class="tutFoot"><div class="dots">${tutorial.map((_,x)=>`<span class="dot ${x===tutorialIndex?"on":""}"></span>`).join("")}</div><div class="actions">${tutorialIndex?`<button class="btn ghost" style="color:#142136;border-color:#d7e0eb" onclick="prevTutorial()">Назад</button>`:""}<button class="btn accent" onclick="nextTutorial()">${tutorialIndex===4?"Выбрать режим":"Дальше"}</button></div></div></div></div>`;
}
function nextTutorial(){if(tutorialIndex<4){tutorialIndex++;renderTutorial()}else{overlay.innerHTML="";showModeChoice()}}
function prevTutorial(){if(tutorialIndex>0){tutorialIndex--;renderTutorial()}}

function showModeChoice(){
  root.innerHTML=`<div class="modeStage"><div class="modeInner">${logoHtml()}<h1>Выбери режим знакомства</h1>
  <p class="modeLead">Можно пользоваться обоими режимами далее. У каждого режима будет своя анкета, поиск, мэтчи и отдельные чаты.</p>
  <div class="cardTable"><div class="modeCard h" onmouseenter="modeTip(event,'harmony')" onmousemove="moveTip(event)" onmouseleave="hideTip()" onclick="pickMode(this,'harmony')"><div class="kicker">отношения + дружба</div><h2>Harmony</h2><div class="modeSymbol">😇</div></div>
  <div class="modeCard a" onmouseenter="modeTip(event,'after')" onmousemove="moveTip(event)" onmouseleave="hideTip()" onclick="pickMode(this,'after')"><div class="kicker">18+ флирт + быстрые свидания</div><h2>After Dark</h2><div class="modeSymbol">🔥</div></div></div>
  <div class="modeNote">Наведи курсор на карту, чтобы узнать подробнее. Позже режим можно переключать в верхнем меню.</div></div></div><div id="cursorTip" class="cursorTip"></div>`;
}
function modeTip(e,m){const el=document.getElementById("cursorTip");el.innerHTML=m==="harmony"?`<b>Harmony</b><br>Серьёзные отношения, дружба, интересы, ценности и спокойный темп знакомства.`:`<b>After Dark 18+</b><br>Флирт, быстрые свидания, границы, предпочтения и заранее обозначенный комфортный формат.`;el.classList.add("show");moveTip(e)}
function moveTip(e){const el=document.getElementById("cursorTip");if(el){el.style.left=e.clientX+"px";el.style.top=e.clientY+"px"}}
function hideTip(){document.getElementById("cursorTip")?.classList.remove("show")}
function pickMode(card,m){hideTip();document.querySelectorAll(".modeCard").forEach(x=>x!==card&&x.classList.add("dim"));card.classList.add("zoom");setTimeout(()=>{mode=m;document.body.className=mode;renderOnboarding(m)},560)}

function renderOnboarding(m){
  root.innerHTML=`<div class="onboard"><div class="onboardInner">${logoHtml()}<h1>${m==="harmony"?"Анкета Harmony":"Анкета After Dark"}</h1>
  <p class="muted">${m==="harmony"?"Расскажи о себе, интересах и том, какие отношения или дружбу ты ищешь.":"Опиши комфортный формат знакомства, темп, границы и интересы."}</p>
  <div class="panel"><div class="photoRow"><img id="photoPreview" class="photoPreview" src="${esc(me?.profile?.common?.photo||"")}" alt=""><div><b>Фото обязательно</b><p class="muted small">Анкеты без фотографии не публикуются.</p><input id="photo" type="file" accept="image/*" onchange="previewPhoto(this)"></div></div>
  <div style="height:18px"></div><div class="formGrid">
    <div class="field"><label>Имя</label><input id="pName" class="input" value="${esc(me?.profile?.common?.name||"")}"></div>
    <div class="field"><label>Дата рождения</label><input id="pBirth" class="input" type="date" value="${esc(me?.profile?.common?.birthDate||"")}"></div>
    <div class="field"><label>Город</label><input id="pCity" class="input" value="${esc(me?.profile?.common?.city||"")}"></div>
    <div class="field"><label>Гендер</label><select id="pGender" class="select">${Object.entries(GEN).map(([v,l])=>`<option value="${v}" ${me?.profile?.common?.gender===v?"selected":""}>${l}</option>`).join("")}</select></div>
    <div class="field"><label>Ориентация</label><select id="pOri" class="select">${Object.entries(ORI).map(([v,l])=>`<option value="${v}" ${me?.profile?.common?.orientation===v?"selected":""}>${l}</option>`).join("")}</select></div>
    <div class="field"><label>#метки через запятую</label><input id="pTags" class="input" value="${esc((me?.profile?.common?.tags||[]).join(", "))}"></div>
    <div class="full">${m==="harmony"?harmonyFields():afterFields()}</div>
  </div><div style="height:15px"></div><button class="btn accent" onclick="saveProfile('${m}')">Сохранить анкету</button></div></div></div>`;
  window.__photo=me?.profile?.common?.photo||"";
}
function harmonyFields(){
  const p=me?.profile?.harmony||{};
  return `<div class="formGrid"><div class="field"><label>Что ищешь</label><select id="goal" class="select"><option value="relations">Серьёзные отношения</option><option value="friendship">Дружбу</option><option value="open">Открыт(а) к разным вариантам</option></select></div><div class="field"><label>Формат отношений</label><input id="style" class="input" value="${esc(p.relationshipStyle||"")}"></div><div class="field full"><label>О себе</label><textarea id="bio" class="textarea">${esc(p.bio||"")}</textarea></div><div class="field"><label>Хобби</label><textarea id="hobbies" class="textarea">${esc(p.hobbies||"")}</textarea></div><div class="field"><label>Ценности</label><textarea id="values" class="textarea">${esc(p.values||"")}</textarea></div></div>`;
}
function afterFields(){
  const p=me?.profile?.after||{},sel=new Set(p.fetishes||[]);
  return `<div class="formGrid"><div class="field"><label>Что ищешь</label><select id="goal" class="select"><option value="flirt">Флирт</option><option value="dates">Быстрые свидания</option><option value="open">Открыт(а) к разным вариантам</option></select></div><div class="field"><label>Темп знакомства</label><select id="pace" class="select"><option>Медленно</option><option>По ситуации</option><option>Быстро</option></select></div><div class="field full"><label>О себе</label><textarea id="bio" class="textarea">${esc(p.bio||"")}</textarea></div><div class="field"><label>Интересы и предпочтения</label><textarea id="interests" class="textarea">${esc(p.interests||"")}</textarea></div><div class="field"><label>Табу и границы</label><textarea id="taboos" class="textarea">${esc(p.taboos||"")}</textarea></div><div class="field full"><label>Фетиши и предпочтения</label><div class="fetishGrid" id="fetishes">${FETISHES.map(f=>`<button type="button" class="fetish ${sel.has(f)?"on":""}" onclick="this.classList.toggle('on')">${esc(f)}</button>`).join("")}</div></div></div>`;
}
function previewPhoto(inp){
  const f=inp.files?.[0];if(!f||!f.type.startsWith("image/"))return toast("Можно загрузить только изображение");
  const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const size=520,c=document.createElement("canvas");c.width=size;c.height=size;const x=c.getContext("2d"),s=Math.max(size/img.width,size/img.height),w=img.width*s,h=img.height*s;x.drawImage(img,(size-w)/2,(size-h)/2,w,h);window.__photo=c.toDataURL("image/jpeg",.82);document.getElementById("photoPreview").src=window.__photo};img.src=fr.result};fr.readAsDataURL(f)
}
async function saveProfile(m){
  try{
    if(!window.__photo)return toast("Добавь фотографию");
    if(age(document.getElementById("pBirth").value)<18)return toast("Сервис доступен только пользователям 18+");
    const common={name:pName.value.trim(),birthDate:pBirth.value,city:cap(pCity.value),gender:pGender.value,orientation:pOri.value,photo:window.__photo,tags:pTags.value.split(",").map(x=>x.trim().replace(/^#/,"")).filter(Boolean)};
    if(!common.name||!common.birthDate||!common.city)return toast("Заполни имя, дату рождения и город");
    let block;
    if(m==="harmony")block={goal:goal.value,bio:cap(bio.value),hobbies:cap(hobbies.value),values:cap(values.value),relationshipStyle:cap(style.value)};
    else block={goal:goal.value,bio:cap(bio.value),pace:pace.value,interests:cap(interests.value),taboos:cap(taboos.value),fetishes:[...document.querySelectorAll("#fetishes .on")].map(x=>x.textContent.trim())};
    const profile={...(me.profile||{}),common,[m]:block};
    await api("/api/me/profile",{method:"PUT",body:JSON.stringify({mode:m,profile})});
    me=(await api("/api/me")).user;mode=m;document.body.className=mode;renderApp();startPolling();
  }catch(e){toast("Не удалось сохранить анкету")}
}

function renderApp(){
  root.innerHTML=`<div class="topbar">${logoHtml()}<div class="modeSwitch"><button id="mH" class="${mode==="harmony"?"on":""}" onclick="switchMode('harmony')">Harmony <span id="uH" class="unread hidden">0</span></button><button id="mA" class="${mode==="after"?"on":""}" onclick="switchMode('after')">After Dark <span id="uA" class="unread hidden">0</span></button></div><div class="actions"><button class="iconBtn" onclick="openNotifications()">✦</button><button class="iconBtn" onclick="go('settings')">⚙</button></div></div>
  <div class="shell"><aside class="side"><nav class="nav">${navBtn("home","Дома")}${navBtn("discover","Поиск")}${navBtn("matches","Созвездия")}${navBtn("chat","Чаты")}${navBtn("calendar","🗓 Календарь встреч")}${navBtn("tests","Тесты")}${navBtn("achievements","Ачивки")}${navBtn("profile","Моя анкета")}</nav></aside><main class="main" id="main"></main></div>`;
  go(page,false);refreshUnread();
}
function navBtn(p,l){return `<button data-p="${p}" class="${page===p?"on":""}" onclick="go('${p}')">${l}</button>`}
async function switchMode(m){
  if(m===mode)return;
  if(m==="harmony"&&!me.completedHarmony||m==="after"&&!me.completedAfter){mode=m;document.body.className=mode;renderOnboarding(m);return}
  mode=m;document.body.className=mode;page="home";renderApp()
}
function go(p,scroll=true){page=p;document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("on",b.dataset.p===p));({home:renderHome,discover:renderDiscover,matches:renderMatches,chat:renderChats,calendar:renderCalendar,tests:renderTests,achievements:renderAchievements,profile:renderProfile,settings:renderSettings}[p]||renderHome)();if(scroll)scrollTo({top:0,behavior:"smooth"})}

async function refreshUnread(){
  try{
    const d=await api("/api/notifications"),unread=d.notifications.filter(n=>!n.read_at);
    const counts={harmony:0,after:0};unread.forEach(n=>{const m=n.payload?.mode;if(m)counts[m]++});
    for(const [m,id] of [["harmony","uH"],["after","uA"]]){const el=document.getElementById(id);if(!el)continue;el.textContent=counts[m];el.classList.toggle("hidden",!counts[m])}
  }catch{}
}
function startPolling(){clearInterval(polling);polling=setInterval(()=>{refreshUnread();if(page==="chat"&&activeChat)loadMessages(activeChat,true)},7000)}

async function renderHome(){
  const matches=(await api(`/api/matches?mode=${mode}`)).matches;
  const dates=(await api("/api/dates")).dates.filter(d=>d.mode===mode&&["pending","confirmed"].includes(d.status)&&new Date(d.when)>new Date()).sort((a,b)=>new Date(a.when)-new Date(b.when));
  const next=dates[0];
  document.getElementById("main").innerHTML=`<div class="hero"><div class="heroA"><div class="kicker">${mode==="harmony"?"Harmony · отношения и дружба":"After Dark · 18+ флирт и быстрые свидания"}</div><h1>${mode==="harmony"?"НАЙДИ<br>СВОЕГО<br>ЧЕЛОВЕКА.":"ВЫБЕРИ<br>СВОЙ<br>ТЕМП."}</h1><p>${mode==="harmony"?"Найди человека, с которым хочется построить долгие взаимоотношения.":"Ищи людей для флирта и быстрых свиданий, заранее обозначая комфортный темп и границы."}</p></div><div class="heroB"><div><div class="kicker">твои созвездия</div><div class="bigStat">${matches.length}</div><b>взаимных мэтчей</b></div><button class="btn" onclick="go('discover')">Начать поиск →</button></div></div>
  <div class="tiles"><div class="tile t1" onclick="go('calendar')"><h3>Календарь встреч</h3><p>${next?`${esc(next.person)} · ${fmt(next.when)}`:"Запланируй встречу после мэтча"}</p><div class="tileIcon">🗓</div></div><div class="tile t2" onclick="go('tests')"><h3>Пройди тесты</h3><p>${me.tests?.mbti?.result||"MBTI"} · ${me.tests?.attachment?.result||"Тип привязанности"}</p><div class="tileIcon">◎</div></div><div class="tile t3" onclick="go('matches')"><h3>Созвездия</h3><p>${matches.length?`${matches.length} активных мэтчей`:"Взаимный лайк откроет чат"}</p><div class="tileIcon">↗</div></div><div class="tile t4" onclick="go('achievements')"><h3>Ачивки</h3><p>Смотри прогресс и ранг аккаунта</p><div class="tileIcon">✱</div></div></div>`;
}

async function renderDiscover(){
  const q=new URLSearchParams({mode,ageMin:filters.ageMin,ageMax:filters.ageMax,city:filters.city,gender:filters.gender,orientation:filters.orientation,tag:filters.tag});
  discover=(await api("/api/discover?"+q)).users;currentCard=discover[0]||null;
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Поиск</h1><p>Написать человеку можно только после взаимного лайка. Уже выбранная анкета вернётся только после обновления её владельцем.</p></div><button class="btn ghost" onclick="openFilters()">Фильтры ☰</button></div><div id="discoverBody">${currentCard?cardHtml(currentCard):emptyDiscover()}</div>`;
  if(currentCard)setTimeout(bindSwipe,0)
}
function emptyDiscover(){return `<div class="panel"><h2>Упс... Кажется небо затянуло</h2><p class="muted">По текущим фильтрам новых анкет пока нет.</p><button class="btn accent" onclick="openFilters()">Изменить фильтры</button></div>`}
function interestScore(u){const a=new Set(me.profile?.common?.tags||[]),b=new Set(u.tags||[]),union=new Set([...a,...b]).size;if(!union)return 0;return Math.round([...a].filter(x=>b.has(x)).length/union*100)}
function textScore(u){const mine=((me.profile?.[mode]?.bio||"")+" "+(mode==="harmony"?(me.profile?.harmony?.hobbies||""):(me.profile?.after?.interests||""))).toLowerCase(),theirs=((u.bio||"")+" "+(mode==="harmony"?(u.harmony?.hobbies||""):(u.after?.interests||""))).toLowerCase(),stop=new Set(["и","в","на","с","что","это","для","как","или","очень","люблю"]);const words=s=>new Set(s.replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(w=>w.length>3&&!stop.has(w)));const a=words(mine),b=words(theirs);if(!a.size||!b.size)return 0;return Math.min(94,Math.round(35+[...a].filter(x=>b.has(x)).length/Math.max(a.size,b.size)*220))}
function psychScore(u){let s=50,c=0;if(me.tests?.mbti?.result&&u.tests?.mbti){c++;s+=(me.tests.mbti.result[0]===u.tests.mbti[0]?22:8)}if(me.tests?.attachment?.result&&u.tests?.attachment){c++;s+=(me.tests.attachment.result===u.tests.attachment?24:6)}return c?Math.min(96,s):null}
function cardHtml(u){
  const ps=psychScore(u),block=mode==="harmony"?`<div class="panel" style="padding:14px;margin:12px 0"><b>Хобби</b><p class="muted">${esc(cap(u.harmony?.hobbies||""))}</p><b>Ценности</b><p class="muted">${esc(cap(u.harmony?.values||""))}</p></div>`:`<div class="panel" style="padding:14px;margin:12px 0"><b>Темп</b><p class="muted">${esc(cap(u.after?.pace||""))}</p><b>Интересы и предпочтения</b><p class="muted">${esc(cap(u.after?.interests||""))}</p><b>Табу и границы</b><p class="muted">${esc(cap(u.after?.taboos||""))}</p><b>Фетиши</b><div class="pills" style="margin-top:8px">${(u.after?.fetishes||[]).map(f=>`<span class="pill">#${esc(f)}</span>`).join("")}</div></div>`;
  return `<div class="searchWrap"><div class="searchCard" id="card" data-id="${u.id}"><div class="searchPhoto"><img src="${u.photo}" alt=""></div><div class="searchActions"><button class="swipe pass" onclick="decide('${u.id}','pass')">× Пропустить</button><button class="swipe like" onclick="decide('${u.id}','like')">♥ Нравится</button></div><div class="searchBody"><div class="kicker">${mode==="harmony"?"Harmony":"After Dark 18+"}</div><h2>${esc(cap(u.name))}, ${age(u.birthDate)}</h2><div class="pills"><span class="badge">${esc(zodiac(u.birthDate))}</span><span class="badge">${esc(cap(u.city))}</span><span class="badge">${esc(ORI[u.orientation]||u.orientation)}</span><span class="badge">${esc(GEN[u.gender]||u.gender)}</span>${Object.values(u.tests||{}).filter(Boolean).slice(0,3).map(x=>`<span class="badge">${esc(x)}</span>`).join("")}</div><p>${esc(cap(u.bio))}</p>${block}<div class="pills">${(u.tags||[]).map(t=>`<span class="pill">#${esc(t)}</span>`).join("")}</div><div class="metrics"><div class="metric"><small>Общие интересы</small><b>${interestScore(u)}%</b><span class="small muted">по #меткам</span></div><div class="metric"><small>Психология</small><b>${ps===null?"—":ps+"%"}</b><span class="small muted">${ps===null?"пройди тесты":"по тестам"}</span></div><div class="metric"><small>Схожесть анкет</small><b>${textScore(u)}%</b><span class="small muted">по темам и формулировкам</span></div></div><div class="reportBottom"><button onclick="report('${u.id}')">Пожаловаться на анкету</button></div></div></div></div>`;
}
function bindSwipe(){const c=document.getElementById("card");if(!c)return;let x=null;c.onpointerdown=e=>{if(e.target.closest("button"))return;x=e.clientX;c.setPointerCapture(e.pointerId);c.style.transition="none"};c.onpointermove=e=>{if(x===null)return;const dx=e.clientX-x;c.style.transform=`translateX(${dx}px) rotate(${dx/28}deg)`};c.onpointerup=e=>{if(x===null)return;const dx=e.clientX-x,id=c.dataset.id;x=null;c.style.transition="";c.style.transform="";if(dx>120)decide(id,"like");else if(dx<-120)decide(id,"pass")}}
function hearts(){const r=document.getElementById("card")?.getBoundingClientRect();if(!r)return;for(let i=0;i<14;i++){const h=document.createElement("div");h.className="heartParticle";h.textContent="♥";h.style.left=r.left+r.width/2+(Math.random()-.5)*120+"px";h.style.top=r.top+r.height*.35+"px";h.style.setProperty("--x",(Math.random()-.5)*260+"px");h.style.setProperty("--y",(-80-Math.random()*220)+"px");document.body.appendChild(h);setTimeout(()=>h.remove(),900)}}
async function decide(id,d){
  const c=document.getElementById("card");if(!c)return;if(d==="like")hearts();c.classList.add(d==="like"?"right":"left");
  setTimeout(async()=>{try{const r=await api("/api/decision",{method:"POST",body:JSON.stringify({targetUserId:id,mode,decision:d})});if(r.match){const u=currentCard;showMatch(u)}else renderDiscover()}catch(e){renderDiscover()}},430)
}
function showMatch(u){
  modal(`<div class="matchPop"><div class="kicker">взаимный лайк</div><div class="matchFaces"><img class="matchAvatar me" src="${me.profile.common.photo}" alt=""><div class="matchHeart">♥</div><img class="matchAvatar them" src="${u.photo}" alt=""></div><h2>Вы понравились друг другу</h2><p class="muted">Созвездие с ${esc(u.name)} создано. Теперь вы можете написать друг другу.</p><div class="actions" style="justify-content:center;margin-top:18px"><button class="btn accent" onclick="closeOverlay();go('chat')">Открыть чат</button><button class="btn yellow" onclick="closeOverlay();go('calendar')">Предложить встречу</button></div></div>`);
  const t=document.createElement("div");t.className="matchToast";t.innerHTML=`<img src="${u.photo}" alt=""><div><b>Взаимный лайк ♥</b><span>${esc(u.name)} тоже выбрал(а) тебя в ${mode==="harmony"?"Harmony":"After Dark"}.</span></div>`;document.body.appendChild(t);setTimeout(()=>t.remove(),4400)
}
function openFilters(){
  overlay.innerHTML=`<div class="drawer open"><div class="drawerHead"><h2>Фильтры</h2><button class="iconBtn" onclick="closeOverlay()">✕</button></div><div class="formGrid"><div class="field"><label>Возраст от</label><input id="fMin" class="input" type="number" value="${filters.ageMin}"></div><div class="field"><label>До</label><input id="fMax" class="input" type="number" value="${filters.ageMax}"></div><div class="field full"><label>Город</label><input id="fCity" class="input" value="${esc(filters.city)}"></div><div class="field full"><label>Гендер</label><select id="fGen" class="select"><option value="all">Любой</option>${Object.entries(GEN).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></div><div class="field full"><label>Ориентация</label><select id="fOri" class="select"><option value="all">Любая</option>${Object.entries(ORI).map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select></div><div class="field full"><label>#метка</label><input id="fTag" class="input" value="${esc(filters.tag)}"></div></div><div style="height:14px"></div><button class="btn accent" onclick="applyFilters()">Применить</button></div>`;fGen.value=filters.gender;fOri.value=filters.orientation
}
function applyFilters(){filters={ageMin:+fMin.value||18,ageMax:+fMax.value||99,city:fCity.value.trim(),gender:fGen.value,orientation:fOri.value,tag:fTag.value.trim()};closeOverlay();renderDiscover()}

async function renderMatches(){
  const d=await api(`/api/matches?mode=${mode}`);document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Созвездия</h1><p>Только взаимные лайки превращаются в созвездие и после этого открывается возможность написать человеку.</p></div></div>${d.matches.length?`<div class="list">${d.matches.map(m=>`<div class="personRow"><img src="${m.person.photo}" alt=""><div><div class="kicker">${esc(zodiac(m.person.birthDate))}</div><h3>${esc(m.person.name)}, ${age(m.person.birthDate)}</h3><p>${esc(cap(m.person.city))} · ${esc(ORI[m.person.orientation]||m.person.orientation)}</p></div><div class="actions"><button class="btn accent" onclick="activeChat='${m.matchId}';go('chat')">Написать</button><button class="btn ghost" onclick="openDateModal('${m.matchId}','${esc(m.person.name)}')">Открыть календарь</button><button class="iconBtn" onclick="matchMenu('${m.matchId}','${m.person.id}','${esc(m.person.name)}')">•••</button></div></div>`).join("")}</div>`:`<div class="panel"><h2>Созвездий пока нет</h2><p class="muted">Созвездие появится после взаимного лайка.</p><button class="btn accent" onclick="go('discover')">Перейти в поиск</button></div>`}`
}
function matchMenu(matchId,userId,name){modal(`<h2>${name}</h2><div class="actions"><button class="btn ghost" onclick="report('${userId}')">Пожаловаться</button><button class="btn danger" onclick="blockUser('${userId}')">Добавить в ЧС</button></div>`)}
async function blockUser(id){if(!confirm("Добавить пользователя в ЧС? Мэтч и чат исчезнут."))return;await api("/api/block",{method:"POST",body:JSON.stringify({targetUserId:id})});closeOverlay();toast("Пользователь добавлен в ЧС");go("matches")}

async function renderChats(){
  const d=await api(`/api/matches?mode=${mode}`),list=d.matches;if(!activeChat&&list[0])activeChat=list[0].matchId;
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Чаты · ${mode==="harmony"?"Harmony":"After Dark"}</h1><p>Переписки двух режимов не смешиваются.</p></div></div><div class="chatLayout"><div class="chatList"><div class="chatListHead"><b>Сообщения</b></div>${list.length?list.map(m=>`<div class="chatItem ${activeChat===m.matchId?"on":""}" onclick="activeChat='${m.matchId}';renderChats()"><img src="${m.person.photo}" alt=""><div class="chatMeta"><strong>${esc(m.person.name)} <span>${m.pinned?"📌":""}${m.muted?"🔇":""}</span></strong><p>${esc(m.lastMessage||"Можно начинать разговор")}</p></div></div>`).join(""):`<div style="padding:20px" class="muted">Чатов пока нет.</div>`}</div><div id="chatRoom" class="chatRoom"></div></div>`;
  if(activeChat)await loadMessages(activeChat)
}
async function loadMessages(matchId,silent=false){
  if(page!=="chat")return;
  const all=(await api(`/api/matches?mode=${mode}`)).matches,meta=all.find(x=>x.matchId===matchId);if(!meta){if(!silent)document.getElementById("chatRoom").innerHTML=`<div style="padding:24px" class="muted">Чат не найден.</div>`;return}
  const d=await api(`/api/matches/${matchId}/messages`);const room=document.getElementById("chatRoom");if(!room)return;
  room.innerHTML=`<div class="chatHead"><div class="chatHeadPerson"><img src="${meta.person.photo}" alt=""><div><b>${esc(meta.person.name)}</b><div class="small muted">${meta.muted?"Уведомления выключены":"Можно писать"}</div></div></div><button class="iconBtn" onclick="chatMenu('${matchId}','${meta.person.id}','${esc(meta.person.name)}',${meta.pinned},${meta.muted})">•••</button></div><div class="messages" id="msgs">${d.messages.map(m=>m.kind==="system"?`<div class="sys">${esc(m.body)}</div>`:`<div class="msg ${m.senderId===me.id?"me":""}">${m.body?esc(m.body):""}${m.image?`<img src="${m.image}" alt="Фото">`:""}<div class="small muted">${new Date(m.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div></div>`).join("")}</div><div class="composer"><label class="btn ghost">＋<input class="hidden" type="file" accept="image/*" onchange="sendChatPhoto('${matchId}',this)"></label><input id="msgText" class="input" placeholder="Сообщение" onkeydown="if(event.key==='Enter')sendText('${matchId}')"><button class="btn accent" onclick="sendText('${matchId}')">→</button></div>`;
  const box=document.getElementById("msgs");box.scrollTop=box.scrollHeight
}
function chatMenu(matchId,userId,name,pinned,muted){modal(`<h2>${name}</h2><div class="actions"><button class="btn ghost" onclick="setPrefs('${matchId}',${!pinned},${muted})">${pinned?"Открепить чат":"Закрепить чат"}</button><button class="btn ghost" onclick="setPrefs('${matchId}',${pinned},${!muted})">${muted?"Включить уведомления":"Заглушить уведомления"}</button><button class="btn ghost" onclick="report('${userId}')">Пожаловаться</button><button class="btn danger" onclick="blockUser('${userId}')">Добавить в ЧС</button></div>`)}
async function setPrefs(mid,pinned,muted){await api(`/api/matches/${mid}/preferences`,{method:"PATCH",body:JSON.stringify({pinned,muted})});closeOverlay();toast(pinned?"Чат закреплён. Это видишь только ты.":muted?"Уведомления выключены только для тебя.":"Настройки чата обновлены.");renderChats()}
async function sendText(mid){const t=document.getElementById("msgText").value.trim();if(!t)return;await api(`/api/matches/${mid}/messages`,{method:"POST",body:JSON.stringify({text:t})});loadMessages(mid)}
function sendChatPhoto(mid,inp){const f=inp.files?.[0];if(!f||!f.type.startsWith("image/"))return toast("Можно отправлять только изображения");const r=new FileReader();r.onload=async()=>{await api(`/api/matches/${mid}/messages`,{method:"POST",body:JSON.stringify({image:r.result})});loadMessages(mid)};r.readAsDataURL(f)}

async function renderCalendar(){
  const dates=(await api("/api/dates")).dates;
  const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();
  let cells="";for(let i=0;i<42;i++){let d,cy=y,cm=m,out=false;if(i<start){d=prevDays-start+i+1;cm=m-1;if(cm<0){cm=11;cy--}out=true}else if(i>=start+days){d=i-start-days+1;cm=m+1;if(cm>11){cm=0;cy++}out=true}else d=i-start+1;const key=`${cy}-${String(cm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,ev=dates.filter(x=>localKey(x.when)===key);cells+=dayHtml(cy,cm,d,out,ev)}
  const next=dates.filter(d=>["pending","confirmed"].includes(d.status)&&new Date(d.when)>new Date()).sort((a,b)=>new Date(a.when)-new Date(b.when))[0];
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Календарь встреч</h1><p>Планируй свои свидания и встречи здесь</p></div><button class="btn accent" onclick="quickDate()">+ Предложить встречу</button></div><div class="calLayout"><div class="calBox"><div class="calHead"><button class="iconBtn" onclick="shiftMonth(-1)">←</button><h2>${first.toLocaleString("ru-RU",{month:"long",year:"numeric"})}</h2><button class="iconBtn" onclick="shiftMonth(1)">→</button></div><div class="calWeek">${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=>`<div class="week">${x}</div>`).join("")}</div><div class="calGrid">${cells}</div></div><div><div class="next">${next?`<div class="kicker">Следующий (-ая) у нас...</div><div style="height:10px"></div><img src="${next.photo}" alt=""><h2>${esc(next.person)}</h2><p>${fmt(next.when)}</p><p>${esc(cap(next.place))}</p>${statusHtml(next.status)}`:`<div class="kicker">Следующий (-ая) у нас...</div><h2>Пока никого</h2><p>Предложи встречу одному из мэтчей.</p>`}</div></div></div>`
}
function dayHtml(y,m,d,out,ev){const key=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,today=localKey(Date.now())===key;return `<div class="day ${out?"out":""} ${today?"today":""}" onclick="openDay('${key}')"><div class="dayNum">${d}</div>${ev.length?`<div class="small" style="margin-top:6px">${ev.map(e=>`<span class="statusDot ${e.status}Dot"></span>`).join("")}${ev.length} встреч.</div><div class="avatarStack">${ev.slice(0,4).map(e=>`<img src="${e.photo}" alt="">`).join("")}</div>`:""}</div>`}
function shiftMonth(n){calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+n,1);renderCalendar()}
async function openDay(key){
  const ev=(await api("/api/dates")).dates.filter(d=>localKey(d.when)===key),date=new Date(key+"T12:00:00");
  modal(`<h2>${date.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</h2>${ev.length?`<div class="meetingList">${ev.map(e=>`<div class="meetingRow"><img src="${e.photo}" alt=""><div><h4>${esc(e.person)}</h4><p>${new Date(e.when).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})} · ${esc(cap(e.place))}</p>${statusHtml(e.status)}</div><div class="actions">${e.direction==="incoming"&&e.status==="pending"?`<button class="btn accent" onclick="respondDate('${e.id}','confirmed')">Принять</button><button class="btn ghost" onclick="respondDate('${e.id}','declined')">Отказаться</button>`:`<button class="iconBtn" onclick="editDate('${e.id}')">✎</button>`}${e.status==="confirmed"?`<button class="btn ghost" onclick="completeDate('${e.id}')">Состоялась</button>`:""}</div></div>`).join("")}</div>`:`<p class="muted">На эту дату встреч нет.</p>`}`)
}
async function quickDate(){const m=(await api(`/api/matches?mode=${mode}`)).matches;if(!m.length)return toast("Сначала нужен взаимный мэтч");openDateModal(m[0].matchId,m[0].person.name)}
function openDateModal(matchId,name){const d=new Date(Date.now()+86400000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());modal(`<h2>Предложить встречу с ${esc(name)}</h2><div class="field"><label>Дата и время</label><input id="dWhen" class="input" type="datetime-local" value="${d.toISOString().slice(0,16)}"></div><div class="field"><label>Место</label><input id="dPlace" class="input" placeholder="Кофейня, парк, бар…"></div><div style="height:12px"></div><button class="btn accent" onclick="saveDate('${matchId}')">Отправить на согласование</button>`)}
async function saveDate(mid){await api("/api/dates",{method:"POST",body:JSON.stringify({matchId:mid,when:dWhen.value,place:dPlace.value.trim()})});closeOverlay();toast("Встреча отправлена на согласование");go("calendar")}
async function respondDate(id,status){await api(`/api/dates/${id}/respond`,{method:"PATCH",body:JSON.stringify({status})});closeOverlay();toast(status==="confirmed"?"Встреча подтверждена":"Встреча отклонена");renderCalendar()}
async function editDate(id){const all=(await api("/api/dates")).dates,e=all.find(x=>x.id===id);if(!e)return;const d=new Date(e.when);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());modal(`<h2>Изменить встречу с ${esc(e.person)}</h2><p class="muted">После изменения время или место снова уйдут второму человеку на согласование.</p><div class="field"><label>Дата и время</label><input id="eWhen" class="input" type="datetime-local" value="${d.toISOString().slice(0,16)}"></div><div class="field"><label>Место</label><input id="ePlace" class="input" value="${esc(e.place)}"></div><div style="height:12px"></div><button class="btn accent" onclick="saveDateEdit('${id}')">Отправить изменения</button>`)}
async function saveDateEdit(id){await api(`/api/dates/${id}`,{method:"PATCH",body:JSON.stringify({when:eWhen.value,place:ePlace.value.trim()})});closeOverlay();toast("Изменения отправлены на согласование");renderCalendar()}
async function completeDate(id){await api(`/api/dates/${id}/complete`,{method:"PATCH",body:"{}"});closeOverlay();toast("Встреча добавлена в историю");renderCalendar()}

async function renderTests(){
  me=(await api("/api/me")).user;document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Тесты</h1><p>Отвечай по пятибалльной шкале. Подписаны крайние точки и середина. После выбора следующий вопрос откроется автоматически.</p></div></div><div class="testGrid">${Object.keys(TESTS).map(testCard).join("")}</div><div style="height:14px"></div><div id="testArea"></div>`;tickLocks()
}
function testCard(type){const t=TESTS[type],r=me.tests?.[type],last=r?.lastAt?+new Date(r.lastAt):0,left=Math.max(0,last+3*86400000-Date.now());return `<div class="testCard"><div class="kicker">${t.subtitle}</div><h2>${t.title}</h2><p>${r?`Текущий результат: <b>${esc(r.result)}</b>`:"Ещё не пройден"}</p>${left?`<p class="timer" data-lock="${last+3*86400000}"></p><button class="btn" disabled>В ожидании...</button>`:`<button class="btn" onclick="startTest('${type}')">${r?"Пройти заново":"Начать"} →</button>`}</div>`}
function tickLocks(){clearInterval(window.__lockTimer);const tick=()=>document.querySelectorAll("[data-lock]").forEach(el=>{const l=Math.max(0,+el.dataset.lock-Date.now()),d=Math.floor(l/86400000),h=Math.floor(l%86400000/3600000),m=Math.floor(l%3600000/60000),s=Math.floor(l%60000/1000);el.textContent=`Повтор через ${d}д ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`});tick();window.__lockTimer=setInterval(tick,1000)}
function startTest(type){testSession={type,index:0,answers:Array(TESTS[type].questions.length).fill(null)};renderQuestion()}
function renderQuestion(){const t=TESTS[testSession.type],q=t.questions[testSession.index],sel=testSession.answers[testSession.index],labels=["Точно нет","","Не уверен(-а)","","Точно да"];document.getElementById("testArea").innerHTML=`<div class="question"><div class="kicker">${t.title} · ${testSession.index+1}/${t.questions.length}</div><h2>${esc(q[0])}</h2><div class="likert">${labels.map((l,i)=>`<div class="likertOpt ${sel===i+1?"on":""}" onclick="likert(${i+1})"><button class="likertDot">${sel===i+1?"✓":""}</button><div class="likertLabel">${l}</div></div>`).join("")}</div><div class="testNav"><button class="btn ghost" onclick="prevQuestion()" ${testSession.index===0?"disabled":""}>← Назад</button></div></div>`}
function likert(v){testSession.answers[testSession.index]=v;renderQuestion();setTimeout(()=>{if(!testSession)return;if(testSession.index<TESTS[testSession.type].questions.length-1){testSession.index++;renderQuestion()}else finishTest()},250)}
function prevQuestion(){if(testSession.index>0){testSession.index--;renderQuestion()}}
async function finishTest(){
  const type=testSession.type,t=TESTS[type],a=testSession.answers;let result="";
  if(type==="mbti"){const s={EI:0,NS:0,TF:0,JP:0};t.questions.forEach((q,i)=>s[q[1]]+=(a[i]-3)*q[2]);result=(s.EI>=0?"E":"I")+(s.NS>=0?"N":"S")+(s.TF>=0?"T":"F")+(s.JP>=0?"J":"P")}
  if(type==="attachment"){const s={secure:0,anxious:0,avoidant:0};t.questions.forEach((q,i)=>s[q[1]]+=a[i]);const k=Object.entries(s).sort((x,y)=>y[1]-x[1])[0][0];result={secure:"Secure",anxious:"Anxious",avoidant:"Avoidant"}[k]}
  if(type==="enneagram"){const s={};for(let i=1;i<=9;i++)s[i]=0;t.questions.forEach((q,i)=>s[q[1]]+=a[i]);result="Тип "+Object.entries(s).sort((x,y)=>y[1]-x[1])[0][0]}
  if(type==="care"){const s={time:0,words:0,acts:0,gifts:0,touch:0};t.questions.forEach((q,i)=>s[q[1]]+=a[i]);const k=Object.entries(s).sort((x,y)=>y[1]-x[1])[0][0];result={time:"Время вместе",words:"Слова поддержки",acts:"Поступки и помощь",gifts:"Подарки и знаки внимания",touch:"Тактильность"}[k]}
  await api(`/api/tests/${type}`,{method:"POST",body:JSON.stringify({result,answers:a})});testSession=null;me=(await api("/api/me")).user;renderTests();document.getElementById("testArea").innerHTML=`<div class="panel"><div class="kicker">результат сохранён</div><h2 style="font-size:46px">${esc(result)}</h2><p class="muted">Результат добавлен к анкете. Перепройти тест можно через 3 суток.</p></div>`
}

async function renderAchievements(){
  const dates=(await api("/api/dates")).dates,matches=[...(await api("/api/matches?mode=harmony")).matches,...(await api("/api/matches?mode=after")).matches],completed=dates.filter(x=>x.status==="completed").length,declined=dates.some(x=>x.status==="declined");
  const created=+new Date(me.createdAt),days=(Date.now()-created)/86400000;let current=null,next=RANKS[0];for(const r of RANKS){if(days>=r.days)current=r;else{next=r;break}}if(days>=RANKS.at(-1).days)next=null;
  const base=current?.days||0,progress=next?Math.max(0,Math.min(100,(days-base)/(next.days-base)*100)):100;
  const ach=[
    ["Первая искра","Создать первое созвездие с человеком","✦",matches.length>=1],
    ["По ракетам!","Назначить первое свидание","↗",dates.length>=1],
    ["Приятного полёта","Провести первое свидание","◐",completed>=1],
    ["Вторая глава","Провести две встречи","◑",completed>=2],
    ["Устойчивая орбита","Провести три встречи","●",completed>=3],
    ["Опытный тестировщик","Пройти все четыре теста","◎",["mbti","attachment","enneagram","care"].every(x=>me.tests?.[x])],
    ["Попытка не пытка","Получить отклонённое приглашение","×",declined],
    ["Другая сторона","Заполнить Harmony и After Dark","↔",me.completedHarmony&&me.completedAfter],
    ["Границы обозначены","Заполнить границы в After Dark","!",!!me.profile?.after?.taboos]
  ];
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Ачивки</h1><p>Прогресс по встречам, тестам и времени с нами.</p></div></div><div class="panel rankCard"><div><div class="kicker">ранг аккаунта</div><h2>${current?current.name:'До ранга «Новичок»'}</h2><p class="muted">${next?`До «${next.name}» осталось примерно ${Math.ceil(next.days-days)} дн.`:"Максимальный ранг достигнут."}</p><div class="progress"><div style="width:${progress}%"></div></div><div class="rankSteps">${RANKS.map(r=>`<span class="rankStep ${days>=r.days?"done":""}">${r.name}</span>`).join("")}</div></div><b>${current?.name||"Старт"}</b></div><div class="achGrid">${ach.map(a=>`<div class="panel ach ${a[3]?"open":""}"><div class="achIcon">${a[2]}</div><h3>${a[0]}</h3><small>${a[1]}</small></div>`).join("")}</div>`
}

function renderProfile(){
  const c=me.profile.common||{},b=me.profile[mode]||{};
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Моя анкета</h1><p>Дата рождения скрыта. Другие люди видят только возраст и знак зодиака.</p></div><button class="btn accent" onclick="renderOnboarding('${mode}')">Редактировать</button></div><div class="panel" style="display:grid;grid-template-columns:320px 1fr;gap:18px"><img src="${c.photo}" style="width:100%;height:440px;object-fit:cover;border-radius:24px"><div><div class="kicker">${mode==="harmony"?"Harmony":"After Dark 18+"}</div><h2 style="font-size:44px;margin:0">${esc(c.name)}, ${age(c.birthDate)}</h2><div class="pills" style="margin:10px 0"><span class="badge">${esc(zodiac(c.birthDate))}</span><span class="badge">${esc(c.city)}</span><span class="badge">${esc(ORI[c.orientation])}</span>${Object.values(me.tests||{}).map(x=>`<span class="badge">${esc(x.result)}</span>`).join("")}</div><p>${esc(b.bio||"")}</p>${mode==="harmony"?`<div class="panel" style="padding:14px"><b>Хобби</b><p class="muted">${esc(b.hobbies||"")}</p><b>Ценности</b><p class="muted">${esc(b.values||"")}</p></div>`:`<div class="panel" style="padding:14px"><b>Темп</b><p class="muted">${esc(b.pace||"")}</p><b>Интересы</b><p class="muted">${esc(b.interests||"")}</p><b>Табу и границы</b><p class="muted">${esc(b.taboos||"")}</p><div class="pills">${(b.fetishes||[]).map(f=>`<span class="pill">#${esc(f)}</span>`).join("")}</div></div>`}<div class="pills">${(c.tags||[]).map(t=>`<span class="pill">#${esc(t)}</span>`).join("")}</div></div></div>`
}
function renderSettings(){
  const s=me.settings||{reminderValue:60,reminderUnit:"minutes"};
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Настройки</h1><p>Общие параметры аккаунта и встреч.</p></div></div><div class="panel"><h2>Напоминание для всех встреч</h2><p class="muted">Изменение применяется ко всем текущим и будущим подтверждённым встречам.</p><div class="formGrid" style="max-width:420px"><div class="field"><label>За сколько</label><input id="remVal" class="input" type="number" min="1" value="${s.reminderValue}"></div><div class="field"><label>Единица</label><select id="remUnit" class="select"><option value="minutes">Минут</option><option value="hours">Часов</option><option value="days">Дней</option></select></div></div><div style="height:10px"></div><button class="btn accent" onclick="saveReminder()">Сохранить</button></div><div class="panel"><h2>Аккаунт</h2><p class="muted">${esc(me.email)}</p><button class="btn ghost" onclick="logout()">Выйти</button></div>`;remUnit.value=s.reminderUnit
}
async function saveReminder(){await api("/api/me/settings",{method:"PUT",body:JSON.stringify({reminderValue:+remVal.value,reminderUnit:remUnit.value})});me=(await api("/api/me")).user;toast("Настройка применена ко всем встречам")}

function report(userId){modal(`<h2>Пожаловаться</h2><div class="field"><label>Причина</label><select id="repReason" class="select"><option>Спам</option><option>Оскорбления</option><option>Мошенничество</option><option>Нежелательный контент</option><option>Нарушение границ</option><option>Другое</option></select></div><div class="field"><label>Что произошло</label><textarea id="repText" class="textarea"></textarea></div><div style="height:12px"></div><button class="btn danger" onclick="sendReport('${userId}')">Отправить жалобу</button>`)}
async function sendReport(id){if(!repText.value.trim())return toast("Опиши проблему");await api("/api/reports",{method:"POST",body:JSON.stringify({targetUserId:id,reason:repReason.value,details:repText.value.trim()})});closeOverlay();toast("Жалоба отправлена модерации")}

async function openNotifications(){
  const d=await api("/api/notifications"),list=d.notifications;
  modal(`<h2>Уведомления</h2>${list.length?`<div class="list">${list.map(n=>{const p=n.payload||{};if(n.type==="meeting_request")return `<div class="panel" style="padding:14px"><b>Новое предложение встречи</b><p class="muted">Открой календарь, чтобы принять или отклонить приглашение.</p><button class="btn accent" onclick="closeOverlay();go('calendar')">Открыть календарь</button></div>`;return `<div class="panel" style="padding:14px"><b>${notificationText(n)}</b><div class="small muted">${new Date(n.created_at).toLocaleString("ru-RU")}</div></div>`}).join("")}</div>`:`<p class="muted">Новых уведомлений нет.</p>`}`);
  await api("/api/notifications/read",{method:"POST",body:"{}"});refreshUnread()
}
function notificationText(n){return {match:"Взаимный лайк ♥",message:"Новое сообщение",meeting_reply:"Ответ на встречу",meeting_edit:"Встреча изменена",meeting_reminder:"Скоро встреча"}[n.type]||"Новое уведомление"}

async function logout(){await api("/api/logout",{method:"POST",body:"{}"}).catch(()=>{});location.reload()}

function showBan(ban){
  clearInterval(polling);document.body.className="after";
  root.innerHTML=`<div class="banScreen"><div class="banCard">${logoHtml()}<div style="height:24px"></div><div class="kicker">доступ временно ограничен</div><h1>Аккаунт заблокирован</h1><p>Причина: <b>${esc(ban.reason||"Нарушение правил")}</b></p><p class="muted">Разблокировка: ${new Date(ban.bannedUntil).toLocaleString("ru-RU")}</p><div id="banTimer" class="banTimer"></div><p class="muted">Если считаешь блокировку ошибочной, отправь апелляцию. Администратор увидит её в панели модерации.</p><textarea id="appealText" class="textarea" placeholder="Почему блокировку стоит пересмотреть?"></textarea><div style="height:10px"></div><button class="btn yellow" onclick="appeal()">Обжаловать блокировку</button></div></div>`;
  const tick=()=>{const l=Math.max(0,new Date(ban.bannedUntil)-Date.now()),d=Math.floor(l/86400000),h=Math.floor(l%86400000/3600000),m=Math.floor(l%3600000/60000),s=Math.floor(l%60000/1000);const el=document.getElementById("banTimer");if(el)el.textContent=`${d}д ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;if(l<=0)setTimeout(()=>location.reload(),1200)};tick();setInterval(tick,1000)
}
async function appeal(){const text=document.getElementById("appealText").value.trim();if(!text)return toast("Напиши текст апелляции");try{await fetch("/api/appeals",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({text})});toast("Апелляция отправлена")}catch{toast("Не удалось отправить апелляцию")}}

boot();
