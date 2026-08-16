// WORK//ROOM source watchdog
// Keeps hh.ru populated even if the normal partner pass misses a run, and
// prepares Instagram partner-account + profession-vacancy hashtag discovery.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

if (!process.env.DATABASE_URL) return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
});

const clean = (v = '', max = 2000) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const plain = (v = '', max = 4000) => clean(sanitizeHtml(String(v || ''), { allowedTags: [], allowedAttributes: {} }), max);
const rich = (v = '') => sanitizeHtml(String(v || ''), {
  allowedTags: ['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
  allowedAttributes: { a: ['href','target','rel'] },
  allowedSchemes: ['http','https','mailto'],
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sector(text = '') {
  const s = String(text).toLowerCase();
  if (/game|gaming|unity|unreal|gamedev|igaming|игр/.test(s)) return 'GameDev';
  if (/ui\b|ux\b|product design|interaction design/.test(s)) return 'UI/UX';
  if (/graphic|brand design|visual design|illustrat|creative design|motion design|графическ|бренд/.test(s)) return 'Graphic Design';
  if (/machine learning|artificial intelligence|\bai\b|data scientist|data engineer|llm|аналитик данных/.test(s)) return 'Data / AI';
  if (/marketing|growth|seo|content|social media|communications|маркет/.test(s)) return 'Marketing';
  if (/product manager|product owner|product management|продакт/.test(s)) return 'Product';
  if (/software|developer|engineer|frontend|backend|fullstack|devops|qa\b|security|ios|android|разработчик|программист/.test(s)) return 'Engineering';
  return 'Digital';
}

function experience(text = '') {
  const s = String(text).toLowerCase();
  if (/без опыта|no experience|intern|internship|trainee|стаж|entry[ -]?level/.test(s)) return 'Без опыта';
  const m = s.match(/(\d{1,2})\s*(?:\+|[-–—]\s*(\d{1,2}))?\s*(?:years?|yrs?|лет|года|год)/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2] || a);
    if (a >= 6 || b >= 7) return '6+ лет';
    if (a >= 3 || b > 3) return '3–6 лет';
    if (a >= 1 || b >= 1) return '1–3 года';
  }
  if (/junior|jr\.?\b/.test(s)) return '1–3 года';
  if (/middle|mid[ -]?level/.test(s)) return '3–6 лет';
  if (/senior|sr\.?\b|principal|staff|lead|head|director|vp\b/.test(s)) return '6+ лет';
  return '';
}

function workMode(text = '') {
  const s = String(text).toLowerCase();
  if (/hybrid|гибрид/.test(s)) return 'Hybrid';
  if (/remote|worldwide|anywhere|work from home|удален|удалён/.test(s)) return 'Remote';
  return 'Office';
}

function locationFromText(text = '') {
  const s = String(text);
  if (/remote|worldwide|anywhere|удален|удалён/i.test(s)) return 'Remote';
  const m = s.match(/(?:location|локация|город|based in)\s*[:—-]\s*([^\n|•;]{2,80})/i);
  return m ? clean(m[1], 160) : '';
}

function salaryFromText(text = '') {
  const s = String(text);
  const patterns = [
    /(?:salary|зарплата|зп|compensation)\s*[:—-]?\s*([^\n|•;]{2,70})/i,
    /((?:from|от)?\s*[\d\s.,]{2,12}\s*(?:–|-|to|до)\s*[\d\s.,]{2,12}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD))/i,
    /((?:from|от)\s*[\d\s.,]{2,12}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD))/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return clean(m[1], 120);
  }
  return '';
}

function isJobLike(text = '') {
  return /(ваканси|ищем|hiring|vacanc|job opening|join our team|career opportunity|позици|designer|developer|engineer|manager|маркетолог|дизайнер|разработчик|аналитик|product|marketing|gamedev|igaming|ui\/ux|ux\/ui)/i.test(text);
}

