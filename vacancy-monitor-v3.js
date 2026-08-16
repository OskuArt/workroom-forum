// WORK//ROOM vacancy monitor v3
// Sources: hh.ru, Telegram partner channels, Instagram professional accounts/hashtags.
// Key rule: a Telegram digest is NEVER stored as one vacancy. Every outbound job link
// is opened and parsed as its own primary source before it can enter the catalogue.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');

if (!process.env.DATABASE_URL || String(process.env.VACANCY_MONITOR_ENABLED || 'true') !== 'true') return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
});

const clean = (value = '', max = 5000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const stripHtml = (value = '', max = 24000) => clean(sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} }), max);
const rich = (value = '') => sanitizeHtml(String(value || ''), {
  allowedTags: ['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
  allowedAttributes: { a: ['href','target','rel'] },
  allowedSchemes: ['http','https','mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target:'_blank', rel:'noopener noreferrer' }) },
});
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ROLE_MATRIX = [
  { sector:'Graphic Design', canonical:'Graphic Designer', en:['graphic designer'], de:['grafikdesigner','grafik designer'], ru:['графический дизайнер'], sr:['grafički dizajner','graficki dizajner'] },
  { sector:'UI/UX', canonical:'UI/UX Designer', en:['ui ux designer','ux designer','ui designer'], de:['ux designer','ui designer'], ru:['ui ux дизайнер','ux дизайнер','ui дизайнер'], sr:['ui ux dizajner','ux dizajner','ui dizajner'] },
  { sector:'UI/UX', canonical:'Product Designer', en:['product designer'], de:['produktdesigner','product designer'], ru:['продуктовый дизайнер','product designer'], sr:['produkt dizajner','product designer'] },
  { sector:'Graphic Design', canonical:'Motion Designer', en:['motion designer'], de:['motion designer'], ru:['моушн дизайнер','motion дизайнер'], sr:['motion dizajner'] },
  { sector:'Graphic Design', canonical:'Illustrator', en:['illustrator'], de:['illustrator'], ru:['иллюстратор'], sr:['ilustrator'] },
  { sector:'Engineering', canonical:'Frontend Developer', en:['frontend developer','front end developer'], de:['frontend entwickler','frontend developer'], ru:['frontend разработчик','фронтенд разработчик'], sr:['frontend developer','frontend programer'] },
  { sector:'Engineering', canonical:'Backend Developer', en:['backend developer','back end developer'], de:['backend entwickler','backend developer'], ru:['backend разработчик','бэкенд разработчик'], sr:['backend developer','backend programer'] },
  { sector:'Engineering', canonical:'Software Engineer', en:['software engineer','software developer','fullstack developer'], de:['softwareentwickler','software engineer'], ru:['разработчик программного обеспечения','software engineer','fullstack разработчик'], sr:['softverski inženjer','softverski inzenjer','software engineer'] },
  { sector:'Product', canonical:'Product Manager', en:['product manager'], de:['produktmanager','product manager'], ru:['продакт менеджер','product manager'], sr:['produkt menadžer','produkt menadzer','product manager'] },
  { sector:'Marketing', canonical:'Marketing Manager', en:['marketing manager','performance marketer','digital marketer'], de:['marketing manager','performance marketing manager'], ru:['маркетолог','performance маркетолог','менеджер по маркетингу'], sr:['marketing menadžer','marketing menadzer','digitalni marketing'] },
  { sector:'GameDev', canonical:'Game Developer', en:['game developer','game designer','gamedev'], de:['game developer','game designer'], ru:['game developer','геймдизайнер','разработчик игр'], sr:['game developer','game dizajner'] },
  { sector:'GameDev', canonical:'iGaming Specialist', en:['igaming','casino product','casino designer'], de:['igaming'], ru:['igaming','айгейминг'], sr:['igaming'] },
  { sector:'Data / AI', canonical:'Data Analyst', en:['data analyst'], de:['datenanalyst','data analyst'], ru:['аналитик данных','data analyst'], sr:['analitičar podataka','analiticar podataka','data analyst'] },
  { sector:'Data / AI', canonical:'AI Engineer', en:['ai engineer','machine learning engineer','llm engineer'], de:['ki entwickler','ai engineer','machine learning engineer'], ru:['ai инженер','инженер машинного обучения','ml инженер'], sr:['ai inženjer','ai inzenjer','machine learning engineer'] },
  { sector:'Digital', canonical:'Content Creator', en:['content creator','creative producer'], de:['content creator','creative producer'], ru:['контент креатор','креатор','креативный продюсер'], sr:['content creator','kreativni producent'] },
];

const VACANCY_MARKERS = {
  en:['vacancy','hiring','job opening','we are hiring','join our team'],
  de:['stelle','stellenangebot','wir suchen','karriere'],
  ru:['вакансия','ищем','требуется','работа'],
  sr:['posao','oglas za posao','konkurs','tražimo','trazimo'],
};
const APPLY_MARKERS = [/apply\b/i,/send (?:your )?(?:cv|resume)/i,/bewerb/i,/lebenslauf/i,/отклик/i,/резюме/i,/присылайте/i,/prijav/i,/pošaljite|posaljite/i,/cv\b/i];
const AD_MARKERS = [
  /\b(course|webinar|masterclass|workshop|bootcamp|mentoring|discount|sale|promo|giveaway|sponsored|buy now)\b/i,
  /курс|вебинар|мастер[- ]?класс|обучени|скидк|распродаж|реклам|розыгрыш|интенсив/i,
  /\b(kurs|webinar|rabatt|schulung|radionica|popust|akcija|promocija|obuka)\b/i,
];
const TOOL_TAGS = [
  ['Figma',/\bfigma\b/i],['AdobePhotoshop',/photoshop|adobe ps\b/i],['AdobeIllustrator',/illustrator|adobe ai\b/i],['AfterEffects',/after effects|\bae\b/i],
  ['InDesign',/indesign/i],['PremierePro',/premiere pro/i],['Blender',/\bblender\b/i],['Cinema4D',/cinema 4d|\bc4d\b/i],['Sketch',/\bsketch\b/i],['Rive',/\brive\b/i],
  ['Webflow',/webflow/i],['Tilda',/\btilda\b/i],['Framer',/\bframer\b/i],['HTML',/\bhtml5?\b/i],['CSS',/\bcss3?\b/i],['JavaScript',/javascript|\bjs\b/i],
  ['TypeScript',/typescript|\bts\b/i],['React',/\breact(?:\.js)?\b/i],['Vue',/\bvue(?:\.js)?\b/i],['Angular',/\bangular\b/i],['NodeJS',/node\.js|nodejs/i],
  ['Python',/\bpython\b/i],['Java',/\bjava\b/i],['Kotlin',/\bkotlin\b/i],['Swift',/\bswift\b/i],['CSharp',/c#|c sharp/i],['CPlusPlus',/c\+\+/i],
  ['Unity',/\bunity\b/i],['UnrealEngine',/unreal engine|\bue5?\b/i],['SQL',/\bsql\b/i],['PostgreSQL',/postgres|postgresql/i],['MySQL',/mysql/i],['AWS',/\baws\b|amazon web services/i],
  ['Docker',/\bdocker\b/i],['Kubernetes',/kubernetes|\bk8s\b/i],['Git',/\bgit\b|github|gitlab/i],['Jira',/\bjira\b/i],['Notion',/\bnotion\b/i],
  ['GA4',/google analytics|\bga4\b/i],['GoogleAds',/google ads/i],['MetaAds',/meta ads|facebook ads/i],['TikTokAds',/tiktok ads/i],
];
const SKILL_TAGS = [
  ['Branding',/branding|brand identity|айдентик|брендинг/i],['Typography',/typograph|типограф/i],['MotionDesign',/motion design|моушн/i],['UIUX',/ui\/ux|ux\/ui|user experience|user interface/i],
  ['Prototyping',/prototyp|прототип/i],['UserResearch',/user research|ux research|исследован/i],['ABTesting',/a\/b|ab test|сплит[- ]?тест/i],['DesignSystems',/design system|дизайн[- ]?систем/i],
  ['Illustration',/illustrat|иллюстрац/i],['3D',/\b3d\b|three[- ]dimensional/i],['VideoEditing',/video edit|монтаж/i],['Copywriting',/copywriting|копирайт/i],['SEO',/\bseo\b/i],
  ['PerformanceMarketing',/performance marketing/i],['Analytics',/analytics|аналитик/i],['CRM',/\bcrm\b/i],['MachineLearning',/machine learning|машинн.*обуч/i],['LLM',/\bllm\b|large language model/i],
  ['PromptEngineering',/prompt engineering|промпт/i],['Agile',/\bagile\b/i],['Scrum',/\bscrum\b/i],['TeamLead',/team lead|руковод.*команд|leadership/i],
];
const COUNTRY_RULES = [
  ['Russia',/\brussia\b|росси|москв|санкт[- ]?петербург|питер/i],['Serbia',/\bserbia\b|срби|серби|beograd|belgrade|novi sad|београд/i],['Germany',/\bgermany\b|deutschland|berlin|münchen|munich|hamburg|frankfurt|köln|cologne/i],
  ['Austria',/\baustria\b|österreich|vienna|wien/i],['Switzerland',/\bswitzerland\b|schweiz|zürich|zurich|geneva/i],['United Kingdom',/united kingdom|\buk\b|london|manchester|edinburgh/i],
  ['United States',/united states|\busa\b|new york|california|san francisco|los angeles|seattle|austin/i],['Canada',/\bcanada\b|toronto|vancouver|montreal/i],['Netherlands',/netherlands|nederland|amsterdam|rotterdam/i],
  ['France',/\bfrance\b|paris|lyon/i],['Spain',/\bspain\b|españa|madrid|barcelona/i],['Portugal',/\bportugal\b|lisbon|lisboa|porto/i],['Italy',/\bitaly\b|italia|milan|milano|rome|roma/i],
  ['Poland',/\bpoland\b|polska|warsaw|warszawa|krakow/i],['Czechia',/czech|česko|prague|praha/i],['Croatia',/croatia|hrvatska|zagreb/i],['Montenegro',/montenegro|crna gora|podgorica/i],
  ['Bosnia and Herzegovina',/bosnia|herzegovina|sarajevo/i],['Slovenia',/slovenia|ljubljana/i],['Turkey',/turkey|türkiye|istanbul/i],['UAE',/united arab emirates|\buae\b|dubai|abu dhabi/i],
  ['Israel',/\bisrael\b|tel aviv/i],['Australia',/\baustralia\b|sydney|melbourne|brisbane/i],
];

function aliases(role){ return [...role.en,...role.de,...role.ru,...role.sr]; }
function findRole(text=''){
  const s=String(text).toLowerCase();
  return ROLE_MATRIX.find(role=>aliases(role).some(alias=>s.includes(alias.toLowerCase()))) || null;
}
function hasVacancyMarker(text=''){
  const s=String(text).toLowerCase();
  return Object.values(VACANCY_MARKERS).flat().some(m=>s.includes(m.toLowerCase()));
}
function vacancyScore(text='',role=null){
  const s=String(text); let score=0;
  if(role||findRole(s)) score+=3;
  if(hasVacancyMarker(s)) score+=2;
  if(APPLY_MARKERS.some(re=>re.test(s))) score+=2;
  if(/salary|gehalt|зарплат|\bplata\b|€|\$|₽|RSD|RUB|EUR|USD/i.test(s)) score+=1;
  if(/remote|hybrid|office|homeoffice|удал|гибрид|офис|hibrid|kancelar/i.test(s)) score+=1;
  score-=AD_MARKERS.filter(re=>re.test(s)).length*3;
  return score;
}
function isVacancy(text='',role=null,trusted=false){
  if(trusted) return Boolean(role||findRole(text));
  return vacancyScore(text,role)>=5 && hasVacancyMarker(text);
}
function detectLanguage(text=''){
  const s=` ${String(text).toLowerCase()} `;
  if(/[А-Яа-яЁё]/.test(text)) return 'ru';
  if (/\b(stelle|stellenangebot|wir suchen|erfahrung|gehalt|bewerb|kenntnisse|homeoffice|arbeitsort)\b/.test(s)||/[äöüß]/.test(s)) return 'de';
  if (/\b(posao|tražimo|trazimo|iskustvo|plata|prijavi|radno mesto|zaposlenje)\b/.test(s)) return 'sr';
  return 'en';
}
function inferExperience(text=''){
  const s=String(text).toLowerCase();
  if(/no experience|entry[ -]?level|intern|internship|trainee|без опыта|стаж|praktik|praksa/.test(s)) return 'Без опыта';
  const m=s.match(/(\d{1,2})\s*(?:\+|[-–—]\s*(\d{1,2}))?\s*(?:years?|yrs?|лет|года|год|jahre?|godin)/i);
  if(m){ const a=Number(m[1]),b=Number(m[2]||a); if(a>=6||b>=7)return'6+ лет'; if(a>=3||b>3)return'3–6 лет'; if(a>=1||b>=1)return'1–3 года'; }
  if(/junior|jr\.?\b/.test(s))return'1–3 года'; if(/middle|mid[ -]?level/.test(s))return'3–6 лет'; if(/senior|sr\.?\b|principal|staff|lead|head|director|vp\b/.test(s))return'6+ лет';
  return '';
}
function inferWorkMode(text=''){
  const s=String(text).toLowerCase();
  if(/hybrid|гибрид|hibrid/.test(s))return'Hybrid';
  if(/remote|worldwide|anywhere|work from home|homeoffice|удал[её]н|udaljeno/.test(s))return'Remote';
  if(/office|on[- ]?site|onsite|офис|kancelar/.test(s))return'Office';
  return '';
}
function inferEmployment(text=''){
  const s=String(text).toLowerCase();
  if(/part[- ]?time|teilzeit|неполная занятость|скраћено|skraceno/.test(s))return'Part-time';
  if(/contract|freelance|freelancer|freiberuf|проектн|фриланс|ugovor/.test(s))return'Contract';
  if(/internship|praktikum|стажиров|praksa/.test(s))return'Internship';
  if(/full[- ]?time|vollzeit|полная занятость|пуно радно|puno radno/.test(s))return'Full-time';
  return '';
}
function inferCountry(text=''){
  for(const [country,re] of COUNTRY_RULES) if(re.test(String(text))) return country;
  return '';
}
function inferLocation(text=''){
  const raw=String(text);
  if(/remote|worldwide|anywhere|удал[её]н|udaljeno/i.test(raw))return'Remote';
  const patterns=[/(?:location|based in|city|office)\s*[:—-]\s*([^\n|•;]{2,80})/i,/(?:локация|город|офис)\s*[:—-]\s*([^\n|•;]{2,80})/i,/(?:standort|arbeitsort|ort)\s*[:—-]\s*([^\n|•;]{2,80})/i,/(?:lokacija|mesto rada|grad)\s*[:—-]\s*([^\n|•;]{2,80})/i];
  for(const re of patterns){const m=raw.match(re);if(m)return clean(m[1],160);} return '';
}
function inferSalary(text=''){
  const s=String(text);
  const label=s.match(/(?:salary|compensation|gehalt|vergütung|vergutung|зарплата|зп|оклад|plata|zarada)\s*[:—-]?\s*([^\n|•;]{2,90})/i);
  if(label&&/\d/.test(label[1]))return clean(label[1],120);
  const money=s.match(/((?:from|от|ab|od)?\s*[\d\s.,]{2,14}\s*(?:–|-|to|до|bis|do)\s*[\d\s.,]{2,14}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD|din(?:ara)?))/i)
    ||s.match(/((?:from|от|ab|od)\s*[\d\s.,]{2,14}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD|din(?:ara)?))/i)
    ||s.match(/([\d\s.,]{3,14}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD|din(?:ara)?)(?:\s*(?:gross|net|brutto|netto|гросс|нет|mesečno|mesecno|month|месяц))?)/i);
  return money?clean(money[1],120):'';
}
function extractTags(text='',extra=[]){
  const out=[]; const add=v=>{const tag=String(v||'').replace(/^#/,'').replace(/[^\p{L}\p{N}+.#-]+/gu,'');if(tag&&!out.some(x=>x.toLowerCase()===tag.toLowerCase()))out.push(tag);};
  (extra||[]).forEach(add); TOOL_TAGS.forEach(([t,re])=>{if(re.test(text))add(t)}); SKILL_TAGS.forEach(([t,re])=>{if(re.test(text))add(t)}); return out.slice(0,20);
}
function inferTitle(text='',role=null){
  const lines=String(text).split(/\n+/).map(v=>v.trim()).filter(Boolean);
  const roleLine=lines.find(line=>role&&aliases(role).some(a=>line.toLowerCase().includes(a.toLowerCase())))||lines.find(hasVacancyMarker);
  let title=clean(roleLine||role?.canonical||lines[0]||'Вакансия',240).replace(/^(?:vacancy|job opening|hiring|stelle|stellenangebot|вакансия|ищем|требуется|posao|konkurs|tražimo|trazimo)\s*[:—-]?\s*/i,'');
  if(title.length>150&&role)title=role.canonical; return title||role?.canonical||'Вакансия';
}
function extractCompany(text='',fallback=''){
  const raw=String(text); const patterns=[/(?:company|employer)\s*[:—-]\s*([^\n|•;]{2,100})/i,/(?:компания|работодатель)\s*[:—-]\s*([^\n|•;]{2,100})/i,/(?:unternehmen|firma)\s*[:—-]\s*([^\n|•;]{2,100})/i,/(?:kompanija|firma|poslodavac)\s*[:—-]\s*([^\n|•;]{2,100})/i];
  for(const re of patterns){const m=raw.match(re);if(m)return clean(m[1],180);} return clean(fallback||'Компания',180);
}
function validDate(value){ if(!value)return null; const d=new Date(value); return Number.isNaN(d.getTime())?null:d; }
function domainLabel(url){ try{return new URL(url).hostname.replace(/^www\./,'');}catch{return'Источник';} }
function canonicalUrl(raw){
  try{
    const u=new URL(raw); ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','yclid'].forEach(k=>u.searchParams.delete(k));
    if(u.hostname==='t.me'&&u.pathname==='/iv'&&u.searchParams.get('url'))return canonicalUrl(u.searchParams.get('url'));
    u.hash=''; return u.toString();
  }catch{return'';}
}

async function ensureSchema(){
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description_ru_html TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_language TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_tags TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS imported_query TEXT;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;
    CREATE INDEX IF NOT EXISTS jobs_country_idx ON jobs(country);
    CREATE INDEX IF NOT EXISTS jobs_source_idx ON jobs(source);
  `);
}

async function upsertRaw(raw){
  const text=stripHtml(`${raw.title||''}\n${raw.summary||''}\n${raw.description||''}`,24000);
  const role=raw.role||findRole(text);
  if(!isVacancy(text,role,raw.trusted===true))return 0;
  const title=clean(raw.title||inferTitle(text,role),240);
  const company=clean(raw.company||extractCompany(text,raw.companyFallback),180);
  const location=clean(raw.location||inferLocation(text),160);
  const country=clean(raw.country||inferCountry(`${location} ${text}`),100);
  const summary=clean(raw.summary||stripHtml(raw.description||'',650),650);
  const sourceLanguage=clean(raw.sourceLanguage||detectLanguage(text),12);
  const salary=clean(raw.salary||inferSalary(text),120);
  const workMode=clean(raw.workMode||inferWorkMode(text),40);
  const experience=clean(raw.experience||inferExperience(text),80);
  const employment=clean(raw.employmentType||inferEmployment(text),100);
  const tags=extractTags(text,raw.extraTags||[]);
  const sourceUrl=canonicalUrl(raw.url);
  if(!sourceUrl||!title||!company)return 0;
  const fingerprint=crypto.createHash('sha1').update(`${title.toLowerCase()}|${company.toLowerCase()}|${country.toLowerCase()}|${location.toLowerCase()}`).digest('hex');
  const publishedAt=validDate(raw.publishedAt);
  const summaryRu=sourceLanguage==='ru'?summary:null;
  const descriptionRu=sourceLanguage==='ru'?rich(raw.description||raw.summary||''):null;

  await pool.query(`
    INSERT INTO jobs(external_id,source,source_url,title,company,summary,summary_ru,description_html,description_ru_html,source_language,
      experience,work_mode,salary,location,country,sector,employment_type,job_tags,imported_query,source_metadata,content_fingerprint,published_at,is_active,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,TRUE,NOW())
    ON CONFLICT(source_url) DO UPDATE SET
      external_id=EXCLUDED.external_id,source=EXCLUDED.source,title=EXCLUDED.title,company=EXCLUDED.company,summary=EXCLUDED.summary,
      summary_ru=CASE WHEN EXCLUDED.source_language='ru' THEN EXCLUDED.summary ELSE COALESCE(jobs.summary_ru,EXCLUDED.summary_ru) END,
      description_html=EXCLUDED.description_html,description_ru_html=CASE WHEN EXCLUDED.source_language='ru' THEN EXCLUDED.description_html ELSE jobs.description_ru_html END,
      source_language=EXCLUDED.source_language,experience=EXCLUDED.experience,work_mode=EXCLUDED.work_mode,salary=EXCLUDED.salary,
      location=EXCLUDED.location,country=EXCLUDED.country,sector=EXCLUDED.sector,employment_type=EXCLUDED.employment_type,job_tags=EXCLUDED.job_tags,
      imported_query=EXCLUDED.imported_query,source_metadata=EXCLUDED.source_metadata,content_fingerprint=EXCLUDED.content_fingerprint,
      published_at=COALESCE(EXCLUDED.published_at,jobs.published_at),is_active=TRUE,updated_at=NOW()
  `,[
    clean(raw.id,180),clean(raw.source,120),sourceUrl,title,company,summary,summaryRu,rich(raw.description||raw.summary||''),descriptionRu,sourceLanguage,
    experience,workMode,salary,location,country,role?.sector||raw.sector||'Digital',employment,tags,clean(raw.query,240),JSON.stringify(raw.metadata||{}),fingerprint,publishedAt,
  ]);
  return 1;
}

async function translateText(text,max=5000){
  const input=clean(text,max); if(!input)return'';
  const chunks=[]; let rest=input;
  while(rest.length){ if(rest.length<=1700){chunks.push(rest);break;} let cut=rest.lastIndexOf('. ',1700);if(cut<800)cut=rest.lastIndexOf(' ',1700);if(cut<500)cut=1700;chunks.push(rest.slice(0,cut+1));rest=rest.slice(cut+1).trim(); }
  const out=[];
  for(const chunk of chunks.slice(0,4)){
    try{
      const u=new URL('https://translate.googleapis.com/translate_a/single');u.searchParams.set('client','gtx');u.searchParams.set('sl','auto');u.searchParams.set('tl','ru');u.searchParams.set('dt','t');u.searchParams.set('q',chunk);
      const res=await fetch(u,{headers:{'user-agent':'WORKROOM/3.0'},signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();out.push(Array.isArray(data?.[0])?data[0].map(p=>p?.[0]||'').join(''):chunk);
    }catch(err){console.warn('[translate] fallback:',err.message);out.push(chunk);} await sleep(45);
  }
  return clean(out.join('\n\n'),7000);
}
async function backfillTranslations(limit=70){
  const {rows}=await pool.query(`SELECT id,summary,description_html FROM jobs WHERE is_active=TRUE AND COALESCE(source_language,'')<>'ru' AND (summary_ru IS NULL OR description_ru_html IS NULL) ORDER BY COALESCE(published_at,created_at) DESC LIMIT $1`,[limit]);
  for(const row of rows){
    const summary=await translateText(row.summary||'',900);
    const desc=await translateText(stripHtml(row.description_html||'',6500),6500);
    await pool.query('UPDATE jobs SET summary_ru=COALESCE(NULLIF($1,\'\'),summary_ru),description_ru_html=COALESCE(NULLIF($2,\'\'),description_ru_html) WHERE id=$3',[summary,desc?desc.split(/\n{2,}/).map(p=>`<p>${escapeHtml(p)}</p>`).join(''):'',row.id]);
  }
  if(rows.length)console.log(`[vacancy-monitor] translated ${rows.length} vacancies`);
}

function roleQueries(){
  const markers={en:'vacancy',de:'stelle',ru:'вакансия',sr:'posao'}; const out=[];
  for(const role of ROLE_MATRIX)for(const lang of ['ru','en','de','sr']){const alias=role[lang]?.[0];if(alias)out.push({role,lang,query:`${alias} ${markers[lang]}`,fallback:alias});}
  return out;
}
function hhSalary(s){if(!s)return'';const f=n=>n?new Intl.NumberFormat('ru-RU').format(n):'';const a=f(s.from),b=f(s.to),c=s.currency||'';return a&&b?`${a}–${b} ${c}`:a?`от ${a} ${c}`:b?`до ${b} ${c}`:'';}
function hhExperience(d){return({noExperience:'Без опыта',between1And3:'1–3 года',between3And6:'3–6 лет',moreThan6:'6+ лет'})[d?.experience?.id]||'';}
async function importHH(){
  const headers={accept:'application/json','user-agent':`WORKROOM/3.0 (${clean(process.env.ADMIN_EMAIL||'workroom',180)})`,'hh-user-agent':`WORKROOM/3.0 (${clean(process.env.ADMIN_EMAIL||'workroom',180)})`};
  const queryLimit=Math.max(12,Math.min(80,Number(process.env.HH_QUERY_LIMIT||60))); const period=Math.max(1,Math.min(7,Number(process.env.HH_PERIOD_DAYS||3))); const found=new Map();
  const queries=roleQueries().slice(0,queryLimit);
  for(const entry of queries){
    for(const qText of [entry.query,entry.fallback]){
      try{
        const u=new URL('https://api.hh.ru/vacancies');u.searchParams.set('text',qText);u.searchParams.set('period',String(period));u.searchParams.set('order_by','publication_time');u.searchParams.set('per_page','25');
        const res=await fetch(u,{headers,signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();
        for(const item of data.items||[])if(!found.has(String(item.id)))found.set(String(item.id),{item,entry});
        if((data.items||[]).length)break;
      }catch(err){console.warn(`[hh] '${qText}' skipped:`,err.message);} await sleep(45);
    }
  }
  const queue=[...found.values()].slice(0,Math.max(80,Math.min(360,Number(process.env.HH_DETAIL_LIMIT||260)))); let imported=0;
  const workers=Array.from({length:5},async()=>{while(queue.length){const {item,entry}=queue.shift();try{
    const res=await fetch(`https://api.hh.ru/vacancies/${encodeURIComponent(item.id)}`,{headers,signal:AbortSignal.timeout(14000)});const d=res.ok?await res.json():item;
    const description=d.description||[item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join('\n');const role=findRole(`${d.name||item.name} ${description}`)||entry.role;
    imported+=await upsertRaw({id:`hh:${item.id}`,source:'hh.ru',url:d.alternate_url||item.alternate_url,title:d.name||item.name,company:d.employer?.name||item.employer?.name||'Компания',summary:[item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join(' · ')||stripHtml(description,650),description,role,trusted:true,query:entry.query,experience:hhExperience(d),workMode:inferWorkMode([d.schedule?.name,...(d.work_format||[]).map(x=>x.name)].join(' ')),salary:hhSalary(d.salary||item.salary),location:d.area?.name||item.area?.name||'',country:inferCountry(`${d.area?.name||''} ${description}`),employmentType:d.employment?.name||item.employment?.name||'',extraTags:(d.key_skills||[]).map(x=>x.name).filter(Boolean),publishedAt:d.published_at||item.published_at||null,metadata:{query_language:entry.lang,hh_id:item.id,primary_source:true}});
  }catch(err){console.warn(`[hh] vacancy ${item.id}:`,err.message);}}});
  await Promise.all(workers); console.log(`[vacancy-monitor] hh.ru found=${found.size} imported=${imported}`); return imported;
}

