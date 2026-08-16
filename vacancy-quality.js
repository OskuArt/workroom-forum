// WORK//ROOM vacancy quality gate
// Keeps the catalogue digital-only, removes promo/digest posts and repairs noisy
// Telegram titles/companies after ingestion. It intentionally runs AFTER the v3 monitor
// so it can clean both new and already-stored imported vacancies without touching
// manual/admin entries.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

if (!process.env.DATABASE_URL) return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max: 3,
});

const clean = (v='', max=5000) => String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
const plain = (v='', max=18000) => clean(sanitizeHtml(String(v||''), { allowedTags:[], allowedAttributes:{} }), max);

const ROLES = [
  ['Graphic Design','Графический дизайнер',/(?:ведущ(?:ий|ая)\s+)?(?:senior\s+|middle\s+|junior\s+)?(?:графическ(?:ий|ая)\s+дизайнер|graphic designer|grafikdesigner|grafički dizajner|graficki dizajner)/i],
  ['Graphic Design','Бренд-дизайнер',/(?:бренд[- ]?дизайнер|brand designer|visual identity designer)/i],
  ['Graphic Design','Motion Designer',/(?:motion designer|моушн[- ]?дизайнер|motion dizajner)/i],
  ['Graphic Design','Иллюстратор',/(?:иллюстратор|illustrator|ilustrator)/i],
  ['UI/UX','Product Designer',/(?:product designer|продуктов(?:ый|ая)\s+дизайнер|produkt dizajner)/i],
  ['UI/UX','UI/UX Designer',/(?:ui\s*[/&+-]?\s*ux\s+designer|ux\s*[/&+-]?\s*ui\s+designer|ui\s*[/&+-]?\s*ux\s+дизайнер|ux designer|ui designer|ux dizajner|ui dizajner)/i],
  ['Engineering','Frontend Developer',/(?:front[- ]?end\s+(?:developer|engineer)|frontend\s+(?:developer|engineer|разработчик)|фронтенд[- ]?разработчик)/i],
  ['Engineering','Backend Developer',/(?:back[- ]?end\s+(?:developer|engineer)|backend\s+(?:developer|engineer|разработчик)|б[эе]кенд[- ]?разработчик)/i],
  ['Engineering','Software Engineer',/(?:software\s+(?:engineer|developer)|full[- ]?stack\s+(?:engineer|developer)|fullstack\s+разработчик|разработчик\s+программного\s+обеспечения)/i],
  ['Engineering','DevOps Engineer',/(?:devops\s+(?:engineer|инженер)|site reliability engineer|\bsre\b)/i],
  ['Engineering','QA Engineer',/(?:qa\s+(?:engineer|инженер)|quality assurance engineer|тестировщик)/i],
  ['Data / AI','AI Engineer',/(?:ai\s+engineer|ml\s+engineer|machine learning engineer|llm\s+engineer|ai[- ]?инженер|ml[- ]?инженер|инженер\s+машинного\s+обучения)/i],
  ['Data / AI','Data Analyst',/(?:data analyst|аналитик\s+данных|analitičar podataka|analiticar podataka)/i],
  ['Data / AI','Data Engineer',/(?:data engineer|инженер\s+данных)/i],
  ['Product','Product Manager',/(?:product manager|продакт[- ]?менеджер|продуктов(?:ый|ая)\s+менеджер|produkt menadžer|produkt menadzer)/i],
  ['Product','Project Manager',/(?:project manager|проджект[- ]?менеджер|менеджер\s+проектов)/i],
  ['Marketing','Marketing Manager',/(?:marketing manager|digital marketer|digital marketing manager|маркетолог|менеджер\s+по\s+маркетингу|marketing menadžer|marketing menadzer)/i],
  ['Marketing','Performance Marketer',/(?:performance\s+(?:marketer|marketing manager)|performance[- ]?маркетолог)/i],
  ['Marketing','SMM Manager',/(?:smm[- ]?менеджер|social media manager|social media specialist|смм[- ]?менеджер)/i],
  ['Marketing','PR Manager',/(?:pr[- ]?менеджер|pr manager|communications manager|менеджер\s+по\s+коммуникациям)/i],
  ['Marketing','CRM Manager',/(?:crm[- ]?менеджер|crm manager|crm specialist)/i],
  ['Content','Copywriter',/(?:копирайтер|copywriter|content writer)/i],
  ['Content','Content Manager',/(?:контент[- ]?менеджер|content manager|content specialist)/i],
  ['Content','Content Creator',/(?:контент[- ]?креатор|content creator|creator)/i],
  ['Creative / Production','Креативный продюсер',/(?:креативн(?:ый|ая)\s+продюсер|creative producer)/i],
  ['Creative / Production','Исполнительный продюсер',/(?:исполнительн(?:ый|ая)\s+продюсер|executive producer)/i],
  ['Creative / Production','Продюсер',/(?:^|[\s:—–-])продюсер(?:[\s,.!?;:—–-]|$)|\bproducer\b/i],
  ['HR','HR Manager',/(?:hr[- ]?менеджер|hr manager|human resources manager)/i],
  ['HR','Recruiter',/(?:it[- ]?рекрутер|рекрутер|recruiter|talent acquisition(?: specialist| manager)?)/i],
  ['HR','HR Business Partner',/(?:hrbp|hr business partner)/i],
  ['GameDev','Game Designer',/(?:game designer|геймдизайнер|game dizajner)/i],
  ['GameDev','Game Developer',/(?:game developer|gamedev developer|разработчик\s+игр)/i],
  ['GameDev','iGaming Specialist',/(?:igaming\s+(?:specialist|manager|designer|producer)|iGaming|айгейминг)/i],
];

