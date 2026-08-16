// Safe production maintenance for imported vacancies and admin identity.
// Runs alongside the main app. It never deletes user accounts, CVs or messages.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

if (process.env.DATABASE_URL) {
  const isProduction = process.env.NODE_ENV === 'production';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 2,
  });

  const DIRECT_LEVER_SITES = [
    ['Skydance', 'skydance'],
    ['Wealthfront', 'wealthfront'],
    ['FieldAI', 'field-ai'],
    ['System1', 'system1'],
  ];
  const DIRECT_GREENHOUSE_BOARDS = [
    ['Figma', 'figma'],
    ['Qualtrics', 'Qualtrics'],
  ];

  const strip = (value='') => sanitizeHtml(String(value), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  const rich = (value='') => sanitizeHtml(String(value), {
    allowedTags: ['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'],
    allowedAttributes: { a: ['href','target','rel'] },
    allowedSchemes: ['http','https','mailto'],
  });
  const relevant = (text='') => /(design|designer|ux\b|ui\b|product|software|developer|engineer|frontend|backend|fullstack|devops|data|machine learning|artificial intelligence|\bai\b|marketing|growth|seo|game|gaming|creative|content|brand|motion|qa\b|cyber|security|mobile|ios|android|fintech|sales|customer success)/i.test(text);
  const sector = (text='') => {
    const s = String(text).toLowerCase();
    if (/game|gaming|unity|unreal/.test(s)) return 'GameDev';
    if (/ui\b|ux\b|product design|interaction design/.test(s)) return 'UI/UX';
    if (/graphic|brand design|visual design|illustrat|creative design|motion design/.test(s)) return 'Graphic Design';
    if (/machine learning|artificial intelligence|\bai\b|data scientist|data engineer|llm/.test(s)) return 'Data / AI';
    if (/marketing|growth|seo|content|social media|communications/.test(s)) return 'Marketing';
    if (/product manager|product owner|product management/.test(s)) return 'Product';
    if (/software|developer|engineer|frontend|backend|fullstack|devops|qa\b|security|ios|android/.test(s)) return 'Engineering';
    return 'Digital';
  };
  const experience = (text='') => {
    const s = String(text).toLowerCase();
    const years = s.match(/(\d{1,2})\s*(?:\+|[-–—]\s*\d{1,2})?\s*(?:years?|yrs?|лет|года|год)/);
    if (years) {
      const n = Number(years[1]);
      if (n >= 6) return '6+ лет';
      if (n >= 3) return '3–6 лет';
      if (n >= 1) return '1–3 года';
    }
    if (/intern|internship|trainee|graduate|entry[ -]?level/.test(s)) return 'Без опыта';
    if (/junior|jr\.?\b/.test(s)) return '1–3 года';
    if (/senior|sr\.?\b|principal|staff|lead|head|director|vp\b/.test(s)) return '6+ лет';
    if (/middle|mid[ -]?level/.test(s)) return '3–6 лет';
    return '';
  };
  const mode = (text='') => {
    const s = String(text).toLowerCase();
    if (/hybrid|гибрид/.test(s)) return 'Hybrid';
    if (/remote|worldwide|anywhere|work from home/.test(s)) return 'Remote';
    return 'Office';
  };

  async function upsertDirectJob(job) {
    if (!job.url || !job.title || !relevant(`${job.title} ${job.team || ''} ${job.description || ''}`)) return 0;
    const descriptionHtml = rich(job.description || '');
    const summary = strip(job.description || '').slice(0, 500);
    const haystack = `${job.title} ${job.team || ''} ${job.description || ''}`;
    await pool.query(`
      INSERT INTO jobs(external_id,source,source_url,title,company,summary,description_html,experience,work_mode,salary,location,sector,employment_type,published_at,is_active,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,NOW())
      ON CONFLICT(source_url) DO UPDATE SET
        external_id=EXCLUDED.external_id,source=EXCLUDED.source,title=EXCLUDED.title,company=EXCLUDED.company,
        summary_ru=CASE WHEN jobs.summary IS DISTINCT FROM EXCLUDED.summary THEN NULL ELSE jobs.summary_ru END,
        summary=EXCLUDED.summary,description_html=EXCLUDED.description_html,experience=EXCLUDED.experience,
        work_mode=EXCLUDED.work_mode,location=EXCLUDED.location,sector=EXCLUDED.sector,
        employment_type=EXCLUDED.employment_type,published_at=EXCLUDED.published_at,is_active=TRUE,updated_at=NOW()
    `, [
      String(job.id || ''), job.source, job.url, String(job.title).slice(0,240), String(job.company).slice(0,180),
      summary, descriptionHtml, experience(haystack), mode(`${job.workplace || ''} ${job.location || ''} ${job.description || ''}`),
      '', String(job.location || '').slice(0,160), sector(haystack), String(job.commitment || '').slice(0,100),
      job.publishedAt || new Date(),
    ]);
    return 1;
  }

  async function importLever(company, site) {
    try {
      const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`, {
        headers: { accept: 'application/json', 'user-agent': 'WORKROOM/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jobs = await response.json();
      let imported = 0;
      for (const j of Array.isArray(jobs) ? jobs : []) {
        imported += await upsertDirectJob({
          id: j.id,
          source: `${company} · direct`,
          url: j.hostedUrl || j.applyUrl,
          title: j.text,
          company,
          description: j.description || j.descriptionPlain || '',
          team: [j.categories?.team, j.categories?.department].filter(Boolean).join(' '),
          location: j.categories?.location || (j.categories?.allLocations || []).join(', '),
          commitment: j.categories?.commitment || '',
          workplace: j.workplaceType || '',
          publishedAt: j.createdAt ? new Date(Number(j.createdAt)) : new Date(),
        });
      }
      console.log(`[jobs] direct Lever ${company}: ${imported}`);
    } catch (err) {
      console.warn(`[jobs] direct Lever ${company} skipped:`, err.message);
    }
  }

  async function importGreenhouse(company, board) {
    try {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`, {
        headers: { accept: 'application/json', 'user-agent': 'WORKROOM/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      let imported = 0;
      for (const j of Array.isArray(payload.jobs) ? payload.jobs : []) {
        const departments = (j.departments || []).map(x => x.name).join(' ');
        imported += await upsertDirectJob({
          id: j.id,
          source: `${company} · direct`,
          url: j.absolute_url,
          title: j.title,
          company,
          description: j.content || '',
          team: departments,
          location: j.location?.name || '',
          commitment: '',
          workplace: '',
          publishedAt: j.updated_at ? new Date(j.updated_at) : new Date(),
        });
      }
      console.log(`[jobs] direct Greenhouse ${company}: ${imported}`);
    } catch (err) {
      console.warn(`[jobs] direct Greenhouse ${company} skipped:`, err.message);
    }
  }

  async function importDirectCompanyJobs() {
    await Promise.all([
      ...DIRECT_LEVER_SITES.map(([company, site]) => importLever(company, site)),
      ...DIRECT_GREENHOUSE_BOARDS.map(([company, board]) => importGreenhouse(company, board)),
    ]);
  }

  async function maintain() {
    try {
      await importDirectCompanyJobs();
      const days = Math.max(7, Math.min(120, Number(process.env.JOB_MAX_AGE_DAYS || 45)));

      // Imported vacancies should not haunt the catalogue forever. Manual/admin
      // vacancies are not touched by this rule.
      const stale = await pool.query(`
        UPDATE jobs
        SET is_active=FALSE, updated_at=NOW()
        WHERE is_active=TRUE
          AND source NOT IN ('Manual','Direct')
          AND COALESCE(published_at,created_at) < NOW() - ($1::text || ' days')::interval
        RETURNING id
      `, [String(days)]);

      // Keep the configured owner account administrative even if it was created
      // before ADMIN_EMAIL was added to Render.
      const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (adminEmail) {
        await pool.query(`UPDATE users SET role='admin' WHERE LOWER(email)=LOWER($1)`, [adminEmail]);
      }

      if (stale.rowCount) console.log(`[jobs] archived ${stale.rowCount} imported vacancies older than ${days} days`);
    } catch (err) {
      console.warn('[maintenance] skipped:', err.message);
    }
  }

  setTimeout(maintain, 12_000).unref();
  setInterval(maintain, 6 * 60 * 60 * 1000).unref();

  process.on('exit', () => pool.end().catch(() => {}));
}
