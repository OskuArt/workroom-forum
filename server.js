require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'] });

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const SITE_NAME = process.env.SITE_NAME || 'WORK//ROOM';
const isProduction = process.env.NODE_ENV === 'production';

const APPLICATION_STATUS_LABELS = {
  want: 'Сохранено',
  waiting: 'В ожидании',
  interview: 'Собеседование',
  offer: 'Оффер',
  rejected: 'Отказ',
  not_fit: 'Не подошло',
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' || (isProduction && !process.env.DATABASE_SSL)
    ? { rejectUnauthorized: false }
    : false,
});

function q(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProduction ? '1d' : 0 }));

const sessionMiddleware = session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'development-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});
app.use(sessionMiddleware);

io.engine.use(sessionMiddleware);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 80, standardHeaders: true, legacyHeaders: false });

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      const expected = new URL(BASE_URL);
      if (origin.host !== expected.host && isProduction) return res.status(403).send('Invalid origin');
    } catch (_) {
      if (isProduction) return res.status(403).send('Invalid origin');
    }
  }
  next();
});

function flash(req, type, message) {
  req.session.flash = { type, message };
}

app.use(async (req, res, next) => {
  try {
    res.locals.siteName = SITE_NAME;
    res.locals.currentPath = req.path;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.user = null;
    res.locals.unreadCount = 0;
    res.locals.pendingFriendCount = 0;
    res.locals.applicationStatusLabels = APPLICATION_STATUS_LABELS;

    if (req.session.userId) {
      const { rows } = await q('SELECT * FROM users WHERE id=$1', [req.session.userId]);
      const user = rows[0];
      if (!user || user.is_banned) {
        req.session.destroy(() => {});
      } else {
        req.user = user;
        res.locals.user = user;
        const unread = await q(`
          SELECT COUNT(*)::int AS c
          FROM messages m
          WHERE m.receiver_id=$1 AND m.read_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM mutes mu WHERE mu.user_id=$1 AND mu.muted_user_id=m.sender_id)
        `, [user.id]);
        res.locals.unreadCount = unread.rows[0].c;
        const pending = await q('SELECT COUNT(*)::int AS c FROM friendships WHERE addressee_id=$1 AND status=\'pending\'', [user.id]);
        res.locals.pendingFriendCount = pending.rows[0].c;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    flash(req, 'info', 'Сначала войдите в аккаунт.');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).render('error', { title: 'Нет доступа', message: 'Эта зона только для администратора.' });
  next();
}

function cleanText(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function safeHttpUrl(value) {
  const raw = cleanText(value, 1200);
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch (_) { return ''; }
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] && entity[1].toLowerCase() === 'x';
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(named, entity.toLowerCase()) ? named[entity.toLowerCase()] : match;
  });
}

function stripHtml(value) {
  const decoded = decodeHtmlEntities(value);
  return decodeHtmlEntities(sanitizeHtml(decoded, { allowedTags: [], allowedAttributes: {} }))
    .replace(/\s+/g, ' ')
    .trim();
}

function safeRichHtml(value) {
  return sanitizeHtml(decodeHtmlEntities(value), {
    allowedTags: ['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
    allowedAttributes: { a: ['href','target','rel'] },
    allowedSchemes: ['http','https','mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}


function normalizedField(value, max = 240) {
  return cleanText(stripHtml(value), max);
}

function inferWorkMode({ remote, title = '', description = '', tags = [], location = '' }) {
  const haystack = `${title} ${description} ${Array.isArray(tags) ? tags.join(' ') : tags} ${location}`.toLowerCase();
  if (/\bhybrid\b|гибрид|hybride|[1-4]\s+days?[^.]{0,35}(office|on[- ]?site)|(office|on[- ]?site)[^.]{0,35}[1-4]\s+days?/.test(haystack)) return 'Hybrid';
  if (remote === true) return 'Remote';
  if (remote == null && /\bremote\b|home[ -]?office|work from home|fully remote/.test(haystack)) return 'Remote';
  return 'Office';
}

const EXPERIENCE_BANDS = ['Без опыта', '1–3 года', '3–6 лет', '6+ лет'];

function inferExperienceBand(title = '', tags = [], description = '') {
  const haystack = `${title} ${Array.isArray(tags) ? tags.join(' ') : tags} ${stripHtml(description)}`.toLowerCase();
  const yearMatches = [...haystack.matchAll(/(\d{1,2})(?:\s*[–—-]\s*(\d{1,2}))?\s*(\+)?\s*(?:years?|yrs?|лет|года|год)/g)];
  if (yearMatches.length) {
    let strongestBand = '';
    for (const match of yearMatches) {
      const min = Number(match[1] || 0);
      const max = Number(match[2] || 0);
      const plus = Boolean(match[3]);
      let band = '';
      if (min >= 6 || max >= 7) band = '6+ лет';
      else if (min >= 3 || (plus && min >= 3) || max > 3) band = '3–6 лет';
      else if (min >= 1 || max >= 1) band = '1–3 года';
      else band = 'Без опыта';
      if (band === '6+ лет') return band;
      if (band === '3–6 лет') strongestBand = band;
      else if (!strongestBand && band) strongestBand = band;
    }
    if (strongestBand) return strongestBand;
  }
  if (/no experience|без опыта|intern|internship|trainee|стаж|graduate|entry[ -]?level/.test(haystack)) return 'Без опыта';
  if (/junior|jr\.?\b/.test(haystack)) return '1–3 года';
  if (/middle|mid[ -]?level/.test(haystack)) return '3–6 лет';
  if (/senior|sr\.?\b|principal|staff|lead|head|director|vp\b/.test(haystack)) return '6+ лет';
  return '';
}

function looksRussian(value) {
  const text = String(value || '');
  if (!text) return false;
  const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  const cyr = text.match(/[А-Яа-яЁё]/g) || [];
  return letters.length > 0 && cyr.length / letters.length >= 0.35;
}

const translationCache = new Map();
async function translateSummaryToRussian(value) {
  const text = cleanText(stripHtml(value), 500);
  if (!text || looksRussian(text)) return text;
  if (translationCache.has(text)) return translationCache.get(text);
  try {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', 'ru');
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);
    const response = await fetch(url, { headers: { 'User-Agent': `${SITE_NAME}/1.0` }, signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw new Error(`translate HTTP ${response.status}`);
    const payload = await response.json();
    const translated = cleanText(Array.isArray(payload?.[0]) ? payload[0].map(part => part?.[0] || '').join('') : '', 500);
    const result = translated || text;
    translationCache.set(text, result);
    return result;
  } catch (err) {
    console.warn('[jobs] summary translation skipped:', err.message);
    translationCache.set(text, text);
    return text;
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function normalizeExistingJobExperience() {
  const { rows } = await q(`SELECT id,title,experience,description_html FROM jobs WHERE is_active=TRUE`);
  const updates = [];
  for (const row of rows) {
    if (EXPERIENCE_BANDS.includes(row.experience)) continue;
    const band = inferExperienceBand(row.title, [row.experience || ''], row.description_html || '');
    if (band && band !== row.experience) updates.push({ id: row.id, band });
  }
  await mapWithConcurrency(updates, 8, ({ id, band }) => q('UPDATE jobs SET experience=$1 WHERE id=$2', [band, id]));
}

async function backfillRussianSummaries(limit = 320) {
  const { rows } = await q(`SELECT id,summary FROM jobs WHERE is_active=TRUE AND COALESCE(summary,'')<>'' AND COALESCE(summary_ru,'')='' ORDER BY COALESCE(published_at,created_at) DESC LIMIT $1`, [limit]);
  await mapWithConcurrency(rows, 5, async (job) => {
    const translated = await translateSummaryToRussian(job.summary);
    await q('UPDATE jobs SET summary_ru=$1 WHERE id=$2', [translated, job.id]);
  });
  if (rows.length) console.log(`[jobs] translated ${rows.length} short summaries to Russian`);
}

function normalizeSector(title = '', tags = [], description = '') {
  const haystack = `${title} ${Array.isArray(tags) ? tags.join(' ') : tags} ${description}`.toLowerCase();
  const rules = [
    ['GameDev', /game|gaming|unity|unreal|gamedev|игр/],
    ['UI/UX', /ui\b|ux\b|user experience|product design|interaction design/],
    ['Graphic Design', /graphic|brand design|visual design|illustrat|motion design|creative design/],
    ['Data / AI', /machine learning|artificial intelligence|\bai\b|data scientist|data engineer|analytics|llm/],
    ['Engineering', /software|developer|engineer|frontend|front-end|backend|back-end|fullstack|full-stack|devops|qa\b|cyber|security|ios|android|java|python|javascript|typescript|react|node/],
    ['Product', /product manager|product owner|product management/],
    ['Marketing', /marketing|growth|seo|content|social media|performance|crm|communications|copywriter/],
    ['Sales', /sales|business development|account executive|customer success/],
    ['Finance', /finance|accounting|fintech|financial/],
  ];
  for (const [label, re] of rules) if (re.test(haystack)) return label;
  if (Array.isArray(tags) && tags.length) return normalizedField(tags[0], 80) || 'Digital';
  return 'Digital';
}

function isRelevantDigitalJob(title = '', tags = [], _description = '') {
  const haystack = `${title} ${Array.isArray(tags) ? tags.join(' ') : tags}`.toLowerCase();
  return /(design|designer|ux\b|ui\b|product|software|developer|engineer|frontend|backend|fullstack|devops|data|machine learning|artificial intelligence|\bai\b|marketing|growth|seo|game|gaming|creative|content|brand|motion|qa\b|cyber|security|mobile|ios|android|fintech|sales|customer success)/.test(haystack);
}

async function attachApplicationStatuses(user, jobs) {
  if (!user || !jobs.length) return jobs;
  const ids = jobs.map(j => Number(j.id)).filter(Number.isFinite);
  if (!ids.length) return jobs;
  const { rows } = await q('SELECT job_id,status FROM applications WHERE user_id=$1 AND job_id=ANY($2::bigint[])', [user.id, ids]);
  const statusByJob = new Map(rows.map(r => [String(r.job_id), r.status]));
  return jobs.map(job => ({ ...job, application_status: statusByJob.get(String(job.id)) || null }));
}

function slugify(value) {
  const s = String(value || '').toLowerCase().trim()
    .replace(/[^a-z0-9а-яё_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || `group-${crypto.randomBytes(4).toString('hex')}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Поддерживаются JPG, PNG, WEBP и GIF.'), ok);
  },
});

async function saveMedia(userId, file) {
  if (!file) return null;
  const { rows } = await q(
    'INSERT INTO media(owner_id,mime,size_bytes,data) VALUES($1,$2,$3,$4) RETURNING id',
    [userId, file.mimetype, file.size, file.buffer]
  );
  return rows[0].id;
}

async function areFriends(a, b) {
  if (!a || !b || Number(a) === Number(b)) return Number(a) === Number(b);
  const { rowCount } = await q(`
    SELECT 1 FROM friendships
    WHERE status='accepted'
      AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))
    LIMIT 1
  `, [a, b]);
  return rowCount > 0;
}

async function friendshipBetween(a, b) {
  const { rows } = await q(`
    SELECT * FROM friendships
    WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)
    ORDER BY id DESC LIMIT 1
  `, [a, b]);
  return rows[0] || null;
}

async function blockedEitherWay(a, b) {
  const { rowCount } = await q(`
    SELECT 1 FROM blocks
    WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)
    LIMIT 1
  `, [a, b]);
  return rowCount > 0;
}

function verificationMail(email, code, token) {
  const link = `${BASE_URL}/verify?token=${encodeURIComponent(token)}`;
  return {
    subject: `${SITE_NAME}: подтвердите почту`,
    text: `Код подтверждения: ${code}\n\nИли откройте ссылку: ${link}\nКод действует 30 минут.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1>${SITE_NAME}</h1><p>Код подтверждения:</p><div style="font-size:36px;font-weight:700;letter-spacing:8px">${code}</div><p style="margin:28px 0"><a href="${link}" style="background:#111;color:#fff;padding:14px 18px;text-decoration:none;border-radius:999px">Подтвердить аккаунт</a></p><p>Код и ссылка действуют 30 минут.</p></div>`,
  };
}

async function sendVerification(email, code, token) {
  const mail = verificationMail(email, code, token);

  // HTTPS email delivery works on Render Free, where common SMTP ports are blocked.
  if (process.env.RESEND_API_KEY) {
    const from = cleanText(process.env.RESEND_FROM || process.env.SMTP_FROM, 240);
    if (!from) throw new Error('RESEND_FROM is required when RESEND_API_KEY is configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [email], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const detail = cleanText(await response.text(), 1000);
      throw new Error(`Email API error ${response.status}: ${detail}`);
    }
    return { dev: false };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      ...mail,
    });
    return { dev: false };
  }

  if (!isProduction) {
    console.log(`\n[DEV MAIL] ${email}\nCODE: ${code}\nLINK: ${BASE_URL}/verify?token=${token}\n`);
    return { dev: true };
  }

  throw new Error('Email delivery is not configured. Set RESEND_API_KEY + RESEND_FROM or SMTP settings.');
}

async function createVerificationForUser(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  await q('UPDATE users SET verification_code=$1, verification_token=$2, verification_expires=$3 WHERE id=$4', [code, token, expires, user.id]);
  const result = await sendVerification(user.email, code, token);
  return { code, token, dev: result.dev };
}

async function importJobicy() {
  if (String(process.env.ENABLE_JOB_IMPORT || 'true') !== 'true') return 0;
  try {
    const response = await fetch('https://jobicy.com/api/v2/remote-jobs?count=100', { headers: { 'User-Agent': `${SITE_NAME}/1.0` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Jobicy HTTP ${response.status}`);
    const data = await response.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    for (const job of jobs) {
      const url = job.url || job.jobUrl;
      if (!url) continue;
      const title = normalizedField(job.jobTitle || job.title, 240);
      const company = normalizedField(job.companyName || job.company || 'Компания', 180);
      const descRaw = job.jobDescription || job.description || '';
      const descriptionHtml = safeRichHtml(descRaw);
      const excerpt = normalizedField(job.jobExcerpt || stripHtml(descRaw).slice(0, 420), 500);
      let salary = normalizedField(job.salary || '', 120);
      if (!salary && (job.annualSalaryMin || job.annualSalaryMax)) {
        const min = job.annualSalaryMin || '?';
        const max = job.annualSalaryMax || '?';
        salary = `${job.salaryCurrency || ''} ${min}–${max}/yr`.trim();
      }
      const published = job.pubDate ? new Date(job.pubDate) : new Date();
      const sector = normalizedField(job.jobIndustry || job.industry || '', 120) || normalizeSector(title, [], descRaw);
      await q(`
        INSERT INTO jobs(external_id,source,source_url,title,company,summary,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,is_active,updated_at)
        VALUES($1,'Jobicy',$2,$3,$4,$5,$6,$7,'Remote',$8,$9,$10,$11,$12,TRUE,NOW())
        ON CONFLICT(source_url) DO UPDATE SET
          title=EXCLUDED.title, company=EXCLUDED.company,
          summary_ru=CASE WHEN jobs.summary IS DISTINCT FROM EXCLUDED.summary THEN NULL ELSE jobs.summary_ru END,
          summary=EXCLUDED.summary, description_html=EXCLUDED.description_html, experience=EXCLUDED.experience,
          work_mode=EXCLUDED.work_mode, salary=EXCLUDED.salary, location=EXCLUDED.location, sector=EXCLUDED.sector,
          employment_type=EXCLUDED.employment_type, published_at=EXCLUDED.published_at,
          is_active=TRUE, updated_at=NOW()
      `, [
        cleanText(job.id || job.jobId || '', 100), url, title, company, excerpt, descriptionHtml,
        inferExperienceBand(title, [job.jobLevel || job.level || ''], descRaw), salary,
        normalizedField(job.jobGeo || job.location || 'Worldwide', 160), sector,
        normalizedField(job.jobType || job.employmentType || '', 100), published,
      ]);
    }
    console.log(`[jobs] Jobicy import complete: ${jobs.length} records checked`);
    return jobs.length;
  } catch (err) {
    console.error('[jobs] Jobicy import failed:', err.message);
    return 0;
  }
}

async function importArbeitnow() {
  if (String(process.env.ENABLE_JOB_IMPORT || 'true') !== 'true') return 0;
  const pages = Math.max(1, Math.min(8, Number(process.env.ARBEITNOW_IMPORT_PAGES || 4)));
  let imported = 0;
  try {
    for (let page = 1; page <= pages; page += 1) {
      const response = await fetch(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, { headers: { 'User-Agent': `${SITE_NAME}/1.0` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Arbeitnow HTTP ${response.status}`);
      const payload = await response.json();
      const jobs = Array.isArray(payload.data) ? payload.data : [];
      for (const job of jobs) {
        const title = normalizedField(job.title || '', 240);
        const company = normalizedField(job.company_name || job.company || 'Компания', 180);
        const tags = Array.isArray(job.tags) ? job.tags.map(x => normalizedField(x, 80)).filter(Boolean) : [];
        const jobTypes = Array.isArray(job.job_types) ? job.job_types.map(x => normalizedField(x, 80)).filter(Boolean) : [];
        const descRaw = job.description || '';
        if (!title || !isRelevantDigitalJob(title, tags, descRaw)) continue;
        const url = safeHttpUrl(job.url || '');
        if (!url) continue;
        const location = normalizedField(job.location || 'Germany', 160) || 'Germany';
        const workMode = inferWorkMode({ remote: Boolean(job.remote), title, description: descRaw, tags, location });
        const sector = normalizeSector(title, tags, descRaw);
        const experience = inferExperienceBand(title, tags, descRaw);
        const descriptionHtml = safeRichHtml(descRaw);
        const excerpt = normalizedField(stripHtml(descRaw).slice(0, 430), 500);
        let published = new Date();
        if (job.created_at) {
          const raw = Number(job.created_at);
          const candidate = Number.isFinite(raw) ? new Date(raw < 10_000_000_000 ? raw * 1000 : raw) : new Date(job.created_at);
          if (!Number.isNaN(candidate.getTime())) published = candidate;
        }
        await q(`
          INSERT INTO jobs(external_id,source,source_url,title,company,summary,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,is_active,updated_at)
          VALUES($1,'Arbeitnow',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,NOW())
          ON CONFLICT(source_url) DO UPDATE SET
            title=EXCLUDED.title, company=EXCLUDED.company,
            summary_ru=CASE WHEN jobs.summary IS DISTINCT FROM EXCLUDED.summary THEN NULL ELSE jobs.summary_ru END,
            summary=EXCLUDED.summary, description_html=EXCLUDED.description_html, experience=EXCLUDED.experience,
            work_mode=EXCLUDED.work_mode, location=EXCLUDED.location, sector=EXCLUDED.sector,
            employment_type=EXCLUDED.employment_type, published_at=EXCLUDED.published_at,
            is_active=TRUE, updated_at=NOW()
        `, [
          cleanText(job.slug || job.id || '', 120), url, title, company, excerpt, descriptionHtml,
          experience, workMode, '', location, sector, jobTypes.join(', '), published,
        ]);
        imported += 1;
      }
      if (!jobs.length) break;
    }
    console.log(`[jobs] Arbeitnow import complete: ${imported} relevant records imported`);
    return imported;
  } catch (err) {
    console.error('[jobs] Arbeitnow import failed:', err.message);
    return imported;
  }
}

async function importAllJobs() {
  const [jobicy, arbeitnow] = await Promise.all([importJobicy(), importArbeitnow()]);
  await q("UPDATE jobs SET sector=REPLACE(REPLACE(sector,'&amp;','&'),'&#38;','&') WHERE sector LIKE '%&amp;%' OR sector LIKE '%&#38;%' ").catch(() => {});
  await normalizeExistingJobExperience().catch(err => console.warn('[jobs] experience normalization skipped:', err.message));
  await backfillRussianSummaries().catch(err => console.warn('[jobs] summary translation pass skipped:', err.message));
  return jobicy + arbeitnow;
}

app.get('/media/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT mime,data FROM media WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).end();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].data);
  } catch (err) { next(err); }
});

app.get('/healthz', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.status(200).type('text/plain').send('ok');
  } catch (_) {
    res.status(503).type('text/plain').send('database unavailable');
  }
});

app.get('/', async (req, res, next) => {
  try {
    let jobs = (await q(`SELECT * FROM jobs WHERE is_active=TRUE ORDER BY featured DESC, COALESCE(published_at,created_at) DESC LIMIT 6`)).rows;
    jobs = await attachApplicationStatuses(req.user, jobs);
    res.render('landing', { title: 'Работа, люди и профессиональные связи', jobs });
  } catch (err) { next(err); }
});

// AUTH
app.get('/register', (req, res) => res.render('auth/register', { title: 'Регистрация' }));
app.post('/register', authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 240).toLowerCase();
    const password = String(req.body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) { flash(req, 'error', 'Проверьте адрес почты.'); return res.redirect('/register'); }
    if (password.length < 8) { flash(req, 'error', 'Пароль должен содержать минимум 8 символов.'); return res.redirect('/register'); }
    const exists = await q('SELECT id,email_verified FROM users WHERE email=$1', [email]);
    if (exists.rows[0]) {
      if (exists.rows[0].email_verified) { flash(req, 'error', 'Аккаунт с этой почтой уже существует.'); return res.redirect('/login'); }
      const user = (await q('SELECT * FROM users WHERE id=$1', [exists.rows[0].id])).rows[0];
      const sent = await createVerificationForUser(user);
      req.session.verifyEmail = email;
      if (sent.dev) flash(req, 'info', `DEV: код ${sent.code}. В продакшене он уйдёт на почту.`);
      return res.redirect('/verify');
    }
    const hash = await bcrypt.hash(password, 12);
    const admin = process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL.toLowerCase();
    const { rows } = await q('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING *', [email, hash, admin ? 'admin' : 'user']);
    const sent = await createVerificationForUser(rows[0]);
    req.session.verifyEmail = email;
    if (sent.dev) flash(req, 'info', `DEV: код ${sent.code}. В продакшене он уйдёт на почту.`);
    res.redirect('/verify');
  } catch (err) { next(err); }
});

app.get('/verify', async (req, res, next) => {
  try {
    if (req.query.token) {
      const { rows } = await q('SELECT * FROM users WHERE verification_token=$1 AND verification_expires>NOW()', [req.query.token]);
      if (!rows[0]) { flash(req, 'error', 'Ссылка устарела или недействительна.'); return res.redirect('/verify'); }
      await q('UPDATE users SET email_verified=TRUE,verification_code=NULL,verification_token=NULL,verification_expires=NULL WHERE id=$1', [rows[0].id]);
      req.session.userId = rows[0].id;
      delete req.session.verifyEmail;
      flash(req, 'success', 'Почта подтверждена. Теперь соберём профиль.');
      return res.redirect('/settings/profile');
    }
    res.render('auth/verify', { title: 'Подтверждение почты', email: req.session.verifyEmail || '' });
  } catch (err) { next(err); }
});

app.post('/verify', authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email || req.session.verifyEmail, 240).toLowerCase();
    const code = cleanText(req.body.code, 10);
    const { rows } = await q('SELECT * FROM users WHERE email=$1 AND verification_code=$2 AND verification_expires>NOW()', [email, code]);
    if (!rows[0]) { flash(req, 'error', 'Неверный или просроченный код.'); return res.redirect('/verify'); }
    await q('UPDATE users SET email_verified=TRUE,verification_code=NULL,verification_token=NULL,verification_expires=NULL WHERE id=$1', [rows[0].id]);
    req.session.userId = rows[0].id;
    delete req.session.verifyEmail;
    flash(req, 'success', 'Готово. Аккаунт подтверждён.');
    res.redirect('/settings/profile');
  } catch (err) { next(err); }
});

app.post('/verify/resend', authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email || req.session.verifyEmail, 240).toLowerCase();
    const { rows } = await q('SELECT * FROM users WHERE email=$1 AND email_verified=FALSE', [email]);
    if (rows[0]) {
      const sent = await createVerificationForUser(rows[0]);
      if (sent.dev) flash(req, 'info', `DEV: новый код ${sent.code}`); else flash(req, 'success', 'Новый код отправлен.');
    }
    res.redirect('/verify');
  } catch (err) { next(err); }
});

app.get('/login', (req, res) => res.render('auth/login', { title: 'Вход' }));
app.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 240).toLowerCase();
    const { rows } = await q('SELECT * FROM users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      flash(req, 'error', 'Неверная почта или пароль.'); return res.redirect('/login');
    }
    if (user.is_banned) { flash(req, 'error', 'Аккаунт заблокирован.'); return res.redirect('/login'); }
    if (!user.email_verified) {
      req.session.verifyEmail = user.email;
      flash(req, 'info', 'Сначала подтвердите почту.'); return res.redirect('/verify');
    }
    req.session.userId = user.id;
    const target = req.session.returnTo || (user.username ? '/jobs' : '/settings/profile');
    delete req.session.returnTo;
    res.redirect(target);
  } catch (err) { next(err); }
});

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// PROFILE
app.get('/settings/profile', requireAuth, async (req, res) => {
  res.render('profile/edit', { title: 'Редактировать профиль', profile: req.user });
});

app.post('/settings/profile', requireAuth, writeLimiter, upload.single('avatar'), async (req, res, next) => {
  try {
    let username = cleanText(req.body.username, 40).toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_.-]{3,40}$/.test(username)) {
      flash(req, 'error', 'Ник: 3–40 символов, латиница, цифры, точка, _ или -.'); return res.redirect('/settings/profile');
    }
    const avatar = await saveMedia(req.user.id, req.file);
    const fields = [
      cleanText(req.body.name, 120), username, cleanText(req.body.bio, 1200), cleanText(req.body.tg, 120),
      safeHttpUrl(req.body.vk), cleanText(req.body.contact_email, 240).toLowerCase(), cleanText(req.body.phone, 80), req.body.birth_date || null,
      cleanText(req.body.location, 160), cleanText(req.body.profession, 160),
      ['public','friends','private'].includes(req.body.wall_privacy) ? req.body.wall_privacy : 'public',
      req.body.open_to_work === 'on', req.user.id,
    ];
    const avatarSql = avatar ? ',avatar_media_id=$14' : '';
    if (avatar) fields.push(avatar);
    await q(`UPDATE users SET name=$1,username=$2,bio=$3,tg=$4,vk=$5,contact_email=$6,phone=$7,birth_date=$8,location=$9,profession=$10,wall_privacy=$11,open_to_work=$12${avatarSql} WHERE id=$13`, fields);
    flash(req, 'success', 'Профиль сохранён.');
    res.redirect(`/u/${encodeURIComponent(username)}`);
  } catch (err) {
    if (err.code === '23505') { flash(req, 'error', 'Этот ник уже занят. Попробуйте другой.'); return res.redirect('/settings/profile'); }
    next(err);
  }
});

app.get('/u/:username', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM users WHERE LOWER(username)=LOWER($1) AND is_banned=FALSE', [req.params.username]);
    const profile = rows[0];
    if (!profile) return res.status(404).render('error', { title: 'Профиль не найден', message: 'Проверьте никнейм.' });
    const owner = req.user && Number(req.user.id) === Number(profile.id);
    const friends = req.user ? await areFriends(req.user.id, profile.id) : false;
    const friendship = req.user && !owner ? await friendshipBetween(req.user.id, profile.id) : null;
    const cvs = (await q(`
      SELECT c.*,(SELECT COUNT(*)::int FROM cv_views v WHERE v.cv_id=c.id) AS views
      FROM cvs c WHERE c.user_id=$1 AND ${owner ? "c.status IN ('draft','published','frozen')" : "c.status='published'"}
      ORDER BY c.updated_at DESC
    `, [profile.id])).rows;
    res.render('profile/view', { title: profile.name || `@${profile.username}`, profile, owner, friends, friendship, cvs });
  } catch (err) { next(err); }
});

app.post('/u/:username/friend', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const target = (await q('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [req.params.username])).rows[0];
    if (!target || Number(target.id) === Number(req.user.id)) return res.redirect(`/u/${req.params.username}`);
    if (await blockedEitherWay(req.user.id, target.id)) { flash(req, 'error', 'Нельзя отправить запрос этому пользователю.'); return res.redirect(`/u/${req.params.username}`); }
    const existing = await friendshipBetween(req.user.id, target.id);
    if (!existing) await q('INSERT INTO friendships(requester_id,addressee_id) VALUES($1,$2)', [req.user.id, target.id]);
    flash(req, 'success', 'Запрос в контакты отправлен.');
    res.redirect(`/u/${req.params.username}`);
  } catch (err) { next(err); }
});

app.post('/friends/:id/accept', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    await q("UPDATE friendships SET status='accepted' WHERE id=$1 AND addressee_id=$2", [req.params.id, req.user.id]);
    flash(req, 'success', 'Контакт добавлен.');
    res.redirect('/people');
  } catch (err) { next(err); }
});

app.post('/friends/:id/remove', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    await q('DELETE FROM friendships WHERE id=$1 AND (requester_id=$2 OR addressee_id=$2)', [req.params.id, req.user.id]);
    flash(req, 'success', 'Контакт удалён.');
    res.redirect(req.get('referer') || '/people');
  } catch (err) { next(err); }
});

// CV
app.get('/my/cv', requireAuth, async (req, res, next) => {
  try {
    const cvs = (await q(`SELECT c.*,(SELECT COUNT(*)::int FROM cv_views v WHERE v.cv_id=c.id) AS views FROM cvs c WHERE c.user_id=$1 ORDER BY c.updated_at DESC`, [req.user.id])).rows;
    res.render('cv/list', { title: 'Мои CV', cvs });
  } catch (err) { next(err); }
});

app.post('/my/cv/new', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const { rows } = await q('INSERT INTO cvs(user_id,title) VALUES($1,$2) RETURNING id', [req.user.id, cleanText(req.body.title || 'Новое CV', 120)]);
    res.redirect(`/my/cv/${rows[0].id}/edit`);
  } catch (err) { next(err); }
});

app.get('/my/cv/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const cv = (await q('SELECT * FROM cvs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!cv) return res.status(404).render('error', { title: 'CV не найден', message: 'У вас нет такого CV.' });
    const views = (await q('SELECT COUNT(*)::int AS c FROM cv_views WHERE cv_id=$1', [cv.id])).rows[0].c;
    res.render('cv/edit', { title: 'Редактировать CV', cv, views });
  } catch (err) { next(err); }
});

app.post('/my/cv/:id/edit', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    await q(`UPDATE cvs SET title=$1,summary=$2,experience=$3,skills=$4,programs=$5,courses=$6,education=$7,portfolio_links=$8,updated_at=NOW() WHERE id=$9 AND user_id=$10`, [
      cleanText(req.body.title, 160), cleanText(req.body.summary, 4000), cleanText(req.body.experience, 12000),
      cleanText(req.body.skills, 5000), cleanText(req.body.programs, 5000), cleanText(req.body.courses, 7000),
      cleanText(req.body.education, 7000), cleanText(req.body.portfolio_links, 5000), req.params.id, req.user.id,
    ]);
    flash(req, 'success', 'CV сохранено.');
    res.redirect(`/my/cv/${req.params.id}/edit`);
  } catch (err) { next(err); }
});

app.post('/my/cv/:id/status', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const status = ['draft','published','frozen'].includes(req.body.status) ? req.body.status : 'draft';
    const cv = (await q('SELECT * FROM cvs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!cv) return res.status(404).end();
    const hasContent = [cv.summary,cv.experience,cv.skills,cv.programs,cv.courses,cv.education,cv.portfolio_links].some(v => cleanText(v).length > 0);
    if (status === 'published' && !hasContent) {
      flash(req, 'error', 'Добавьте хотя бы один содержательный блок перед публикацией.');
      return res.redirect(`/my/cv/${cv.id}/edit`);
    }
    await q(`UPDATE cvs SET status=$1,published_at=CASE WHEN $1='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,updated_at=NOW() WHERE id=$2`, [status, cv.id]);
    flash(req, 'success', status === 'published' ? 'CV опубликовано.' : status === 'frozen' ? 'CV заморожено и скрыто от других.' : 'CV возвращено в черновики.');
    res.redirect('/my/cv');
  } catch (err) { next(err); }
});

app.get('/cv/:id', async (req, res, next) => {
  try {
    const cv = (await q(`SELECT c.*,u.username,u.name,u.profession,u.location,u.avatar_media_id,u.open_to_work FROM cvs c JOIN users u ON u.id=c.user_id WHERE c.id=$1 AND u.is_banned=FALSE`, [req.params.id])).rows[0];
    if (!cv) return res.status(404).render('error', { title: 'CV не найден', message: 'Возможно, оно удалено.' });
    const owner = req.user && Number(req.user.id) === Number(cv.user_id);
    if (!owner && cv.status !== 'published') return res.status(404).render('error', { title: 'CV недоступно', message: 'Автор скрыл или заморозил это CV.' });
    if (!owner) {
      let viewerKey;
      if (req.user) viewerKey = `u:${req.user.id}`;
      else {
        viewerKey = req.session.cvVisitorKey || `a:${crypto.randomUUID()}`;
        req.session.cvVisitorKey = viewerKey;
      }
      const inserted = await q('INSERT INTO cv_views(cv_id,viewer_key,viewer_user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id', [cv.id, viewerKey, req.user ? req.user.id : null]);
      if (inserted.rowCount) {
        const count = (await q('SELECT COUNT(*)::int AS c FROM cv_views WHERE cv_id=$1', [cv.id])).rows[0].c;
        io.to(`cv:${cv.id}`).emit('cv_view_count', { cvId: String(cv.id), count });
      }
    }
    const views = (await q('SELECT COUNT(*)::int AS c FROM cv_views WHERE cv_id=$1', [cv.id])).rows[0].c;
    res.render('cv/view', { title: cv.title, cv, owner, views });
  } catch (err) { next(err); }
});

// JOBS
app.get('/jobs', async (req, res, next) => {
  try {
    const params = [];
    const where = ['is_active=TRUE', '(expires_at IS NULL OR expires_at>NOW())'];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
    const query = cleanText(req.query.q, 100);
    if (query) {
      const val = `%${query}%`;
      params.push(val,val,val,val,val,val,val,val);
      const n = params.length;
      where.push(`(title ILIKE $${n-7} OR company ILIKE $${n-6} OR COALESCE(summary_ru,summary,'') ILIKE $${n-5} OR COALESCE(sector,'') ILIKE $${n-4} OR COALESCE(location,'') ILIKE $${n-3} OR COALESCE(experience,'') ILIKE $${n-2} OR COALESCE(work_mode,'') ILIKE $${n-1} OR COALESCE(employment_type,'') ILIKE $${n})`);
    }
    if (cleanText(req.query.sector, 100)) add('sector ILIKE ?', `%${cleanText(req.query.sector,100)}%`);
    if (cleanText(req.query.mode, 80)) add('work_mode ILIKE ?', `%${cleanText(req.query.mode,80)}%`);
    if (cleanText(req.query.experience, 80)) add('experience = ?', cleanText(req.query.experience,80));
    if (cleanText(req.query.location, 100)) add('location ILIKE ?', `%${cleanText(req.query.location,100)}%`);
    if (req.query.salary === '1') where.push("COALESCE(salary,'')<>''");
    let jobs = (await q(`SELECT * FROM jobs WHERE ${where.join(' AND ')} ORDER BY featured DESC, COALESCE(published_at,created_at) DESC LIMIT 250`, params)).rows;
    jobs = await attachApplicationStatuses(req.user, jobs);
    const sectors = (await q(`SELECT DISTINCT sector FROM jobs WHERE is_active=TRUE AND COALESCE(sector,'')<>'' ORDER BY sector LIMIT 80`)).rows.map(r => r.sector);
    const modeRows = (await q(`SELECT work_mode,COUNT(*)::int AS c FROM jobs WHERE is_active=TRUE AND work_mode IN ('Remote','Hybrid','Office') GROUP BY work_mode`)).rows;
    const modeCounts = Object.fromEntries(modeRows.map(r => [r.work_mode, r.c]));
    res.render('jobs/list', { title: 'Вакансии', jobs, sectors, modeCounts, filters: req.query });
  } catch (err) { next(err); }
});

app.get('/jobs/:id', async (req, res, next) => {
  try {
    const job = (await q('SELECT * FROM jobs WHERE id=$1 AND is_active=TRUE', [req.params.id])).rows[0];
    if (!job) return res.status(404).render('error', { title: 'Вакансия недоступна', message: 'Она могла быть снята или устареть.' });
    let application = null;
    if (req.user) application = (await q('SELECT * FROM applications WHERE user_id=$1 AND job_id=$2', [req.user.id, job.id])).rows[0] || null;
    res.render('jobs/view', { title: job.title, job, application });
  } catch (err) { next(err); }
});

app.post('/jobs/:id/save', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const job = (await q('SELECT id FROM jobs WHERE id=$1 AND is_active=TRUE', [req.params.id])).rows[0];
    if (!job) return res.status(404).end();
    await q(`INSERT INTO applications(user_id,job_id,status) VALUES($1,$2,'want') ON CONFLICT(user_id,job_id) DO UPDATE SET updated_at=NOW()`, [req.user.id, job.id]);
    flash(req,'success','Вакансия сохранена в органайзер.');
    res.redirect(`/jobs/${job.id}`);
  } catch (err) { next(err); }
});

app.get('/jobs/:id/apply', async (req, res, next) => {
  try {
    const job = (await q('SELECT id,source_url FROM jobs WHERE id=$1 AND is_active=TRUE', [req.params.id])).rows[0];
    if (!job) return res.status(404).end();
    if (!req.user) {
      req.session.returnTo = `/jobs/${job.id}`;
      flash(req, 'info', 'Войдите, чтобы сохранить отклик в личный органайзер.');
      return res.redirect('/login');
    }
    await q(`INSERT INTO applications(user_id,job_id,status) VALUES($1,$2,'waiting') ON CONFLICT(user_id,job_id) DO UPDATE SET status=CASE WHEN applications.status='want' THEN 'waiting' ELSE applications.status END,updated_at=NOW()`, [req.user.id, job.id]);
    const target = safeHttpUrl(job.source_url);
    if (!target) return res.status(400).render('error', { title: 'Некорректная ссылка', message: 'Источник вакансии содержит недопустимый адрес.' });
    return res.redirect(target);
  } catch (err) { next(err); }
});

app.get('/applications', requireAuth, async (req, res, next) => {
  try {
    const status = ['want','waiting','interview','offer','rejected','not_fit'].includes(req.query.status) ? req.query.status : '';
    const params = [req.user.id];
    let sql = `SELECT a.*,j.title,j.company,j.source,j.source_url,j.location,j.work_mode,j.salary,j.sector FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1`;
    if (status) { params.push(status); sql += ` AND a.status=$2`; }
    sql += ' ORDER BY a.updated_at DESC';
    const apps = (await q(sql, params)).rows;
    res.render('applications/list', { title: 'Мои отклики', apps, status });
  } catch (err) { next(err); }
});

app.post('/applications/:id', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const status = ['want','waiting','interview','offer','rejected','not_fit'].includes(req.body.status) ? req.body.status : 'waiting';
    await q('UPDATE applications SET status=$1,notes=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4', [status, cleanText(req.body.notes, 3000), req.params.id, req.user.id]);
    flash(req, 'success', 'Статус обновлён.');
    res.redirect('/applications');
  } catch (err) { next(err); }
});

// PEOPLE
app.get('/people', async (req, res, next) => {
  try {
    const rawTerm = cleanText(req.query.q, 80);
    const term = rawTerm.replace(/^@+/, '').trim();
    let people = [];
    if (term) {
      people = (await q(`SELECT u.id,u.username,u.name,u.profession,u.location,u.avatar_media_id,u.bio,u.open_to_work FROM users u WHERE u.username IS NOT NULL AND u.is_banned=FALSE AND u.username ILIKE $1 ORDER BY CASE WHEN LOWER(u.username)=LOWER($2) THEN 0 ELSE 1 END,u.username LIMIT 40`, [`%${term}%`, term])).rows;
    }
    let pending = [];
    let contacts = [];
    if (req.user) {
      pending = (await q(`SELECT f.*,u.username,u.name,u.profession,u.avatar_media_id FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.created_at DESC`, [req.user.id])).rows;
      contacts = (await q(`
        SELECT f.id AS friendship_id,u.id,u.username,u.name,u.profession,u.location,u.avatar_media_id,u.open_to_work
        FROM friendships f
        JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
        WHERE f.status='accepted' AND (f.requester_id=$1 OR f.addressee_id=$1) AND u.is_banned=FALSE
        ORDER BY COALESCE(u.name,u.username)
      `,[req.user.id])).rows;
    }
    res.render('people/list', { title: 'Люди', people, pending, contacts, term: rawTerm });
  } catch (err) { next(err); }
});

// Temporarily hidden modules. Backend tables are kept for a later iteration.
app.use(['/feed','/articles','/groups'], (req, res) => res.redirect(303, '/'));

// FEED / POSTS
app.get('/feed', async (req, res, next) => {
  try {
    let posts;
    if (req.user) {
      posts = (await q(`
        SELECT p.*,u.username,u.name,u.profession,u.avatar_media_id,u.wall_privacy,
          EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=u.id) OR (f.addressee_id=$1 AND f.requester_id=u.id))) AS is_friend
        FROM posts p JOIN users u ON u.id=p.user_id
        WHERE u.is_banned=FALSE AND (
          p.user_id=$1 OR
          (p.visibility='public' AND u.wall_privacy='public') OR
          (EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=u.id) OR (f.addressee_id=$1 AND f.requester_id=u.id)))
             AND p.visibility IN ('public','friends') AND u.wall_privacy IN ('public','friends'))
        )
        ORDER BY p.created_at DESC LIMIT 150
      `, [req.user.id])).rows;
    } else {
      posts = (await q(`SELECT p.*,u.username,u.name,u.profession,u.avatar_media_id FROM posts p JOIN users u ON u.id=p.user_id WHERE p.visibility='public' AND u.wall_privacy='public' AND u.is_banned=FALSE ORDER BY p.created_at DESC LIMIT 100`)).rows;
    }
    res.render('feed/list', { title: 'Лента', posts });
  } catch (err) { next(err); }
});

app.post('/feed', requireAuth, writeLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const body = cleanText(req.body.body, 5000);
    const mediaId = await saveMedia(req.user.id, req.file);
    if (!body && !mediaId) { flash(req, 'error', 'Напишите текст или добавьте изображение.'); return res.redirect('/feed'); }
    const visibility = ['public','friends','private'].includes(req.body.visibility) ? req.body.visibility : 'public';
    await q('INSERT INTO posts(user_id,body,media_id,visibility) VALUES($1,$2,$3,$4)', [req.user.id, body || null, mediaId, visibility]);
    res.redirect('/feed');
  } catch (err) { next(err); }
});

app.post('/posts/:id/delete', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    await q('DELETE FROM posts WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.redirect(req.get('referer') || '/feed');
  } catch (err) { next(err); }
});

// ARTICLES / LONGFORM BLOG
app.get('/articles', async (req, res, next) => {
  try {
    const articles = (await q(`
      SELECT a.*,u.username,u.name,u.profession,u.avatar_media_id
      FROM articles a JOIN users u ON u.id=a.user_id
      WHERE a.status='published' AND u.is_banned=FALSE
      ORDER BY a.published_at DESC NULLS LAST,a.created_at DESC LIMIT 100
    `)).rows;
    res.render('articles/list', { title: 'Статьи', articles });
  } catch (err) { next(err); }
});

app.get('/articles/new', requireAuth, (req, res) => {
  res.render('articles/edit', { title: 'Новая статья', article: null });
});

app.post('/articles', requireAuth, writeLimiter, upload.single('cover'), async (req, res, next) => {
  try {
    const title = cleanText(req.body.title, 220);
    const body = cleanText(req.body.body, 40000);
    if (!title || !body) { flash(req, 'error', 'Добавьте заголовок и текст статьи.'); return res.redirect('/articles/new'); }
    const cover = await saveMedia(req.user.id, req.file);
    const status = req.body.status === 'published' ? 'published' : 'draft';
    const { rows } = await q(`INSERT INTO articles(user_id,title,excerpt,body,cover_media_id,status,published_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='published' THEN NOW() ELSE NULL END) RETURNING id`, [req.user.id,title,cleanText(req.body.excerpt,700),body,cover,status]);
    flash(req, 'success', status === 'published' ? 'Статья опубликована.' : 'Черновик сохранён.');
    res.redirect(status === 'published' ? `/articles/${rows[0].id}` : `/articles/${rows[0].id}/edit`);
  } catch (err) { next(err); }
});

app.get('/articles/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const article = (await q('SELECT * FROM articles WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!article) return res.status(404).render('error', { title: 'Статья не найдена', message: 'У вас нет такого черновика.' });
    res.render('articles/edit', { title: 'Редактировать статью', article });
  } catch (err) { next(err); }
});

