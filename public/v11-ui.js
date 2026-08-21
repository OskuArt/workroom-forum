/* CONSTELLATION V11 responsive navigation + human UI hierarchy */

const V11_NAV = {
  home:{label:'Дома',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M9 20v-6h6v6"/></svg>'},
  discover:{label:'Поиск',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>'},
  matches:{label:'Мэтчи',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5c2.1 0 3.5 1.2 4.5 2.6 1-1.4 2.4-2.6 4.5-2.6 2.8 0 4.5 2 4.5 4.5 0 4.8-5 7.7-9 10-4-2.3-9-5.2-9-10 0-2.5 1.7-4.5 4.5-4.5Z"/></svg>'},
  chat:{label:'Чаты',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>'},
  calendar:{label:'Календарь встреч',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7 3v5M17 3v5M3.5 10h17"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>'},
  tests:{label:'Тесты',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M10 3v5l-5 9a2.5 2.5 0 0 0 2.2 3.7h9.6A2.5 2.5 0 0 0 19 17l-5-9V3"/><path d="M8.5 15h7"/></svg>'},
  achievements:{label:'Ачивки',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="m9 13-2 8 5-3 5 3-2-8"/></svg>'},
  profile:{label:'Моя анкета',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6"/></svg>'}
};

function v11EnhanceShell(){
  document.body.classList.add('v11-ui');
  const top=document.querySelector('.topbar');
  const side=document.querySelector('.side');
  if(!top||!side)return;

  side.id='v11MobileNav';
  side.setAttribute('aria-label','Основная навигация');

  const logo=top.querySelector('.logo');
  if(logo&&!logo.dataset.v11){
    logo.dataset.v11='1';
    logo.setAttribute('role','button');
    logo.setAttribute('tabindex','0');
    logo.setAttribute('aria-label','Открыть меню');
    logo.addEventListener('click',()=>{if(matchMedia('(max-width:599px)').matches)v11ToggleMobileNav()});
    logo.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&matchMedia('(max-width:599px)').matches){e.preventDefault();v11ToggleMobileNav()}});
  }

  const modes=[['mH','uH','😇','Harmony'],['mA','uA','🔥','After Dark']];
  modes.forEach(([btnId,countId,emoji,label])=>{
    const btn=document.getElementById(btnId);if(!btn||btn.dataset.v11)return;
    const count=document.getElementById(countId);const value=count?.textContent||'0';const hidden=count?.classList.contains('hidden');
    btn.dataset.v11='1';btn.title=label;btn.setAttribute('aria-label',label);
    btn.innerHTML=`<span class="modeEmoji" aria-hidden="true">${emoji}</span><span id="${countId}" class="unread ${hidden?'hidden':''}">${value}</span>`;
  });

  side.querySelectorAll('.nav button').forEach(btn=>{
    const p=btn.dataset.p,meta=V11_NAV[p];if(!meta)return;
    btn.innerHTML=`<span class="navIcon">${meta.icon}</span><span class="navLabel">${meta.label}</span>`;
    btn.title=meta.label;
    btn.setAttribute('aria-label',meta.label);
    btn.setAttribute('aria-current',btn.classList.contains('on')?'page':'false');
    if(!btn.dataset.v11){btn.dataset.v11='1';btn.addEventListener('click',()=>v11CloseMobileNav())}
  });

  let backdrop=document.getElementById('v11NavBackdrop');
  if(!backdrop){
    backdrop=document.createElement('button');
    backdrop.id='v11NavBackdrop';backdrop.className='v11NavBackdrop';backdrop.type='button';backdrop.setAttribute('aria-label','Закрыть меню');
    backdrop.addEventListener('click',v11CloseMobileNav);document.body.appendChild(backdrop);
  }
}

function v11ToggleMobileNav(){
  const side=document.getElementById('v11MobileNav'),backdrop=document.getElementById('v11NavBackdrop');if(!side)return;
  const open=!side.classList.contains('is-mobile-open');
  side.classList.toggle('is-mobile-open',open);backdrop?.classList.toggle('show',open);document.body.classList.toggle('mobile-nav-open',open);
}
function v11CloseMobileNav(){document.getElementById('v11MobileNav')?.classList.remove('is-mobile-open');document.getElementById('v11NavBackdrop')?.classList.remove('show');document.body.classList.remove('mobile-nav-open')}

const v11BaseRenderApp=renderApp;
renderApp=function(){const r=v11BaseRenderApp();requestAnimationFrame(v11EnhanceShell);return r};

const v11BaseGo=go;
go=function(p,scroll=true){v11CloseMobileNav();const r=v11BaseGo(p,scroll);setTimeout(v11AfterView,0);return r};

function v11AfterView(){
  document.querySelectorAll('.nav button').forEach(btn=>btn.setAttribute('aria-current',btn.classList.contains('on')?'page':'false'));
  document.querySelectorAll('.sectionTitle p').forEach(p=>{if(p.textContent.trim()==='Переписки двух режимов не смешиваются.')p.remove()});
  v11EnhanceShell();
}

const v11BaseRenderChats=renderChats;
renderChats=async function(){const r=await v11BaseRenderChats();v11AfterView();return r};

renderAchievements=async function(){
  const dates=(await api('/api/dates')).dates;
  const matches=[...(await api('/api/matches?mode=harmony')).matches,...(await api('/api/matches?mode=after')).matches];
  const completed=dates.filter(x=>x.status==='completed').length;
  const declined=dates.some(x=>x.status==='declined');
  const created=+new Date(me.createdAt),days=(Date.now()-created)/86400000;
  let current=null,next=RANKS[0];
  for(const r of RANKS){if(days>=r.days)current=r;else{next=r;break}}
  if(days>=RANKS.at(-1).days)next=null;
  const base=current?.days||0,progress=next?Math.max(0,Math.min(100,(days-base)/(next.days-base)*100)):100;
  const ach=[
    ['Первая искра','Создать первый мэтч','✦',matches.length>=1],
    ['По ракетам!','Назначить первое свидание','↗',dates.length>=1],
    ['Приятного полёта','Провести первое свидание','◐',completed>=1],
    ['Вторая глава','Провести две встречи','◑',completed>=2],
    ['Устойчивая орбита','Провести три встречи','●',completed>=3],
    ['Опытный тестировщик','Пройти все четыре теста','◎',['mbti','attachment','enneagram','care'].every(x=>me.tests?.[x])],
    ['Попытка не пытка','Получить отклонённое приглашение','×',declined],
    ['Другая сторона','Заполнить Harmony и After Dark','↔',me.completedHarmony&&me.completedAfter],
    ['Границы обозначены','Заполнить границы в After Dark','!',!!me.profile?.after?.taboos]
  ];
  document.getElementById('main').innerHTML=`
    <div class="sectionTitle v11AchTitle"><div><h1>Ачивки</h1><p>Коллекция достижений. Полученные медали окрашиваются, остальные остаются в витрине как цели.</p></div><div class="medalCount"><b>${ach.filter(a=>a[3]).length}</b><span>из ${ach.length}</span></div></div>
    <div class="panel rankCard v11RankCard"><div><div class="kicker">ранг аккаунта</div><h2>${current?current.name:'Без ранга'}</h2><p class="muted">${next?`До ранга «${next.name}» осталось примерно ${Math.max(0,Math.ceil(next.days-days))} дн.`:'Максимальный ранг достигнут.'}</p></div><div class="rankProgressWrap"><span>${Math.round(progress)}%</span><div class="progress"><div style="width:${progress}%"></div></div></div></div>
    <div class="medalShowcaseHeader"><div><div class="kicker">витрина медалей</div><h2>Твоя коллекция</h2></div><span class="medalScrollHint">Прокручивай →</span></div>
    <div class="medalShelf" tabindex="0" aria-label="Витрина достижений">${ach.map((a,i)=>`<article class="medalCard ${a[3]?'is-earned':'is-locked'}"><div class="medalTop"><span class="medalIndex">${String(i+1).padStart(2,'0')}</span><span class="medalState">${a[3]?'получено':'не открыто'}</span></div><div class="medalDisc"><span>${a[2]}</span></div><h3>${a[0]}</h3><p>${a[1]}</p></article>`).join('')}</div>`;
};

const v11CopyObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(n.nodeType!==1)continue;n.querySelectorAll?.('.sectionTitle p').forEach(p=>{if(p.textContent.trim()==='Переписки двух режимов не смешиваются.')p.remove()})}});
v11CopyObserver.observe(document.documentElement,{subtree:true,childList:true});

addEventListener('resize',()=>{if(!matchMedia('(max-width:599px)').matches)v11CloseMobileNav()});
setTimeout(()=>{v11EnhanceShell();v11AfterView()},250);
