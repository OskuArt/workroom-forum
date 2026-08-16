// WORK//ROOM temporary moderation system.
// Preloaded before server.js. Adds account + hashed-IP temporary bans,
// temporary vacancy suspension and a user appeal flow without changing the core routes.

const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max: 3,
}) : null;

const clean = (value, max = 2000) => String(value || '').trim().slice(0, max);
const q = (text, params = []) => pool.query(text, params);

let schemaPromise = null;
function ensureSchema() {
  if (!pool) return Promise.resolve();
  if (!schemaPromise) schemaPromise = q(`
    CREATE TABLE IF NOT EXISTS site_bans (
      id BIGSERIAL PRIMARY KEY,
      target_type TEXT NOT NULL CHECK(target_type IN ('user','job')),
      target_id BIGINT NOT NULL,
      ip_hash TEXT,
      reason TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      created_by BIGINT,
      revoked_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS site_bans_active_target_idx ON site_bans(target_type,target_id,ends_at) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS site_bans_active_ip_idx ON site_bans(ip_hash,ends_at) WHERE revoked_at IS NULL AND ip_hash IS NOT NULL;

    CREATE TABLE IF NOT EXISTS user_ip_history (
      user_id BIGINT NOT NULL,
      ip_hash TEXT NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,ip_hash)
    );

    CREATE OR REPLACE FUNCTION workroom_guard_suspended_job() RETURNS trigger AS $$
    BEGIN
      IF NEW.is_active = TRUE AND EXISTS(
        SELECT 1 FROM site_bans b
        WHERE b.target_type='job' AND b.target_id=NEW.id
          AND b.revoked_at IS NULL AND b.ends_at>NOW()
      ) THEN
        NEW.is_active := FALSE;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS workroom_guard_suspended_job_trigger ON jobs;
    CREATE TRIGGER workroom_guard_suspended_job_trigger
      BEFORE UPDATE OF is_active ON jobs
      FOR EACH ROW EXECUTE FUNCTION workroom_guard_suspended_job();
  `).then(() => console.log('[ban-system] temporary moderation schema ready'))
    .catch(err => {
      schemaPromise = null;
      console.error('[ban-system] schema error:', err.message);
      throw err;
    });
  return schemaPromise;
}

function normalizedIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return String(forwarded || req.ip || req.socket?.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .trim();
}
function ipHash(req) {
  const ip = normalizedIp(req);
  if (!ip) return '';
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'workroom-ip-ban-v1').update(ip).digest('hex');
}
function durationMs(value, unit) {
  const n = Math.max(1, Math.min(10000, Number(value) || 0));
  const units = { minutes:60_000, hours:3_600_000, days:86_400_000, weeks:604_800_000 };
  const ms = n * (units[unit] || units.hours);
  return Math.min(ms, 90 * 86_400_000);
}
async function restoreExpiredJobBans() {
  await ensureSchema();
  const { rows } = await q(`
    UPDATE site_bans SET revoked_at=NOW()
    WHERE target_type='job' AND revoked_at IS NULL AND ends_at<=NOW()
    RETURNING target_id,metadata
  `);
  for (const ban of rows) {
    if (ban.metadata && ban.metadata.restore_active === true) {
      await q('UPDATE jobs SET is_active=TRUE,updated_at=NOW() WHERE id=$1', [ban.target_id]).catch(() => {});
    }
  }
  if (rows.length) console.log(`[ban-system] restored ${rows.length} expired vacancy suspensions`);
}