app.post('/articles/:id/edit', requireAuth, writeLimiter, upload.single('cover'), async (req, res, next) => {
  try {
    const article = (await q('SELECT * FROM articles WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!article) return res.status(404).end();
    const cover = await saveMedia(req.user.id, req.file);
    const status = req.body.status === 'published' ? 'published' : 'draft';
    const params = [cleanText(req.body.title,220),cleanText(req.body.excerpt,700),cleanText(req.body.body,40000),status,req.params.id,req.user.id];
    let coverSql='';
    if (cover) { params.push(cover); coverSql=',cover_media_id=$7'; }
    await q(`UPDATE articles SET title=$1,excerpt=$2,body=$3,status=$4,published_at=CASE WHEN $4='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,updated_at=NOW()${coverSql} WHERE id=$5 AND user_id=$6`, params);
    flash(req,'success','Статья сохранена.');
    res.redirect(status==='published' ? `/articles/${req.params.id}` : `/articles/${req.params.id}/edit`);
  } catch (err) { next(err); }
});

app.get('/articles/:id', async (req,res,next)=>{
  try{
    const article=(await q(`SELECT a.*,u.username,u.name,u.profession,u.avatar_media_id FROM articles a JOIN users u ON u.id=a.user_id WHERE a.id=$1 AND u.is_banned=FALSE`,[req.params.id])).rows[0];
    if(!article) return res.status(404).render('error',{title:'Статья не найдена',message:'Возможно, она удалена.'});
    const owner=req.user && Number(req.user.id)===Number(article.user_id);
    if(article.status!=='published' && !owner) return res.status(404).render('error',{title:'Статья недоступна',message:'Это черновик автора.'});
    res.render('articles/view',{title:article.title,article,owner});
  }catch(err){next(err)}
});

// MESSAGES
app.get('/messages', requireAuth, async (req, res, next) => {
  try {
    const conversations = (await q(`
      WITH peers AS (
        SELECT CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END AS peer_id, MAX(created_at) AS last_at
        FROM messages WHERE sender_id=$1 OR receiver_id=$1
        GROUP BY 1
      )
      SELECT p.peer_id,p.last_at,u.username,u.name,u.profession,u.avatar_media_id,
        (SELECT body FROM messages m WHERE (m.sender_id=$1 AND m.receiver_id=p.peer_id) OR (m.sender_id=p.peer_id AND m.receiver_id=$1) ORDER BY m.created_at DESC LIMIT 1) AS last_body,
        (SELECT COUNT(*)::int FROM messages m WHERE m.receiver_id=$1 AND m.sender_id=p.peer_id AND m.read_at IS NULL) AS unread,
        EXISTS(SELECT 1 FROM mutes mu WHERE mu.user_id=$1 AND mu.muted_user_id=p.peer_id) AS muted
      FROM peers p JOIN users u ON u.id=p.peer_id
      ORDER BY p.last_at DESC
    `, [req.user.id])).rows;
    res.render('messages/list', { title: 'Сообщения', conversations });
  } catch (err) { next(err); }
});

app.get('/messages/:username', requireAuth, async (req, res, next) => {
  try {
    const peer = (await q('SELECT id,username,name,profession,avatar_media_id FROM users WHERE LOWER(username)=LOWER($1) AND is_banned=FALSE', [req.params.username])).rows[0];
    if (!peer || Number(peer.id) === Number(req.user.id)) return res.status(404).render('error', { title: 'Диалог не найден', message: 'Нельзя открыть этот диалог.' });
    const blocked = await blockedEitherWay(req.user.id, peer.id);
    const muted = (await q('SELECT 1 FROM mutes WHERE user_id=$1 AND muted_user_id=$2', [req.user.id, peer.id])).rowCount > 0;
    const messages = (await q(`SELECT * FROM messages WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1) ORDER BY created_at ASC LIMIT 500`, [req.user.id, peer.id])).rows;
    await q('UPDATE messages SET read_at=NOW() WHERE receiver_id=$1 AND sender_id=$2 AND read_at IS NULL', [req.user.id, peer.id]);
    res.render('messages/thread', { title: `Диалог с @${peer.username}`, peer, messages, blocked, muted });
  } catch (err) { next(err); }
});

app.post('/messages/:username/send', requireAuth, writeLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const peer = (await q('SELECT id,username FROM users WHERE LOWER(username)=LOWER($1) AND is_banned=FALSE', [req.params.username])).rows[0];
    if (!peer || Number(peer.id) === Number(req.user.id)) return res.status(404).json({ error: 'Пользователь не найден.' });
    if (await blockedEitherWay(req.user.id, peer.id)) return res.status(403).json({ error: 'Отправка сообщений заблокирована.' });
    const body = cleanText(req.body.body, 5000);
    const mediaId = await saveMedia(req.user.id, req.file);
    if (!body && !mediaId) return res.status(400).json({ error: 'Пустое сообщение.' });
    const { rows } = await q('INSERT INTO messages(sender_id,receiver_id,body,media_id) VALUES($1,$2,$3,$4) RETURNING *', [req.user.id, peer.id, body || null, mediaId]);
    const payload = { ...rows[0], senderUsername: req.user.username, receiverUsername: peer.username };
    io.to(`user:${req.user.id}`).emit('message:new', payload);
    io.to(`user:${peer.id}`).emit('message:new', payload);
    res.json({ ok: true, message: payload });
  } catch (err) { next(err); }
});

