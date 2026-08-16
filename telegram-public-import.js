// WORK//ROOM approved public Telegram channel importer.
// Uses Telegram's public channel preview pages so the initial backlog can be
// imported even before a bot is added to every channel. New posts are refreshed
// daily around Moscow midnight. Only the allowlisted channels are read.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

if (!process.env.DATABASE_URL) return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 2,
});

const DEFAULT_CHANNELS = [
  'mirkreatorovjob',
  'designhunters',
  'jun_hi_vacancies',
  'serbia_vacancies',
  'rabotavserbii',
  'desivr_design',
];

const channels = (process.env.TELEGRAM_JOB_CHANNELS || DEFAULT_CHANNELS.join(','))
  .split(',').map(x => x.trim().replace(/^@/, '')).filter(Boolean);

const clean = (v = '', max = 2000) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const plain = (html = '', max = 5000) => clean(sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} }), max);
const rich = (html = '') => sanitizeHtml(String(html || ''), {
  allowedTags: ['p','br','ul','ol','li','strong','b','em','i','a','code','pre'],
  allowedAttributes: { a: ['href','target','rel'] },
  allowedSchemes: ['http','https','mailto','tg'],
});

function isJobLike(text = '') {
  return /(ваканси|ищем|hiring|vacanc|job opening|join our team|позици|работа|designer|developer|engineer|manager|маркетолог|дизайнер|разработчик|аналитик|product|marketing|motion|creator|gamedev|igaming|ui\/ux|ux\/ui|artist|animator)/i.test(text);
}
function sector(text = '') {
  const s = String(text).toLowerCase();
  if (/game|gaming|unity|unreal|gamedev|igaming|игр/.test(s)) return 'GameDev';
  if (/ui\b|ux\b|product design|interaction design/.test(s)) return 'UI/UX';
  if (/graphic|brand design|visual design|illustrat|creative design|motion|3d artist|2d artist|animator|графическ|бренд/.test(s)) return 'Graphic Design';
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
function workMode(text = '') {
  const s = String(text).toLowerCase();
  if (/hybrid|гибрид/.test(s)) return 'Hybrid';
  if (/remote|worldwide|anywhere|work from home|удален|удалён|удаленно|удалённо/.test(s)) return 'Remote';
  return 'Office';
}
function salary(text = '') {
  const patterns = [
    /(?:зарплат\w*|вилка|зп|salary|compensation|оплата)\s*[:—-]?\s*([^\n•;]{2,90})/i,
    /((?:от|from)?\s*[\d\s.,]{2,12}\s*(?:–|-|до|to)\s*[\d\s.,]{2,12}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD))/i,
    /((?:от|from)\s*[\d\s.,]{2,12}\s*(?:₽|руб\.?|RUB|USD|\$|EUR|€|RSD))/i,
  ];
  for (const re of patterns) { const m = String(text).match(re); if (m) return clean(m[1], 120); }
  return '';
}
function location(text = '') {
  const s = String(text);
  if (/remote|worldwide|anywhere|удален|удалён/i.test(s)) return 'Remote';
  const m = s.match(/(?:локация|город|location|офис|based in)\s*[:—-]\s*([^\n•;]{2,80})/i);
  if (m) return clean(m[1], 160);
  if (/серби|belgrade|белград/i.test(s)) return 'Serbia';
  if (/москв|moscow/i.test(s)) return 'Moscow';
  if (/петербург|санкт-петербург|saint petersburg|st\.? petersburg/i.test(s)) return 'Saint Petersburg';
  return '';
}
function title(text = '') {
  const lines = String(text).split(/\n+/).map(x => x.trim()).filter(Boolean);
  const likely = lines.find(line => /(designer|developer|engineer|manager|artist|animator|creator|marketer|аналитик|дизайнер|разработчик|маркетолог|продюсер|product|marketing|motion|gamedev|igaming)/i.test(line));
  return clean((likely || lines[0] || 'Вакансия').replace(/^[-–—•*#\s]+/, ''), 240);
}
function company(text = '', channel = '') {
  const patterns = [/(?:компания|company|студия|agency|агентство)\s*[:—-]\s*([^\n•;]{2,80})/i,/\bв\s+(?:команду\s+)?([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9._-]{2,40})/];
  for (const re of patterns) { const m = String(text).match(re); if (m) return clean(m[1], 100); }
  return `@${channel}`;
}

function parsePosts(html, channel) {
  const markers = [];
  const re = /data-post="([^"]+\/(\d+))"/g;
  let m;
  while ((m = re.exec(html))) markers.push({ start:m.index, post:m[1], id:m[2] });
  const posts = [];
  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    const segment = html.slice(current.start, markers[i + 1]?.start || html.length);
    const textMatch = segment.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);
    if (!textMatch) continue;
    const text = plain(textMatch[1], 7000);
    if (!isJobLike(text)) continue;
    const dt = segment.match(/<time[^>]+datetime="([^"]+)"/i)?.[1];
    const publishedAt = dt ? new Date(dt) : new Date();
    if (Number.isFinite(publishedAt.getTime()) && Date.now() - publishedAt.getTime() > 12 * 24 * 60 * 60 * 1000) continue;
    posts.push({ id:current.id, post:current.post, text, html:textMatch[1], publishedAt });
  }
  return posts;
}

async function upsert(channel, post) {
  const sourceUrl = `https://t.me/${post.post}`;
  const role = title(post.text);
  const employer = company(post.text, channel);
  await pool.query(`
    INSERT INTO jobs(external_id,source,source_url,title,company,summary,summary_ru,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,is_active,updated_at)
    VALUES($1,'Telegram',$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,'',$12,TRUE,NOW())
    ON CONFLICT(source_url) DO UPDATE SET
      title=EXCLUDED.title,company=EXCLUDED.company,summary=EXCLUDED.summary,summary_ru=EXCLUDED.summary_ru,
      description_html=EXCLUDED.description_html,experience=EXCLUDED.experience,work_mode=EXCLUDED.work_mode,
      salary=EXCLUDED.salary,location=EXCLUDED.location,sector=EXCLUDED.sector,published_at=EXCLUDED.published_at,
      is_active=TRUE,updated_at=NOW()
  `, [
    `tg-public:${channel}:${post.id}`, sourceUrl, role, employer, clean(post.text,500), rich(post.html),
    experience(post.text), workMode(post.text), salary(post.text), location(post.text), sector(post.text), post.publishedAt,
  ]);
}

async function importChannel(channel) {
  const url = `https://t.me/s/${encodeURIComponent(channel)}`;
  const res = await fetch(url, {
    headers: { 'user-agent':'Mozilla/5.0 WORKROOM vacancy indexer', accept:'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const posts = parsePosts(html, channel);
  for (const post of posts) await upsert(channel, post);
  console.log(`[telegram-public] @${channel}: ${posts.length} vacancy posts`);
  return posts.length;
}

async function refresh() {
  let total = 0;
  for (const channel of channels) {
    try { total += await importChannel(channel); }
    catch (err) { console.warn(`[telegram-public] @${channel} skipped:`, err.message); }
  }
  console.log(`[telegram-public] refresh complete: ${total}`);
}

function msUntilMoscow(hour = 0, minute = 3) {
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  let target = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), hour, minute) - 3 * 60 * 60 * 1000;
  if (target <= Date.now()) target += 24 * 60 * 60 * 1000;
  return target - Date.now();
}
function schedule() {
  setTimeout(async () => { try { await refresh(); } finally { schedule(); } }, msUntilMoscow()).unref();
}

setTimeout(refresh, 45_000).unref();
schedule();
process.on('exit', () => pool.end().catch(() => {}));
