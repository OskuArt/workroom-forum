// WORK//ROOM partner vacancy imports.
// - Aligns the app's built-in Jobicy/Arbeitnow refresh to 00:00 Moscow time.
// - Adds hh.ru immediately.
// - Enables X, Telegram and Instagram partner feeds when their credentials/source IDs
//   are added as Render environment variables.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

const nativeSetInterval = global.setInterval;
const nativeSetTimeout = global.setTimeout;

function msUntilNextMoscowMidnight() {
  const now = new Date();
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const y = moscowNow.getUTCFullYear();
  const m = moscowNow.getUTCMonth();
  const d = moscowNow.getUTCDate();
  const targetUtc = Date.UTC(y, m, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000;
  return Math.max(1000, targetUtc - Date.now());
}

function scheduleAtMoscowMidnight(fn, { runSoon = false } = {}) {
  let timer = null;
  let unrefed = false;
  let cancelled = false;

  const schedule = () => {
    if (cancelled) return;
    timer = nativeSetTimeout(async () => {
      try { await fn(); }
      catch (err) { console.warn('[jobs] midnight refresh failed:', err.message); }
      finally { schedule(); }
    }, msUntilNextMoscowMidnight());
    if (unrefed && timer?.unref) timer.unref();
  };

  if (runSoon) {
    timer = nativeSetTimeout(async () => {
      try { await fn(); }
      catch (err) { console.warn('[jobs] startup partner refresh failed:', err.message); }
      finally { schedule(); }
    }, 25_000);
  } else schedule();

  return {
    unref() { unrefed = true; timer?.unref?.(); return this; },
    ref() { unrefed = false; timer?.ref?.(); return this; },
    hasRef() { return timer?.hasRef?.() ?? !unrefed; },
    close() { cancelled = true; clearTimeout(timer); },
  };
}

// server.js currently asks for a recurring interval for importAllJobs(). Intercept only
// that named callback and align it to Moscow midnight. All unrelated intervals keep
// their normal semantics.
global.setInterval = function workroomInterval(fn, delay, ...args) {
  if (typeof fn === 'function' && fn.name === 'importAllJobs') {
    console.log('[jobs] built-in import scheduled for 00:00 Europe/Moscow');
    return scheduleAtMoscowMidnight(() => fn(...args));
  }
  return nativeSetInterval(fn, delay, ...args);
};

if (!process.env.DATABASE_URL) return;

const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 3,
});

