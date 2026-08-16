// WORK//ROOM vacancy quality gate v2
// Strictly digital-only: fixes noisy titles, removes recruiter promos / digests / non-digital
// jobs and enforces a 90-day freshness ceiling. Runs repeatedly because external feeds can
// update while the Node process is alive.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

if (!process.env.DATABASE_URL) return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max: 3,
});

const clean=(v='',max=5000)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
const plain=(v='',max=18000)=>clean(sanitizeHtml(String(v||''),{allowedTags:[],allowedAttributes:{}}),max);
const lowerFirst=s=>s ? s.charAt(0).toLocaleLowerCase('ru-RU')+s.slice(1) : s;

const ROLES = [
  ['Graphic Design','Графический дизайнер',/(?:графическ(?:ий|ая)\s+дизайнер|graphic designer|grafikdesigner|grafički dizajner|graficki dizajner)/i],
  ['Graphic Design','Бренд-дизайнер',/(?:бренд[- ]?дизайнер|brand designer|visual identity designer|brend dizajner)/i],
  ['Graphic Design','Motion Designer',/(?:motion designer|motion graphics designer|моушн[- ]?дизайнер|motion dizajner)/i],
  ['Graphic Design','Web Designer',/(?:web designer|веб[- ]?дизайнер|webdesigner|web dizajner)/i],
  ['Graphic Design','3D Designer',/(?:3d designer|3d artist|3d[- ]?дизайнер|3d dizajner)/i],
  ['Graphic Design','Иллюстратор',/(?:иллюстратор|illustrator|ilustrator)/i],
  ['Graphic Design','Art Director',/(?:art director|арт[- ]?директор|art direktor)/i],
  ['Graphic Design','Creative Director',/(?:creative director|креативн(?:ый|ая)\s+директор|kreativni direktor)/i],
  ['UI/UX','Product Designer',/(?:product designer|продуктов(?:ый|ая)\s+дизайнер|produkt dizajner|produktdesigner)/i],
  ['UI/UX','UI/UX Designer',/(?:ui\s*[/&+\-]?\s*ux\s+(?:designer|дизайнер)|ux\s*[/&+\-]?\s*ui\s+(?:designer|дизайнер)|ux designer|ui designer|ux dizajner|ui dizajner)/i],
  ['Engineering','Frontend Developer',/(?:front[- ]?end\s+(?:developer|engineer)|frontend\s+(?:developer|engineer|разработчик)|фронтенд[- ]?разработчик|frontend programer)/i],
  ['Engineering','Backend Developer',/(?:back[- ]?end\s+(?:developer|engineer)|backend\s+(?:developer|engineer|разработчик)|б[эе]кенд[- ]?разработчик|backend programer)/i],
  ['Engineering','Fullstack Developer',/(?:full[- ]?stack\s+(?:developer|engineer)|fullstack\s+(?:developer|engineer|разработчик)|фуллст[эе]к[- ]?разработчик)/i],
  ['Engineering','Software Engineer',/(?:software\s+(?:engineer|developer)|softwareentwickler|разработчик\s+программного\s+обеспечения|softverski inženjer|softverski inzenjer)/i],
  ['Engineering','iOS Developer',/(?:ios\s+(?:developer|engineer|разработчик)|swift developer)/i],
  ['Engineering','Android Developer',/(?:android\s+(?:developer|engineer|разработчик)|kotlin developer)/i],
  ['Engineering','DevOps Engineer',/(?:devops\s+(?:engineer|инженер)|site reliability engineer|\bsre\b)/i],
  ['Engineering','QA Engineer',/(?:qa\s+(?:engineer|инженер)|quality assurance engineer|software tester|тестировщик)/i],
  ['Engineering','Cybersecurity Specialist',/(?:cybersecurity|cyber security|information security|информационн(?:ая|ой)\s+безопасност|security engineer)/i],
  ['Data / AI','AI Engineer',/(?:ai\s+engineer|ml\s+engineer|machine learning engineer|llm\s+engineer|ai[- ]?инженер|ml[- ]?инженер|инженер\s+машинного\s+обучения)/i],
  ['Data / AI','Data Analyst',/(?:data analyst|аналитик\s+данных|datenanalyst|analitičar podataka|analiticar podataka)/i],
  ['Data / AI','Data Engineer',/(?:data engineer|инженер\s+данных|dateningenieur)/i],
  ['Data / AI','Data Scientist',/(?:data scientist|специалист\s+data science)/i],
  ['Product','Product Manager',/(?:product manager|продакт[- ]?менеджер|продуктов(?:ый|ая)\s+менеджер|produktmanager|produkt menadžer|produkt menadzer)/i],
  ['Product','Project Manager',/(?:project manager|проджект[- ]?менеджер|менеджер\s+проектов|projektmanager|projekt menadžer|projekt menadzer)/i],
  ['Product','Business Analyst',/(?:business analyst|бизнес[- ]?аналитик|biznis analitičar|biznis analiticar)/i],
  ['Product','System Analyst',/(?:system analyst|системн(?:ый|ая)\s+аналитик|systemanalyst|sistemski analitičar|sistemski analiticar)/i],
  ['Marketing','Marketing Manager',/(?:marketing manager|digital marketer|digital marketing manager|маркетолог|менеджер\s+по\s+маркетингу|marketing menadžer|marketing menadzer)/i],
  ['Marketing','Performance Marketer',/(?:performance\s+(?:marketer|marketing manager)|performance[- ]?маркетолог)/i],
  ['Marketing','SMM Manager',/(?:smm[- ]?менеджер|social media manager|social media specialist|смм[- ]?менеджер)/i],
  ['Marketing','PR Manager',/(?:pr[- ]?менеджер|pr manager|communications manager|менеджер\s+по\s+коммуникациям)/i],
  ['Marketing','CRM Manager',/(?:crm[- ]?менеджер|crm manager|crm specialist)/i],
  ['Marketing','SEO Specialist',/(?:seo\s+(?:specialist|manager|специалист)|seo[- ]?специалист)/i],
  ['Content','Copywriter',/(?:копирайтер|copywriter|content writer|texter)/i],
  ['Content','Content Manager',/(?:контент[- ]?менеджер|content manager|content specialist)/i],
  ['Content','Content Creator',/(?:контент[- ]?креатор|content creator|ugc creator)/i],
  ['Creative / Production','Креативный продюсер',/(?:креативн(?:ый|ая)\s+продюсер|creative producer|digital producer)/i],
  ['Creative / Production','Исполнительный продюсер',/(?:исполнительн(?:ый|ая)\s+продюсер|executive producer)/i],
  ['HR','HR Manager',/(?:hr[- ]?менеджер|hr manager|human resources manager|people manager)/i],
  ['HR','Recruiter',/(?:it[- ]?рекрутер|рекрутер|recruiter|talent recruiter)/i],
  ['HR','Talent Acquisition Specialist',/(?:talent acquisition(?: specialist| manager)?)/i],
  ['HR','HR Business Partner',/(?:hrbp|hr business partner)/i],
  ['GameDev','Game Designer',/(?:game designer|геймдизайнер|level designer|game dizajner)/i],
  ['GameDev','Game Developer',/(?:game developer|разработчик\s+игр|spieleentwickler)/i],
  ['GameDev','Unity Developer',/(?:unity\s+(?:developer|engineer|разработчик))/i],
  ['GameDev','Unreal Developer',/(?:unreal(?: engine)?\s+(?:developer|engineer|разработчик))/i],
  ['GameDev','iGaming Specialist',/(?:igaming\s+(?:specialist|manager|designer|producer)|\bigaming\b|айгейминг)/i],
];