app.post('/messages/:username/block', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const peer = (await q('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [req.params.username])).rows[0];
    if (!peer) return res.redirect('/messages');
    const exists = await q('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, peer.id]);
    if (exists.rowCount) await q('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, peer.id]);
    else await q('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, peer.id]);
    res.redirect(`/messages/${req.params.username}`);
  } catch (err) { next(err); }
});

app.post('/messages/:username/mute', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const peer = (await q('SELECT id FROM users WHERE LOWER(username)=LOWER($1)', [req.params.username])).rows[0];
    if (!peer) return res.redirect('/messages');
    const exists = await q('SELECT 1 FROM mutes WHERE user_id=$1 AND muted_user_id=$2', [req.user.id, peer.id]);
    if (exists.rowCount) await q('DELETE FROM mutes WHERE user_id=$1 AND muted_user_id=$2', [req.user.id, peer.id]);
    else await q('INSERT INTO mutes(user_id,muted_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, peer.id]);
    res.redirect(`/messages/${req.params.username}`);
  } catch (err) { next(err); }
});

// GROUPS
app.get('/groups', async (req, res, next) => {
  try {
    const groups = (await q(`SELECT g.*,u.username,(SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id=g.id) AS members FROM groups g JOIN users u ON u.id=g.owner_id ORDER BY g.created_at DESC LIMIT 100`)).rows;
    res.render('groups/list', { title: 'Группы', groups });
  } catch (err) { next(err); }
});

app.post('/groups', requireAuth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const name = cleanText(req.body.name, 120);
    if (name.length < 3) { flash(req, 'error', 'Название группы слишком короткое.'); return res.redirect('/groups'); }
    let slug = slugify(req.body.slug || name);
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO groups(owner_id,name,slug,description,privacy) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.id, name, slug, cleanText(req.body.description, 1500), req.body.privacy === 'private' ? 'private' : 'public']);
    await client.query("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'owner')", [rows[0].id, req.user.id]);
    await client.query('COMMIT');
    res.redirect(`/groups/${rows[0].slug}`);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { flash(req, 'error', 'Такой адрес группы уже занят.'); return res.redirect('/groups'); }
    next(err);
  } finally { client.release(); }
});

