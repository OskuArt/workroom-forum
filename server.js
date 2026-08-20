const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "8mb" }));

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  options: "-c search_path=constellation,public",
});

const SESSION_DAYS = 30;
const DAY = 86400000;
const CODE_MINUTES = 10;
const DEMO_CODE = "111111";
const ALLOW_DEMO_AUTH = String(process.env.ALLOW_DEMO_AUTH || "true").toLowerCase() === "true";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "CONSTELLATION";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const AUTH_PEPPER = process.env.AUTH_PEPPER || process.env.SESSION_SECRET || "constellation-dev-pepper";

const nowIso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const safeEmail = (e) => String(e || "").trim().toLowerCase();
function ipOf(req) {
  const f = req.headers["x-forwarded-for"];
  return String(Array.isArray(f) ? f[0] : (f || req.ip || req.socket.remoteAddress || ""))
    .split(",")[0].trim().replace(/^::ffff:/, "");
}
function pairKey(a,b){ return [String(a), String(b)].sort().join(":"); }
function modeOk(m){ return m === "harmony" || m === "after"; }
function publicProfile(row, mode) {
  const p = row.profile || {};
  const common = p.common || {};
  const block = p[mode] || {};
  return {
    id: row.id,
    version: mode === "harmony" ? row.version_harmony : row.version_after,
    name: common.name || "",
    birthDate: common.birthDate || "",
    city: common.city || "",
    gender: common.gender || "",
    orientation: common.orientation || "",
    photo: common.photo || "",
    tags: common.tags || [],
    bio: block.bio || "",
    harmony: mode === "harmony" ? block : undefined,
    after: mode === "after" ? block : undefined,
    demoLikedYou: !!p.demoLikedYou,
    isDemo: !!row.is_demo,
    tests: row.tests || {},
  };
}

async function initDb() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS constellation`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_versions(
      version INT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed_harmony BOOLEAN NOT NULL DEFAULT FALSE,
      completed_after BOOLEAN NOT NULL DEFAULT FALSE,
      version_harmony INT NOT NULL DEFAULT 1,
      version_after INT NOT NULL DEFAULT 1,
      settings JSONB NOT NULL DEFAULT '{"reminderValue":60,"reminderUnit":"minutes"}'::jsonb,
      last_ip TEXT,
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_codes(
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS decisions(
      from_user TEXT REFERENCES users(id) ON DELETE CASCADE,
      to_user TEXT REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('harmony','after')),
      decision TEXT NOT NULL CHECK(decision IN ('like','pass')),
      target_version INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(from_user,to_user,mode)
    );
    CREATE TABLE IF NOT EXISTS matches(
      id TEXT PRIMARY KEY,
      pair_key TEXT NOT NULL,
      user1 TEXT REFERENCES users(id) ON DELETE CASCADE,
      user2 TEXT REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('harmony','after')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(pair_key,mode)
    );
    CREATE TABLE IF NOT EXISTS messages(
      id BIGSERIAL PRIMARY KEY,
      match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      image_data TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_preferences(
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      muted BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY(user_id,match_id)
    );
    CREATE TABLE IF NOT EXISTS blocks(
      blocker_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(blocker_id,blocked_id)
    );
    CREATE TABLE IF NOT EXISTS dates(
      id TEXT PRIMARY KEY,
      match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('harmony','after')),
      proposer_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      when_at TIMESTAMPTZ NOT NULL,
      place TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','declined','completed','cancelled')),
      reminder_sent JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notifications(
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tests(
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      result TEXT NOT NULL,
      answers JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reports(
      id TEXT PRIMARY KEY,
      reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reported_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bans(
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ip_address TEXT,
      reason TEXT NOT NULL,
      banned_until TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS appeals(
      id TEXT PRIMARY KEY,
      ban_id TEXT REFERENCES bans(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      email TEXT,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log(
      id BIGSERIAL PRIMARY KEY,
      actor TEXT,
      action TEXT NOT NULL,
      target TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dates_when ON dates(when_at);
    CREATE INDEX IF NOT EXISTS idx_bans_ip ON bans(ip_address,active,banned_until);
    CREATE INDEX IF NOT EXISTS idx_bans_user ON bans(user_id,active,banned_until);
    INSERT INTO schema_versions(version) VALUES (1) ON CONFLICT DO NOTHING;
  `);
  await seedDemoUsers();
}