const GENERIC_DESIGNER=/(?:^|[^\p{L}])(?:дизайнер|designer)(?:[^\p{L}]|$)/iu;
const DIGITAL_DESIGN_SIGNAL=/(?:figma|photoshop|illustrator|after effects|adobe|branding|brand identity|ui\b|ux\b|web|digital|визуал|графич|айдентик|баннер|лендинг|social media|smm|маркетплейс|креатив|типограф|motion)/i;
const NON_DIGITAL_DESIGN=/(?:дизайнер\s+(?:одежды|интерьера|мебели|ландшафта|ювелир|текстиля|штор)|fashion designer|interior designer|industrial designer|landscape designer)/i;
const NON_DIGITAL_TITLE=/(?:кассир|продавец|официант|бариста|повар|пекарь|курьер|водитель|кладовщик|комплектовщик|разнорабоч|грузчик|уборщик|охранник|слесарь|электрик|сварщик|оператор\s+станка|мастер\s+маникюра|врач|медсестр|фармацевт|автомеханик|строитель)/i;

const PROMO_PATTERNS=[
  /(?:хотите|хочешь|хотите ли).*?(?:опубликовать|разместить).*?ваканси/i,
  /(?:опубликовать|разместить|добавить)\s+(?:свою\s+)?ваканси/i,
  /(?:размещаем|разместим|публикуем)\s+ваканси/i,
  /для\s+размещения\s+ваканси/i,
  /входите\s+как\s+рекрутер/i,
  /(?:заполните|заполнить)\s+(?:эту\s+)?анкету/i,
  /чем\s+подробнее\s+и\s+точнее\s+будет\s+информация/i,
  /(?:найдете|найдёте)\s+нужного\s+специалиста/i,
  /ежедневн(?:ая|ые)\s+подборк[аи]\s+(?:актуальных\s+)?ваканси/i,
  /(?:просматриваем|мониторим).*?\d{2,}\+?\s+(?:источников|вакансий)/i,
  /канал\s+(?:с|про)\s+ваканси/i,
  /(?:ищете|ищешь)\s+(?:сотрудника|специалиста|кандидата)/i,
  /(?:для|сервис)\s+работодател/i,
  /(?:реклама|рекламный пост|партн[её]рский материал|sponsored)/i,
  /референсы\s*$/im,
];

