// WORK//ROOM lightweight presence system.
// Stores a throttled last_seen_at heartbeat for authenticated users and exposes
// presence only to accepted contacts. No precise activity history is public.

const express = require('express');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max: 2,
});
const q=(text,params=[])=>pool.query(text,params);
const schemaPromise=q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ; CREATE INDEX IF NOT EXISTS users_last_seen_idx ON users(last_seen_at);`)
  .then(()=>console.log('[presence] schema ready')).catch(err=>console.warn('[presence] schema:',err.message));
const lastTouch=new Map();

async function heartbeat(req,_res,next){
  try{
    await schemaPromise;
    if(req.user?.id){
      const id=Number(req.user.id),now=Date.now(),prev=lastTouch.get(id)||0;
      if(now-prev>45_000){lastTouch.set(id,now);q('UPDATE users SET last_seen_at=NOW() WHERE id=$1',[id]).catch(()=>{});}
    }
  }catch(_){}
  next();
}

function requireUser(req,res,next){if(!req.user)return res.status(401).json({error:'Нужно войти.'});next();}

function installRoutes(app){
  const router=express.Router();
  router.get('/api/presence/contacts',requireUser,async(req,res,next)=>{
    try{
      await schemaPromise;
      const {rows}=await q(`
        SELECT u.id,u.username,u.last_seen_at,
          (u.last_seen_at IS NOT NULL AND u.last_seen_at>NOW()-INTERVAL '2 minutes') AS online
        FROM friendships f
        JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
        WHERE f.status='accepted' AND (f.requester_id=$1 OR f.addressee_id=$1) AND u.is_banned=FALSE
        ORDER BY online DESC,u.last_seen_at DESC NULLS LAST
      `,[req.user.id]);
      res.json({contacts:rows.map(r=>({id:String(r.id),username:r.username,online:Boolean(r.online),lastSeenAt:r.last_seen_at}))});
    }catch(err){next(err);}
  });
  app.use(router);
}

const originalUse=express.application.use;
express.application.use=function workroomPresenceUse(...args){
  const isAuthLocals=args.some(arg=>typeof arg==='function' && /applicationStatusLabels/.test(Function.prototype.toString.call(arg)));
  const terminal404=args.some(arg=>typeof arg==='function' && /Такой страницы нет|status\(404\)/.test(Function.prototype.toString.call(arg)));

  // API must be registered before the app's terminal 404 middleware.
  if(terminal404&&!this.__workroomPresenceRoutes){Object.defineProperty(this,'__workroomPresenceRoutes',{value:true});installRoutes(this);}

  const result=originalUse.apply(this,args);
  if(isAuthLocals&&!this.__workroomPresenceHeartbeat){Object.defineProperty(this,'__workroomPresenceHeartbeat',{value:true});originalUse.call(this,heartbeat);}
  return result;
};

process.on('exit',()=>pool.end().catch(()=>{}));