const demoUsers = [
  {
    id:"demo-alina", email:"demo.alina@constellation.local", demoLikedYou:true,
    common:{name:"Алина",birthDate:"2002-04-18",city:"Санкт-Петербург",gender:"woman",orientation:"bi",
      photo:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=85",
      tags:["art","books","coffee","nightowl"]},
    harmony:{goal:"relations",bio:"Иллюстратор. Люблю небольшие выставки, прогулки без маршрута, хороший кофе и разговоры, после которых появляется новая идея.",hobbies:"Рисование, кино, книжные магазины",values:"Честность, любопытство, свобода",relationshipStyle:"Партнёрство и уважение личного пространства"},
    after:{goal:"flirt",bio:"Люблю лёгкий флирт, красивые встречи и ясные договорённости.",pace:"Медленно",interests:"Флирт, свидания, игра с образом",taboos:"Давление, нарушение договорённостей",fetishes:["Игры с образом","Нижнее бельё","Флирт в переписке"]},
    tests:{mbti:"INFP",attachment:"Secure",enneagram:"Тип 4",care:"Время вместе"}
  },
  {
    id:"demo-mira", email:"demo.mira@constellation.local", demoLikedYou:false,
    common:{name:"Мира",birthDate:"1999-09-03",city:"Москва",gender:"woman",orientation:"lesbian",
      photo:"https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=85",
      tags:["music","travel","podcasts"]},
    harmony:{goal:"friendship",bio:"Продюсер подкастов. Люблю концерты, поездки на выходные и людей, с которыми можно спокойно молчать.",hobbies:"Концерты, поездки, подкасты",values:"Уважение, самостоятельность, юмор",relationshipStyle:"Дружба и лёгкое знакомство без спешки"},
    after:null,tests:{mbti:"ENTP",attachment:"Avoidant",enneagram:"Тип 7",care:"Слова поддержки"}
  },
  {
    id:"demo-sasha", email:"demo.sasha@constellation.local", demoLikedYou:true,
    common:{name:"Саша",birthDate:"2001-01-29",city:"Белград",gender:"nonbinary",orientation:"pan",
      photo:"https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=800&q=85",
      tags:["design","running","architecture","travel"]},
    harmony:{goal:"relations",bio:"Работаю с интерфейсами, люблю архитектуру и бег. Нравятся люди, которые умеют строить планы и не боятся менять их.",hobbies:"Дизайн, бег, архитектура",values:"Открытость, гибкость, интерес к миру",relationshipStyle:"Партнёрство с большим количеством совместных планов"},
    after:{goal:"dates",bio:"Люблю прямой флирт и встречи, где всё заранее проговорено.",pace:"По ситуации",interests:"Флирт, быстрые свидания",taboos:"Грубость, игнорирование границ",fetishes:["Ролевые сценарии","Массаж","Косплей"]},
    tests:{mbti:"ENFP",attachment:"Secure",enneagram:"Тип 7",care:"Поступки и помощь"}
  }
];

async function seedDemoUsers() {
  for (const u of demoUsers) {
    const profile = { common:u.common, harmony:u.harmony, after:u.after, demoLikedYou:u.demoLikedYou, tests:u.tests };
    await pool.query(`
      INSERT INTO users(id,email,profile,completed_harmony,completed_after,is_demo)
      VALUES($1,$2,$3,$4,$5,TRUE)
      ON CONFLICT(id) DO UPDATE SET profile=EXCLUDED.profile, completed_harmony=EXCLUDED.completed_harmony,
      completed_after=EXCLUDED.completed_after, updated_at=NOW()
    `,[u.id,u.email,JSON.stringify(profile),!!u.harmony,!!u.after]);
  }
}

async function sendCodeEmail(email, code) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) return false;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method:"POST",
    headers:{"content-type":"application/json","api-key":BREVO_API_KEY},
    body:JSON.stringify({
      sender:{name:BREVO_SENDER_NAME,email:BREVO_SENDER_EMAIL},
      to:[{email}],
      subject:"Код входа в CONSTELLATION",
      htmlContent:`<div style="font-family:Arial,sans-serif"><h2>Твой код входа</h2><div style="font-size:34px;font-weight:800;letter-spacing:6px">${code}</div><p>Код действует ${CODE_MINUTES} минут.</p></div>`
    })
  });
  if (!res.ok) throw new Error("Brevo error "+res.status);
  return true;
}
async function sendReminderEmail(email, name, whenAt, place) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !email || email.endsWith("@constellation.local")) return false;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method:"POST",
    headers:{"content-type":"application/json","api-key":BREVO_API_KEY},
    body:JSON.stringify({
      sender:{name:BREVO_SENDER_NAME,email:BREVO_SENDER_EMAIL},
      to:[{email}],
      subject:`Скоро встреча с ${name}`,
      htmlContent:`<div style="font-family:Arial,sans-serif"><h2>Скоро встреча с ${name}</h2><p>${new Date(whenAt).toLocaleString("ru-RU")}</p><p>${place || "Место уточняется"}</p></div>`
    })
  });
  return res.ok;
}

async function createSession(userId, isAdmin=false) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hash(token);
  await pool.query(`INSERT INTO sessions(token_hash,user_id,is_admin,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '${SESSION_DAYS} days')`,
    [tokenHash,userId||null,isAdmin]);
  return token;
}
async function getSession(req) {
  const raw = (req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("sid="));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice(4));
  const {rows} = await pool.query(`SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>NOW()`,[hash(token)]);
  return rows[0]||null;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie",`sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}; ${process.env.NODE_ENV==="production"?"Secure;":""}`);
}
async function requireUser(req,res,next) {
  try {
    const s = await getSession(req);
    if (!s || !s.user_id || s.is_admin) return res.status(401).json({error:"auth_required"});
    const {rows} = await pool.query(`SELECT * FROM users WHERE id=$1`,[s.user_id]);
    if (!rows[0]) return res.status(401).json({error:"auth_required"});
    req.user=rows[0]; req.session=s; next();
  } catch(e){next(e)}
}
async function requireAdmin(req,res,next) {
  try {
    const s = await getSession(req);
    if (!s || !s.is_admin) return res.status(401).json({error:"admin_required"});
    req.session=s; next();
  } catch(e){next(e)}
}
async function activeBanFor(ip,userId=null) {
  const {rows}=await pool.query(`
    SELECT * FROM bans WHERE active=TRUE AND banned_until>NOW()
    AND (($1::text IS NOT NULL AND ip_address=$1) OR ($2::text IS NOT NULL AND user_id=$2))
    ORDER BY banned_until DESC LIMIT 1
  `,[ip||null,userId||null]);
  return rows[0]||null;
}
app.use("/api", async (req,res,next)=>{
  if (req.path.startsWith("/admin") || req.path==="/appeals" || req.path==="/ban-status" || req.path.startsWith("/auth")) return next();
  try {
    const s=await getSession(req);
    const ban=await activeBanFor(ipOf(req),s?.user_id||null);
    if (ban) return res.status(403).json({error:"banned",ban:{
      id:ban.id,reason:ban.reason,bannedUntil:ban.banned_until,remainingMs:Math.max(0,new Date(ban.banned_until)-Date.now())
    }});
    next();
  } catch(e){next(e)}
});