app.get('/groups/:slug', async (req, res, next) => {
  try {
    const group = (await q(`SELECT g.*,u.username,(SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id=g.id) AS members FROM groups g JOIN users u ON u.id=g.owner_id WHERE g.slug=$1`, [req.params.slug])).rows[0];
    if (!group) return res.status(404).render('error', { title: 'Группа не найдена', message: 'Проверьте адрес.' });
    const member = req.user ? (await q('SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2', [group.id, req.user.id])).rows[0] : null;
    if (group.privacy === 'private' && !member) return res.status(403).render('error', { title: 'Закрытая группа', message: 'Публикации видят только участники.' });
    const posts = (await q(`SELECT gp.*,u.username,u.name,u.avatar_media_id FROM group_posts gp JOIN users u ON u.id=gp.user_id WHERE gp.group_id=$1 ORDER BY gp.created_at DESC LIMIT 100`, [group.id])).rows;
    res.render('groups/view', { title: group.name, group, member, posts });
  } catch (err) { next(err); }
});

app.post('/groups/:slug/join', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const group = (await q('SELECT id,privacy FROM groups WHERE slug=$1', [req.params.slug])).rows[0];
    if (!group) return res.status(404).end();
    // MVP: private groups currently require owner to share the URL, but join is still immediate.
    await q('INSERT INTO group_members(group_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [group.id, req.user.id]);
    res.redirect(`/groups/${req.params.slug}`);
  } catch (err) { next(err); }
});

