/* CONSTELLATION V8 UX polish */

Object.assign(ORI,{gay:"Гей",lesbian:"Лесбиянка",queer:"Асексуал(-ка)"});

const V8_RESULT_DESCRIPTIONS={
  mbti:{
    INTJ:"Ты склонен(на) видеть систему там, где другие замечают отдельные детали. Обычно тебе важно понимать логику происходящего, заранее продумывать варианты и самостоятельно выбирать направление. В отношениях ценишь интеллектуальную честность, уважение к границам и человека, с которым можно говорить не только о событиях, но и об идеях.",
    INTP:"Твоё естественное состояние — исследовать, сомневаться и собирать собственную модель мира. Ты легко уходишь в глубокий анализ, любишь необычные идеи и плохо переносишь правила, которые существуют только потому, что «так принято». В близости тебе особенно важны свобода мысли, спокойствие и партнёр, который не требует постоянно играть социальную роль.",
    ENTJ:"Ты часто быстро видишь цель, структуру и следующий шаг. Тебе комфортно принимать решения, организовывать процессы и говорить прямо, особенно когда ситуация требует ясности. В отношениях ты, как правило, уважаешь самостоятельность и амбиции партнёра, но тебе полезно оставлять место не только решениям, но и чувствам, которым не всегда нужен немедленный план.",
    ENTP:"Ты питаешься новизной, идеями и живыми разговорами. Тебе нравится проверять привычные взгляды на прочность, находить неожиданные связи и быстро перестраиваться, когда появляется более интересный вариант. В отношениях тебе особенно подходит человек, который не боится интеллектуальной игры, юмора и перемен, но при этом умеет сохранять устойчивый эмоциональный контакт.",
    INFJ:"Ты склонен(на) глубоко считывать людей, подтекст и настроение отношений. Часто соединяешь сильную внутреннюю систему ценностей с желанием понимать других и помогать им расти. В близости тебе важны искренность, смысл и ощущение, что контакт не поверхностный; при этом важно не брать на себя ответственность за чужие эмоции целиком.",
    INFP:"Ты воспринимаешь мир через личные ценности, воображение и тонкие эмоциональные оттенки. Часто тебе важно не просто «как правильно», а насколько что-то соответствует твоему внутреннему ощущению себя. В отношениях ценишь принятие, индивидуальность и глубокую эмоциональную связь, а давление или холодная прагматика могут быстро заставить тебя закрыться.",
    ENFJ:"Ты хорошо чувствуешь динамику между людьми и часто умеешь объединять их вокруг общей идеи. Тебе естественно поддерживать, замечать чужие состояния и создавать атмосферу, в которой людям проще раскрыться. В отношениях ты щедро вкладываешься в контакт, поэтому особенно важно, чтобы забота была взаимной, а твои собственные потребности не становились невидимыми.",
    ENFP:"Ты любопытен(на), эмоционально живой(ая) и легко загораешься людьми, идеями и возможностями. Обычно тебе нужен контакт, в котором можно оставаться собой, импровизировать и постоянно открывать что-то новое. В отношениях особенно ценишь искренний интерес и эмоциональную вовлечённость, но рутина без внутреннего смысла может быстро снижать твою энергию.",
    ISTJ:"Ты обычно опираешься на факты, надёжность и понятные договорённости. Тебе спокойнее, когда слова совпадают с поступками, планы имеют форму, а ответственность распределена ясно. В отношениях ты часто проявляешь заботу через стабильность и действия, а не громкие жесты, и особенно ценишь последовательность партнёра.",
    ISFJ:"Ты внимателен(на) к деталям, хорошо замечаешь потребности близких и часто выражаешь привязанность через конкретную заботу. Для тебя важны безопасность, уважение и ощущение, что отношения имеют устойчивую основу. Иногда ты можешь слишком долго подстраиваться под других, поэтому открыто говорить о собственных желаниях для тебя особенно полезно.",
    ESTJ:"Тебе естественно наводить порядок, принимать практичные решения и доводить договорённости до результата. Ты ценишь ясность, ответственность и людей, на которых действительно можно положиться. В отношениях тебе комфортнее, когда ожидания проговорены прямо, а партнёр способен быть самостоятельным и последовательно держать слово.",
    ESFJ:"Ты ориентирован(а) на людей, связь и атмосферу вокруг. Часто хорошо замечаешь, кому нужна поддержка, умеешь создавать тепло и ценишь понятные проявления взаимного интереса. В отношениях для тебя особенно важны включённость и подтверждение близости, поэтому холодная неопределённость может переживаться тяжелее, чем открытый разговор.",
    ISTP:"Ты наблюдателен(на), практичен(на) и предпочитаешь сначала разобраться в ситуации, а потом действовать. Тебе нравится свобода, конкретика и возможность решать задачи без лишней драматизации. В отношениях ценишь уважение к личному пространству и естественность, а чрезмерный контроль или эмоциональное давление могут быстро утомлять.",
    ISFP:"Ты чувствителен(на) к атмосфере, эстетике и личной свободе. Обычно предпочитаешь проявлять себя через поступки, впечатления и непосредственный опыт, а не через жёсткие схемы. В отношениях тебе важны мягкость, принятие и пространство для собственного темпа, особенно когда речь идёт об эмоциональной открытости.",
    ESTP:"Ты быстро включаешься в происходящее, хорошо реагируешь на изменения и чаще предпочитаешь реальный опыт долгим размышлениям о нём. Тебя привлекают энергия, действие и люди, которые умеют быть живыми и прямыми. В отношениях тебе важны динамика и честность, но глубокая близость требует иногда замедлиться и остаться в разговоре дольше, чем подсказывает импульс.",
    ESFP:"Ты легко привносишь в общение энергию, эмоции и ощущение настоящего момента. Тебе важны впечатления, взаимный интерес и возможность открыто выражать симпатию. В отношениях ты часто создаёшь тепло естественным образом, а слишком холодная или формальная коммуникация может ощущаться как отсутствие контакта."
  },
  attachment:{
    Secure:"Тебе в целом комфортна близость без необходимости постоянно проверять отношения на прочность. Ты способен(на) просить о поддержке, обсуждать границы и сохранять чувство связи даже во время конфликта. Это не означает отсутствие тревоги или сложных реакций, скорее у тебя обычно есть внутренняя опора, позволяющая возвращаться к открытому диалогу.",
    Anxious:"Для тебя связь с близким человеком может ощущаться особенно значимой и чувствительной к изменениям. Паузы, неоднозначные сигналы или дистанция иногда запускают сильное желание убедиться, что отношения всё ещё в порядке. Тебе особенно подходят ясные договорённости и партнёры, которые умеют последовательно показывать интерес, а навык выдерживать неопределённость помогает не превращать тревогу в постоянную проверку контакта.",
    Avoidant:"Тебе важна автономия, и при росте эмоциональной интенсивности может появляться желание увеличить дистанцию. Ты часто предпочитаешь сначала справляться с переживаниями самостоятельно и только потом говорить о них. В отношениях тебе особенно помогает контакт, где уважают личное пространство, а близость развивается без давления и без необходимости выбирать между независимостью и привязанностью."
  },
  enneagram:{
    "Тип 1":"Ты ориентирован(а) на качество, ответственность и внутреннее ощущение правильности. Часто быстро замечаешь, что можно сделать лучше, и предъявляешь высокие требования прежде всего к себе. Твоя сила — принципиальность и надёжность, а точка роста — позволять себе несовершенство и не превращать внутреннего редактора в круглосуточного начальника.",
    "Тип 2":"Ты легко замечаешь потребности других и часто строишь близость через помощь, поддержку и участие. Для тебя важно чувствовать, что твоя забота действительно нужна и ценится. Сильная сторона этого типа — тепло и эмпатия, а важный баланс появляется, когда ты умеешь замечать собственные желания до того, как накопится усталость или обида.",
    "Тип 3":"Ты ориентирован(а) на движение, результат и ощущение эффективности. Обычно умеешь быстро понимать, что требуется от ситуации, и подстраивать стратегию так, чтобы достичь цели. Твоя энергия помогает многого добиваться, но особенно важным становится пространство, где ценность не нужно постоянно подтверждать успехами.",
    "Тип 4":"Ты глубоко чувствуешь индивидуальность, атмосферу и эмоциональные оттенки. Для тебя важно ощущать подлинность и иметь право быть не таким(ой), как все. Творческая глубина и чувствительность становятся большой силой, когда сравнение с другими не затмевает уже существующую ценность твоего опыта.",
    "Тип 5":"Ты стремишься понять мир прежде, чем активно в него включаться. Информация, компетентность и личное пространство дают тебе ощущение устойчивости. Ты умеешь видеть то, что другие пропускают, а в отношениях особенно важно не ждать полной готовности к близости, потому что часть контакта появляется только в процессе.",
    "Тип 6":"Ты хорошо замечаешь риски, противоречия и то, насколько можно доверять ситуации или человеку. Надёжность для тебя имеет большое значение, и ты умеешь быть очень лояльным(ой), когда доверие сформировано. Сила типа — внимательность и преданность, а рост связан со способностью опираться на собственные решения, даже когда невозможно получить стопроцентную гарантию.",
    "Тип 7":"Ты тянешься к возможностям, впечатлениям и ощущению свободы. Новые идеи легко дают тебе энергию, а ограничения быстро вызывают желание найти альтернативу. Твоя гибкость и оптимизм особенно раскрываются, когда ты способен(на) не только двигаться к следующему интересному опыту, но и оставаться рядом с неприятными чувствами достаточно долго, чтобы их прожить.",
    "Тип 8":"Ты ценишь силу, прямоту и право самостоятельно определять свои границы. Обычно быстро реагируешь на давление и предпочитаешь честный конфликт скрытому контролю. Твоя решительность может создавать чувство безопасности для близких, а особая глубина появляется тогда, когда уязвимость перестаёт восприниматься как потеря силы.",
    "Тип 9":"Ты хорошо чувствуешь разные стороны ситуации и часто стремишься сохранить мир между людьми. Тебе естественно искать общую почву и не усиливать напряжение без необходимости. Твоя спокойная устойчивость ценна, но важно не растворять собственные желания в чужих приоритетах и позволять себе занимать место в отношениях."
  },
  care:{
    "Время вместе":"Главный сигнал близости для тебя — качественное присутствие. Совместный вечер, прогулка или разговор без постоянного отвлечения могут значить больше, чем громкие жесты. Особенно важно, чтобы время вместе ощущалось выбранным сознательно, а не оставшимся случайно между другими делами.",
    "Слова поддержки":"Ты хорошо считываешь любовь и участие через слова. Точные комплименты, признание усилий и простое «я рядом» могут иметь для тебя большой эмоциональный вес. При этом особенно ценна конкретика: искреннее замечание работает сильнее автоматических красивых фраз.",
    "Поступки и помощь":"Для тебя забота особенно убедительна, когда она превращается в действие. Помочь, облегчить задачу, приехать вовремя или сделать то, что обещал, часто говорит больше длинных признаний. Последовательность поступков становится важной частью доверия.",
    "Подарки и знаки внимания":"Ты воспринимаешь небольшие материальные знаки как способ сказать «я думал(а) о тебе». Цена здесь обычно менее важна, чем точность выбора и личная история вещи. Значимым становится сам факт, что человек запомнил деталь и превратил её в жест.",
    "Тактильность":"Физический контакт для тебя — самостоятельный язык близости. Объятия, прикосновения и ощущение человека рядом помогают быстрее почувствовать безопасность и связь. Особенно важно, чтобы тактильность всегда оставалась взаимной и соответствовала границам обоих."
  }
};