app.post("/api/auth/request-code", async(req,res,next)=>{
  try{
    const email=safeEmail(req.body.email);
    if(!email || !email.includes("@")) return res.status(400).json({error:"invalid_email"});
    const code = ALLOW_DEMO_AUTH && !BREVO_API_KEY ? DEMO_CODE : String(Math.floor(100000+Math.random()*900000));
    await pool.query(`INSERT INTO auth_codes(email,code_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '${CODE_MINUTES} minutes')
      ON CONFLICT(email) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,created_at=NOW()`,
      [email,hash(code+AUTH_PEPPER)]);
    let sent=false;
    try{sent=await sendCodeEmail(email,code)}catch(e){console.error(e)}
    res.json({ok:true,delivery:sent?"email":"demo",demoCode:(!sent&&ALLOW_DEMO_AUTH)?DEMO_CODE:undefined});
  }catch(e){next(e)}
});
app.post("/api/auth/verify-code", async(req,res,next)=>{
  try{
    const email=safeEmail(req.body.email),code=String(req.body.code||"").trim();
    const {rows}=await pool.query(`SELECT * FROM auth_codes WHERE email=$1 AND expires_at>NOW()`,[email]);
    if(!rows[0] || rows[0].code_hash!==hash(code+AUTH_PEPPER)) return res.status(400).json({error:"invalid_code"});
    await pool.query(`DELETE FROM auth_codes WHERE email=$1`,[email]);
    let u=(await pool.query(`SELECT * FROM users WHERE email=$1`,[email])).rows[0];
    if(!u){
      const uid=id();
      await pool.query(`INSERT INTO users(id,email,last_ip) VALUES($1,$2,$3)`,[uid,email,ipOf(req)]);
      u=(await pool.query(`SELECT * FROM users WHERE id=$1`,[uid])).rows[0];
    }else await pool.query(`UPDATE users SET last_ip=$2,last_seen=NOW() WHERE id=$1`,[u.id,ipOf(req)]);
    const ban=await activeBanFor(ipOf(req),u.id);
    if(ban) return res.status(403).json({error:"banned",ban:{id:ban.id,reason:ban.reason,bannedUntil:ban.banned_until}});
    const token=await createSession(u.id,false);setSessionCookie(res,token);res.json({ok:true});
  }catch(e){next(e)}
});
app.post("/api/logout", async(req,res,next)=>{
  try{const s=await getSession(req);if(s)await pool.query(`DELETE FROM sessions WHERE token_hash=$1`,[s.token_hash]);res.setHeader("Set-Cookie","sid=; Path=/; HttpOnly; Max-Age=0");res.json({ok:true})}catch(e){next(e)}
});
app.get("/api/ban-status", async(req,res,next)=>{
  try{const s=await getSession(req);const ban=await activeBanFor(ipOf(req),s?.user_id||null);res.json({ban:ban?{id:ban.id,reason:ban.reason,bannedUntil:ban.banned_until}:null})}catch(e){next(e)}
});
app.post("/api/appeals", async(req,res,next)=>{
  try{
    const s=await getSession(req),ban=await activeBanFor(ipOf(req),s?.user_id||null);
    if(!ban)return res.status(400).json({error:"no_active_ban"});
    const text=String(req.body.text||"").trim(); if(!text)return res.status(400).json({error:"text_required"});
    let email=s?.user_id?(await pool.query(`SELECT email FROM users WHERE id=$1`,[s.user_id])).rows[0]?.email:null;
    await pool.query(`INSERT INTO appeals(id,ban_id,user_id,email,text) VALUES($1,$2,$3,$4,$5)`,[id(),ban.id,s?.user_id||null,email||safeEmail(req.body.email),text]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.get("/api/me", requireUser, async(req,res,next)=>{
  try{
    const tests=(await pool.query(`SELECT DISTINCT ON(type) type,result,created_at FROM tests WHERE user_id=$1 ORDER BY type,created_at DESC`,[req.user.id])).rows;
    const testMap=Object.fromEntries(tests.map(t=>[t.type,{result:t.result,lastAt:t.created_at}]));
    res.json({user:{
      id:req.user.id,email:req.user.email,profile:req.user.profile,completedHarmony:req.user.completed_harmony,completedAfter:req.user.completed_after,
      versionHarmony:req.user.version_harmony,versionAfter:req.user.version_after,settings:req.user.settings,createdAt:req.user.created_at,tests:testMap
    }});
  }catch(e){next(e)}
});
app.put("/api/me/profile", requireUser, async(req,res,next)=>{
  try{
    const profile=req.body.profile||{},mode=req.body.mode;
    if(!modeOk(mode))return res.status(400).json({error:"bad_mode"});
    const old=req.user.profile||{}, newP={...old,...profile};
    const oldBlock=JSON.stringify(old[mode]||{}),newBlock=JSON.stringify(newP[mode]||{});
    const bump=oldBlock!==newBlock;
    const common=newP.common||{};
    if(!common.name||!common.birthDate||!common.city||!common.photo)return res.status(400).json({error:"profile_incomplete"});
    if(mode==="harmony"){
      await pool.query(`UPDATE users SET profile=$2,completed_harmony=TRUE,version_harmony=version_harmony+$3,updated_at=NOW(),last_ip=$4 WHERE id=$1`,
        [req.user.id,JSON.stringify(newP),bump?1:0,ipOf(req)]);
    }else{
      await pool.query(`UPDATE users SET profile=$2,completed_after=TRUE,version_after=version_after+$3,updated_at=NOW(),last_ip=$4 WHERE id=$1`,
        [req.user.id,JSON.stringify(newP),bump?1:0,ipOf(req)]);
    }
    await pool.query(`INSERT INTO audit_log(actor,action,target,payload) VALUES($1,'profile_update',$1,$2)`,[req.user.id,JSON.stringify({mode,bump})]);
    res.json({ok:true});
  }catch(e){next(e)}
});
app.put("/api/me/settings", requireUser, async(req,res,next)=>{
  try{
    const value=Math.max(1,Number(req.body.reminderValue||60)),unit=["minutes","hours","days"].includes(req.body.reminderUnit)?req.body.reminderUnit:"minutes";
    const settings={...(req.user.settings||{}),reminderValue:value,reminderUnit:unit};
    await pool.query(`UPDATE users SET settings=$2,updated_at=NOW() WHERE id=$1`,[req.user.id,JSON.stringify(settings)]);
    res.json({ok:true,settings});
  }catch(e){next(e)}
});

app.get("/api/discover", requireUser, async(req,res,next)=>{
  try{
    const mode=modeOk(req.query.mode)?req.query.mode:"harmony";
    const col=mode==="harmony"?"completed_harmony":"completed_after";
    const ver=mode==="harmony"?"version_harmony":"version_after";
    const {rows}=await pool.query(`
      SELECT u.*,
        COALESCE((
          SELECT jsonb_object_agg(t.type,t.result) FROM (
            SELECT DISTINCT ON(type) type,result FROM tests WHERE user_id=u.id ORDER BY type,created_at DESC
          ) t
        ),'{}'::jsonb) AS tests
      FROM users u
      LEFT JOIN decisions d ON d.from_user=$1 AND d.to_user=u.id AND d.mode=$2
      WHERE u.id<>$1 AND u.${col}=TRUE
        AND NOT EXISTS(SELECT 1 FROM bans b WHERE b.active=TRUE AND b.user_id=u.id AND b.banned_until>NOW())
        AND NOT EXISTS(SELECT 1 FROM blocks bl WHERE bl.blocker_id=$1 AND bl.blocked_id=u.id)
        AND NOT EXISTS(SELECT 1 FROM blocks bl2 WHERE bl2.blocker_id=u.id AND bl2.blocked_id=$1)
        AND (d.to_user IS NULL OR d.target_version<>u.${ver})
      ORDER BY u.is_demo DESC,u.updated_at DESC
      LIMIT 60
    `,[req.user.id,mode]);
    let list=rows.map(r=>publicProfile(r,mode));
    const min=Number(req.query.ageMin||18),max=Number(req.query.ageMax||99);
    const age=(b)=>{const d=new Date(b),n=new Date();let a=n.getFullYear()-d.getFullYear();const md=n.getMonth()-d.getMonth();if(md<0||(md===0&&n.getDate()<d.getDate()))a--;return a};
    list=list.filter(u=>age(u.birthDate)>=min&&age(u.birthDate)<=max);
    if(req.query.city)list=list.filter(u=>(u.city||"").toLowerCase().includes(String(req.query.city).toLowerCase()));
    if(req.query.gender&&req.query.gender!=="all")list=list.filter(u=>u.gender===req.query.gender);
    if(req.query.orientation&&req.query.orientation!=="all")list=list.filter(u=>u.orientation===req.query.orientation);
    if(req.query.tag)list=list.filter(u=>(u.tags||[]).some(t=>String(t).toLowerCase().includes(String(req.query.tag).toLowerCase())));
    res.json({users:list});
  }catch(e){next(e)}
});
app.post("/api/decision", requireUser, async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const mode=req.body.mode,target=String(req.body.targetUserId||""),decision=req.body.decision;
    if(!modeOk(mode)||!["like","pass"].includes(decision))return res.status(400).json({error:"bad_request"});
    const targetRow=(await client.query(`SELECT * FROM users WHERE id=$1`,[target])).rows[0];
    if(!targetRow)return res.status(404).json({error:"user_not_found"});
    const tv=mode==="harmony"?targetRow.version_harmony:targetRow.version_after;
    await client.query("BEGIN");
    await client.query(`INSERT INTO decisions(from_user,to_user,mode,decision,target_version) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(from_user,to_user,mode) DO UPDATE SET decision=EXCLUDED.decision,target_version=EXCLUDED.target_version,created_at=NOW()`,
      [req.user.id,target,mode,decision,tv]);
    let match=null;
    if(decision==="like"){
      const myVer=mode==="harmony"?req.user.version_harmony:req.user.version_after;
      const reverse=(await client.query(`SELECT decision,target_version FROM decisions WHERE from_user=$1 AND to_user=$2 AND mode=$3`,[target,req.user.id,mode])).rows[0];
      const demoLike=!!targetRow.profile?.demoLikedYou;
      if((reverse&&reverse.decision==="like"&&reverse.target_version===myVer)||demoLike){
        const pk=pairKey(req.user.id,target);
        const existing=(await client.query(`SELECT * FROM matches WHERE pair_key=$1 AND mode=$2`,[pk,mode])).rows[0];
        if(existing) match=existing;
        else{
          const mid=id();
          match=(await client.query(`INSERT INTO matches(id,pair_key,user1,user2,mode) VALUES($1,$2,$3,$4,$5) RETURNING *`,
            [mid,pk,req.user.id,target,mode])).rows[0];
          await client.query(`INSERT INTO messages(match_id,sender_id,kind,body) VALUES($1,NULL,'system','Мэтч случился ✦ Можно начинать разговор.')`,[mid]);
          await client.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'match',$2),($3,'match',$4)`,
            [req.user.id,JSON.stringify({matchId:mid,otherUserId:target,mode}),target,JSON.stringify({matchId:mid,otherUserId:req.user.id,mode})]);
        }
      }
    }
    await client.query("COMMIT");
    if(match && target.startsWith("demo-")){
      setTimeout(async()=>{try{
        const existing=(await pool.query(`SELECT id FROM dates WHERE match_id=$1 AND proposer_id=$2 AND status='pending' LIMIT 1`,[match.id,target])).rows[0];
        if(!existing){
          const when=new Date(Date.now()+2*DAY);
          when.setHours(19,0,0,0);
          const did=id();
          await pool.query(`INSERT INTO dates(id,match_id,mode,proposer_id,when_at,place,status) VALUES($1,$2,$3,$4,$5,$6,'pending')`,
            [did,match.id,mode,target,when.toISOString(),"Кофейня на выбор"]);
          await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'meeting_request',$2)`,
            [req.user.id,JSON.stringify({dateId:did,matchId:match.id,mode,from:target})]);
        }
      }catch(e){console.error(e)}},5000);
    }
    res.json({ok:true,match});
  }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});