function roleMatch(text=''){
  const s=String(text);
  for(const [sector,canonical,re] of ROLES){const m=s.match(re);if(m)return{sector,canonical,index:m.index||0,matched:m[0]};}
  if(GENERIC_DESIGNER.test(s)&&DIGITAL_DESIGN_SIGNAL.test(s)&&!NON_DIGITAL_DESIGN.test(s))return{sector:'Graphic Design',canonical:'Дизайнер',index:Math.max(0,s.search(GENERIC_DESIGNER)),matched:'Дизайнер'};
  return null;
}
function isPromo(text=''){return PROMO_PATTERNS.some(re=>re.test(String(text)));}
function qualifier(text=''){
  const head=String(text).slice(0,500);
  if(/\b(?:lead|team lead|teamlead)\b|тимлид|ведущ(?:ий|ая)/i.test(head))return'Lead';
  if(/\bsenior\b|старш(?:ий|ая)/i.test(head))return'Senior';
  if(/\bmiddle\b|мидл/i.test(head))return'Middle';
  if(/\bjunior\b|младш(?:ий|ая)/i.test(head))return'Junior';
  return'';
}
function cleanRoleTitle(role,text=''){
  if(!role)return'';
  const q=qualifier(text);
  const base=role.canonical.charAt(0).toLocaleUpperCase('ru-RU')+role.canonical.slice(1);
  if(!q)return base;
  if(/[А-Яа-яЁё]/.test(base)){
    const ru={Lead:'Ведущий',Senior:'Senior',Middle:'Middle',Junior:'Junior'}[q]||q;
    return `${ru} ${lowerFirst(base)}`;
  }
  return `${q} ${base}`;
}
function smartCompany(text='',current=''){
  const raw=String(text||'').replace(/\r/g,'');
  const patterns=[
    /(?:компания|работодатель|company|employer|firma|kompanija)\s*[:—–-]\s*([^\n|•;]{2,80})/i,
    /(?:в\s+(?:компанию|команде|команде компании|проект)|для\s+компании|at)\s+([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9&.'’+\- ]{1,60})(?=\s+(?:офис|remote|удал|гибрид|ищем|нужен|требуется|в\s+[А-ЯA-Z])|[,.!\n]|$)/u,
    /(?:дизайнер|маркетолог|менеджер|developer|engineer|designer|producer|рекрутер|аналитик)[^\n]{0,35}\s+в\s+([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9&.'’+\-]{1,50})(?=\s|[,.!\n]|$)/u,
  ];
  for(const re of patterns){const m=raw.match(re);if(m){const candidate=clean(m[1],80);if(!/^(?:москв|санкт|росси|серби|remote|офис)/i.test(candidate))return candidate;}}
  const c=clean(current,80);
  if(c&&!/^@/.test(c)&&!/^(?:telegram|google docs|docs\.google\.com|instagram)$/i.test(c))return c;
  return'Компания не указана';
}

async function qualityPass(){
  try{
    // Hard freshness rule first. It also catches old rows that otherwise would not enter the batch below.
    await pool.query(`UPDATE jobs SET is_active=FALSE,updated_at=NOW(),source_metadata=COALESCE(source_metadata,'{}'::jsonb)||'{"quality_hidden":true,"quality_reason":"older_than_90_days"}'::jsonb WHERE is_active=TRUE AND COALESCE(published_at,created_at)<NOW()-INTERVAL '90 days'`);

    const {rows}=await pool.query(`
      SELECT id,title,company,summary,summary_ru,description_html,description_ru_html,sector,source,source_metadata,is_active,published_at,created_at
      FROM jobs
      WHERE source NOT IN ('Manual','Direct')
        AND (is_active=TRUE OR updated_at>NOW()-INTERVAL '7 days')
      ORDER BY COALESCE(published_at,created_at) DESC
      LIMIT 5000
    `);
    let hidden=0,repaired=0;
    for(const row of rows){
      const description=plain(row.description_ru_html||row.description_html||'',14000);
      const text=[row.title,row.summary,row.summary_ru,description].filter(Boolean).join('\n');
      const promo=isPromo(text);
      const titleNonDigital=NON_DIGITAL_TITLE.test(row.title||'')||NON_DIGITAL_DESIGN.test(row.title||'');
      const role=roleMatch(text);
      if(promo||titleNonDigital||!role){
        if(row.is_active){
          const reason=promo?'promo_or_recruiter_ad':titleNonDigital?'non_digital':'no_digital_role';
          await pool.query(`UPDATE jobs SET is_active=FALSE,updated_at=NOW(),source_metadata=COALESCE(source_metadata,'{}'::jsonb)||$2::jsonb WHERE id=$1`,[row.id,JSON.stringify({quality_hidden:true,quality_reason:reason})]);
          hidden++;
        }
        continue;
      }

      const nextTitle=cleanRoleTitle(role,`${row.title}\n${row.summary||''}\n${description.slice(0,800)}`);
      const nextCompany=smartCompany(`${row.title}\n${row.summary||''}\n${description.slice(0,1600)}`,row.company);
      const metadata={quality_checked:true,quality_hidden:false,quality_reason:null,quality_role:role.canonical,quality_sector:role.sector};
      if(nextTitle!==row.title||nextCompany!==row.company||row.sector!==role.sector)repaired++;
      await pool.query(`UPDATE jobs SET title=$2,company=$3,sector=$4,source_metadata=(COALESCE(source_metadata,'{}'::jsonb)-'quality_hidden'-'quality_reason')||$5::jsonb,updated_at=NOW() WHERE id=$1`,[
        row.id,nextTitle,nextCompany,role.sector,JSON.stringify(metadata)
      ]);
    }
    const stats=(await pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE COALESCE(published_at,created_at)>=NOW()-INTERVAL '7 days')::int AS week FROM jobs WHERE is_active=TRUE AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '90 days'`)).rows[0];
    console.log(`[vacancy-quality] checked=${rows.length} repaired=${repaired} hidden=${hidden} active90=${stats.total} fresh7=${stats.week}`);
  }catch(err){console.warn('[vacancy-quality] pass failed:',err.message);}
}

setTimeout(qualityPass,8_000).unref();
setTimeout(qualityPass,70_000).unref();
setInterval(qualityPass,2*60_000).unref();
process.on('exit',()=>pool.end().catch(()=>{}));