function v8Description(type,result){return V8_RESULT_DESCRIPTIONS[type]?.[result]||"Результат описывает одну из устойчивых тенденций твоего поведения. Используй его как повод лучше понять свои привычные реакции, а не как жёсткую характеристику личности."}
function v8PsychClass(value){
  const v=String(value||"").trim();
  if(/^[EI][NS][TF][JP]$/.test(v)){
    if(["INTJ","INTP","ENTJ","ENTP"].includes(v))return "mbti-analyst";
    if(["INFJ","INFP","ENFJ","ENFP"].includes(v))return "mbti-diplomat";
    if(["ISTJ","ISFJ","ESTJ","ESFJ"].includes(v))return "mbti-sentinel";
    return "mbti-explorer";
  }
  const m=v.match(/^Тип ([1-9])$/);return m?`ennea-${m[1]}`:"";
}
function v8DecoratePsychBadges(scope=document){
  const nodes=[];
  if(scope.nodeType===1&&scope.matches?.(".badge"))nodes.push(scope);
  scope.querySelectorAll?.(".badge").forEach(x=>nodes.push(x));
  nodes.forEach(el=>{const cls=v8PsychClass(el.textContent);if(cls)el.classList.add("psychBadge",cls)});
}

const V8_FLAG_CLASSES={hetero:"flag-hetero",gay:"flag-gay",lesbian:"flag-lesbian",bi:"flag-bi",pan:"flag-pan",queer:"flag-queer",other:"flag-other"};
function v8ApplyOrientationSelect(){
  [document.getElementById("pOri"),document.getElementById("fOri")].filter(Boolean).forEach(sel=>{
    sel.querySelectorAll("option").forEach(o=>{if(ORI[o.value])o.textContent=ORI[o.value]});
    const apply=()=>{sel.classList.remove(...Object.values(V8_FLAG_CLASSES));sel.classList.add("orientationSelect",V8_FLAG_CLASSES[sel.value]||"flag-other")};
    sel.onchange=()=>{apply();if(sel.id==="pOri")sel.dispatchEvent(new CustomEvent("orientationflag",{bubbles:false}))};apply();
  });
}