function telegramChannels(){return(process.env.TELEGRAM_JOB_CHANNELS||'mirkreatorovjob,designhunters,jun_hi_vacancies,serbia_vacancies,rabotavserbii,desivr_design').split(',').map(x=>x.trim().replace(/^https?:\/\/t\.me\//,'').replace(/^@/,'').replace(/^s\//,'')).filter(Boolean);}
function decodeEntities(s=''){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function externalLinksFromBlock(block=''){
  const links=[]; for(const m of block.matchAll(/href="([^"]+)"/gi)){let href=decodeEntities(m[1]);if(href.startsWith('//'))href=`https:${href}`;const u=canonicalUrl(href);if(!u)continue;try{const host=new URL(u).hostname.replace(/^www\./,'');if(host==='t.me'||host.endsWith('.t.me')||host==='telegram.me'||host==='telegram.org')continue;if(['instagram.com','facebook.com','x.com','twitter.com','youtube.com','youtu.be'].includes(host))continue;if(!links.includes(u))links.push(u);}catch{}}
  return links.slice(0,24);
}
function parseTelegramPosts(html='',channel=''){
  const markers=[...String(html).matchAll(/data-post="([^"]+)"/g)];const posts=[];
  for(let i=0;i<markers.length;i++){const start=markers[i].index||0,end=i+1<markers.length?(markers[i+1].index||html.length):html.length,block=html.slice(start,end),key=markers[i][1];const tm=block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);if(!tm)continue;
    const text=sanitizeHtml(tm[1].replace(/<br\s*\/?\s*>/gi,'\n'),{allowedTags:[],allowedAttributes:{}}).replace(/\n\s+/g,'\n').trim();const time=block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1]||null;const id=key.split('/').pop();posts.push({id:`tg:${key}`,url:`https://t.me/${channel}/${id}`,text,publishedAt:validDate(time),links:externalLinksFromBlock(block)});
  }return posts;
}
function findJsonLdJob(obj){
  if(!obj)return null;if(Array.isArray(obj)){for(const item of obj){const hit=findJsonLdJob(item);if(hit)return hit;}return null;}if(typeof obj!=='object')return null;
  const type=obj['@type'];if(type==='JobPosting'||(Array.isArray(type)&&type.includes('JobPosting')))return obj;
  for(const v of Object.values(obj)){const hit=findJsonLdJob(v);if(hit)return hit;}return null;
}
function firstMeta(html,names=[]){for(const name of names){const esc=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const patterns=[new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${esc}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${esc}["']`,'i')];for(const re of patterns){const m=html.match(re);if(m)return decodeEntities(m[1]);}}return'';}
function salaryFromLd(job){
  const b=job?.baseSalary;if(!b)return'';const currency=b.currency||job.salaryCurrency||'';const val=b.value||b;const unit=val.unitText?` / ${val.unitText}`:'';if(typeof val==='number'||typeof val==='string')return`${val} ${currency}${unit}`.trim();const min=val.minValue,max=val.maxValue,value=val.value;if(min&&max)return`${min}–${max} ${currency}${unit}`.trim();if(value)return`${value} ${currency}${unit}`.trim();return'';
}
function locationFromLd(job){
  const loc=Array.isArray(job?.jobLocation)?job.jobLocation[0]:job?.jobLocation;const a=loc?.address||{};return clean([a.addressLocality,a.addressRegion,a.addressCountry?.name||a.addressCountry].filter(Boolean).join(', '),160);
}
async function parsePrimarySource(url,discovery){
  try{
    const res=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; WORKROOM/3.0; vacancy indexer)'},signal:AbortSignal.timeout(18000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const finalUrl=canonicalUrl(res.url||url);const html=await res.text();if(html.length>3_000_000)throw new Error('page too large');
    let jobLd=null;for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const obj=JSON.parse(m[1]);jobLd=findJsonLdJob(obj);if(jobLd)break;}catch{}}
    const title=clean(jobLd?.title||firstMeta(html,['og:title','twitter:title'])||stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'',240),240);
    const company=clean(jobLd?.hiringOrganization?.name||firstMeta(html,['author','og:site_name'])||domainLabel(finalUrl),180);
    const description=jobLd?.description||firstMeta(html,['og:description','description'])||'';const bodyText=stripHtml(description||html,18000);const role=findRole(`${title} ${bodyText}`);
    if(!jobLd&&!isVacancy(`${title}\n${bodyText}`,role,false))return null;
    const published=validDate(jobLd?.datePosted||firstMeta(html,['article:published_time','datePublished','date','datePosted'])||html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1]);
    const location=locationFromLd(jobLd)||inferLocation(bodyText);const country=inferCountry(`${location} ${bodyText}`);
    return {id:`primary:${crypto.createHash('sha1').update(finalUrl).digest('hex')}`,source:domainLabel(finalUrl),url:finalUrl,title:title||role?.canonical||'Вакансия',company,summary:stripHtml(description||bodyText,650),description:description||bodyText,role,trusted:Boolean(jobLd),salary:salaryFromLd(jobLd)||inferSalary(bodyText),location,country,workMode:inferWorkMode(`${jobLd?.jobLocationType||''} ${bodyText}`),experience:inferExperience(bodyText),employmentType:clean(jobLd?.employmentType||inferEmployment(bodyText),100),extraTags:[...(Array.isArray(jobLd?.skills)?jobLd.skills:[]),...(Array.isArray(jobLd?.qualifications)?jobLd.qualifications:[])],publishedAt:published,query:discovery.query||'',metadata:{primary_source:true,discovered_via:'telegram',telegram_channel:discovery.channel,telegram_post:discovery.telegramPost,telegram_posted_at:discovery.telegramPostedAt||null}};
  }catch(err){console.warn(`[telegram→source] ${url}:`,err.message);return null;}
}
function looksDigest(post){return post.links.length>1||/(?:^|\n)\s*\d+[.)]\s+/m.test(post.text)||(findRole(post.text)&&((post.text.match(/(?:графическ|designer|developer|engineer|маркетолог|product manager|ux|ui)/gi)||[]).length>=4));}
async function importTelegram(){
  let imported=0;
  for(const channel of telegramChannels()){
    try{
      const res=await fetch(`https://t.me/s/${encodeURIComponent(channel)}`,{headers:{'user-agent':'Mozilla/5.0 WORKROOM/3.0'},signal:AbortSignal.timeout(18000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const posts=parseTelegramPosts(await res.text(),channel).slice(-40);
      for(const post of posts){
        const digest=looksDigest(post);
        if(post.links.length){
          let followed=0;
          for(const link of post.links){const parsed=await parsePrimarySource(link,{channel,telegramPost:post.url,telegramPostedAt:post.publishedAt?.toISOString()||null,query:'telegram outbound vacancy'});if(!parsed)continue;followed++;imported+=await upsertRaw(parsed);await sleep(70);}
          if(followed||digest)continue;
        }
        const role=findRole(post.text);if(!isVacancy(post.text,role,false))continue;
        imported+=await upsertRaw({...post,source:`Telegram · @${channel}`,title:inferTitle(post.text,role),role,company:extractCompany(post.text,`@${channel}`),summary:post.text.slice(0,650),description:post.text,query:role?`${role.canonical} vacancy`:'vacancy',metadata:{primary_source:true,discovered_via:'telegram',telegram_channel:channel}});
      }
      await sleep(100);
    }catch(err){console.warn(`[telegram] @${channel}:`,err.message);}
  }
  console.log(`[vacancy-monitor] Telegram/primary sources imported=${imported}`);return imported;
}

function instagramConfig(){return{token:clean(process.env.INSTAGRAM_ACCESS_TOKEN||'',2400),igUserId:clean(process.env.INSTAGRAM_IG_USER_ID||'',160),accounts:(process.env.INSTAGRAM_JOB_ACCOUNTS||'vacancy_design,simple_studio,beginit.indrive.ca').split(',').map(x=>x.trim().replace(/^@/,'')).filter(Boolean),budget:Math.max(1,Math.min(8,Number(process.env.INSTAGRAM_HASHTAG_BUDGET||4)))};}
async function graphGet(path,params,token){const u=new URL(`https://graph.facebook.com/${String(path).replace(/^\//,'')}`);Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,String(v)));u.searchParams.set('access_token',token);const res=await fetch(u,{signal:AbortSignal.timeout(18000)});if(!res.ok)throw new Error(`HTTP ${res.status}: ${clean(await res.text(),260)}`);return res.json();}
function instagramQueries(limit){const markers={en:'vacancy',de:'stelle',ru:'вакансия',sr:'posao'},all=[];for(const role of ROLE_MATRIX)for(const lang of['en','de','ru','sr']){const alias=role[lang]?.[0];if(!alias)continue;const hashtag=`${alias}${markers[lang]}`.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}_]+/gu,'');all.push({hashtag,role,lang,query:`${alias} ${markers[lang]}`});}const day=Math.floor(Date.now()/86400000),start=(day*limit)%all.length;return[...all.slice(start),...all.slice(0,start)].slice(0,limit);}
async function importInstagram(){
  const cfg=instagramConfig();if(!cfg.token||!cfg.igUserId){console.log('[vacancy-monitor] Instagram paused: INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_IG_USER_ID are required');return 0;}let imported=0,seen=new Set();
  for(const username of cfg.accounts){try{const fields=`business_discovery.username(${username}){username,media.limit(50){id,caption,permalink,timestamp}}`;const data=await graphGet(cfg.igUserId,{fields},cfg.token),account=data.business_discovery;for(const media of account?.media?.data||[]){const text=media.caption||'',role=findRole(text);if(!media.permalink||!isVacancy(text,role,false))continue;seen.add(String(media.id));imported+=await upsertRaw({id:`ig:${media.id}`,source:`Instagram · @${account.username||username}`,url:media.permalink,title:inferTitle(text,role),role,company:extractCompany(text,`@${account.username||username}`),summary:text.slice(0,650),description:text,query:role?`${role.canonical} vacancy`:'vacancy',publishedAt:media.timestamp||null,metadata:{primary_source:true,account:account.username||username}});}}catch(err){console.warn(`[instagram] @${username}:`,err.message);}}
  for(const entry of instagramQueries(cfg.budget)){try{const found=await graphGet('ig_hashtag_search',{user_id:cfg.igUserId,q:entry.hashtag},cfg.token),hid=found.data?.[0]?.id;if(!hid)continue;const media=await graphGet(`${hid}/recent_media`,{user_id:cfg.igUserId,fields:'id,caption,permalink,timestamp',limit:'40'},cfg.token);for(const post of media.data||[]){if(!post.id||seen.has(String(post.id)))continue;seen.add(String(post.id));const text=post.caption||'',role=findRole(text)||entry.role;if(!post.permalink||!isVacancy(text,role,false))continue;const published=validDate(post.timestamp);if(published&&Date.now()-published.getTime()>10*86400000)continue;imported+=await upsertRaw({id:`ig:${post.id}`,source:'Instagram',url:post.permalink,title:inferTitle(text,role),role,company:extractCompany(text,`Instagram · #${entry.hashtag}`),summary:text.slice(0,650),description:text,query:entry.query,publishedAt:published,metadata:{primary_source:true,hashtag:entry.hashtag,query_language:entry.lang}});}await sleep(100);}catch(err){console.warn(`[instagram] #${entry.hashtag}:`,err.message);}}
  console.log(`[vacancy-monitor] Instagram imported=${imported}`);return imported;
}