app.post('/groups/:slug/post', requireAuth, writeLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const group = (await q('SELECT id FROM groups WHERE slug=$1', [req.params.slug])).rows[0];
    if (!group) return res.status(404).end();
    const member = await q('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [group.id, req.user.id]);
    if (!member.rowCount) return res.status(403).end();
    const body = cleanText(req.body.body, 5000);
    if (!body) { flash(req, 'error', 'Напишите текст поста.'); return res.redirect(`/groups/${req.params.slug}`); }
    const mediaId = await saveMedia(req.user.id, req.file);
    await q('INSERT INTO group_posts(group_id,user_id,body,media_id) VALUES($1,$2,$3,$4)', [group.id, req.user.id, body, mediaId]);
    res.redirect(`/groups/${req.params.slug}`);
  } catch (err) { next(err); }
});

// EMPLOYERS
app.get('/employers', (req, res) => res.render('employers', { title: 'Работодателям' }));

// REPORTS
app.post('/report', requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const type = ['user','post','message','group'].includes(req.body.target_type) ? req.body.target_type : null;
    const id = Number(req.body.target_id);
    const reason = cleanText(req.body.reason, 1000);
    if (!type || !id || !reason) { flash(req, 'error', 'Не удалось отправить жалобу.'); return res.redirect(req.get('referer') || '/'); }
    await q('INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES($1,$2,$3,$4)', [req.user.id, type, id, reason]);
    flash(req, 'success', 'Жалоба отправлена администратору.');
    res.redirect(req.get('referer') || '/');
  } catch (err) { next(err); }
});