app.post("/api/block", requireUser, async(req,res,next)=>{
  try{
    const target=String(req.body.targetUserId||"");
    if(!target||target===req.user.id)return res.status(400).json({error:"bad_target"});
    await pool.query(`INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[req.user.id,target]);
    const {rows}=await pool.query(`SELECT id FROM matches WHERE (user1=$1 AND user2=$2) OR (user1=$2 AND user2=$1)`,[req.user.id,target]);
    for(const m of rows) await pool.query(`DELETE FROM matches WHERE id=$1`,[m.id]);
    await pool.query(`INSERT INTO audit_log(actor,action,target) VALUES($1,'block',$2)`,[req.user.id,target]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.get("/api/matches", requireUser, async(req,res,next)=>{
  try{
    const mode=modeOk(req.query.mode)?req.query.mode:"harmony";
    const {rows}=await pool.query(`
      SELECT m.*, u.*, cp.pinned,cp.muted,
      (SELECT body FROM messages mm WHERE mm.match_id=m.id AND mm.kind<>'system' ORDER BY mm.created_at DESC LIMIT 1) AS last_message
      FROM matches m
      JOIN users u ON u.id=CASE WHEN m.user1=$1 THEN m.user2 ELSE m.user1 END
      LEFT JOIN chat_preferences cp ON cp.user_id=$1 AND cp.match_id=m.id
      WHERE (m.user1=$1 OR m.user2=$1) AND m.mode=$2
      ORDER BY COALESCE(cp.pinned,FALSE) DESC,m.created_at DESC
    `,[req.user.id,mode]);
    res.json({matches:rows.map(r=>({matchId:r.id,mode:r.mode,person:publicProfile(r,mode),pinned:!!r.pinned,muted:!!r.muted,lastMessage:r.last_message||""}))});
  }catch(e){next(e)}
});
async function getMatchFor(userId,matchId){
  return (await pool.query(`SELECT * FROM matches WHERE id=$1 AND (user1=$2 OR user2=$2)`,[matchId,userId])).rows[0];
}
app.get("/api/matches/:id/messages", requireUser, async(req,res,next)=>{
  try{
    const m=await getMatchFor(req.user.id,req.params.id);if(!m)return res.status(404).json({error:"match_not_found"});
    const {rows}=await pool.query(`SELECT * FROM messages WHERE match_id=$1 ORDER BY created_at ASC LIMIT 500`,[m.id]);
    res.json({messages:rows.map(x=>({id:x.id,kind:x.kind,body:x.body,image:x.image_data,senderId:x.sender_id,createdAt:x.created_at}))});
  }catch(e){next(e)}
});
app.post("/api/matches/:id/messages", requireUser, async(req,res,next)=>{
  try{
    const m=await getMatchFor(req.user.id,req.params.id);if(!m)return res.status(404).json({error:"match_not_found"});
    const text=String(req.body.text||"").trim(),image=String(req.body.image||"");
    if(!text&&!image)return res.status(400).json({error:"empty_message"});
    if(image&&!image.startsWith("data:image/"))return res.status(400).json({error:"images_only"});
    const kind=image?"image":"text";
    const row=(await pool.query(`INSERT INTO messages(match_id,sender_id,kind,body,image_data) VALUES($1,$2,$3,$4,$5) RETURNING *`,[m.id,req.user.id,kind,text||null,image||null])).rows[0];
    const other=m.user1===req.user.id?m.user2:m.user1;
    await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'message',$2)`,[other,JSON.stringify({matchId:m.id,mode:m.mode,from:req.user.id})]);
    if(other.startsWith("demo-")){
      setTimeout(async()=>{try{
        const exists=(await pool.query(`SELECT COUNT(*)::int c FROM messages WHERE match_id=$1 AND sender_id=$2`,[m.id,other])).rows[0].c;
        if(!exists){
          await pool.query(`INSERT INTO messages(match_id,sender_id,kind,body) VALUES($1,$2,'text',$3)`,[m.id,other,"Привет! Рада нашему мэтчу 🙂"]);
          await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'message',$2)`,[req.user.id,JSON.stringify({matchId:m.id,mode:m.mode,from:other})]);
        }
      }catch(e){console.error(e)}},2500);
    }
    res.json({ok:true,message:row});
  }catch(e){next(e)}
});
app.patch("/api/matches/:id/preferences", requireUser, async(req,res,next)=>{
  try{
    const m=await getMatchFor(req.user.id,req.params.id);if(!m)return res.status(404).json({error:"match_not_found"});
    const pinned=!!req.body.pinned,muted=!!req.body.muted;
    await pool.query(`INSERT INTO chat_preferences(user_id,match_id,pinned,muted) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id,match_id) DO UPDATE SET pinned=EXCLUDED.pinned,muted=EXCLUDED.muted`,[req.user.id,m.id,pinned,muted]);
    res.json({ok:true,pinned,muted});
  }catch(e){next(e)}
});

app.get("/api/dates", requireUser, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`
      SELECT d.*, m.user1,m.user2,u.profile AS other_profile
      FROM dates d JOIN matches m ON m.id=d.match_id
      JOIN users u ON u.id=CASE WHEN m.user1=$1 THEN m.user2 ELSE m.user1 END
      WHERE m.user1=$1 OR m.user2=$1 ORDER BY d.when_at ASC
    `,[req.user.id]);
    res.json({dates:rows.map(r=>({id:r.id,matchId:r.match_id,mode:r.mode,proposerId:r.proposer_id,when:r.when_at,place:r.place,status:r.status,
      direction:r.proposer_id===req.user.id?"outgoing":"incoming",person:(r.other_profile?.common?.name)||"",photo:(r.other_profile?.common?.photo)||""}))});
  }catch(e){next(e)}
});
app.post("/api/dates", requireUser, async(req,res,next)=>{
  try{
    const m=await getMatchFor(req.user.id,String(req.body.matchId||""));if(!m)return res.status(404).json({error:"match_not_found"});
    const when=new Date(req.body.when);if(!Number.isFinite(+when)||when<=new Date())return res.status(400).json({error:"bad_time"});
    const place=String(req.body.place||"").trim();if(!place)return res.status(400).json({error:"place_required"});
    const did=id(),row=(await pool.query(`INSERT INTO dates(id,match_id,mode,proposer_id,when_at,place,status) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [did,m.id,m.mode,req.user.id,when.toISOString(),place])).rows[0];
    const other=m.user1===req.user.id?m.user2:m.user1;
    await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'meeting_request',$2)`,[other,JSON.stringify({dateId:did,matchId:m.id,mode:m.mode,from:req.user.id})]);
    if(other.startsWith("demo-"))setTimeout(()=>demoDateReply(did,other),2600);
    res.json({ok:true,date:row});
  }catch(e){next(e)}
});
async function demoDateReply(dateId,other){
  try{
    const d=(await pool.query(`SELECT * FROM dates WHERE id=$1`,[dateId])).rows[0];if(!d||d.status!=="pending")return;
    const status=other==="demo-mira"?"declined":"confirmed";
    await pool.query(`UPDATE dates SET status=$2,updated_at=NOW() WHERE id=$1`,[dateId,status]);
    const m=(await pool.query(`SELECT * FROM matches WHERE id=$1`,[d.match_id])).rows[0];
    const recipient=m.user1===other?m.user2:m.user1;
    await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'meeting_reply',$2)`,[recipient,JSON.stringify({dateId,status,mode:d.mode,from:other})]);
  }catch(e){console.error(e)}
}
app.patch("/api/dates/:id/respond", requireUser, async(req,res,next)=>{
  try{
    const status=req.body.status;if(!["confirmed","declined"].includes(status))return res.status(400).json({error:"bad_status"});
    const {rows}=await pool.query(`SELECT d.*,m.user1,m.user2 FROM dates d JOIN matches m ON m.id=d.match_id WHERE d.id=$1 AND (m.user1=$2 OR m.user2=$2)`,[req.params.id,req.user.id]);
    const d=rows[0];if(!d)return res.status(404).json({error:"date_not_found"});
    if(d.proposer_id===req.user.id)return res.status(400).json({error:"proposer_cannot_respond"});
    await pool.query(`UPDATE dates SET status=$2,updated_at=NOW() WHERE id=$1`,[d.id,status]);
    await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'meeting_reply',$2)`,[d.proposer_id,JSON.stringify({dateId:d.id,status,mode:d.mode,from:req.user.id})]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.patch("/api/dates/:id/complete", requireUser, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT d.*,m.user1,m.user2 FROM dates d JOIN matches m ON m.id=d.match_id WHERE d.id=$1 AND (m.user1=$2 OR m.user2=$2)`,[req.params.id,req.user.id]);
    const d=rows[0]; if(!d)return res.status(404).json({error:"date_not_found"});
    if(d.status!=="confirmed")return res.status(400).json({error:"not_confirmed"});
    await pool.query(`UPDATE dates SET status='completed',updated_at=NOW() WHERE id=$1`,[d.id]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.patch("/api/dates/:id", requireUser, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT d.*,m.user1,m.user2 FROM dates d JOIN matches m ON m.id=d.match_id WHERE d.id=$1 AND (m.user1=$2 OR m.user2=$2)`,[req.params.id,req.user.id]);
    const d=rows[0];if(!d)return res.status(404).json({error:"date_not_found"});
    const when=new Date(req.body.when);const place=String(req.body.place||"").trim();
    if(!Number.isFinite(+when)||when<=new Date()||!place)return res.status(400).json({error:"bad_edit"});
    await pool.query(`UPDATE dates SET proposer_id=$2,when_at=$3,place=$4,status='pending',reminder_sent='{}'::jsonb,updated_at=NOW() WHERE id=$1`,
      [d.id,req.user.id,when.toISOString(),place]);
    const other=d.user1===req.user.id?d.user2:d.user1;
    await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'meeting_edit',$2)`,[other,JSON.stringify({dateId:d.id,mode:d.mode,from:req.user.id})]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.get("/api/tests", requireUser, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT DISTINCT ON(type) type,result,answers,created_at FROM tests WHERE user_id=$1 ORDER BY type,created_at DESC`,[req.user.id]);
    res.json({tests:Object.fromEntries(rows.map(x=>[x.type,{result:x.result,lastAt:x.created_at}]))});
  }catch(e){next(e)}
});
app.post("/api/tests/:type", requireUser, async(req,res,next)=>{
  try{
    const type=req.params.type;if(!["mbti","attachment","enneagram","care"].includes(type))return res.status(400).json({error:"bad_type"});
    const prev=(await pool.query(`SELECT created_at FROM tests WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1`,[req.user.id,type])).rows[0];
    if(prev && Date.now()-new Date(prev.created_at)<3*86400000)return res.status(429).json({error:"locked",nextAt:new Date(+new Date(prev.created_at)+3*86400000)});
    const result=String(req.body.result||"").trim();if(!result)return res.status(400).json({error:"result_required"});
    await pool.query(`INSERT INTO tests(user_id,type,result,answers) VALUES($1,$2,$3,$4)`,[req.user.id,type,result,JSON.stringify(req.body.answers||[])]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.get("/api/notifications", requireUser, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80`,[req.user.id]);
    res.json({notifications:rows});
  }catch(e){next(e)}
});
app.post("/api/notifications/read", requireUser, async(req,res,next)=>{
  try{await pool.query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`,[req.user.id]);res.json({ok:true})}catch(e){next(e)}
});
app.post("/api/reports", requireUser, async(req,res,next)=>{
  try{
    const target=String(req.body.targetUserId||""),reason=String(req.body.reason||"").trim(),details=String(req.body.details||"").trim();
    if(!target||!reason||!details)return res.status(400).json({error:"fields_required"});
    const rid=id();await pool.query(`INSERT INTO reports(id,reporter_id,reported_user_id,reason,details) VALUES($1,$2,$3,$4,$5)`,[rid,req.user.id,target,reason,details]);
    await pool.query(`INSERT INTO audit_log(actor,action,target,payload) VALUES($1,'report',$2,$3)`,[req.user.id,target,JSON.stringify({reportId:rid,reason})]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.post("/api/admin/login", async(req,res,next)=>{
  try{
    if(!ADMIN_EMAIL||!ADMIN_PASSWORD)return res.status(503).json({error:"admin_not_configured"});
    const email=safeEmail(req.body.email),password=String(req.body.password||"");
    const a=Buffer.from(email),b=Buffer.from(ADMIN_EMAIL),p=Buffer.from(password),q=Buffer.from(ADMIN_PASSWORD);
    const ok=a.length===b.length&&crypto.timingSafeEqual(a,b)&&p.length===q.length&&crypto.timingSafeEqual(p,q);
    if(!ok)return res.status(401).json({error:"invalid_admin_login"});
    const token=await createSession(null,true);setSessionCookie(res,token);res.json({ok:true});
  }catch(e){next(e)}
});
app.get("/api/admin/me", requireAdmin, (req,res)=>res.json({ok:true,email:ADMIN_EMAIL}));
app.get("/api/admin/reports", requireAdmin, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT r.*,ru.email reporter_email,tu.email reported_email,tu.profile reported_profile FROM reports r LEFT JOIN users ru ON ru.id=r.reporter_id LEFT JOIN users tu ON tu.id=r.reported_user_id ORDER BY r.created_at DESC`);
    res.json({reports:rows});
  }catch(e){next(e)}
});
app.patch("/api/admin/reports/:id", requireAdmin, async(req,res,next)=>{
  try{const st=["new","reviewing","actioned","closed"].includes(req.body.status)?req.body.status:"reviewing";await pool.query(`UPDATE reports SET status=$2,updated_at=NOW() WHERE id=$1`,[req.params.id,st]);res.json({ok:true})}catch(e){next(e)}
});
app.get("/api/admin/users", requireAdmin, async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim().toLowerCase();
    const {rows}=await pool.query(`SELECT id,email,profile,last_ip,is_demo,created_at,last_seen FROM users WHERE $1='' OR LOWER(email) LIKE '%'||$1||'%' OR LOWER(COALESCE(profile->'common'->>'name','')) LIKE '%'||$1||'%' ORDER BY created_at DESC LIMIT 200`,[q]);
    res.json({users:rows});
  }catch(e){next(e)}
});
app.get("/api/admin/bans", requireAdmin, async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT b.*,u.email,u.profile FROM bans b LEFT JOIN users u ON u.id=b.user_id ORDER BY b.created_at DESC`);
    res.json({bans:rows});
  }catch(e){next(e)}
});
app.post("/api/admin/bans", requireAdmin, async(req,res,next)=>{
  try{
    const userId=String(req.body.userId||""),minutes=Math.max(1,Number(req.body.durationMinutes||60)),reason=String(req.body.reason||"").trim();
    if(!userId||!reason)return res.status(400).json({error:"fields_required"});
    const u=(await pool.query(`SELECT * FROM users WHERE id=$1`,[userId])).rows[0];if(!u)return res.status(404).json({error:"user_not_found"});
    const bid=id(),until=new Date(Date.now()+minutes*60000);
    await pool.query(`INSERT INTO bans(id,user_id,ip_address,reason,banned_until) VALUES($1,$2,$3,$4,$5)`,[bid,userId,u.last_ip||null,reason,until.toISOString()]);
    await pool.query(`INSERT INTO audit_log(actor,action,target,payload) VALUES('admin','ban',$1,$2)`,[userId,JSON.stringify({banId:bid,until,reason,ip:u.last_ip})]);
    res.json({ok:true,banId:bid,bannedUntil:until});
  }catch(e){next(e)}
});
app.post("/api/admin/bans/:id/revoke", requireAdmin, async(req,res,next)=>{
  try{await pool.query(`UPDATE bans SET active=FALSE,revoked_at=NOW() WHERE id=$1`,[req.params.id]);res.json({ok:true})}catch(e){next(e)}
});
app.get("/api/admin/appeals", requireAdmin, async(req,res,next)=>{
  try{const {rows}=await pool.query(`SELECT a.*,b.reason,b.banned_until,u.profile,u.email user_email FROM appeals a JOIN bans b ON b.id=a.ban_id LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC`);res.json({appeals:rows})}catch(e){next(e)}
});
app.patch("/api/admin/appeals/:id", requireAdmin, async(req,res,next)=>{
  try{const st=["new","reviewing","accepted","rejected"].includes(req.body.status)?req.body.status:"reviewing";await pool.query(`UPDATE appeals SET status=$2,updated_at=NOW() WHERE id=$1`,[req.params.id,st]);if(st==="accepted"){const a=(await pool.query(`SELECT ban_id FROM appeals WHERE id=$1`,[req.params.id])).rows[0];if(a)await pool.query(`UPDATE bans SET active=FALSE,revoked_at=NOW() WHERE id=$1`,[a.ban_id])}res.json({ok:true})}catch(e){next(e)}
});
app.get("/api/admin/audit", requireAdmin, async(req,res,next)=>{
  try{const {rows}=await pool.query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 250`);res.json({audit:rows})}catch(e){next(e)}
});