function titleFromPost(text = '') {
  const lines = String(text).split(/\n+/).map(x => x.trim()).filter(Boolean);
  const likely = lines.find(line => /(designer|developer|engineer|manager|marketer|creator|analyst|ваканси|ищем|дизайнер|разработчик|маркетолог|аналитик|product|marketing|gamedev|igaming)/i.test(line));
  return clean((likely || lines[0] || 'Вакансия').replace(/^[-–—•*#\s]+/, ''), 240);
}

async function upsert(job) {
  if (!job.url || !job.title || !job.company) return 0;
  const description = String(job.description || job.summary || '');
  const summary = plain(job.summary || description, 500);
  const haystack = `${job.title} ${summary} ${description}`;
  const looksRu = ((summary.match(/[А-Яа-яЁё]/g) || []).length / Math.max(1, (summary.match(/[A-Za-zА-Яа-яЁё]/g) || []).length)) > .35;

  await pool.query(`
    INSERT INTO jobs(external_id,source,source_url,title,company,summary,summary_ru,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,is_active,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,NOW())
    ON CONFLICT(source_url) DO UPDATE SET
      external_id=EXCLUDED.external_id,source=EXCLUDED.source,title=EXCLUDED.title,company=EXCLUDED.company,
      summary_ru=CASE WHEN jobs.summary IS DISTINCT FROM EXCLUDED.summary THEN EXCLUDED.summary_ru ELSE COALESCE(jobs.summary_ru,EXCLUDED.summary_ru) END,
      summary=EXCLUDED.summary,description_html=EXCLUDED.description_html,experience=EXCLUDED.experience,
      work_mode=EXCLUDED.work_mode,salary=EXCLUDED.salary,location=EXCLUDED.location,sector=EXCLUDED.sector,
      employment_type=EXCLUDED.employment_type,published_at=EXCLUDED.published_at,is_active=TRUE,updated_at=NOW()
  `, [
    clean(job.id,160), clean(job.source,100), clean(job.url,1000), clean(job.title,240), clean(job.company,180),
    summary, looksRu ? summary : null, rich(description), job.experience || experience(haystack),
    job.workMode || workMode(`${job.location || ''} ${haystack}`), clean(job.salary || salaryFromText(haystack),120),
    clean(job.location || locationFromText(haystack),160), job.sector || sector(haystack), clean(job.employmentType,100),
    job.publishedAt || new Date(),
  ]);
  return 1;
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, queue.length || 1)) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

function salaryHH(salary) {
  if (!salary) return '';
  const fmt = n => n ? new Intl.NumberFormat('ru-RU').format(n) : '';
  const from = fmt(salary.from), to = fmt(salary.to), c = salary.currency || '';
  if (from && to) return `${from}–${to} ${c}`;
  if (from) return `от ${from} ${c}`;
  if (to) return `до ${to} ${c}`;
  return '';
}

function experienceHH(item) {
  const id = item?.experience?.id;
  return ({ noExperience:'Без опыта', between1And3:'1–3 года', between3And6:'3–6 лет', moreThan6:'6+ лет' })[id] || experience(item?.experience?.name || '');
}

async function importHHRobust() {
  const terms = (process.env.HH_JOB_SEARCH_TERMS || [
    'графический дизайнер','UI UX дизайнер','product designer','motion designer','иллюстратор',
    'frontend developer','backend developer','fullstack developer','software engineer','product manager',
    'маркетолог','performance marketing','gamedev','igaming','data analyst','AI engineer'
  ].join(',')).split(',').map(x => x.trim()).filter(Boolean).slice(0, 20);

  const contact = clean(process.env.HH_CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'OskuArt@users.noreply.github.com', 180);
  const headers = {
    accept: 'application/json',
    'user-agent': `WORKROOM/1.0 (${contact})`,
    'hh-user-agent': `WORKROOM/1.0 (${contact})`,
  };
  const byId = new Map();
  const period = Math.max(1, Math.min(7, Number(process.env.HH_PERIOD_DAYS || 3)));

  for (const term of terms) {
    for (let page = 0; page < 2; page++) {
      try {
        const url = new URL('https://api.hh.ru/vacancies');
        url.searchParams.set('text', term);
        url.searchParams.set('period', String(period));
        url.searchParams.set('order_by', 'publication_time');
        url.searchParams.set('per_page', '50');
        url.searchParams.set('page', String(page));
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(18000) });
        if (!res.ok) {
          const body = plain(await res.text(), 500);
          throw new Error(`HTTP ${res.status}${body ? ` · ${body}` : ''}`);
        }
        const data = await res.json();
        for (const item of data.items || []) byId.set(String(item.id), item);
        if (page + 1 >= Number(data.pages || 1)) break;
        await sleep(120);
      } catch (err) {
        console.warn(`[hh] search '${term}' p${page} failed:`, err.message);
        break;
      }
    }
  }

  const items = [...byId.values()].slice(0, 320);
  let imported = 0;
  await mapLimit(items, 4, async item => {
    try {
      let detail = item;
      const res = await fetch(`https://api.hh.ru/vacancies/${encodeURIComponent(item.id)}`, { headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) detail = await res.json();
      const description = detail.description || [item.snippet?.responsibility, item.snippet?.requirement].filter(Boolean).join('\n');
      const wf = [detail.schedule?.name, ...(detail.work_format || []).map(x => x.name), detail.address?.city].filter(Boolean).join(' ');
      imported += await upsert({
        id:`hh:${item.id}`, source:'hh.ru', url:detail.alternate_url || item.alternate_url,
        title:detail.name || item.name, company:detail.employer?.name || item.employer?.name || 'Компания',
        summary:[item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join(' · ') || plain(description,500),
        description, experience:experienceHH(detail), workMode:workMode(wf), salary:salaryHH(detail.salary || item.salary),
        location:detail.area?.name || item.area?.name || '', sector:sector(`${detail.name || item.name} ${description}`),
        employmentType:detail.employment?.name || item.employment?.name || '',
        publishedAt:detail.published_at ? new Date(detail.published_at) : new Date(),
      });
      await sleep(40);
    } catch (err) {
      console.warn(`[hh] vacancy ${item.id} failed:`, err.message);
    }
  });

  const stats = await pool.query(`SELECT COUNT(*)::int AS count,MAX(published_at) AS latest FROM jobs WHERE source='hh.ru' AND is_active=TRUE`);
  console.log(`[hh] import finished: fetched=${byId.size}, upserted=${imported}, active=${stats.rows[0]?.count || 0}, latest=${stats.rows[0]?.latest || 'none'}`);
  return imported;
}

function msUntilMoscow(hour = 0, minute = 5) {
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  let target = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), hour, minute) - 3 * 60 * 60 * 1000;
  if (target <= now.getTime()) target += 24 * 60 * 60 * 1000;
  return target - now.getTime();
}