// ADMIN
app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const [users,jobs,messages,reports] = await Promise.all([
      q('SELECT COUNT(*)::int AS c FROM users'), q('SELECT COUNT(*)::int AS c FROM jobs WHERE is_active=TRUE'),
      q('SELECT COUNT(*)::int AS c FROM messages'), q("SELECT COUNT(*)::int AS c FROM reports WHERE status='open'")
    ]);
    const recentJobs = (await q('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 8')).rows;
    res.render('admin/dashboard', { title: 'Админ-панель', stats: { users:users.rows[0].c,jobs:jobs.rows[0].c,messages:messages.rows[0].c,reports:reports.rows[0].c }, recentJobs });
  } catch (err) { next(err); }
});

app.get('/admin/jobs', requireAdmin, async (req, res, next) => {
  try {
    const jobs = (await q('SELECT * FROM jobs ORDER BY featured DESC,created_at DESC LIMIT 300')).rows;
    res.render('admin/jobs', { title: 'Админ · вакансии', jobs });
  } catch (err) { next(err); }
});

app.get('/admin/jobs/:id/edit', requireAdmin, async (req,res,next)=>{
  try{
    const job=(await q('SELECT * FROM jobs WHERE id=$1',[req.params.id])).rows[0];
    if(!job) return res.status(404).render('error',{title:'Вакансия не найдена',message:'Возможно, она удалена.'});
    res.render('admin/job-edit',{title:'Админ · редактировать вакансию',job});
  }catch(err){next(err)}
});

