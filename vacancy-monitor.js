// WORK//ROOM unified vacancy monitor
// Sources for this phase: hh.ru, Instagram, Telegram.
// Searches role + vacancy/job markers in EN / DE / RU / SR, filters promo/noise,
// normalizes fields for the site, auto-translates descriptions to Russian and
// extracts role-specific skill/program hashtags.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');

if (!process.env.DATABASE_URL || String(process.env.VACANCY_MONITOR_ENABLED || 'true') !== 'true') return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 4,
});

const clean = (value = '', max = 5000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const htmlToText = (value = '', max = 20000) => clean(sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} }), max);
const safeRich = (value = '') => sanitizeHtml(String(value || ''), {
  allowedTags: ['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
  allowedAttributes: { a: ['href','target','rel'] },
  allowedSchemes: ['http','https','mailto'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target:'_blank', rel:'noopener noreferrer' }) },
});
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ROLE_MATRIX = [
  { key:'graphic-designer', sector:'Graphic Design', canonical:'Graphic Designer', en:['graphic designer'], de:['grafikdesigner','grafik designer'], ru:['графический дизайнер'], sr:['grafički dizajner','graficki dizajner'] },
  { key:'ui-ux-designer', sector:'UI/UX', canonical:'UI/UX Designer', en:['ui ux designer','ux designer','ui designer'], de:['ux designer','ui designer'], ru:['ui ux дизайнер','ux дизайнер','ui дизайнер'], sr:['ui ux dizajner','ux dizajner','ui dizajner'] },
  { key:'product-designer', sector:'UI/UX', canonical:'Product Designer', en:['product designer'], de:['produktdesigner','product designer'], ru:['продуктовый дизайнер','product designer'], sr:['produkt dizajner','product designer'] },
  { key:'motion-designer', sector:'Graphic Design', canonical:'Motion Designer', en:['motion designer'], de:['motion designer'], ru:['моушн дизайнер','motion дизайнер'], sr:['motion dizajner'] },
  { key:'illustrator', sector:'Graphic Design', canonical:'Illustrator', en:['illustrator'], de:['illustrator'], ru:['иллюстратор'], sr:['ilustrator'] },
  { key:'frontend', sector:'Engineering', canonical:'Frontend Developer', en:['frontend developer','front end developer'], de:['frontend entwickler','frontend developer'], ru:['frontend разработчик','фронтенд разработчик'], sr:['frontend developer','frontend programer'] },
  { key:'backend', sector:'Engineering', canonical:'Backend Developer', en:['backend developer','back end developer'], de:['backend entwickler','backend developer'], ru:['backend разработчик','бэкенд разработчик'], sr:['backend developer','backend programer'] },
  { key:'software-engineer', sector:'Engineering', canonical:'Software Engineer', en:['software engineer','software developer'], de:['softwareentwickler','software engineer'], ru:['разработчик программного обеспечения','software engineer'], sr:['softverski inženjer','softverski inzenjer','software engineer'] },
  { key:'product-manager', sector:'Product', canonical:'Product Manager', en:['product manager'], de:['produktmanager','product manager'], ru:['продакт менеджер','product manager'], sr:['produkt menadžer','produkt menadzer','product manager'] },
  { key:'marketing', sector:'Marketing', canonical:'Marketing Manager', en:['marketing manager','performance marketer','digital marketer'], de:['marketing manager','performance marketing manager'], ru:['маркетолог','performance маркетолог','менеджер по маркетингу'], sr:['marketing menadžer','marketing menadzer','digitalni marketing'] },
  { key:'gamedev', sector:'GameDev', canonical:'Game Developer', en:['game developer','game designer','gamedev'], de:['game developer','game designer'], ru:['game developer','геймдизайнер','разработчик игр'], sr:['game developer','game dizajner'] },
  { key:'igaming', sector:'GameDev', canonical:'iGaming Specialist', en:['igaming','casino product','casino designer'], de:['igaming'], ru:['igaming','айгейминг'], sr:['igaming'] },
  { key:'data-analyst', sector:'Data / AI', canonical:'Data Analyst', en:['data analyst'], de:['datenanalyst','data analyst'], ru:['аналитик данных','data analyst'], sr:['analitičar podataka','analiticar podataka','data analyst'] },
  { key:'ai-engineer', sector:'Data / AI', canonical:'AI Engineer', en:['ai engineer','machine learning engineer','llm engineer'], de:['ki entwickler','ai engineer','machine learning engineer'], ru:['ai инженер','инженер машинного обучения','ml инженер'], sr:['ai inženjer','ai inzenjer','machine learning engineer'] },
  { key:'creator', sector:'Digital', canonical:'Content Creator', en:['content creator','creative producer'], de:['content creator','creative producer'], ru:['контент креатор','креатор','креативный продюсер'], sr:['content creator','kreativni producent'] },
];

