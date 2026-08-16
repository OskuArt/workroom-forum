// hh.ru safety net for WORK//ROOM.
// The primary monitor follows role + vacancy-word templates. If that yields too
// little inventory, this fallback performs broader role-only searches so hh.ru
// never silently disappears from the catalogue.

const { Pool } = require('pg');
const sanitizeHtml = require('sanitize-html');

if (!process.env.DATABASE_URL || String(process.env.VACANCY_MONITOR_ENABLED || 'true') !== 'true') return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max:2,
});
const clean = (v='', max=5000) => String(v || '').replace(/\s+/g,' ').trim().slice(0,max);
const plain = (v='', max=8000) => clean(sanitizeHtml(String(v || ''), { allowedTags:[], allowedAttributes:{} }), max);
const rich = (v='') => sanitizeHtml(String(v || ''), { allowedTags:['p','br','ul','ol','li','strong','b','em','i','h2','h3','h4','blockquote','a','code','pre'], allowedAttributes:{ a:['href','target','rel'] }, allowedSchemes:['http','https','mailto'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const TERMS = [
  ['графический дизайнер','Graphic Design'],['graphic designer','Graphic Design'],['UI UX дизайнер','UI/UX'],['product designer','UI/UX'],
  ['motion designer','Graphic Design'],['иллюстратор','Graphic Design'],['frontend developer','Engineering'],['backend developer','Engineering'],
  ['software engineer','Engineering'],['product manager','Product'],['маркетолог','Marketing'],['performance marketing','Marketing'],
  ['gamedev','GameDev'],['igaming','GameDev'],['data analyst','Data / AI'],['AI engineer','Data / AI'],
];
const TOOL_RE = [
  ['Figma',/\bfigma\b/i],['AdobePhotoshop',/photoshop/i],['AdobeIllustrator',/illustrator/i],['AfterEffects',/after effects/i],
  ['Blender',/\bblender\b/i],['React',/\breact\b/i],['TypeScript',/typescript/i],['JavaScript',/javascript/i],['Python',/\bpython\b/i],
  ['Java',/\bjava\b/i],['SQL',/\bsql\b/i],['Docker',/\bdocker\b/i],['Kubernetes',/kubernetes|\bk8s\b/i],['Unity',/\bunity\b/i],['UnrealEngine',/unreal engine/i],
];
function salary(s) {
  if (!s) return '';
  const f=n=>n ? new Intl.NumberFormat('ru-RU').format(Number(n)) : '';
  const a=f(s.from), b=f(s.to), c=s.currency || '';
  return a&&b ? `${a}–${b} ${c}` : a ? `от ${a} ${c}` : b ? `до ${b} ${c}` : '';
}
function exp(d) { return ({noExperience:'Без опыта',between1And3:'1–3 года',between3And6:'3–6 лет',moreThan6:'6+ лет'})[d?.experience?.id] || ''; }
function mode(d) {
  const s=[d.schedule?.name,...(d.work_format||[]).map(x=>x.name)].join(' ').toLowerCase();
  if (/гибрид|hybrid/.test(s)) return 'Hybrid';
  if (/удал|remote|home/.test(s)) return 'Remote';
  if (/офис|office|на месте/.test(s)) return 'Office';
  return '';
}
function country(text='') {
  const s=String(text);
  const rules=[['Russia',/росси|москв|петербург/i],['Serbia',/serbia|серби|belgrade|beograd|novi sad/i],['Germany',/germany|deutschland|berlin|munich|münchen/i],['United Kingdom',/united kingdom|london|\buk\b/i],['United States',/united states|\busa\b|new york|california/i],['Canada',/canada|toronto|vancouver/i],['UAE',/\buae\b|dubai/i]];
  return rules.find(([,re])=>re.test(s))?.[0] || '';
}
function tags(text='', extra=[]) {
  const out=[]; const add=t=>{const x=String(t||'').replace(/[^\p{L}\p{N}+.#-]+/gu,'');if(x&&!out.some(v=>v.toLowerCase()===x.toLowerCase()))out.push(x)};
  extra.forEach(add); TOOL_RE.forEach(([t,re])=>{if(re.test(text)) add(t)}); return out.slice(0,18);
}
function looksRu(text='') { const letters=String(text).match(/[A-Za-zА-Яа-яЁё]/g)||[]; const cyr=String(text).match(/[А-Яа-яЁё]/g)||[]; return letters.length && cyr.length/letters.length>.35; }
async function translate(text='') {
  const p=plain(text,6000); if(!p || looksRu(p)) return p;
  const chunks=[]; for(let i=0;i<p.length;i+=1500) chunks.push(p.slice(i,i+1500));
  const out=[];
  for(const chunk of chunks.slice(0,4)) {
    try {
      const u=new URL('https://translate.googleapis.com/translate_a/single');
      u.searchParams.set('client','gtx');u.searchParams.set('sl','auto');u.searchParams.set('tl','ru');u.searchParams.set('dt','t');u.searchParams.set('q',chunk);
      const r=await fetch(u,{signal:AbortSignal.timeout(10000)}); if(!r.ok) throw new Error(String(r.status)); const j=await r.json();
      out.push((j?.[0]||[]).map(x=>x?.[0]||'').join('') || chunk);
    } catch { out.push(chunk); }
  }
  return out.join('\n\n');
}

async function broadHH() {
  const existing = await pool.query(`SELECT COUNT(*)::int AS c FROM jobs WHERE is_active=TRUE AND source='hh.ru'`);
  if (Number(existing.rows[0]?.c || 0) >= 20) return;

  const headers={accept:'application/json','user-agent':`WORKROOM/2.0 (${clean(process.env.ADMIN_EMAIL||'workroom',160)})`,'hh-user-agent':`WORKROOM/2.0 (${clean(process.env.ADMIN_EMAIL||'workroom',160)})`};
  const period=Math.max(1,Math.min(7,Number(process.env.HH_PERIOD_DAYS||3)));
  const found=new Map();
  for(const [term,sector] of TERMS) {
    try {
      const u=new URL('https://api.hh.ru/vacancies');u.searchParams.set('text',term);u.searchParams.set('period',String(period));u.searchParams.set('order_by','publication_time');u.searchParams.set('per_page','20');
      const r=await fetch(u,{headers,signal:AbortSignal.timeout(14000)});if(!r.ok) continue;const j=await r.json();for(const item of j.items||[]) if(!found.has(String(item.id))) found.set(String(item.id),{item,term,sector});
      await sleep(70);
    } catch {}
  }

  let imported=0;
  for(const {item,term,sector} of [...found.values()].slice(0,120)) {
    try {
      const r=await fetch(`https://api.hh.ru/vacancies/${encodeURIComponent(item.id)}`,{headers,signal:AbortSignal.timeout(12000)});const d=r.ok?await r.json():item;
      const desc=d.description||[item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join('\n');const descText=plain(desc,8000);const ru=await translate(descText);
      const loc=d.area?.name||item.area?.name||'';const cn=country(`${loc} ${descText}`);const keySkills=(d.key_skills||[]).map(x=>x.name).filter(Boolean);
      await pool.query(`
        INSERT INTO jobs(external_id,source,source_url,title,company,summary,summary_ru,description_html,description_ru_html,source_language,experience,work_mode,salary,location,country,sector,employment_type,job_tags,imported_query,source_metadata,published_at,is_active,updated_at)
        VALUES($1,'hh.ru',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,TRUE,NOW())
        ON CONFLICT(source_url) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,summary=EXCLUDED.summary,summary_ru=EXCLUDED.summary_ru,description_html=EXCLUDED.description_html,description_ru_html=EXCLUDED.description_ru_html,experience=EXCLUDED.experience,work_mode=EXCLUDED.work_mode,salary=EXCLUDED.salary,location=EXCLUDED.location,country=EXCLUDED.country,sector=EXCLUDED.sector,employment_type=EXCLUDED.employment_type,job_tags=EXCLUDED.job_tags,imported_query=EXCLUDED.imported_query,source_metadata=EXCLUDED.source_metadata,published_at=EXCLUDED.published_at,is_active=TRUE,updated_at=NOW()
      `,[`hh:${item.id}`,d.alternate_url||item.alternate_url,d.name||item.name,d.employer?.name||item.employer?.name||'Компания',plain([item.snippet?.responsibility,item.snippet?.requirement].filter(Boolean).join(' · ')||descText,520),plain(ru,700),rich(desc),ru.split(/\n{2,}/).map(x=>`<p>${escapeHtml(x)}</p>`).join(''),looksRu(descText)?'ru':'auto',exp(d),mode(d),salary(d.salary||item.salary),loc||cn,cn,sector,d.employment?.name||item.employment?.name||'',tags(descText,keySkills),term,JSON.stringify({fallback:true,hh_id:item.id}),d.published_at?new Date(d.published_at):new Date()]);
      imported++;
    } catch (err) { console.warn(`[hh-safety] ${item.id} skipped:`,err.message); }
  }
  console.log(`[hh-safety] broad fallback imported=${imported}, found=${found.size}`);
}

setTimeout(()=>broadHH().catch(err=>console.warn('[hh-safety] failed:',err.message)),5*60*1000).unref();
setInterval(()=>broadHH().catch(err=>console.warn('[hh-safety] failed:',err.message)),24*60*60*1000).unref();
process.on('exit',()=>pool.end().catch(()=>{}));