const v8BaseRenderOnboarding=renderOnboarding;
renderOnboarding=function(m){v8BaseRenderOnboarding(m);v8ApplyOrientationSelect();v8NormalizeUiCopy(document);v8DecoratePsychBadges(document)};
const v8BaseOpenFilters=openFilters;
openFilters=function(){v8BaseOpenFilters();v8ApplyOrientationSelect()};

function v8NormalizeUiCopy(scope=document){
  const selectors=".navItem,.nav button,.sidebar button,.tile h3,.heroB .kicker,.sectionTitle h1,.sectionTitle p,.panel h2,.panel p,.ach small,.matchPop p";
  const exact={
    "Созвездия":"Мэтчи",
    "твои созвездия":"твои мэтчи",
    "Созвездий пока нет":"Мэтчей пока нет",
    "Созвездие появится после взаимного лайка.":"Мэтч появится после взаимного лайка.",
    "Только взаимные лайки превращаются в созвездие и после этого открывается возможность написать человеку.":"Только взаимный лайк создаёт мэтч, после этого можно написать человеку.",
    "Создать первое созвездие с человеком":"Создать первый мэтч с человеком",
    "Упс... Кажется небо затянуло":"Не осталось подходящих анкет",
    "Упс… Кажется небо затянуло":"Не осталось подходящих анкет"
  };
  const nodes=[];if(scope.nodeType===1&&scope.matches?.(selectors))nodes.push(scope);scope.querySelectorAll?.(selectors).forEach(x=>nodes.push(x));
  nodes.forEach(el=>{const t=el.textContent.trim();if(exact[t])el.textContent=exact[t];else if(el.closest?.(".matchPop")&&/^Созвездие с .+ создано\./.test(t))el.textContent=t.replace(/^Созвездие с (.+) создано\./,"Мэтч с $1 создан.")});
  scope.querySelectorAll?.("option").forEach(o=>{if(ORI[o.value])o.textContent=ORI[o.value]});
  scope.querySelectorAll?.(".badge").forEach(el=>{const old={"Лесби":"Лесбиянка","Гомо":"Гей","Квир":"Асексуал(-ка)"}[el.textContent.trim()];if(old)el.textContent=old});
}