let maintenanceAt = 0;
async function moderationGate(req, res, next) {
  try {
    await ensureSchema();
    if (Date.now() > maintenanceAt) {
      maintenanceAt = Date.now() + 30_000;
      restoreExpiredJobBans().catch(err => console.warn('[ban-system] restore skipped:', err.message));
    }

    // Appeals, logout and the ban page itself must remain reachable.
    if (req.path === '/ban' || req.path === '/ban/appeal' || req.path === '/logout') return next();

    const currentIpHash = ipHash(req);
    const sessionUserId = Number(req.session?.userId || 0) || null;
    let sessionRole = null;
    if (sessionUserId) {
      const user = (await q('SELECT id,role FROM users WHERE id=$1', [sessionUserId])).rows[0];
      sessionRole = user?.role || null;
      if (currentIpHash) {
        await q(`INSERT INTO user_ip_history(user_id,ip_hash) VALUES($1,$2)
          ON CONFLICT(user_id,ip_hash) DO UPDATE SET last_seen_at=NOW()`, [sessionUserId,currentIpHash]);
      }
    }

    // Admins should never lock themselves out just because they share a network.
    if (sessionRole === 'admin') return next();

    const params = [];
    const checks = [];
    if (sessionUserId) { params.push(sessionUserId); checks.push(`(b.target_id=$${params.length})`); }
    if (currentIpHash) { params.push(currentIpHash); checks.push(`(b.ip_hash=$${params.length})`); }
    if (!checks.length) return next();

    const ban = (await q(`
      SELECT b.*
      FROM site_bans b
      WHERE b.target_type='user' AND b.revoked_at IS NULL AND b.ends_at>NOW()
        AND (${checks.join(' OR ')})
      ORDER BY b.ends_at DESC LIMIT 1
    `, params)).rows[0];
    if (!ban) return next();

    // If the ban was created before we knew the user's IP, capture it on their next request.
    if (!ban.ip_hash && currentIpHash && sessionUserId && Number(ban.target_id) === sessionUserId) {
      await q('UPDATE site_bans SET ip_hash=$1 WHERE id=$2 AND ip_hash IS NULL', [currentIpHash,ban.id]);
      ban.ip_hash = currentIpHash;
    }

    const appeal = (await q(`
      SELECT id,created_at,status FROM reports
      WHERE target_type='user' AND target_id=$1 AND reason_code='ban_appeal'
        AND COALESCE(metadata->>'ban_id','')=$2
      ORDER BY created_at DESC LIMIT 1
    `, [ban.target_id,String(ban.id)])).rows[0] || null;

    const appealSent = Boolean(req.session?.banAppealSent);
    if (req.session) delete req.session.banAppealSent;
    return res.status(403).render('ban', {
      title:'Доступ временно ограничен',
      ban,
      appeal,
      appealSent,
      siteName:process.env.SITE_NAME || 'WORK//ROOM',
    });
  } catch (err) {
    console.error('[ban-system] gate failed:', err.message);
    next();
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error:'Нет доступа.' });
  next();
}