const clean = (v = '', max = 2000) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const plain = (v = '', max = 4000) => clean(sanitizeHtml(String(v || ''), { allowedTags: [], allowedAttributes: {} }), max);
const safeRich = (v = '') => sanitizeHtml(String(v || ''), {
  allowedTags: ['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
  allowedAttributes: { a: ['href','target','rel'] },
  allowedSchemes: ['http','https','mailto'],
});

function isJobLike(text = '') {
  return /(ваканси|ищем|hiring|vacanc|job opening|join our team|career opportunity|работ[ау]|позици|designer|developer|engineer|маркетолог|дизайнер|разработчик|аналитик|product|marketing|gamedev|game dev|ui\/ux|ux\/ui)/i.test(text);
}
function sector(text = '') {
  const s = String(text).toLowerCase();
  if (/game|gaming|unity|unreal|gamedev|игр/.test(s)) return 'GameDev';
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
  if (/без опыта|no experience|intern|internship|trainee|стаж/.test(s)) return 'Без опыта';
  const m = s.match(/(\d{1,2})\s*(?:\+|[-–—]\s*(\d{1,2}))?\s*(?:years?|yrs?|лет|года|год)/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2] || a);
    if (a >= 6 || b >= 7) return '6+ лет';
    if (a >= 3 || b > 3) return '3–6 лет';
    if (a >= 1 || b >= 1) return '1–3 года';
  }
  if (/junior|jr\.?\b/.test(s)) return '1–3 года';
  if (/middle|mid[ -]?level/.test(s)) return '3–6 лет';
  if (/senior|sr\.?\b|principal|staff|lead|head|director|vp\b/.test(s)) return '6+ лет';
  return '';
}
function mode(text = '') {
  const s = String(text).toLowerCase();
  if (/hybrid|гибрид/.test(s)) return 'Hybrid';
  if (/remote|worldwide|anywhere|work from home|удален|удалён/.test(s)) return 'Remote';
  return 'Office';
}
function firstUrl(text = '') {
  const m = String(text).match(/https?:\/\/[^\s<>()]+/i);
  return m ? m[0].replace(/[.,;!?]+$/, '') : '';
}
function titleFromPost(text = '') {
  const lines = String(text).split(/\n+/).map(x => x.trim()).filter(Boolean);
  const likely = lines.find(line => /(ваканси|hiring|ищем|designer|developer|engineer|manager|маркетолог|дизайнер|разработчик|аналитик|product|marketing)/i.test(line));
  return clean((likely || lines[0] || 'Вакансия').replace(/^[-–—•*#\s]+/, ''), 240);
}
function looksRussian(text = '') {
  const letters = String(text).match(/[A-Za-zА-Яа-яЁё]/g) || [];
  const cyr = String(text).match(/[А-Яа-яЁё]/g) || [];
  return letters.length > 0 && cyr.length / letters.length > .35;
}

async function upsert(job) {
  if (!job.url || !job.title || !job.company) return 0;
  const haystack = `${job.title} ${job.summary || ''} ${job.description || ''}`;
  const summary = plain(job.summary || job.description || '', 500);
  const summaryRu = looksRussian(summary) ? summary : null;
  await pool.query(`
    INSERT INTO jobs(external_id,source,source_url,title,company,summary,summary_ru,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,is_active,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,NOW())
    ON CONFLICT(source_url) DO UPDATE SET
      external_id=EXCLUDED.external_id, source=EXCLUDED.source, title=EXCLUDED.title, company=EXCLUDED.company,
      summary_ru=CASE WHEN jobs.summary IS DISTINCT FROM EXCLUDED.summary THEN EXCLUDED.summary_ru ELSE COALESCE(jobs.summary_ru,EXCLUDED.summary_ru) END,
      summary=EXCLUDED.summary, description_html=EXCLUDED.description_html, experience=EXCLUDED.experience,
      work_mode=EXCLUDED.work_mode, salary=EXCLUDED.salary, location=EXCLUDED.location, sector=EXCLUDED.sector,
      employment_type=EXCLUDED.employment_type, published_at=EXCLUDED.published_at, is_active=TRUE, updated_at=NOW()
  `, [
    clean(job.id, 160), clean(job.source, 100), clean(job.url, 1000), clean(job.title, 240), clean(job.company, 180),
    summary, summaryRu, safeRich(job.description || summary), job.experience || experience(haystack),
    job.workMode || mode(`${job.location || ''} ${haystack}`), clean(job.salary, 120), clean(job.location, 160),
    job.sector || sector(haystack), clean(job.employmentType, 100), job.publishedAt || new Date(),
  ]);
  return 1;
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length || 1) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(workers);
}

function salaryHH(salary) {
  if (!salary) return '';
  const from = salary.from ? new Intl.NumberFormat('ru-RU').format(salary.from) : '';
  const to = salary.to ? new Intl.NumberFormat('ru-RU').format(salary.to) : '';
  const currency = salary.currency || '';
  if (from && to) return `${from}–${to} ${currency}`;
  if (from) return `от ${from} ${currency}`;
  if (to) return `до ${to} ${currency}`;
  return '';
}
function experienceHH(item) {
  const id = item?.experience?.id;
  if (id === 'noExperience') return 'Без опыта';
  if (id === 'between1And3') return '1–3 года';
  if (id === 'between3And6') return '3–6 лет';
  if (id === 'moreThan6') return '6+ лет';
  return experience(item?.experience?.name || '');
}

async function importHH() {
  const terms = (process.env.HH_JOB_SEARCH_TERMS || 'дизайнер,программист,разработчик,product manager,маркетолог,gamedev,data analyst,AI').split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);
  const headers = { accept: 'application/json', 'user-agent': `WORKROOM/1.0 (${process.env.ADMIN_EMAIL || 'jobs aggregator'})` };
  const byId = new Map();
  for (const term of terms) {
    try {
      const url = new URL('https://api.hh.ru/vacancies');
      url.searchParams.set('text', term);
      url.searchParams.set('period', '1');
      url.searchParams.set('order_by', 'publication_time');
      url.searchParams.set('per_page', '50');
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const item of data.items || []) byId.set(String(item.id), item);
    } catch (err) { console.warn(`[jobs] hh search '${term}' skipped:`, err.message); }
  }

  const items = [...byId.values()].slice(0, 180);
  let imported = 0;
  await mapLimit(items, 7, async (item) => {
    try {
      let detail = item;
      const r = await fetch(`https://api.hh.ru/vacancies/${encodeURIComponent(item.id)}`, { headers, signal: AbortSignal.timeout(12000) });
      if (r.ok) detail = await r.json();
      const description = detail.description || [item.snippet?.responsibility, item.snippet?.requirement].filter(Boolean).join('\n');
      const workText = [detail.schedule?.name, ...(detail.work_format || []).map(x => x.name), detail.address?.city].filter(Boolean).join(' ');
      imported += await upsert({
        id: `hh:${item.id}`,
        source: 'hh.ru',
        url: detail.alternate_url || item.alternate_url,
        title: detail.name || item.name,
        company: detail.employer?.name || item.employer?.name || 'Компания',
        summary: [item.snippet?.responsibility, item.snippet?.requirement].filter(Boolean).join(' · ') || plain(description, 500),
        description,
        experience: experienceHH(detail),
        workMode: mode(workText),
        salary: salaryHH(detail.salary || item.salary),
        location: detail.area?.name || item.area?.name || '',
        sector: sector(`${detail.name || item.name} ${description}`),
        employmentType: detail.employment?.name || item.employment?.name || '',
        publishedAt: detail.published_at ? new Date(detail.published_at) : new Date(),
      });
    } catch (err) { console.warn('[jobs] hh detail skipped:', err.message); }
  });
  console.log(`[jobs] hh.ru midnight import: ${imported}`);
}