const v8BaseShowMatch=showMatch;
showMatch=function(u){v8BaseShowMatch(u);v8NormalizeUiCopy(document)};
const v8BaseRenderHome=renderHome;
renderHome=async function(){await v8BaseRenderHome();v8NormalizeUiCopy(document);v8DecoratePsychBadges(document)};
const v8BaseRenderMatches=renderMatches;
renderMatches=async function(){await v8BaseRenderMatches();v8NormalizeUiCopy(document);v8DecoratePsychBadges(document)};
const v8BaseRenderAchievements=renderAchievements;
renderAchievements=async function(){await v8BaseRenderAchievements();v8NormalizeUiCopy(document)};
const v8BaseRenderDiscover=renderDiscover;
renderDiscover=async function(){await v8BaseRenderDiscover();v8NormalizeUiCopy(document);v8DecoratePsychBadges(document)};
const v8BaseRenderProfile=renderProfile;
renderProfile=function(){v8BaseRenderProfile();v8NormalizeUiCopy(document);v8DecoratePsychBadges(document)};

function v8ReadTicks(read){return read?'<span class="readTicks read"><i>✓</i><i>✓</i></span>':'<span class="readTicks"><i>✓</i></span>'}
function v8MessageHtml(m,matchId){
  if(m.kind==="system")return `<div class="sys">${esc(m.body)}</div>`;
  const mine=m.senderId===me.id;
  const reacts=(m.reactions||[]).map(r=>`<button class="reactionPill ${r.mine?"mine":""}" onclick="reactToMessage('${matchId}','${m.id}','${r.emoji}')"><span>${r.emoji}</span><small>${r.count}</small></button>`).join("");
  return `<div class="msg ${mine?"me":""}" data-message-id="${m.id}" oncontextmenu="openReactionMenu(event,'${matchId}','${m.id}')">${m.body?esc(m.body):""}${m.image?`<img src="${m.image}" alt="Фото">`:""}${reacts?`<div class="messageReactions">${reacts}</div>`:""}<div class="messageMeta"><span>${new Date(m.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>${mine?v8ReadTicks(!!m.readAt):""}</div></div>`;
}
loadMessages=async function(matchId,silent=false){
  if(page!=="chat")return;
  try{
    const draft=document.getElementById("msgText")?.value||"";
    const all=(await api(`/api/matches?mode=${mode}`)).matches,meta=all.find(x=>x.matchId===matchId);
    if(!meta){activeChat=null;if(!silent)renderChats();return}
    const d=await api(`/api/matches/${matchId}/messages-v7`),room=document.getElementById("chatRoom");if(!room)return;
    const inputName=`message-${matchId}-${Math.floor(Date.now()/1000)}`;
    room.innerHTML=`<div class="chatHead"><div class="chatHeadPerson"><div class="avatarWrap"><img src="${meta.person.photo}" alt="">${meta.online?'<span class="onlineDot"></span>':""}</div><div><b>${esc(meta.person.name)}</b><div class="small muted">${meta.online?"Онлайн":meta.muted?"Уведомления выключены":"Не в сети"}</div></div></div><div class="actions"><button class="btn ghost compact" onclick="openDateModal('${matchId}','${esc(meta.person.name)}')">${calendarGlyph()} Встреча</button><button class="iconBtn" onclick="chatMenu('${matchId}','${meta.person.id}','${esc(meta.person.name)}',${meta.pinned},${meta.muted})">•••</button></div></div><div class="messages" id="msgs">${d.messages.map(m=>v8MessageHtml(m,matchId)).join("")}</div><div class="composer" autocomplete="off"><label class="btn ghost">＋<input class="hidden" type="file" accept="image/*" onchange="sendChatPhoto('${matchId}',this)"></label><input id="msgText" class="input" name="${inputName}" value="${esc(draft)}" placeholder="Сообщение" autocomplete="off" aria-autocomplete="none" autocorrect="off" spellcheck="true" onkeydown="if(event.key==='Enter')sendText('${matchId}')"><button class="btn accent" onclick="sendText('${matchId}')">→</button></div>`;
    const box=document.getElementById("msgs");box.scrollTop=box.scrollHeight;
  }catch(e){if(!silent)toast("Не удалось открыть чат")}
};