function installRoutes(app) {
  const router = express.Router();

  router.get('/ban', async (req, res) => {
    // Normally moderationGate renders this before routing. This fallback avoids a blank route.
    res.redirect('/');
  });

  router.post('/ban/appeal', async (req, res, next) => {
    try {
      await ensureSchema();
      const banId = Number(req.body.ban_id);
      const comment = clean(req.body.comment, 4000);
      if (!banId || comment.length < 5) {
        if (req.session) req.session.banAppealSent = false;
        return res.redirect(req.get('referer') || '/');
      }
      const ban = (await q(`SELECT * FROM site_bans WHERE id=$1 AND target_type='user' AND revoked_at IS NULL AND ends_at>NOW()`, [banId])).rows[0];
      if (!ban) return res.redirect('/');

      const currentIpHash = ipHash(req);
      const sameUser = Number(req.session?.userId || 0) === Number(ban.target_id);
      const sameIp = Boolean(currentIpHash && ban.ip_hash && currentIpHash === ban.ip_hash);
      if (!sameUser && !sameIp) return res.status(403).send('Appeal does not belong to this ban.');

      const duplicate = await q(`SELECT 1 FROM reports WHERE target_type='user' AND target_id=$1 AND reason_code='ban_appeal' AND status='open' AND COALESCE(metadata->>'ban_id','')=$2`, [ban.target_id,String(ban.id)]);
      if (!duplicate.rowCount) {
        await q(`INSERT INTO reports(reporter_id,target_type,target_id,reason,reason_code,comment,metadata)
          VALUES($1,'user',$2,$3,'ban_appeal',$4,$5::jsonb)`, [
          sameUser ? ban.target_id : null,
          ban.target_id,
          'Обжалование временного бана',
          comment,
          JSON.stringify({ ban_id:String(ban.id), ban_reason:ban.reason, ban_ends_at:ban.ends_at }),
        ]);
      }
      if (req.session) req.session.banAppealSent = true;
      res.redirect('/');
    } catch (err) { next(err); }
  });

  router.post('/admin/users/:id/temp-ban', requireAdmin, async (req, res, next) => {
    try {
      await ensureSchema();
      const targetId = Number(req.params.id);
      if (!targetId || targetId === Number(req.user.id)) {
        if (req.session) req.session.flash = { type:'error', message:'Нельзя временно заблокировать собственный аккаунт.' };
        return res.redirect('/admin/users');
      }
      const target = (await q('SELECT id,username,email FROM users WHERE id=$1', [targetId])).rows[0];
      if (!target) return res.status(404).end();
      const reason = clean(req.body.reason, 1200);
      if (!reason) {
        if (req.session) req.session.flash = { type:'error', message:'Укажите причину временного бана.' };
        return res.redirect('/admin/users');
      }
      const endsAt = new Date(Date.now() + durationMs(req.body.duration_value, req.body.duration_unit));
      const latestIp = (await q('SELECT ip_hash FROM user_ip_history WHERE user_id=$1 ORDER BY last_seen_at DESC LIMIT 1', [targetId])).rows[0]?.ip_hash || null;
      await q(`UPDATE site_bans SET revoked_at=NOW() WHERE target_type='user' AND target_id=$1 AND revoked_at IS NULL AND ends_at>NOW()`, [targetId]);
      await q(`INSERT INTO site_bans(target_type,target_id,ip_hash,reason,ends_at,created_by,metadata)
        VALUES('user',$1,$2,$3,$4,$5,$6::jsonb)`, [targetId,latestIp,reason,endsAt,req.user.id,JSON.stringify({ username:target.username || '', email:target.email || '' })]);
      if (req.session) req.session.flash = { type:'success', message:`@${target.username || target.email} временно заблокирован до ${endsAt.toLocaleString('ru-RU')}.` };
      res.redirect('/admin/users');
    } catch (err) { next(err); }
  });

  router.post('/admin/users/:id/temp-unban', requireAdmin, async (req, res, next) => {
    try {
      await ensureSchema();
      const result = await q(`UPDATE site_bans SET revoked_at=NOW() WHERE target_type='user' AND target_id=$1 AND revoked_at IS NULL AND ends_at>NOW() RETURNING id`, [Number(req.params.id)]);
      if (req.session) req.session.flash = { type:'success', message: result.rowCount ? 'Временный бан снят.' : 'Активного временного бана не было.' };
      res.redirect('/admin/users');
    } catch (err) { next(err); }
  });

  router.post('/admin/jobs/:id/temp-ban', requireAdmin, async (req, res, next) => {
    try {
      await ensureSchema();
      const jobId = Number(req.params.id);
      const job = (await q('SELECT id,title,is_active FROM jobs WHERE id=$1', [jobId])).rows[0];
      if (!job) return res.status(404).end();
      const reason = clean(req.body.reason, 1200);
      if (!reason) {
        if (req.session) req.session.flash = { type:'error', message:'Укажите причину временного скрытия вакансии.' };
        return res.redirect('/admin/jobs');
      }
      const existing = (await q(`SELECT metadata FROM site_bans WHERE target_type='job' AND target_id=$1 AND revoked_at IS NULL AND ends_at>NOW() ORDER BY id DESC LIMIT 1`, [jobId])).rows[0];
      const restoreActive = existing?.metadata?.restore_active === true ? true : Boolean(job.is_active);
      const endsAt = new Date(Date.now() + durationMs(req.body.duration_value, req.body.duration_unit));
      await q(`UPDATE site_bans SET revoked_at=NOW() WHERE target_type='job' AND target_id=$1 AND revoked_at IS NULL AND ends_at>NOW()`, [jobId]);
      await q(`INSERT INTO site_bans(target_type,target_id,reason,ends_at,created_by,metadata)
        VALUES('job',$1,$2,$3,$4,$5::jsonb)`, [jobId,reason,endsAt,req.user.id,JSON.stringify({ restore_active:restoreActive, title:job.title })]);
      await q('UPDATE jobs SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [jobId]);
      if (req.session) req.session.flash = { type:'success', message:`Вакансия временно скрыта до ${endsAt.toLocaleString('ru-RU')}.` };
      res.redirect('/admin/jobs');
    } catch (err) { next(err); }
  });

  router.post('/admin/jobs/:id/temp-unban', requireAdmin, async (req, res, next) => {
    try {
      await ensureSchema();
      const jobId = Number(req.params.id);
      const bans = (await q(`UPDATE site_bans SET revoked_at=NOW() WHERE target_type='job' AND target_id=$1 AND revoked_at IS NULL AND ends_at>NOW() RETURNING metadata`, [jobId])).rows;
      if (bans.some(b => b.metadata?.restore_active === true)) await q('UPDATE jobs SET is_active=TRUE,updated_at=NOW() WHERE id=$1', [jobId]);
      if (req.session) req.session.flash = { type:'success', message: bans.length ? 'Временное скрытие вакансии снято.' : 'Активного временного бана не было.' };
      res.redirect('/admin/jobs');
    } catch (err) { next(err); }
  });

  app.use(router);
}

// ban-system is loaded before social-features.js. social-features wraps this hook,
// so both route packs are inserted before the core terminal 404.
const originalUse = express.application.use;
express.application.use = function workroomBanUse(...args) {
  const isSession = args.some(arg => typeof arg === 'function' && arg.name === 'session');
  const terminal404 = args.some(arg => typeof arg === 'function' && /Такой страницы нет|status\(404\)/.test(Function.prototype.toString.call(arg)));

  if (terminal404 && !this.__workroomBanRoutesInstalled) {
    Object.defineProperty(this, '__workroomBanRoutesInstalled', { value:true });
    installRoutes(this);
  }

  const result = originalUse.apply(this, args);

  if (isSession && !this.__workroomBanGateInstalled) {
    Object.defineProperty(this, '__workroomBanGateInstalled', { value:true });
    originalUse.call(this, moderationGate);
  }
  return result;
};

setInterval(() => restoreExpiredJobBans().catch(() => {}), 60_000).unref();
process.on('exit', () => { if (pool) pool.end().catch(() => {}); });
