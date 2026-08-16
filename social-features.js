// WORK//ROOM social/moderation add-on.
// Loaded before server.js. It installs additive routes immediately before the
// app's final 404 handler, so the core server can stay small and stable.

const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 3,
}) : null;

const migrationPromise = pool ? (async () => {
  await pool.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_deleted_at TIMESTAMPTZ;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_deleted_at TIMESTAMPTZ;

    ALTER TABLE reports ADD COLUMN IF NOT EXISTS reason_code TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS comment TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence_media_ids BIGINT[] NOT NULL DEFAULT '{}';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
    ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
      CHECK(target_type IN ('user','post','message','group','job'));
  `);
  console.log('[social] message controls + moderation schema ready');
})().catch(err => {
  console.error('[social] migration failed:', err.message);
  throw err;
}) : Promise.resolve();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('К жалобе можно прикреплять JPG, PNG, WEBP или GIF.'), ok);
  },
});

const clean = (value, max = 5000) => String(value || '').trim().slice(0, max);
const q = (text, params = []) => pool.query(text, params);
const reportLabels = {
  spam: 'Спам',
  insult: 'Оскорбления',
  forbidden: 'Запрещённый контент',
  scam: 'Мошенничество',
  stale: 'Несуществующая вакансия / игнор',
  unfair_rejection: 'Отказали по необоснованным причинам',
  other: 'Другое',
};

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Нужно войти в аккаунт.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа.' });
  next();
}
function setFlash(req, type, message) {
  if (req.session) req.session.flash = { type, message };
}
async function saveEvidence(userId, files = []) {
  const ids = [];
  for (const file of files) {
    const { rows } = await q('INSERT INTO media(owner_id,mime,size_bytes,data) VALUES($1,$2,$3,$4) RETURNING id', [userId, file.mimetype, file.size, file.buffer]);
    ids.push(Number(rows[0].id));
  }
  return ids;
}
async function peerByUsername(username) {
  const { rows } = await q('SELECT id,username,name FROM users WHERE LOWER(username)=LOWER($1) AND is_banned=FALSE', [clean(username, 80)]);
  return rows[0] || null;
}

function installRoutes(app) {
  const router = express.Router();

  router.get('/api/messages/:username/status', requireUser, async (req, res, next) => {
    try {
      await migrationPromise;
      const peer = await peerByUsername(req.params.username);
      if (!peer) return res.status(404).json({ error: 'Диалог не найден.' });
      const { rows } = await q(`
        SELECT id,read_at,edited_at
        FROM messages
        WHERE sender_id=$1 AND receiver_id=$2 AND sender_deleted_at IS NULL
        ORDER BY id DESC LIMIT 500
      `, [req.user.id, peer.id]);
      res.json({ messages: rows.map(r => ({ id:String(r.id), readAt:r.read_at, editedAt:r.edited_at })) });
    } catch (err) { next(err); }
  });

  router.post('/api/messages/:username/read', requireUser, async (req, res, next) => {
    try {
      await migrationPromise;
      const peer = await peerByUsername(req.params.username);
      if (!peer) return res.status(404).json({ error: 'Диалог не найден.' });
      const { rows } = await q(`
        UPDATE messages SET read_at=COALESCE(read_at,NOW())
        WHERE receiver_id=$1 AND sender_id=$2 AND read_at IS NULL
        RETURNING id,read_at
      `, [req.user.id, peer.id]);
      res.json({ ok:true, read:rows.map(r => ({ id:String(r.id), readAt:r.read_at })) });
    } catch (err) { next(err); }
  });

  router.post('/api/messages/:id/edit', requireUser, async (req, res, next) => {
    try {
      await migrationPromise;
      const body = clean(req.body.body, 5000);
      if (!body) return res.status(400).json({ error: 'Сообщение не может быть пустым.' });
      const { rows } = await q(`
        UPDATE messages SET body=$1,edited_at=NOW()
        WHERE id=$2 AND sender_id=$3 AND sender_deleted_at IS NULL
        RETURNING id,body,edited_at
      `, [body, Number(req.params.id), req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Сообщение не найдено или не принадлежит вам.' });
      res.json({ ok:true, message:{ id:String(rows[0].id), body:rows[0].body, editedAt:rows[0].edited_at } });
    } catch (err) { next(err); }
  });

  router.post('/api/messages/:id/delete', requireUser, async (req, res, next) => {
    try {
      await migrationPromise;
      const id = Number(req.params.id);
      const scope = req.body.scope === 'both' ? 'both' : 'self';
      const { rows } = await q('SELECT id,sender_id,receiver_id FROM messages WHERE id=$1', [id]);
      const message = rows[0];
      if (!message || (![message.sender_id,message.receiver_id].map(Number).includes(Number(req.user.id)) && req.user.role !== 'admin')) {
        return res.status(404).json({ error: 'Сообщение не найдено.' });
      }
      if (scope === 'both') {
        if (Number(message.sender_id) !== Number(req.user.id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Удалить у обоих может только автор сообщения.' });
        await q('DELETE FROM messages WHERE id=$1', [id]);
      } else if (Number(message.sender_id) === Number(req.user.id)) {
        await q('UPDATE messages SET sender_deleted_at=NOW() WHERE id=$1', [id]);
      } else {
        await q('UPDATE messages SET receiver_deleted_at=NOW() WHERE id=$1', [id]);
      }
      res.json({ ok:true, id:String(id), scope });
    } catch (err) { next(err); }
  });

  router.post('/api/chat/:username/report', requireUser, async (req, res, next) => {
    try {
      await migrationPromise;
      const peer = await peerByUsername(req.params.username);
      if (!peer) return res.status(404).json({ error: 'Пользователь не найден.' });
      const code = ['spam','insult','forbidden','other'].includes(req.body.reason_code) ? req.body.reason_code : '';
      const comment = clean(req.body.comment, 2500);
      if (!code || (code === 'other' && !comment)) return res.status(400).json({ error: 'Выберите причину. Для «Другое» нужен комментарий.' });
      await q(`INSERT INTO reports(reporter_id,target_type,target_id,reason,reason_code,comment,metadata)
        VALUES($1,'user',$2,$3,$4,$5,$6::jsonb)`, [
        req.user.id, peer.id, reportLabels[code], code, comment,
        JSON.stringify({ context:'conversation', target_username:peer.username, target_name:peer.name || '' }),
      ]);
      setFlash(req, 'success', 'Жалоба на диалог отправлена администратору.');
      res.redirect(`/messages/${encodeURIComponent(peer.username)}`);
    } catch (err) { next(err); }
  });

  router.post('/api/jobs/:id/report', requireUser, upload.array('evidence', 4), async (req, res, next) => {
    try {
      await migrationPromise;
      const job = (await q('SELECT id,title,company,source,source_url FROM jobs WHERE id=$1', [Number(req.params.id)])).rows[0];
      if (!job) return res.status(404).json({ error: 'Вакансия не найдена.' });
      const code = ['scam','stale','unfair_rejection','other'].includes(req.body.reason_code) ? req.body.reason_code : '';
      const comment = clean(req.body.comment, 3000);
      if (!code || (code === 'other' && !comment)) {
        setFlash(req, 'error', 'Выберите причину. Для «Другое» комментарий обязателен.');
        return res.redirect(`/jobs/${job.id}`);
      }
      const evidenceIds = await saveEvidence(req.user.id, req.files || []);
      await q(`INSERT INTO reports(reporter_id,target_type,target_id,reason,reason_code,comment,evidence_media_ids,metadata)
        VALUES($1,'job',$2,$3,$4,$5,$6,$7::jsonb)`, [
        req.user.id, job.id, reportLabels[code], code, comment, evidenceIds,
        JSON.stringify({ job_title:job.title, company:job.company, source:job.source, source_url:job.source_url }),
      ]);
      setFlash(req, 'success', 'Жалоба на вакансию отправлена. Спасибо, что помогаете чистить каталог.');
      res.redirect(`/jobs/${job.id}`);
    } catch (err) { next(err); }
  });

  router.post('/admin/messages/purge', requireAdmin, async (req, res, next) => {
    try {
      await migrationPromise;
      if (clean(req.body.confirm, 80) !== 'УДАЛИТЬ ВСЕ') {
        setFlash(req, 'error', 'Для массового удаления введите «УДАЛИТЬ ВСЕ».');
        return res.redirect('/admin');
      }
      const result = await q('DELETE FROM messages');
      setFlash(req, 'success', `Удалено сообщений: ${result.rowCount}.`);
      res.redirect('/admin');
    } catch (err) { next(err); }
  });

  app.use(router);
}

// Inject the add-on immediately before the core app registers its terminal 404.
const originalUse = express.application.use;
express.application.use = function workroomUse(...args) {
  if (!this.__workroomSocialInstalled) {
    const terminal404 = args.some(arg => typeof arg === 'function' && /Такой страницы нет|status\(404\)/.test(Function.prototype.toString.call(arg)));
    if (terminal404) {
      Object.defineProperty(this, '__workroomSocialInstalled', { value:true, configurable:false });
      installRoutes(this);
    }
  }
  return originalUse.apply(this, args);
};

process.on('exit', () => { if (pool) pool.end().catch(() => {}); });