async function importX() {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return;
  const accounts = (process.env.X_JOB_ACCOUNTS || '').split(',').map(x => x.trim().replace(/^@/, '')).filter(Boolean);
  let query = clean(process.env.X_JOB_QUERY || '', 800);
  if (!query && accounts.length) query = `(${accounts.slice(0,20).map(a => `from:${a}`).join(' OR ')}) (hiring OR vacancy OR job OR вакансия OR ищем) -is:retweet`;
  if (!query) return;
  try {
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', '100');
    url.searchParams.set('tweet.fields', 'created_at,entities,author_id');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,name');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${plain(await res.text(), 300)}`);
    const data = await res.json();
    const users = new Map((data.includes?.users || []).map(u => [u.id, u]));
    let imported = 0;
    for (const post of data.data || []) {
      if (!isJobLike(post.text)) continue;
      const author = users.get(post.author_id) || {};
      const expanded = post.entities?.urls?.map(u => u.expanded_url).find(Boolean) || '';
      const sourceUrl = expanded || (author.username ? `https://x.com/${author.username}/status/${post.id}` : '');
      imported += await upsert({
        id: `x:${post.id}`, source: 'X', url: sourceUrl, title: titleFromPost(post.text),
        company: author.name || author.username || 'X', summary: post.text, description: post.text,
        location: /remote|удален|удалён/i.test(post.text) ? 'Remote' : '', publishedAt: post.created_at ? new Date(post.created_at) : new Date(),
      });
    }
    console.log(`[jobs] X midnight import: ${imported}`);
  } catch (err) { console.warn('[jobs] X import skipped:', err.message); }
}