function scheduleDaily(fn, hour, minute) {
  const arm = () => setTimeout(async () => {
    try { await fn(); } catch (err) { console.warn('[source-watchdog] daily job failed:', err.message); }
    arm();
  }, msUntilMoscow(hour, minute)).unref();
  arm();
}

async function ensureHH() {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count,MAX(updated_at) AS latest FROM jobs WHERE source='hh.ru' AND is_active=TRUE`);
    const count = Number(rows[0]?.count || 0);
    const latest = rows[0]?.latest ? new Date(rows[0].latest).getTime() : 0;
    const stale = !latest || Date.now() - latest > 30 * 60 * 60 * 1000;
    console.log(`[hh] watchdog: active=${count}, latest-update=${rows[0]?.latest || 'none'}, stale=${stale}`);
    if (count === 0 || stale) await importHHRobust();
  } catch (err) {
    console.warn('[hh] watchdog failed:', err.message);
  }
}

function instagramConfig() {
  return {
    token: clean(process.env.INSTAGRAM_ACCESS_TOKEN || '', 2000),
    igUserId: clean(process.env.INSTAGRAM_IG_USER_ID || '', 120),
    accounts: (process.env.INSTAGRAM_JOB_ACCOUNTS || 'vacancy_design,simple_studio,beginit.indrive.ca')
      .split(',').map(x => x.trim().replace(/^@/,'')).filter(Boolean),
    professions: (process.env.INSTAGRAM_VACANCY_PROFESSIONS || [
      'graphic designer','ui designer','ux designer','product designer','motion designer','illustrator',
      'frontend developer','backend developer','software engineer','product manager','marketing manager',
      'performance marketer','game developer','igaming','data analyst','ai engineer','ai creator'
    ].join(',')).split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
  };
}

function hashtagCandidates(profession) {
  const compact = profession.replace(/[^a-z0-9]+/g, '');
  const under = profession.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'');
  return [...new Set([`${compact}vacancy`, `${compact}jobs`, `${under}_vacancy`, `${under}_jobs`])];
}

async function graphGet(path, params, token) {
  const url = new URL(`https://graph.facebook.com/${String(path).replace(/^\//,'')}`);
  Object.entries(params || {}).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${plain(await res.text(), 400)}`);
  return res.json();
}

async function importInstagramPartnerAccounts() {
  const { token, igUserId, accounts } = instagramConfig();
  if (!token || !igUserId || !accounts.length) return 0;
  let imported = 0;

  for (const username of accounts) {
    try {
      const fields = `business_discovery.username(${username}){username,media.limit(50){id,caption,permalink,timestamp}}`;
      const data = await graphGet(igUserId, { fields }, token);
      const discovered = data.business_discovery;
      for (const media of discovered?.media?.data || []) {
        const text = media.caption || '';
        if (!media.permalink || !isJobLike(text)) continue;
        imported += await upsert({
          id:`ig:${media.id}`, source:'Instagram', url:media.permalink, title:titleFromPost(text),
          company:`@${discovered.username || username}`, summary:text, description:text,
          location:locationFromText(text), salary:salaryFromText(text), sector:sector(text),
          publishedAt:media.timestamp ? new Date(media.timestamp) : new Date(),
        });
      }
    } catch (err) {
      console.warn(`[instagram] partner @${username} skipped:`, err.message);
    }
  }
  console.log(`[instagram] partner accounts imported: ${imported}`);
  return imported;
}

async function importInstagramProfessionVacancies() {
  const { token, igUserId, professions } = instagramConfig();
  if (!token || !igUserId || !professions.length) return 0;
  let imported = 0;
  const seenMedia = new Set();

  for (const profession of professions.slice(0, 20)) {
    for (const hashtag of hashtagCandidates(profession)) {
      try {
        const found = await graphGet('ig_hashtag_search', { user_id:igUserId, q:hashtag }, token);
        const hashtagId = found.data?.[0]?.id;
        if (!hashtagId) continue;
        const media = await graphGet(`${hashtagId}/recent_media`, {
          user_id:igUserId,
          fields:'id,caption,permalink,timestamp',
          limit:'50',
        }, token);
        for (const post of media.data || []) {
          if (!post.id || seenMedia.has(post.id)) continue;
          seenMedia.add(post.id);
          const text = post.caption || '';
          if (!post.permalink || !isJobLike(text)) continue;
          const publishedAt = post.timestamp ? new Date(post.timestamp) : new Date();
          if (Date.now() - publishedAt.getTime() > 8 * 24 * 60 * 60 * 1000) continue;
          imported += await upsert({
            id:`ig:${post.id}`, source:'Instagram', url:post.permalink,
            title:titleFromPost(text), company:`Instagram · #${hashtag}`,
            summary:text, description:text, location:locationFromText(text), salary:salaryFromText(text),
            sector:sector(`${profession} ${text}`), publishedAt,
          });
        }
        await sleep(120);
      } catch (err) {
        console.warn(`[instagram] #${hashtag} search skipped:`, err.message);
      }
    }
  }
  console.log(`[instagram] profession-vacancy hashtag import: ${imported}`);
  return imported;
}

async function importInstagramVacancies() {
  const cfg = instagramConfig();
  if (!cfg.token || !cfg.igUserId) {
    console.log('[instagram] waiting for INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_IG_USER_ID');
    return 0;
  }
  const results = await Promise.allSettled([importInstagramPartnerAccounts(), importInstagramProfessionVacancies()]);
  return results.reduce((sum,r) => sum + (r.status === 'fulfilled' ? Number(r.value || 0) : 0), 0);
}

// Startup reliability pass: existing partner importer runs after ~25s. We verify its
// result later and only retry hh.ru when the DB is empty/stale.
setTimeout(ensureHH, 90_000).unref();
setTimeout(importInstagramVacancies, 110_000).unref();

// 00:05 MSK is a deliberate retry after the main 00:00 refresh.
scheduleDaily(importHHRobust, 0, 5);
scheduleDaily(importInstagramVacancies, 0, 7);

process.on('exit', () => pool.end().catch(() => {}));