app.post('/admin/jobs/:id/edit', requireAdmin, writeLimiter, async (req,res,next)=>{
  try{
    const sourceUrl=safeHttpUrl(req.body.source_url);
    if(!sourceUrl){flash(req,'error','Укажите корректную http/https ссылку.');return res.redirect(`/admin/jobs/${req.params.id}/edit`)}
    const description=safeRichHtml(cleanText(req.body.description,30000).replace(/\n/g,'<br>'));
    await q(`UPDATE jobs SET source=$1,source_url=$2,title=$3,company=$4,summary=$5,summary_ru=NULL,description_html=$6,experience=$7,work_mode=$8,salary=$9,location=$10,sector=$11,employment_type=$12,expires_at=$13,featured=$14,is_active=$15,updated_at=NOW() WHERE id=$16`,[
      cleanText(req.body.source,80),sourceUrl,cleanText(req.body.title,240),cleanText(req.body.company,180),cleanText(req.body.summary,600),description,
      cleanText(req.body.experience,80),cleanText(req.body.work_mode,80),cleanText(req.body.salary,120),cleanText(req.body.location,160),cleanText(req.body.sector,120),cleanText(req.body.employment_type,100),req.body.expires_at||null,req.body.featured==='on',req.body.is_active==='on',req.params.id
    ]);
    flash(req,'success','Вакансия обновлена.');res.redirect('/admin/jobs');
  }catch(err){if(err.code==='23505'){flash(req,'error','Такая ссылка уже используется другой вакансией.');return res.redirect(`/admin/jobs/${req.params.id}/edit`)} next(err)}
});

