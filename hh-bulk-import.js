// WORK//ROOM bulk hh.ru importer
// Goal: keep a deep pool of fresh (<= 90 days) digital vacancies while the main
// vacancy-monitor-v3 handles Telegram / Instagram / translations / richer discovery.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');

if (!process.env.DATABASE_URL || String(process.env.VACANCY_MONITOR_ENABLED || 'true') !== 'true') return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max: 6,
});

const clean=(v='',max=5000)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
const plain=(v='',max=12000)=>clean(sanitizeHtml(String(v||''),{allowedTags:[],allowedAttributes:{}}),max);
const rich=(v='')=>sanitizeHtml(String(v||''),{
  allowedTags:['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
  allowedAttributes:{a:['href','target','rel']},allowedSchemes:['http','https','mailto'],
  transformTags:{a:sanitizeHtml.simpleTransform('a',{target:'_blank',rel:'noopener noreferrer'})},
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const ROLES = [
  ['Graphic Design','Графический дизайнер',['graphic designer','grafikdesigner','графический дизайнер','grafički dizajner']],
  ['Graphic Design','Бренд-дизайнер',['brand designer','brand identity designer','бренд-дизайнер','brend dizajner']],
  ['Graphic Design','Motion Designer',['motion designer','motion graphics designer','моушн дизайнер','motion dizajner']],
  ['Graphic Design','Web Designer',['web designer','webdesigner','веб-дизайнер','web dizajner']],
  ['Graphic Design','3D Designer',['3d designer','3d artist','3d-дизайнер','3d dizajner']],
  ['Graphic Design','Иллюстратор',['illustrator','illustration designer','иллюстратор','ilustrator']],
  ['Graphic Design','Art Director',['art director','art direktor','арт-директор','art direktor']],
  ['Graphic Design','Creative Director',['creative director','kreativdirektor','креативный директор','kreativni direktor']],
  ['UI/UX','UI/UX Designer',['ui ux designer','ux designer','ui designer','ui ux дизайнер','ui ux dizajner']],
  ['UI/UX','Product Designer',['product designer','produktdesigner','продуктовый дизайнер','produkt dizajner']],
  ['Engineering','Frontend Developer',['frontend developer','frontend engineer','frontend entwickler','frontend разработчик','frontend programer']],
  ['Engineering','Backend Developer',['backend developer','backend engineer','backend entwickler','backend разработчик','backend programer']],
  ['Engineering','Fullstack Developer',['fullstack developer','full stack engineer','fullstack entwickler','fullstack разработчик','fullstack programer']],
  ['Engineering','Software Engineer',['software engineer','software developer','softwareentwickler','software разработчик','softverski inženjer']],
  ['Engineering','iOS Developer',['ios developer','swift developer','ios entwickler','ios разработчик','ios programer']],
  ['Engineering','Android Developer',['android developer','kotlin developer','android entwickler','android разработчик','android programer']],
  ['Engineering','DevOps Engineer',['devops engineer','site reliability engineer','devops entwickler','devops инженер','devops inženjer']],
  ['Engineering','QA Engineer',['qa engineer','quality assurance engineer','software tester','qa инженер','qa inženjer']],
  ['Engineering','Cybersecurity Specialist',['cybersecurity specialist','security engineer','it security spezialist','специалист по информационной безопасности','cyber security specialist']],
  ['Data / AI','Data Analyst',['data analyst','datenanalyst','аналитик данных','analitičar podataka']],
  ['Data / AI','Data Engineer',['data engineer','dateningenieur','инженер данных','data inženjer']],
  ['Data / AI','Data Scientist',['data scientist','data science','специалист data science','data scientist']],
  ['Data / AI','AI Engineer',['ai engineer','machine learning engineer','ki entwickler','ai инженер','ai inženjer']],
  ['Product','Product Manager',['product manager','produktmanager','продакт менеджер','produkt menadžer']],
  ['Product','Project Manager',['project manager','projektmanager','проджект менеджер','projekt menadžer']],
  ['Product','Business Analyst',['business analyst','business-analyst','бизнес-аналитик','biznis analitičar']],
  ['Product','System Analyst',['system analyst','systemanalyst','системный аналитик','sistemski analitičar']],
  ['Marketing','Marketing Manager',['marketing manager','digital marketing manager','marketing manager','маркетолог','marketing menadžer']],
  ['Marketing','Performance Marketer',['performance marketer','performance marketing manager','performance marketing manager','performance маркетолог','performance marketing']],
  ['Marketing','SMM Manager',['social media manager','smm manager','social media manager','smm менеджер','social media menadžer']],
  ['Marketing','CRM Manager',['crm manager','crm specialist','crm manager','crm менеджер','crm menadžer']],
  ['Marketing','PR Manager',['pr manager','communications manager','pr manager','pr менеджер','pr menadžer']],
  ['Marketing','SEO Specialist',['seo specialist','seo manager','seo spezialist','seo специалист','seo stručnjak']],
  ['Content','Content Manager',['content manager','content specialist','content manager','контент менеджер','content menadžer']],
  ['Content','Copywriter',['copywriter','content writer','texter','копирайтер','copywriter']],
  ['Content','Content Creator',['content creator','ugc creator','content creator','контент креатор','content creator']],
  ['Creative / Production','Креативный продюсер',['creative producer','digital producer','kreativproduzent','креативный продюсер','kreativni producent']],
  ['HR','Recruiter',['it recruiter','recruiter','it recruiter','it рекрутер','it regruter']],
  ['HR','HR Manager',['hr manager','people manager','hr manager','hr менеджер','hr menadžer']],
  ['HR','Talent Acquisition Specialist',['talent acquisition specialist','talent acquisition manager','talent acquisition','talent acquisition специалист','talent acquisition']],
  ['GameDev','Game Designer',['game designer','level designer','game designer','геймдизайнер','game dizajner']],
  ['GameDev','Game Developer',['game developer','unity developer','spieleentwickler','разработчик игр','game developer']],
  ['GameDev','Unreal Developer',['unreal engine developer','unreal developer','unreal entwickler','unreal разработчик','unreal developer']],
  ['GameDev','iGaming Specialist',['igaming specialist','casino product manager','igaming','igaming специалист','igaming']],
];

const NON_DIGITAL_TITLE=/(?:кассир|продавец|официант|бариста|повар|пекарь|курьер|водитель|кладовщик|грузчик|уборщик|охранник|слесарь|сварщик|электрик|фармацевт|медсестр|врач|дизайнер\s+(?:одежды|интерьера|мебели|ландшафта|ювелир))/i;

function detectLanguage(text=''){
  const s=String(text);
  if(/[А-Яа-яЁё]/.test(s))return'ru';
  if(/[äöüß]/i.test(s)||/\b(?:stelle|bewerbung|kenntnisse|erfahrung)\b/i.test(s))return'de';
  if(/\b(?:posao|iskustvo|prijava|zaposlenje|tražimo|trazimo)\b/i.test(s))return'sr';
  return'en';
}
function salary(s){
  if(!s)return'';const f=n=>n==null?'':new Intl.NumberFormat('ru-RU').format(Number(n));
  const a=f(s.from),b=f(s.to),c=s.currency||'';return a&&b?`${a}–${b} ${c}`:a?`от ${a} ${c}`:b?`до ${b} ${c}`:'';
}
function experience(d){return({noExperience:'Без опыта',between1And3:'1–3 года',between3And6:'3–6 лет',moreThan6:'6+ лет'})[d?.experience?.id]||'';}
function mode(d){
  const s=[d?.schedule?.name,...(d?.work_format||[]).map(x=>x.name),d?.address?.city].filter(Boolean).join(' ').toLowerCase();
  if(/гибрид|hybrid|hibrid/.test(s))return'Hybrid';
  if(/удален|удалён|remote|homeoffice|udaljeno/.test(s))return'Remote';
  if(/офис|office|на месте|kancelar/.test(s))return'Office';
  return'';
}
function country(area='',text=''){
  const s=`${area} ${text}`;
  const rules=[['Russia',/росси|москв|санкт[- ]?петербург|екатеринбург|новосибирск|казань/i],['Serbia',/serbia|серби|beograd|belgrade|novi sad/i],['Germany',/germany|deutschland|berlin|hamburg|münchen|munich|frankfurt/i],['United Kingdom',/united kingdom|\buk\b|london|manchester/i],['United States',/united states|\busa\b|new york|california|san francisco|austin/i],['Canada',/canada|toronto|vancouver|montreal/i],['UAE',/uae|dubai|abu dhabi/i],['Turkey',/turkey|türkiye|istanbul/i],['Netherlands',/netherlands|amsterdam|rotterdam/i],['France',/france|paris/i],['Spain',/spain|madrid|barcelona/i],['Portugal',/portugal|lisbon|porto/i],['Poland',/poland|warsaw|krakow/i],['Czechia',/czech|prague|praha/i]];
  return(rules.find(([,re])=>re.test(s))||[])[0]||'';
}
function freshEnough(value){const d=new Date(value||0);return !Number.isNaN(d.getTime())&&Date.now()-d.getTime()<=90*86400000;}

async function ensureSchema(){
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_ru_html TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_language TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_tags TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS imported_query TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
    CREATE INDEX IF NOT EXISTS jobs_fresh_idx ON jobs(is_active,published_at DESC);
  `);
}

async function upsert(detail,role,query){
  const published=detail.published_at||detail.created_at;
  if(!published||!freshEnough(published))return 0;
  const title=clean(detail.name,240);
  if(!title||NON_DIGITAL_TITLE.test(title))return 0;
  const url=clean(detail.alternate_url||'',1000);if(!url)return 0;
  const company=clean(detail.employer?.name||'Компания',180);
  const desc=detail.description||[detail.snippet?.responsibility,detail.snippet?.requirement].filter(Boolean).join('\n');
  const summary=plain([detail.snippet?.responsibility,detail.snippet?.requirement].filter(Boolean).join(' · ')||desc,650);
  const lang=detectLanguage(`${title} ${desc}`);
  const location=clean(detail.area?.name||detail.address?.city||'',160);
  const tags=(detail.key_skills||[]).map(x=>clean(x.name,80)).filter(Boolean).slice(0,20);
  const fingerprint=crypto.createHash('sha1').update(`${title.toLowerCase()}|${company.toLowerCase()}|${location.toLowerCase()}`).digest('hex');
  await pool.query(`
    INSERT INTO jobs(external_id,source,source_url,title,company,summary,summary_ru,description_html,description_ru_html,source_language,
      experience,work_mode,salary,location,country,sector,employment_type,job_tags,imported_query,source_metadata,content_fingerprint,published_at,is_active,updated_at)
    VALUES($1,'hh.ru',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,TRUE,NOW())
    ON CONFLICT(source_url) DO UPDATE SET
      external_id=EXCLUDED.external_id,title=EXCLUDED.title,company=EXCLUDED.company,summary=EXCLUDED.summary,
      summary_ru=CASE WHEN EXCLUDED.source_language='ru' THEN EXCLUDED.summary ELSE COALESCE(jobs.summary_ru,EXCLUDED.summary_ru) END,
      description_html=EXCLUDED.description_html,description_ru_html=CASE WHEN EXCLUDED.source_language='ru' THEN EXCLUDED.description_html ELSE jobs.description_ru_html END,
      source_language=EXCLUDED.source_language,experience=EXCLUDED.experience,work_mode=EXCLUDED.work_mode,salary=EXCLUDED.salary,
      location=EXCLUDED.location,country=EXCLUDED.country,sector=EXCLUDED.sector,employment_type=EXCLUDED.employment_type,
      job_tags=EXCLUDED.job_tags,imported_query=EXCLUDED.imported_query,
      source_metadata=(COALESCE(jobs.source_metadata,'{}'::jsonb)-'quality_hidden'-'quality_reason')||EXCLUDED.source_metadata,
      content_fingerprint=EXCLUDED.content_fingerprint,published_at=EXCLUDED.published_at,is_active=TRUE,updated_at=NOW()
  `,[
    `hh:${detail.id}`,url,title,company,summary,lang==='ru'?summary:null,rich(desc),lang==='ru'?rich(desc):null,lang,
    experience(detail),mode(detail),salary(detail.salary),location,country(location,desc),role.sector,
    clean(detail.employment?.name||'',100),tags,clean(query,240),JSON.stringify({bulk_hh:true,quality_role:role.canonical,quality_sector:role.sector,hh_id:String(detail.id)}),fingerprint,new Date(published),
  ]);
  return 1;
}

function queries(){
  const seen=new Set(),out=[];
  for(const [sector,canonical,terms] of ROLES){
    for(const term of terms){const key=term.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({sector,canonical,term});}
  }
  return out;
}

async function searchHH(){
  const target=Math.max(1000,Math.min(2200,Number(process.env.HH_BULK_TARGET||1400)));
  const pages=Math.max(1,Math.min(4,Number(process.env.HH_BULK_PAGES||2)));
  const headers={accept:'application/json','user-agent':`WORKROOM/4.0 (${clean(process.env.ADMIN_EMAIL||'workroom',180)})`};
  const dateFrom=new Date(Date.now()-90*86400000).toISOString();
  const found=new Map();
  for(const entry of queries()){
    for(let page=0;page<pages;page++){
      try{
        const u=new URL('https://api.hh.ru/vacancies');
        u.searchParams.set('text',entry.term);
        u.searchParams.append('search_field','name');
        u.searchParams.set('date_from',dateFrom);
        u.searchParams.set('order_by','publication_time');
        u.searchParams.set('per_page','100');
        u.searchParams.set('page',String(page));
        const res=await fetch(u,{headers,signal:AbortSignal.timeout(18000)});
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const data=await res.json();
        for(const item of data.items||[]){
          if(!freshEnough(item.published_at)||NON_DIGITAL_TITLE.test(item.name||''))continue;
          if(!found.has(String(item.id)))found.set(String(item.id),{item,role:entry,query:entry.term});
        }
        if(page+1>=Number(data.pages||1))break;
      }catch(err){console.warn(`[hh-bulk] search ${entry.term} p${page}:`,err.message);break;}
      await sleep(55);
    }
    if(found.size>=target*1.35)break;
  }
  return {found,target,headers};
}

async function run(reason='scheduled'){
  const started=Date.now();
  try{
    await ensureSchema();
    const {found,target,headers}=await searchHH();
    const queue=[...found.values()].sort((a,b)=>new Date(b.item.published_at||0)-new Date(a.item.published_at||0)).slice(0,Math.max(target,1000));
    let imported=0,failed=0;
    const workers=Array.from({length:6},async()=>{
      while(queue.length){
        const entry=queue.shift();
        try{
          const res=await fetch(`https://api.hh.ru/vacancies/${encodeURIComponent(entry.item.id)}`,{headers,signal:AbortSignal.timeout(16000)});
          if(!res.ok)throw new Error(`HTTP ${res.status}`);
          const detail=await res.json();
          imported+=await upsert(detail,entry.role,entry.query);
        }catch(err){failed++; if(failed<20)console.warn(`[hh-bulk] ${entry.item.id}:`,err.message);}
        await sleep(80);
      }
    });
    await Promise.all(workers);
    await pool.query(`UPDATE jobs SET is_active=FALSE,updated_at=NOW() WHERE source='hh.ru' AND is_active=TRUE AND COALESCE(published_at,created_at)<NOW()-INTERVAL '90 days'`);
    const active=(await pool.query(`SELECT COUNT(*)::int AS c FROM jobs WHERE is_active=TRUE AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '90 days'`)).rows[0].c;
    console.log(`[hh-bulk] ${reason}: discovered=${found.size} imported=${imported} failed=${failed} active_fresh_total=${active} in ${Math.round((Date.now()-started)/1000)}s`);
  }catch(err){console.error('[hh-bulk] run failed:',err);}
}

function msUntilMoscowMidnight(){
  const now=new Date(),msk=new Date(now.getTime()+3*3600000);
  const target=Date.UTC(msk.getUTCFullYear(),msk.getUTCMonth(),msk.getUTCDate()+1,0,0,0)-3*3600000;
  return Math.max(1000,target-now.getTime());
}
function armDaily(){const t=setTimeout(async()=>{await run('00:00 MSK');armDaily();},msUntilMoscowMidnight());t.unref();}

setTimeout(()=>run('startup'),25_000).unref();
armDaily();
process.on('exit',()=>pool.end().catch(()=>{}));
