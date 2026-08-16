// Safe production maintenance for imported vacancies and admin identity.
// Runs alongside the main app. It never deletes user accounts, CVs or messages.

const { Pool } = require('pg');

if (process.env.DATABASE_URL) {
  const isProduction = process.env.NODE_ENV === 'production';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    max: 2,
  });

  async function maintain() {
    try {
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