app.post('/admin/jobs', requireAdmin, writeLimiter, async (req, res, next) => {
  try {
    const sourceUrl = safeHttpUrl(req.body.source_url);
    if (!sourceUrl) { flash(req, 'error', 'Укажите корректную http/https ссылку на вакансию.'); return res.redirect('/admin/jobs'); }
    const description = safeRichHtml(cleanText(req.body.description, 30000).replace(/\n/g, '<br>'));
    await q(`INSERT INTO jobs(source,source_url,title,company,summary,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,expires_at,featured,is_active,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,$14,TRUE,$15)`, [
      cleanText(req.body.source || 'Direct',80), sourceUrl, cleanText(req.body.title,240), cleanText(req.body.company,180),
      cleanText(req.body.summary,600), description, cleanText(req.body.experience,80), cleanText(req.body.work_mode,80), cleanText(req.body.salary,120),
      cleanText(req.body.location,160), cleanText(req.body.sector,120), cleanText(req.body.employment_type,100), req.body.expires_at || null,
      req.body.featured === 'on', req.user.id,
    ]);
    flash(req, 'success', 'Вакансия опубликована.');
    res.redirect('/admin/jobs');
  } catch (err) {
    if (err.code === '23505') flash(req, 'error', 'Вакансия с этой ссылкой уже есть.'); else return next(err);
    res.redirect('/admin/jobs');
  }
});

app.post('/admin/jobs/:id', requireAdmin, writeLimiter, async (req, res, next) => {
  try {
    const action = req.body.action;
    if (action === 'feature') await q('UPDATE jobs SET featured=NOT featured,updated_at=NOW() WHERE id=$1', [req.params.id]);
    if (action === 'active') await q('UPDATE jobs SET is_active=NOT is_active,updated_at=NOW() WHERE id=$1', [req.params.id]);
    if (action === 'delete') await q('DELETE FROM jobs WHERE id=$1', [req.params.id]);
    res.redirect('/admin/jobs');
  } catch (err) { next(err); }
});

app.post('/admin/jobs/import', requireAdmin, writeLimiter, async (req, res) => {
  const count = await importAllJobs();
  flash(req, 'success', `Импорт вакансий завершён: обработано ${count}.`);
  res.redirect('/admin/jobs');
});

app.get('/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const users = (await q(`SELECT u.*,(SELECT COUNT(*)::int FROM cvs c WHERE c.user_id=u.id) AS cvs,(SELECT COUNT(*)::int FROM posts p WHERE p.user_id=u.id) AS posts FROM users u ORDER BY u.created_at DESC LIMIT 300`)).rows;
    res.render('admin/users', { title: 'Админ · пользователи', users });
  } catch (err) { next(err); }
});

app.post('/admin/users/:id', requireAdmin, writeLimiter, async (req, res, next) => {
  try {
    if (Number(req.params.id) === Number(req.user.id)) { flash(req, 'error', 'Нельзя заблокировать собственный аккаунт.'); return res.redirect('/admin/users'); }
    if (req.body.action === 'ban') await q('UPDATE users SET is_banned=NOT is_banned WHERE id=$1', [req.params.id]);
    if (req.body.action === 'admin') await q("UPDATE users SET role=CASE WHEN role='admin' THEN 'user' ELSE 'admin' END WHERE id=$1", [req.params.id]);
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

app.get('/admin/reports', requireAdmin, async (req, res, next) => {
  try {
    const reports = (await q(`SELECT r.*,u.username AS reporter FROM reports r LEFT JOIN users u ON u.id=r.reporter_id ORDER BY r.status ASC,r.created_at DESC LIMIT 300`)).rows;
    res.render('admin/reports', { title: 'Админ · жалобы', reports });
  } catch (err) { next(err); }
});

app.post('/admin/reports/:id/close', requireAdmin, writeLimiter, async (req, res, next) => {
  try { await q("UPDATE reports SET status='closed' WHERE id=$1", [req.params.id]); res.redirect('/admin/reports'); }
  catch (err) { next(err); }
});

// SOCKETS
io.on('connection', (socket) => {
  const userId = socket.request.session && socket.request.session.userId;
  if (userId) socket.join(`user:${userId}`);
  socket.on('watch_cv', (cvId) => {
    const id = String(cvId || '').replace(/[^0-9]/g, '');
    if (id) socket.join(`cv:${id}`);
  });
});

app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Такой страницы нет.' }));
app.use((err, req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError || /Поддерживаются/.test(err.message || '')) {
    flash(req, 'error', err.message || 'Ошибка загрузки файла.');
    return res.redirect(req.get('referer') || '/');
  }
  res.status(500).render('error', { title: 'Ошибка', message: isProduction ? 'Что-то сломалось. Попробуйте ещё раз.' : err.message });
});

(async () => {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
    await initDb();
    const hours = Math.max(1, Number(process.env.JOB_IMPORT_INTERVAL_HOURS || 6));
    setInterval(importAllJobs, hours * 60 * 60 * 1000).unref();
    server.listen(PORT, () => {
      console.log(`${SITE_NAME} → ${BASE_URL}`);
      importAllJobs().catch(err => console.error('[jobs] background import failed:', err.message));
    });
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
})();