const VACANCY_MARKERS = {
  en: ['vacancy','hiring','job opening','job'],
  de: ['stelle','stellenangebot','job','wir suchen'],
  ru: ['вакансия','ищем','требуется','работа'],
  sr: ['posao','oglas za posao','konkurs','tražimo','trazimo'],
};

const APPLY_MARKERS = [
  /apply\b/i, /send (?:your )?(?:cv|resume)/i, /bewerb/i, /lebenslauf/i,
  /отклик/i, /резюме/i, /присылайте/i, /prijav/i, /pošaljite|posaljite/i, /cv\b/i,
];
const AD_MARKERS = [
  /\b(course|webinar|masterclass|workshop|bootcamp|mentoring|discount|sale|promo|giveaway|buy now|sponsored)\b/i,
  /курс|вебинар|мастер[- ]?класс|обучени|скидк|распродаж|реклам|розыгрыш|купи|интенсив/i,
  /\b(kurs|webinar|rabatt|angebot|workshop|schulung)\b/i,
  /\b(kurs|radionica|popust|akcija|promocija|obuka)\b/i,
];

const TOOL_TAGS = [
  ['Figma', /\bfigma\b/i], ['AdobePhotoshop', /photoshop|adobe ps\b/i], ['AdobeIllustrator', /illustrator|adobe ai\b/i],
  ['AfterEffects', /after effects|\bae\b/i], ['InDesign', /indesign/i], ['PremierePro', /premiere pro/i], ['Blender', /\bblender\b/i],
  ['Cinema4D', /cinema 4d|\bc4d\b/i], ['Sketch', /\bsketch\b/i], ['Rive', /\brive\b/i], ['Jitter', /\bjitter\b/i],
  ['Webflow', /webflow/i], ['Tilda', /\btilda\b/i], ['Framer', /\bframer\b/i], ['HTML', /\bhtml5?\b/i], ['CSS', /\bcss3?\b/i],
  ['JavaScript', /javascript|\bjs\b/i], ['TypeScript', /typescript|\bts\b/i], ['React', /\breact(?:\.js)?\b/i], ['Vue', /\bvue(?:\.js)?\b/i],
  ['Angular', /\bangular\b/i], ['NodeJS', /node\.js|nodejs/i], ['Python', /\bpython\b/i], ['Java', /\bjava\b/i], ['Kotlin', /\bkotlin\b/i],
  ['Swift', /\bswift\b/i], ['CSharp', /c#|c sharp/i], ['CPlusPlus', /c\+\+/i], ['Unity', /\bunity\b/i], ['UnrealEngine', /unreal engine|\bue5?\b/i],
  ['SQL', /\bsql\b/i], ['PostgreSQL', /postgres|postgresql/i], ['MySQL', /mysql/i], ['AWS', /\baws\b|amazon web services/i], ['Docker', /\bdocker\b/i],
  ['Kubernetes', /kubernetes|\bk8s\b/i], ['Git', /\bgit\b|github|gitlab/i], ['Jira', /\bjira\b/i], ['Notion', /\bnotion\b/i],
  ['GA4', /google analytics|\bga4\b/i], ['GoogleAds', /google ads/i], ['MetaAds', /meta ads|facebook ads/i], ['TikTokAds', /tiktok ads/i],
];
const SKILL_TAGS = [
  ['Branding', /branding|brand identity|айдентик|брендинг/i], ['Typography', /typograph|типограф/i], ['MotionDesign', /motion design|моушн/i],
  ['UIUX', /ui\/ux|ux\/ui|user experience|user interface/i], ['Prototyping', /prototyp|прототип/i], ['UserResearch', /user research|ux research|исследован/i],
  ['ABTesting', /a\/b|ab test|сплит[- ]?тест/i], ['DesignSystems', /design system|дизайн[- ]?систем/i], ['Illustration', /illustrat|иллюстрац/i],
  ['3D', /\b3d\b|three[- ]dimensional/i], ['VideoEditing', /video edit|монтаж/i], ['Copywriting', /copywriting|копирайт/i], ['SEO', /\bseo\b/i],
  ['PerformanceMarketing', /performance marketing/i], ['Analytics', /analytics|аналитик/i], ['CRM', /\bcrm\b/i], ['SQL', /\bsql\b/i],
  ['MachineLearning', /machine learning|машинн.*обуч/i], ['LLM', /\bllm\b|large language model/i], ['PromptEngineering', /prompt engineering|промпт/i],
  ['Agile', /\bagile\b/i], ['Scrum', /\bscrum\b/i], ['TeamLead', /team lead|руковод.*команд|leadership/i],
];

const COUNTRY_RULES = [
  ['Russia', /\brussia\b|росси|москв|санкт[- ]?петербург|питер/i], ['Serbia', /\bserbia\b|срби|серби|beograd|belgrade|novi sad|београд/i],
  ['Germany', /\bgermany\b|deutschland|berlin|münchen|munich|hamburg|frankfurt|köln|cologne/i], ['Austria', /\baustria\b|österreich|vienna|wien/i],
  ['Switzerland', /\bswitzerland\b|schweiz|zürich|zurich|geneva/i], ['United Kingdom', /united kingdom|\buk\b|london|manchester|edinburgh/i],
  ['United States', /united states|\busa\b|new york|california|san francisco|los angeles|seattle|austin/i], ['Canada', /\bcanada\b|toronto|vancouver|montreal/i],
  ['Netherlands', /netherlands|nederland|amsterdam|rotterdam/i], ['France', /\bfrance\b|paris|lyon/i], ['Spain', /\bspain\b|españa|madrid|barcelona/i],
  ['Portugal', /\bportugal\b|lisbon|lisboa|porto/i], ['Italy', /\bitaly\b|italia|milan|milano|rome|roma/i], ['Poland', /\bpoland\b|polska|warsaw|warszawa|krakow/i],
  ['Czechia', /czech|česko|prague|praha/i], ['Croatia', /croatia|hrvatska|zagreb/i], ['Montenegro', /montenegro|crna gora|podgorica/i],
  ['Bosnia and Herzegovina', /bosnia|herzegovina|sarajevo/i], ['Slovenia', /slovenia|ljubljana/i], ['Turkey', /turkey|türkiye|istanbul/i],
  ['UAE', /united arab emirates|\buae\b|dubai|abu dhabi/i], ['Israel', /\bisrael\b|tel aviv/i], ['Australia', /\baustralia\b|sydney|melbourne|brisbane/i],
];

function allRoleAliases(role) {
  return [...role.en, ...role.de, ...role.ru, ...role.sr];
}
function findRole(text = '') {
  const haystack = String(text).toLowerCase();
  for (const role of ROLE_MATRIX) {
    for (const alias of allRoleAliases(role)) {
      if (haystack.includes(alias.toLowerCase())) return role;
    }
  }
  return null;
}
function hasVacancyMarker(text = '') {
  const s = String(text).toLowerCase();
  return Object.values(VACANCY_MARKERS).flat().some(marker => s.includes(marker.toLowerCase()));
}
function vacancyScore(text = '', matchedRole = null) {
  const s = String(text);
  let score = 0;
  if (matchedRole || findRole(s)) score += 3;
  for (const markers of Object.values(VACANCY_MARKERS)) {
    if (markers.some(marker => s.toLowerCase().includes(marker.toLowerCase()))) score += 2;
  }
  if (APPLY_MARKERS.some(re => re.test(s))) score += 2;
  if (/salary|gehalt|зарплат|\bplata\b|€|\$|₽|RSD|RUB|EUR|USD/i.test(s)) score += 1;
  if (/remote|hybrid|office|homeoffice|удал|гибрид|офис|hibrid|kancelar/i.test(s)) score += 1;
  const adHits = AD_MARKERS.filter(re => re.test(s)).length;
  score -= adHits * 3;
  return score;
}
function isVacancyContent(text = '', matchedRole = null, trustedJobSource = false) {
  if (trustedJobSource) return Boolean(matchedRole || findRole(text));
  return vacancyScore(text, matchedRole) >= 5 && hasVacancyMarker(text);
}

function detectLanguage(text = '') {
  const s = ` ${String(text).toLowerCase()} `;
  if (/\b(stelle|stellenangebot|wir suchen|erfahrung|gehalt|bewerb|kenntnisse|homeoffice|arbeitsort)\b/.test(s) || /[äöüß]/.test(s)) return 'de';
  if (/\b(posao|tražimo|trazimo|iskustvo|plata|prijavi|radno mesto|kancelarija|hibridno|zaposlenje)\b/.test(s) || /[čćžšđ]/.test(s)) return 'sr';
  if (/ваканси|ищем|требуется|опыт|зарплат|удал[её]н|офис|гибрид|работа/i.test(s)) return 'ru';
  if (/[а-яё]/i.test(s)) return 'ru';
  return 'en';
}

function inferExperience(text = '') {
  const s = String(text).toLowerCase();
  if (/no experience|без опыта|ohne berufserfahrung|keine erfahrung|bez iskustva|intern|internship|praktik|стаж|junior trainee/.test(s)) return 'Без опыта';
  const matches = [...s.matchAll(/(\d{1,2})\s*(?:\+|[-–—]\s*(\d{1,2}))?\s*(?:years?|yrs?|jahre?|лет|года|год|godina|godine)/g)];
  if (matches.length) {
    const mins = matches.map(m => Number(m[1] || 0));
    const min = Math.max(...mins);
    if (min >= 6) return '6+ лет';
    if (min >= 3) return '3–6 лет';
    if (min >= 1) return '1–3 года';
  }
  if (/senior|principal|staff|head|director|lead\b|leiter|руковод|ведущ|senior/.test(s)) return '6+ лет';
  if (/middle|mid[- ]?level|medior/.test(s)) return '3–6 лет';
  if (/junior|jr\.?\b/.test(s)) return '1–3 года';
  return '';
}
function inferWorkMode(text = '') {
  const s = String(text).toLowerCase();
  if (/hybrid|hybridarbeit|гибрид|hibrid/.test(s)) return 'Hybrid';
  if (/remote|fully remote|worldwide|anywhere|homeoffice|work from home|удал[её]н|из дома|udaljeno|rad od kuće|rad od kuce/.test(s)) return 'Remote';
  if (/on[- ]?site|office|büro|vor ort|офис|kancelarija|u kancelariji/.test(s)) return 'Office';
  return '';
}
function inferEmploymentType(text = '') {
  const s = String(text).toLowerCase();
  if (/part[- ]?time|teilzeit|частичн.*занято|nepuno radno vreme/.test(s)) return 'Part-Time';
  if (/contract|freelance|freelancer|befristet|проектн|контракт|honorar/.test(s)) return 'Contract';
  if (/internship|praktikum|стажиров|praksa/.test(s)) return 'Internship';
  if (/full[- ]?time|vollzeit|полная занятость|puno radno vreme/.test(s)) return 'Full-Time';
  return '';
}
function inferCountry(text = '') {
  for (const [country, re] of COUNTRY_RULES) if (re.test(String(text))) return country;
  return '';
}
function inferLocation(text = '') {
  const raw = String(text);
  if (/remote|worldwide|anywhere|удал[её]н|udaljeno/i.test(raw)) return 'Remote';
  const patterns = [
    /(?:location|based in|city|office)\s*[:—-]\s*([^\n|•;]{2,80})/i,
    /(?:локация|город|офис)\s*[:—-]\s*([^\n|•;]{2,80})/i,
    /(?:standort|arbeitsort|ort)\s*[:—-]\s*([^\n|•;]{2,80})/i,
    /(?:lokacija|mesto rada|grad)\s*[:—-]\s*([^\n|•;]{2,80})/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return clean(m[1], 160);
  }
  return '';
}
function inferSalary(text = '') {
  const s = String(text);
  const label = s.match(/(?:salary|compensation|gehalt|vergütung|vergutung|зарплата|зп|оклад|plata|zarada)\s*[:—-]?\s*([^\n|•;]{2,90})/i);
  if (label) {
    const candidate = clean(label[1], 120);
    if (/\d/.test(candidate)) return candidate;
  }
  const money = s.match(/((?:from|от|ab|od)?\s*[\d\s.,]{2,14}\s*(?:–|-|to|до|bis|do)\s*[\d\s.,]{2,14}\s*(?:₽|руб\.?|RUB|RUR|USD|\$|EUR|€|RSD|din(?:ara)?))/i)
    || s.match(/((?:from|от|ab|od)\s*[\d\s.,]{2,14}\s*(?:₽|руб\.?|RUB|RUR|USD|\$|EUR|€|RSD|din(?:ara)?))/i)
    || s.match(/([\d\s.,]{3,14}\s*(?:₽|руб\.?|RUB|RUR|USD|\$|EUR|€|RSD|din(?:ara)?)(?:\s*(?:gross|net|brutto|netto|гросс|нет|mesečno|mesecno|month|месяц))?)/i);
  return money ? clean(money[1], 120) : '';
}
function extractCompany(text = '', fallback = '') {
  const raw = String(text);
  const patterns = [
    /(?:company|employer)\s*[:—-]\s*([^\n|•;]{2,100})/i,
    /(?:компания|работодатель)\s*[:—-]\s*([^\n|•;]{2,100})/i,
    /(?:unternehmen|firma)\s*[:—-]\s*([^\n|•;]{2,100})/i,
    /(?:kompanija|firma|poslodavac)\s*[:—-]\s*([^\n|•;]{2,100})/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return clean(m[1], 180);
  }
  return clean(fallback || 'Компания', 180);
}
function inferTitle(text = '', role = null) {
  const lines = String(text).split(/\n+/).map(v => v.trim()).filter(Boolean);
  const aliases = role ? allRoleAliases(role).map(a => a.toLowerCase()) : [];
  const roleLine = lines.find(line => aliases.some(alias => line.toLowerCase().includes(alias))) || lines.find(line => hasVacancyMarker(line));
  let title = clean(roleLine || role?.canonical || lines[0] || 'Вакансия', 240);
  title = title.replace(/^(?:vacancy|job opening|hiring|stelle|stellenangebot|вакансия|ищем|требуется|posao|konkurs|tražimo|trazimo)\s*[:—-]?\s*/i, '');
  if (title.length > 120 && role) title = role.canonical;
  return title || role?.canonical || 'Вакансия';
}
function extractTags(text = '', extra = []) {
  const out = [];
  const add = value => { const tag = String(value || '').replace(/^#/, '').replace(/[^\p{L}\p{N}+.#-]+/gu, ''); if (tag && !out.some(x => x.toLowerCase() === tag.toLowerCase())) out.push(tag); };
  for (const value of extra || []) add(value);
  for (const [tag, re] of TOOL_TAGS) if (re.test(text)) add(tag);
  for (const [tag, re] of SKILL_TAGS) if (re.test(text)) add(tag);
  return out.slice(0, 18);
}

async function translateChunk(text) {
  const input = clean(text, 1900);
  if (!input) return { text:'', lang:'' };
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', 'ru');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', input);
  const res = await fetch(url, { headers:{ 'user-agent':'WORKROOM/1.0' }, signal:AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const payload = await res.json();
  return {
    text: clean(Array.isArray(payload?.[0]) ? payload[0].map(part => part?.[0] || '').join('') : input, 2200),
    lang: clean(payload?.[2] || '', 12),
  };
}
async function translateToRussian(text = '', maxChars = 12000) {
  const plain = htmlToText(text, maxChars);
  if (!plain) return { text:'', lang:'' };
  const guessed = detectLanguage(plain);
  if (guessed === 'ru') return { text:plain, lang:'ru' };
  const chunks = [];
  let rest = plain;
  while (rest.length) {
    if (rest.length <= 1800) { chunks.push(rest); break; }
    let cut = rest.lastIndexOf('. ', 1800);
    if (cut < 900) cut = rest.lastIndexOf(' ', 1800);
    if (cut < 500) cut = 1800;
    chunks.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1).trim();
  }
  const translated = [];
  let lang = guessed;
  for (const chunk of chunks.slice(0, 7)) {
    try {
      const result = await translateChunk(chunk);
      translated.push(result.text || chunk);
      if (result.lang) lang = result.lang;
      await sleep(35);
    } catch (err) {
      console.warn('[vacancy-monitor] translation fallback:', err.message);
      translated.push(chunk);
    }
  }
  return { text:translated.join('\n\n'), lang };
}
function translatedHtml(text = '') {
  return String(text || '').split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
}

async function ensureSchema() {
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

async function upsertNormalized(raw) {
  const text = htmlToText(`${raw.title || ''}\n${raw.summary || ''}\n${raw.description || ''}`, 24000);
  const role = raw.role || findRole(text);
  if (!isVacancyContent(text, role, raw.trusted === true)) return 0;

  const sourceLanguage = raw.sourceLanguage || detectLanguage(text);
  const originalDescription = safeRich(raw.description || raw.summary || '');
  const plainDescription = htmlToText(raw.description || raw.summary || '', 12000);
  const summaryOriginal = clean(raw.summary || plainDescription.slice(0, 520), 520);

  let summaryRu = summaryOriginal;
  let descriptionRu = plainDescription;
  let detectedLang = sourceLanguage;
  if (sourceLanguage !== 'ru') {
    try {
      const summaryTranslation = await translateToRussian(summaryOriginal, 800);
      summaryRu = summaryTranslation.text || summaryOriginal;
      detectedLang = summaryTranslation.lang || detectedLang;
      const descTranslation = await translateToRussian(plainDescription, 12000);
      descriptionRu = descTranslation.text || plainDescription;
      detectedLang = descTranslation.lang || detectedLang;
    } catch (err) {
      console.warn(`[vacancy-monitor] translation skipped for ${raw.url}:`, err.message);
    }
  }

  const haystack = `${raw.title || ''}\n${raw.location || ''}\n${text}`;
  const location = clean(raw.location || inferLocation(haystack), 160);
  const country = clean(raw.country || inferCountry(`${location} ${haystack}`), 100);
  const workMode = clean(raw.workMode || inferWorkMode(haystack), 40);
  const salary = clean(raw.salary || inferSalary(haystack), 120);
  const experience = clean(raw.experience || inferExperience(haystack), 80);
  const employmentType = clean(raw.employmentType || inferEmploymentType(haystack), 100);
  const title = clean(raw.title || inferTitle(text, role), 240);
  const company = clean(raw.company || extractCompany(text, raw.companyFallback), 180);
  const tags = extractTags(haystack, raw.extraTags || []);
  const fingerprint = crypto.createHash('sha1').update(`${title.toLowerCase()}|${company.toLowerCase()}|${country.toLowerCase()}|${location.toLowerCase()}`).digest('hex');

  await pool.query(`
    INSERT INTO jobs(
      external_id,source,source_url,title,company,summary,summary_ru,description_html,description_ru_html,
      source_language,experience,work_mode,salary,location,country,sector,employment_type,job_tags,imported_query,
      source_metadata,content_fingerprint,published_at,is_active,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,TRUE,NOW())
    ON CONFLICT(source_url) DO UPDATE SET
      external_id=EXCLUDED.external_id,source=EXCLUDED.source,title=EXCLUDED.title,company=EXCLUDED.company,
      summary=EXCLUDED.summary,summary_ru=EXCLUDED.summary_ru,description_html=EXCLUDED.description_html,
      description_ru_html=EXCLUDED.description_ru_html,source_language=EXCLUDED.source_language,
      experience=EXCLUDED.experience,work_mode=EXCLUDED.work_mode,salary=EXCLUDED.salary,location=EXCLUDED.location,
      country=EXCLUDED.country,sector=EXCLUDED.sector,employment_type=EXCLUDED.employment_type,job_tags=EXCLUDED.job_tags,
      imported_query=EXCLUDED.imported_query,source_metadata=EXCLUDED.source_metadata,content_fingerprint=EXCLUDED.content_fingerprint,
      published_at=EXCLUDED.published_at,is_active=TRUE,updated_at=NOW()
  `, [
    clean(raw.id, 180), clean(raw.source, 120), clean(raw.url, 1200), title, company,
    summaryOriginal, clean(summaryRu, 700), originalDescription, translatedHtml(descriptionRu), clean(detectedLang || sourceLanguage, 12),
    experience, workMode, salary, location, country, role?.sector || raw.sector || 'Digital', employmentType,
    tags, clean(raw.query, 240), JSON.stringify(raw.metadata || {}), fingerprint, raw.publishedAt || new Date(),
  ]);
  return 1;
}

function roleQueries() {
  const rows = [];
  const strongest = { en:'vacancy', de:'stelle', ru:'вакансия', sr:'posao' };
  for (const role of ROLE_MATRIX) {
    for (const lang of ['en','de','ru','sr']) {
      const alias = role[lang]?.[0];
      if (!alias) continue;
      rows.push({ role, lang, query:`${alias} ${strongest[lang]}` });
    }
  }
  return rows;
}

function hhSalary(salary) {
  if (!salary) return '';
  const fmt = n => Number.isFinite(Number(n)) ? new Intl.NumberFormat('ru-RU').format(Number(n)) : '';
  const from = fmt(salary.from), to = fmt(salary.to), currency = salary.currency || '';
  if (from && to) return `${from}–${to} ${currency}`;
  if (from) return `от ${from} ${currency}`;
  if (to) return `до ${to} ${currency}`;
  return '';
}
function hhExperience(detail) {
  const map = { noExperience:'Без опыта', between1And3:'1–3 года', between3And6:'3–6 лет', moreThan6:'6+ лет' };
  return map[detail?.experience?.id] || '';
}
async function importHH() {
  const headers = {
    accept:'application/json',
    'user-agent':`WORKROOM/2.0 (${clean(process.env.ADMIN_EMAIL || 'workroom', 180)})`,
    'hh-user-agent':`WORKROOM/2.0 (${clean(process.env.ADMIN_EMAIL || 'workroom', 180)})`,
  };
  const queryLimit = Math.max(8, Math.min(80, Number(process.env.HH_QUERY_LIMIT || 60)));
  const period = Math.max(1, Math.min(7, Number(process.env.HH_PERIOD_DAYS || 3)));
  const found = new Map();

  for (const entry of roleQueries().slice(0, queryLimit)) {
    try {
      const url = new URL('https://api.hh.ru/vacancies');
      url.searchParams.set('text', entry.query);
      url.searchParams.set('period', String(period));
      url.searchParams.set('order_by', 'publication_time');
      url.searchParams.set('per_page', '30');
      const res = await fetch(url, { headers, signal:AbortSignal.timeout(16000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const item of data.items || []) {
        if (!found.has(String(item.id))) found.set(String(item.id), { item, entry });
      }
      await sleep(80);
    } catch (err) {
      console.warn(`[hh] query '${entry.query}' skipped:`, err.message);
    }
  }

  let imported = 0;
  const queue = [...found.values()].slice(0, Math.max(60, Math.min(360, Number(process.env.HH_DETAIL_LIMIT || 260))));
  const workers = Array.from({ length:4 }, async () => {
    while (queue.length) {
      const { item, entry } = queue.shift();
      try {
        const res = await fetch(`https://api.hh.ru/vacancies/${encodeURIComponent(item.id)}`, { headers, signal:AbortSignal.timeout(14000) });
        const detail = res.ok ? await res.json() : item;
        const description = detail.description || [item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join('\n');
        const role = findRole(`${detail.name || item.name} ${description}`) || entry.role;
        const workTokens = [detail.schedule?.name, ...(detail.work_format || []).map(x => x.name), detail.address?.city].filter(Boolean).join(' ');
        imported += await upsertNormalized({
          id:`hh:${item.id}`, source:'hh.ru', url:detail.alternate_url || item.alternate_url,
          title:detail.name || item.name, company:detail.employer?.name || item.employer?.name || 'Компания',
          summary:[item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join(' · ') || htmlToText(description, 520),
          description, role, trusted:true, query:entry.query,
          experience:hhExperience(detail), workMode:inferWorkMode(workTokens), salary:hhSalary(detail.salary || item.salary),
          location:detail.area?.name || item.area?.name || '', country:inferCountry(`${detail.area?.name || ''} ${description}`),
          employmentType:detail.employment?.name || item.employment?.name || '',
          extraTags:(detail.key_skills || []).map(x => x.name).filter(Boolean),
          publishedAt:detail.published_at ? new Date(detail.published_at) : new Date(),
          metadata:{ query_language:entry.lang, hh_id:item.id },
        });
      } catch (err) {
        console.warn(`[hh] vacancy ${item.id} skipped:`, err.message);
      }
    }
  });
  await Promise.all(workers);
  console.log(`[vacancy-monitor] hh.ru: found=${found.size}, imported=${imported}`);
  return imported;
}

function telegramChannels() {
  return (process.env.TELEGRAM_JOB_CHANNELS || 'mirkreatorovjob,designhunters,jun_hi_vacancies,serbia_vacancies,rabotavserbii,desivr_design')
    .split(',').map(x => x.trim().replace(/^https?:\/\/t\.me\//,'').replace(/^@/,'').replace(/^s\//,'')).filter(Boolean);
}
function telegramPosts(html = '', channel = '') {
  const markers = [...String(html).matchAll(/data-post="([^"]+)"/g)];
  const posts = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index || 0;
    const end = i + 1 < markers.length ? (markers[i + 1].index || html.length) : html.length;
    const block = html.slice(start, end);
    const postKey = markers[i][1];
    const textMatch = block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch) continue;
    const text = sanitizeHtml(textMatch[1].replace(/<br\s*\/?\s*>/gi, '\n'), { allowedTags:[], allowedAttributes:{} }).replace(/\n\s+/g,'\n').trim();
    const time = block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1];
    const id = postKey.split('/').pop();
    posts.push({ id:`tg:${postKey}`, url:`https://t.me/${channel}/${id}`, text, publishedAt:time ? new Date(time) : new Date() });
  }
  return posts;
}
async function importTelegram() {
  let imported = 0;
  for (const channel of telegramChannels()) {
    try {
      const res = await fetch(`https://t.me/s/${encodeURIComponent(channel)}`, { headers:{ 'user-agent':'Mozilla/5.0 WORKROOM/2.0' }, signal:AbortSignal.timeout(18000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const posts = telegramPosts(await res.text(), channel).slice(-35);
      for (const post of posts) {
        const role = findRole(post.text);
        if (!isVacancyContent(post.text, role, false)) continue;
        const query = role ? `${role.canonical} + vacancy` : 'vacancy';
        imported += await upsertNormalized({
          ...post, source:`Telegram · @${channel}`, title:inferTitle(post.text, role), role,
          company:extractCompany(post.text, `@${channel}`), summary:post.text.slice(0, 520), description:post.text,
          query, metadata:{ channel },
        });
      }
      await sleep(120);
    } catch (err) {
      console.warn(`[telegram] @${channel} skipped:`, err.message);
    }
  }
  console.log(`[vacancy-monitor] Telegram: imported=${imported}`);
  return imported;
}

function instagramConfig() {
  return {
    token:clean(process.env.INSTAGRAM_ACCESS_TOKEN || '', 2400),
    igUserId:clean(process.env.INSTAGRAM_IG_USER_ID || '', 160),
    accounts:(process.env.INSTAGRAM_JOB_ACCOUNTS || 'vacancy_design,simple_studio,beginit.indrive.ca').split(',').map(x=>x.trim().replace(/^@/,'')).filter(Boolean),
    budget:Math.max(4, Math.min(50, Number(process.env.INSTAGRAM_HASHTAG_BUDGET || 24))),
  };
}
async function graphGet(path, params, token) {
  const url = new URL(`https://graph.facebook.com/${String(path).replace(/^\//,'')}`);
  Object.entries(params || {}).forEach(([key,value]) => url.searchParams.set(key, String(value)));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal:AbortSignal.timeout(18000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${clean(await res.text(), 320)}`);
  return res.json();
}
function hashtagFor(alias, marker) {
  return `${alias}${marker}`.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}_]+/gu,'');
}
function instagramHashtags(limit) {
  const primaryMarkers = { en:'vacancy', de:'stelle', ru:'вакансия', sr:'posao' };
  const all = [];
  for (const role of ROLE_MATRIX) {
    for (const lang of ['en','de','ru','sr']) {
      const alias = role[lang]?.[0];
      if (!alias) continue;
      all.push({ hashtag:hashtagFor(alias, primaryMarkers[lang]), role, lang, query:`${alias} ${primaryMarkers[lang]}` });
    }
  }
  // Rotate through the matrix daily so the API budget covers every profession over time.
  const day = Math.floor(Date.now() / 86400000);
  const start = (day * limit) % Math.max(1, all.length);
  return [...all.slice(start), ...all.slice(0,start)].slice(0, limit);
}
async function importInstagram() {
  const cfg = instagramConfig();
  if (!cfg.token || !cfg.igUserId) {
    console.log('[vacancy-monitor] Instagram paused: add INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_IG_USER_ID');
    return 0;
  }
  let imported = 0;
  const seen = new Set();

  for (const username of cfg.accounts) {
    try {
      const fields = `business_discovery.username(${username}){username,media.limit(50){id,caption,permalink,timestamp}}`;
      const data = await graphGet(cfg.igUserId, { fields }, cfg.token);
      const account = data.business_discovery;
      for (const media of account?.media?.data || []) {
        const text = media.caption || '';
        const role = findRole(text);
        if (!media.permalink || !isVacancyContent(text, role, false)) continue;
        seen.add(String(media.id));
        imported += await upsertNormalized({
          id:`ig:${media.id}`, source:`Instagram · @${account.username || username}`, url:media.permalink,
          title:inferTitle(text, role), role, company:extractCompany(text, `@${account.username || username}`),
          summary:text.slice(0,520), description:text, query:role ? `${role.canonical} + vacancy` : 'vacancy',
          publishedAt:media.timestamp ? new Date(media.timestamp) : new Date(), metadata:{ account:account.username || username },
        });
      }
    } catch (err) {
      console.warn(`[instagram] @${username} skipped:`, err.message);
    }
  }

  for (const entry of instagramHashtags(cfg.budget)) {
    try {
      const search = await graphGet('ig_hashtag_search', { user_id:cfg.igUserId, q:entry.hashtag }, cfg.token);
      const id = search.data?.[0]?.id;
      if (!id) continue;
      const media = await graphGet(`${id}/recent_media`, { user_id:cfg.igUserId, fields:'id,caption,permalink,timestamp', limit:'40' }, cfg.token);
      for (const post of media.data || []) {
        if (!post.id || seen.has(String(post.id))) continue;
        seen.add(String(post.id));
        const text = post.caption || '';
        const role = findRole(text) || entry.role;
        if (!post.permalink || !isVacancyContent(text, role, false)) continue;
        const publishedAt = post.timestamp ? new Date(post.timestamp) : new Date();
        if (Date.now() - publishedAt.getTime() > 10 * 86400000) continue;
        imported += await upsertNormalized({
          id:`ig:${post.id}`, source:'Instagram', url:post.permalink, title:inferTitle(text, role), role,
          company:extractCompany(text, `Instagram · #${entry.hashtag}`), summary:text.slice(0,520), description:text,
          query:entry.query, publishedAt, metadata:{ hashtag:entry.hashtag, query_language:entry.lang },
        });
      }
      await sleep(120);
    } catch (err) {
      console.warn(`[instagram] #${entry.hashtag} skipped:`, err.message);
    }
  }
  console.log(`[vacancy-monitor] Instagram: imported=${imported}`);
  return imported;
}

function msUntilMoscow(hour = 0, minute = 0) {
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  let targetUtc = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), hour - 3, minute, 0);
  if (targetUtc <= now.getTime()) targetUtc += 86400000;
  return targetUtc - now.getTime();
}
async function archiveStale() {
  const days = Math.max(3, Math.min(60, Number(process.env.VACANCY_MAX_AGE_DAYS || 21)));
  const { rowCount } = await pool.query(`
    UPDATE jobs SET is_active=FALSE,updated_at=NOW()
    WHERE is_active=TRUE
      AND source NOT IN ('Manual','Direct')
      AND COALESCE(published_at,created_at) < NOW() - ($1::text || ' days')::interval
  `, [String(days)]);
  if (rowCount) console.log(`[vacancy-monitor] archived stale jobs: ${rowCount}`);
}
let running = false;
async function runMonitor(reason = 'scheduled') {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    await ensureSchema();
    console.log(`[vacancy-monitor] run start (${reason})`);
    const results = await Promise.allSettled([importHH(), importTelegram(), importInstagram()]);
    await archiveStale();
    const counts = results.map(r => r.status === 'fulfilled' ? Number(r.value || 0) : 0);
    console.log(`[vacancy-monitor] run complete in ${Math.round((Date.now()-started)/1000)}s · hh=${counts[0]} tg=${counts[1]} ig=${counts[2]}`);
  } catch (err) {
    console.error('[vacancy-monitor] run failed:', err);
  } finally {
    running = false;
  }
}
function scheduleDaily() {
  const arm = () => {
    const timer = setTimeout(async () => {
      await runMonitor('00:00 MSK');
      arm();
    }, msUntilMoscow(0, 0));
    timer.unref();
  };
  arm();
}

setTimeout(() => runMonitor('startup'), 18_000).unref();
scheduleDaily();

process.on('exit', () => pool.end().catch(() => {}));