async function importTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const allowed = new Set((process.env.TELEGRAM_JOB_CHANNELS || '').split(',').map(x => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean));
  let offset;
  let imported = 0;
  try {
    for (let page = 0; page < 5; page++) {
      const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
      url.searchParams.set('limit', '100');
      url.searchParams.set('timeout', '0');
      url.searchParams.set('allowed_updates', JSON.stringify(['channel_post','edited_channel_post']));
      if (offset) url.searchParams.set('offset', String(offset));
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const updates = data.result || [];
      if (!updates.length) break;
      for (const update of updates) {
        offset = Math.max(offset || 0, Number(update.update_id) + 1);
        const msg = update.channel_post || update.edited_channel_post;
        if (!msg) continue;
        const username = String(msg.chat?.username || '').toLowerCase();
        const chatId = String(msg.chat?.id || '');
        if (allowed.size && !allowed.has(username) && !allowed.has(chatId.toLowerCase())) continue;
        const text = msg.text || msg.caption || '';
        if (!isJobLike(text) || !username) continue;
        const telegramUrl = `https://t.me/${username}/${msg.message_id}`;
        imported += await upsert({
          id: `tg:${chatId}:${msg.message_id}`, source: 'Telegram', url: telegramUrl,
          title: titleFromPost(text), company: msg.chat?.title || `@${username}`, summary: text, description: text,
          location: /remote|удален|удалён/i.test(text) ? 'Remote' : '', publishedAt: msg.date ? new Date(msg.date * 1000) : new Date(),
        });
      }
      if (updates.length < 100) break;
    }
    console.log(`[jobs] Telegram midnight import: ${imported}`);
  } catch (err) { console.warn('[jobs] Telegram import skipped:', err.message); }
}

async function importInstagram() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const ids = (process.env.INSTAGRAM_JOB_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!token || !ids.length) return;
  let imported = 0;
  for (const id of ids) {
    try {
      const url = new URL(`https://graph.instagram.com/${encodeURIComponent(id)}/media`);
      url.searchParams.set('fields', 'id,caption,permalink,timestamp,username');
      url.searchParams.set('limit', '50');
      url.searchParams.set('access_token', token);
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${plain(await res.text(), 250)}`);
      const data = await res.json();
      for (const media of data.data || []) {
        const text = media.caption || '';
        if (!isJobLike(text) || !media.permalink) continue;
        imported += await upsert({
          id: `ig:${media.id}`, source: 'Instagram', url: media.permalink,
          title: titleFromPost(text), company: media.username ? `@${media.username}` : 'Instagram',
          summary: text, description: text, location: /remote|удален|удалён/i.test(text) ? 'Remote' : '',
          publishedAt: media.timestamp ? new Date(media.timestamp) : new Date(),
        });
      }
    } catch (err) { console.warn(`[jobs] Instagram source ${id} skipped:`, err.message); }
  }
  console.log(`[jobs] Instagram midnight import: ${imported}`);
}

async function partnerRefresh() {
  await Promise.allSettled([importHH(), importX(), importTelegram(), importInstagram()]);
  // Only keep reasonably fresh imported vacancies visible. Admin/manual entries are untouched.
  const days = Math.max(7, Math.min(120, Number(process.env.JOB_MAX_AGE_DAYS || 45)));
  await pool.query(`UPDATE jobs SET is_active=FALSE,updated_at=NOW()
    WHERE is_active=TRUE AND source NOT IN ('Manual','Direct')
      AND COALESCE(published_at,created_at) < NOW() - ($1::text || ' days')::interval`, [String(days)]).catch(() => {});
}

scheduleAtMoscowMidnight(partnerRefresh, { runSoon: true }).unref();
process.on('exit', () => pool.end().catch(() => {}));
