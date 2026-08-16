// Safe production maintenance for WORK//ROOM.
// Vacancy acquisition now lives exclusively in vacancy-monitor-v3.js.
// This file archives stale imported vacancies, keeps ADMIN_EMAIL admin,
// and retires legacy feeds only after the new multi-source catalogue is healthy.

const { Pool } = require('pg');

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 2,
  });

  async function maintain() {
    try {
      const days = Math.max(3, Math.min(120, Number(process.env.VACANCY_MAX_AGE_DAYS || 21)));
      const stale = await pool.query(`
        UPDATE jobs
        SET is_active=FALSE, updated_at=NOW()
        WHERE is_active=TRUE
          AND source NOT IN ('Manual','Direct')
          AND COALESCE(published_at,created_at) < NOW() - ($1::text || ' days')::interval
        RETURNING id
      `, [String(days)]);

      await pool.query(`
        UPDATE jobs
        SET location=country
        WHERE COALESCE(location,'')='' AND COALESCE(country,'')<>''
      `).catch(() => {});

      // Telegram digests can now resolve into hirehi.ru/company/etc. primary pages,
      // so count discovery metadata instead of relying only on the displayed source label.
      const primary = await pool.query(`
        SELECT COUNT(*)::int AS c FROM jobs
        WHERE is_active=TRUE AND (
          source='hh.ru'
          OR source LIKE 'Instagram%'
          OR source LIKE 'Telegram · %'
          OR COALESCE(source_metadata->>'discovered_via','')='telegram'
        )
      `).catch(() => ({ rows:[{ c:0 }] }));

      if (Number(primary.rows[0]?.c || 0) >= 20) {
        const retired = await pool.query(`
          UPDATE jobs SET is_active=FALSE,updated_at=NOW()
          WHERE is_active=TRUE AND (
            source IN ('Jobicy','Arbeitnow') OR source LIKE '% · direct'
          )
          RETURNING id
        `);
        if (retired.rowCount) console.log(`[maintenance] retired ${retired.rowCount} legacy-source vacancies`);
      }

      const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (adminEmail) await pool.query(`UPDATE users SET role='admin' WHERE LOWER(email)=LOWER($1)`, [adminEmail]);

      if (stale.rowCount) console.log(`[maintenance] archived ${stale.rowCount} vacancies older than ${days} days`);
    } catch (err) {
      console.warn('[maintenance] skipped:', err.message);
    }
  }

  setTimeout(maintain, 12_000).unref();
  setTimeout(maintain, 4 * 60 * 1000).unref();
  setInterval(maintain, 60 * 60 * 1000).unref();
  process.on('exit', () => pool.end().catch(() => {}));
}