const PROMO_PATTERNS = [
  /(?:хотите|хочешь|хотите ли).*?(?:опубликовать|разместить).*?ваканси/i,
  /(?:опубликовать|разместить)\s+(?:свою\s+)?ваканси/i,
  /(?:размещаем|разместим|публикуем)\s+ваканси/i,
  /для\s+размещения\s+ваканси/i,
  /входите\s+как\s+рекрутер/i,
  /заполните\s+(?:эту\s+)?анкету/i,
  /ежедневн(?:ая|ые)\s+подборк[аи]\s+(?:актуальных\s+)?ваканси/i,
  /(?:просматриваем|мониторим).*?\d{2,}\+?\s+(?:источников|вакансий)/i,
  /канал\s+(?:с|про)\s+ваканси/i,
  /(?:ищете|ищешь)\s+(?:сотрудника|специалиста|кандидата)/i,
  /(?:реклама|рекламный пост|партн[её]рский материал|sponsored)/i,
  /референсы\s*$/im,
];

const BAD_NON_DIGITAL = /(?:кассир|продавец|официант|бариста|повар|пекарь|курьер|водитель|кладовщик|комплектовщик|разнорабоч|грузчик|уборщик|охранник|слесарь|электрик|сварщик|оператор\s+станка|мастер\s+маникюра|врач|медсестр|фармацевт)/i;
const BAD_TITLE = /^(?:@?[\w.]+|вакансия|работа|ищем|требуется|job|vacancy|позиция|—.+|•.+)$/i;

function roleMatch(text='') {
  const s=String(text);
  for (const [sector, canonical, re] of ROLES) {
    const m=s.match(re);
    if (m) return { sector, canonical, matched:clean(m[0].replace(/^[\s:—–-]+/,''),120), index:m.index||0 };
  }
  return null;
}

function isPromo(text='') { return PROMO_PATTERNS.some(re=>re.test(String(text))); }
function isDigital(text='') { return Boolean(roleMatch(text)); }