async function archiveStale(){const days=Math.max(3,Math.min(60,Number(process.env.VACANCY_MAX_AGE_DAYS||21)));const {rowCount}=await pool.query(`UPDATE jobs SET is_active=FALSE,updated_at=NOW() WHERE is_active=TRUE AND source NOT IN ('Manual','Direct') AND COALESCE(published_at,created_at)<NOW()-($1::text||' days')::interval`,[String(days)]);if(rowCount)console.log(`[vacancy-monitor] archived=${rowCount}`);}
async function sourceStats(){const {rows}=await pool.query(`SELECT CASE WHEN source='hh.ru' THEN 'hh.ru' WHEN source LIKE 'Instagram%' THEN 'Instagram' WHEN source LIKE 'Telegram · %' OR source_metadata->>'discovered_via'='telegram' THEN 'Telegram/discovered' ELSE source END AS source_group,COUNT(*)::int AS c FROM jobs WHERE is_active=TRUE GROUP BY 1 ORDER BY c DESC LIMIT 20`);console.log('[vacancy-monitor] active sources:',rows);}
function msUntilMoscowMidnight(){const now=new Date(),msk=new Date(now.getTime()+3*3600000);let target=Date.UTC(msk.getUTCFullYear(),msk.getUTCMonth(),msk.getUTCDate()+1,0,0,0)-3*3600000;return Math.max(1000,target-now.getTime());}
let running=false;
async function run(reason='scheduled'){
  if(running)return;running=true;const started=Date.now();
  try{await ensureSchema();console.log(`[vacancy-monitor] v3 start ${reason}`);const results=await Promise.allSettled([importHH(),importTelegram(),importInstagram()]);await archiveStale();await sourceStats();const counts=results.map(r=>r.status==='fulfilled'?Number(r.value||0):0);console.log(`[vacancy-monitor] v3 ingestion done ${Math.round((Date.now()-started)/1000)}s hh=${counts[0]} tg/primary=${counts[1]} ig=${counts[2]}`);setTimeout(()=>backfillTranslations(80).catch(err=>console.warn('[translate]',err.message)),3000).unref();}catch(err){console.error('[vacancy-monitor] v3 failed:',err);}finally{running=false;}
}
function scheduleDaily(){const arm=()=>{const t=setTimeout(async()=>{await run('00:00 MSK');arm();},msUntilMoscowMidnight());t.unref();};arm();}
setTimeout(()=>run('startup'),12000).unref();scheduleDaily();setInterval(()=>backfillTranslations(35).catch(()=>{}),60*60*1000).unref();
process.on('exit',()=>pool.end().catch(()=>{}));