async function reminderSweep(){
  try{
    const {rows}=await pool.query(`
      SELECT d.*,m.user1,m.user2,u1.email e1,u1.profile p1,u1.settings s1,u2.email e2,u2.profile p2,u2.settings s2
      FROM dates d JOIN matches m ON m.id=d.match_id JOIN users u1 ON u1.id=m.user1 JOIN users u2 ON u2.id=m.user2
      WHERE d.status='confirmed' AND d.when_at>NOW() AND d.when_at<NOW()+INTERVAL '7 days'
    `);
    for(const d of rows){
      for(const side of [1,2]){
        const uid=d["user"+side],settings=d["s"+side]||{},email=d["e"+side],profile=d["p"+side]||{},other=side===1?d.p2:d.p1;
        const v=Number(settings.reminderValue||60),unit=settings.reminderUnit||"minutes";
        const ms=unit==="days"?v*DAY:unit==="hours"?v*3600000:v*60000;
        const sent=d.reminder_sent||{};
        if(!sent[uid] && new Date(d.when_at)-Date.now()<=ms){
          await pool.query(`INSERT INTO notifications(user_id,type,payload) VALUES($1,'meeting_reminder',$2)`,[uid,JSON.stringify({dateId:d.id,mode:d.mode})]);
          const next={...sent,[uid]:nowIso()};
          await pool.query(`UPDATE dates SET reminder_sent=$2 WHERE id=$1`,[d.id,JSON.stringify(next)]);
          await sendReminderEmail(email,other?.common?.name||"человеком",d.when_at,d.place).catch(console.error);
        }
      }
    }
  }catch(e){console.error("reminder sweep",e)}
}

app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({error:"server_error"});
});

initDb().then(()=>{
  setInterval(reminderSweep,60000);
  reminderSweep();
  app.listen(PORT,()=>console.log(`CONSTELLATION on ${PORT}`));
}).catch(e=>{console.error(e);process.exit(1)});