function v8TestLock(type){const r=me.tests?.[type],last=r?.lastAt?+new Date(r.lastAt):0;return {result:r,left:Math.max(0,last+3*86400000-Date.now()),until:last+3*86400000}}
function v8TestTone(type,result){const p=v8PsychClass(result);return p||(`result-${type}`)}
function v8TestCard(type){
  const t=TESTS[type],lock=v8TestLock(type),r=lock.result,desc=r?v8Description(type,r.result):"";
  return `<div class="testCard v8TestCard ${r?v8TestTone(type,r.result):""}" onclick="v8OpenTest('${type}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')v8OpenTest('${type}')"><div class="kicker">${t.subtitle}</div><h2>${t.title}</h2>${r?`<div class="testResultBadge ${v8TestTone(type,r.result)}">${esc(r.result)}</div><p class="testCardDescription">${esc(desc)}</p>`:`<p>Ещё не пройден</p>`}${lock.left?`<p class="timer" data-lock="${lock.until}"></p><span class="testCardCta muted">Открыть результат →</span>`:`<span class="testCardCta">${r?"Открыть результат / пройти заново":"Начать тест"} →</span>`}</div>`;
}
renderTests=async function(){
  me=(await api("/api/me")).user;
  document.getElementById("main").innerHTML=`<div class="sectionTitle"><div><h1>Тесты</h1><p>Выбери тест. После открытия он займёт рабочую область целиком, чтобы ничего не отвлекало от вопросов и результата.</p></div></div><div class="testGrid v8TestGrid">${Object.keys(TESTS).map(v8TestCard).join("")}</div>`;
  tickLocks();v8DecoratePsychBadges(document);
};
function v8OpenTest(type){const lock=v8TestLock(type);if(lock.result)return v8ShowTestResult(type,lock.result.result,true);startTest(type)}
startTest=function(type){testSession={type,index:0,answers:Array(TESTS[type].questions.length).fill(null)};renderQuestion()};
function v8ExitTest(){testSession=null;renderTests()}
renderQuestion=function(){
  const t=TESTS[testSession.type],q=t.questions[testSession.index],sel=testSession.answers[testSession.index],labels=["Точно нет","","Не уверен(-а)","","Точно да"],progress=Math.round((testSession.index/t.questions.length)*100);
  document.getElementById("main").innerHTML=`<div class="testFocus"><div class="testFocusTop"><button class="btn ghost" onclick="v8ExitTest()">← К тестам</button><div><div class="kicker">${t.title}</div><b>${testSession.index+1} / ${t.questions.length}</b></div></div><div class="testFocusProgress"><span style="width:${progress}%"></span></div><div class="question v8Question"><h2>${esc(q[0])}</h2><div class="likert">${labels.map((l,i)=>`<div class="likertOpt ${sel===i+1?"on":""}" onclick="likert(${i+1})"><button class="likertDot">${sel===i+1?"✓":""}</button><div class="likertLabel">${l}</div></div>`).join("")}</div><div class="testNav"><button class="btn ghost" onclick="prevQuestion()" ${testSession.index===0?"disabled":""}>← Назад</button></div></div></div>`;
};
function v8ComputeResult(type,a){
  const t=TESTS[type];let result="";
  if(type==="mbti"){const s={EI:0,NS:0,TF:0,JP:0};t.questions.forEach((q,i)=>s[q[1]]+=(a[i]-3)*q[2]);result=(s.EI>=0?"E":"I")+(s.NS>=0?"N":"S")+(s.TF>=0?"T":"F")+(s.JP>=0?"J":"P")}
  if(type==="attachment"){const s={secure:0,anxious:0,avoidant:0};t.questions.forEach((q,i)=>s[q[1]]+=a[i]);const k=Object.entries(s).sort((x,y)=>y[1]-x[1])[0][0];result={secure:"Secure",anxious:"Anxious",avoidant:"Avoidant"}[k]}
  if(type==="enneagram"){const s={};for(let i=1;i<=9;i++)s[i]=0;t.questions.forEach((q,i)=>s[q[1]]+=a[i]);result="Тип "+Object.entries(s).sort((x,y)=>y[1]-x[1])[0][0]}
  if(type==="care"){const s={time:0,words:0,acts:0,gifts:0,touch:0};t.questions.forEach((q,i)=>s[q[1]]+=a[i]);const k=Object.entries(s).sort((x,y)=>y[1]-x[1])[0][0];result={time:"Время вместе",words:"Слова поддержки",acts:"Поступки и помощь",gifts:"Подарки и знаки внимания",touch:"Тактильность"}[k]}
  return result;
}
finishTest=async function(){
  const type=testSession.type,a=testSession.answers,result=v8ComputeResult(type,a);
  await api(`/api/tests/${type}`,{method:"POST",body:JSON.stringify({result,answers:a})});testSession=null;me=(await api("/api/me")).user;v8ShowTestResult(type,result,false);checkAchievementsNow?.();
};
function v8ShowTestResult(type,result,existing){
  const t=TESTS[type],lock=v8TestLock(type),tone=v8TestTone(type,result),desc=v8Description(type,result);
  document.getElementById("main").innerHTML=`<div class="testFocus resultFocus"><div class="testFocusTop"><button class="btn ghost" onclick="renderTests()">← К тестам</button><div class="kicker">${t.title}</div></div><div class="testResultHero ${tone}"><div class="kicker">${existing?"твой текущий результат":"результат сохранён"}</div><h1>${esc(result)}</h1><p>${esc(desc)}</p></div><div class="testResultActions">${lock.left?`<div><p class="timer" data-lock="${lock.until}"></p><button class="btn" disabled>В ожидании...</button></div>`:`<button class="btn accent" onclick="startTest('${type}')">Пройти заново</button>`}<button class="btn ghost" onclick="renderTests()">Все тесты</button></div></div>`;
  tickLocks();
}

function v8AfterMutation(node){v8NormalizeUiCopy(node);v8DecoratePsychBadges(node);if(node.nodeType===1&&(node.id==="pOri"||node.querySelector?.("#pOri")))v8ApplyOrientationSelect()}
const v8Observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1)v8AfterMutation(n)});
v8Observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(()=>{v8NormalizeUiCopy(document);v8DecoratePsychBadges(document);v8ApplyOrientationSelect()},200);
