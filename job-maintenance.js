// Safe production maintenance for WORK//ROOM.
// Vacancy acquisition now lives exclusively in vacancy-monitor.js.
// This file only archives stale imported vacancies and keeps ADMIN_EMAIL admin.

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

      const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (adminEmail) await pool.query(`UPDATE users SET role='admin' WHERE LOWER(email)=LOWER($1)`, [adminEmail]);

      if (stale.rowCount) console.log(`[maintenance] archived ${stale.rowCount} vacancies older than ${days} days`);
    } catch (err) {
      console.warn('[maintenance] skipped:', err.message);
    }
  }

  setTimeout(maintain, 12_000).unref();
  setInterval(maintain, 6 * 60 * 60 * 1000).unref();
  process.on('exit', () => pool.end().catch(() => {}));
}