function smartTitle(text='', existing='') {
  const raw=String(text||'').replace(/\r/g,'');
  const role=roleMatch(raw);
  if (!role) return '';
  const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let best='';
  for (const line of lines) {
    if (!roleMatch(line)) continue;
    if (isPromo(line) || line.length>180) continue;
    let candidate=line
      .replace(/^[•▪︎◾️🔹🔸📣📢💼✅☑️⭐️✨\-–—\s]+/u,'')
      .replace(/^(?:вакансия|ищем|требуется|job opening|vacancy|hiring|stelle|posao)\s*[:—–-]?\s*/i,'')
      .replace(/\s+(?:в|для|at)\s+[A-ZА-ЯЁ][^|•]{0,80}$/u,'')
      .trim();
    if (candidate.length>=3 && candidate.length<=120) { best=candidate; break; }
  }
  if (!best || BAD_TITLE.test(best) || /^@/.test(best)) best=role.matched || role.canonical;
  // Keep meaningful seniority/lead qualifier if it is close to the role.
  const qualifier=raw.slice(Math.max(0,role.index-35),role.index+role.matched.length+35).match(/\b(?:senior|middle|junior|lead|head|ведущ(?:ий|ая)|старш(?:ий|ая)|младш(?:ий|ая)|тимлид)\b/iu)?.[0];
  if (qualifier && !new RegExp(qualifier,'i').test(best) && best.length<95) best=`${qualifier} ${best}`;
  return clean(best,120);
}

function smartCompany(text='', current='') {
  const raw=String(text||'');
  const patterns=[
    /(?:вакансия|ищем|требуется)?[^\n]{0,90}\s+в\s+([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9&.'’+\- ]{2,65})(?:\s+(?:офис|remote|удал|гибрид|в\s+[А-ЯA-Z])|[,.!\n]|$)/u,
    /(?:компания|работодатель|company|employer)\s*[:—–-]\s*([^\n|•;]{2,80})/i,
    /(?:для|at)\s+([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9&.'’+\- ]{2,65})(?:[,.!\n]|$)/u,
  ];
  for (const re of patterns) { const m=raw.match(re); if(m) return clean(m[1],80); }
  if (current && !/^@/.test(current) && !/telegram/i.test(current)) return clean(current,80);
  return current || 'Компания';
}

async function qualityPass() {
  try {
    const {rows}=await pool.query(`
      SELECT id,title,company,summary,summary_ru,description_html,description_ru_html,sector,source,source_metadata,is_active
      FROM jobs
      WHERE source NOT IN ('Manual','Direct')
        AND (is_active=TRUE OR updated_at>NOW()-INTERVAL '7 days')
      ORDER BY COALESCE(published_at,created_at) DESC
      LIMIT 1200
    `);
    let hidden=0,repaired=0;
    for (const row of rows) {
      const text=[row.title,row.summary,row.summary_ru,plain(row.description_ru_html||row.description_html||'',12000)].filter(Boolean).join('\n');
      const role=roleMatch(text);
      const promo=isPromo(text);
      const nondigital=BAD_NON_DIGITAL.test(`${row.title}\n${row.summary||''}`) && !role;
      if (promo || !role || nondigital) {
        if (row.is_active) {
          await pool.query(`UPDATE jobs SET is_active=FALSE,updated_at=NOW(),source_metadata=COALESCE(source_metadata,'{}'::jsonb)||$2::jsonb WHERE id=$1`,[
            row.id,JSON.stringify({quality_hidden:true,quality_reason:promo?'promo_or_recruiter_ad':nondigital?'non_digital':'no_digital_role'})
          ]);
          hidden++;
        }
        continue;
      }
      const nextTitle=smartTitle(text,row.title) || row.title;
      const nextCompany=smartCompany(text,row.company);
      const sourceMeta={quality_checked:true,quality_role:role.canonical,quality_sector:role.sector};
      if (nextTitle!==row.title || nextCompany!==row.company || row.sector!==role.sector) repaired++;
      await pool.query(`UPDATE jobs SET title=$2,company=$3,sector=$4,source_metadata=COALESCE(source_metadata,'{}'::jsonb)||$5::jsonb,updated_at=NOW() WHERE id=$1`,[
        row.id,nextTitle,nextCompany,role.sector,JSON.stringify(sourceMeta)
      ]);
    }
    console.log(`[vacancy-quality] checked=${rows.length} repaired=${repaired} hidden=${hidden}`);
  } catch(err) { console.warn('[vacancy-quality] pass failed:',err.message); }
}

setTimeout(qualityPass,45_000).unref();
setInterval(qualityPass,20*60_000).unref();
process.on('exit',()=>pool.end().catch(()=>{}));
