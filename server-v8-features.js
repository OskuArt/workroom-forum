module.exports=function patchV8Features(source){
  let s=source;
  const staticAnchor='app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));';
  if(!s.includes(staticAnchor)) throw new Error('v8 features: static anchor not found');

  const helpers=`
function v8NormText(v){return String(v||"").trim().toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu," ").split(/\\s+/).filter(Boolean)}
function v8Jaccard(a,b){const A=new Set(a||[]),B=new Set(b||[]);if(!A.size&&!B.size)return 1;const inter=[...A].filter(x=>B.has(x)).length,uni=new Set([...A,...B]).size;return uni?inter/uni:1}
function v8TextSimilarity(a,b){return v8Jaccard(v8NormText(a),v8NormText(b))}
function v8ArraySimilarity(a,b){return v8Jaccard((Array.isArray(a)?a:[]).map(x=>String(x).trim().toLowerCase()),(Array.isArray(b)?b:[]).map(x=>String(x).trim().toLowerCase()))}
function v8RelevantProfile(profile,mode){
  const p=profile||{},c=p.common||{},b=p[mode]||{};
  const photoHash=c.photoHash||((c.photo&&typeof c.photo==="string")?hash(c.photo).slice(0,20):"");
  return {common:{name:c.name||"",birthDate:c.birthDate||"",city:c.city||"",gender:c.gender||"",orientation:c.orientation||"",tags:c.tags||[],languages:c.languages||[],photoHash},[mode]:mode==="harmony"?{goal:b.goal||"",bio:b.bio||""}:{goal:b.goal||"",bio:b.bio||"",pace:b.pace||"",taboos:b.taboos||"",fetishes:b.fetishes||[]}};
}
function v8ProfileChangeRatio(before,current,mode){
  const a=v8RelevantProfile(before,mode),b=v8RelevantProfile(current,mode),ac=a.common,bc=b.common,ab=a[mode]||{},bb=b[mode]||{};
  const sims=[
    ac.name===bc.name?1:0,
    ac.birthDate===bc.birthDate?1:0,
    String(ac.city).toLowerCase()===String(bc.city).toLowerCase()?1:0,
    ac.gender===bc.gender?1:0,
    ac.orientation===bc.orientation?1:0,
    v8ArraySimilarity(ac.tags,bc.tags),
    v8ArraySimilarity(ac.languages,bc.languages),
    ac.photoHash===bc.photoHash?1:0,
    ab.goal===bb.goal?1:0,
    v8TextSimilarity(ab.bio,bb.bio)
  ];
  if(mode==="after")sims.push(ab.pace===bb.pace?1:0,v8TextSimilarity(ab.taboos,bb.taboos),v8ArraySimilarity(ab.fetishes,bb.fetishes));
  return 1-(sims.reduce((x,y)=>x+y,0)/sims.length);
}
function v8ProfileSnapshot(profile,mode){return v8RelevantProfile(profile,mode)}
async function initV8Tables(){
  await pool.query("ALTER TABLE decisions ADD COLUMN IF NOT EXISTS profile_snapshot JSONB");
  const rows=(await pool.query("SELECT d.from_user,d.to_user,d.mode,u.profile FROM decisions d JOIN users u ON u.id=d.to_user WHERE d.profile_snapshot IS NULL")).rows;
  for(const r of rows)await pool.query("UPDATE decisions SET profile_snapshot=$4 WHERE from_user=$1 AND to_user=$2 AND mode=$3",[r.from_user,r.to_user,r.mode,JSON.stringify(v8ProfileSnapshot(r.profile,r.mode))]);
}
`;
  s=s.replace(staticAnchor,helpers+'\n'+staticAnchor);

  const selectAnchor='      SELECT u.*,\n        COALESCE((';
  if(!s.includes(selectAnchor)) throw new Error('v8 features: discover select anchor not found');
  s=s.replace(selectAnchor,'      SELECT u.*, d.profile_snapshot AS decision_profile_snapshot,\n        COALESCE((');

  const discoverGate='        AND NOT EXISTS(SELECT 1 FROM blocks bl2 WHERE bl2.blocker_id=u.id AND bl2.blocked_id=$1)\n        AND (d.to_user IS NULL OR d.target_version<>u.${ver})';
  if(!s.includes(discoverGate)) throw new Error('v8 features: discover decision gate not found');
  s=s.replace(discoverGate,'        AND NOT EXISTS(SELECT 1 FROM blocks bl2 WHERE bl2.blocker_id=u.id AND bl2.blocked_id=$1)\n        AND NOT EXISTS(SELECT 1 FROM matches mm WHERE mm.mode=$2 AND ((mm.user1=$1 AND mm.user2=u.id) OR (mm.user1=u.id AND mm.user2=$1)))');

  const listAnchor='    let list=rows.map(r=>publicProfile(r,mode));';
  if(!s.includes(listAnchor)) throw new Error('v8 features: discover list anchor not found');
  s=s.replace(listAnchor,'    let list=rows.filter(r=>!r.decision_profile_snapshot || v8ProfileChangeRatio(r.decision_profile_snapshot,r.profile,mode)>0.75).map(r=>publicProfile(r,mode));');

  const targetAnchor='    const targetRow=(await client.query(`SELECT * FROM users WHERE id=$1`,[target])).rows[0];\n    if(!targetRow)return res.status(404).json({error:"user_not_found"});\n    const tv=mode==="harmony"?targetRow.version_harmony:targetRow.version_after;';
  if(!s.includes(targetAnchor)) throw new Error('v8 features: decision target anchor not found');
  s=s.replace(targetAnchor,'    const targetRow=(await client.query(`SELECT * FROM users WHERE id=$1`,[target])).rows[0];\n    if(!targetRow)return res.status(404).json({error:"user_not_found"});\n    const already=(await client.query(`SELECT id FROM matches WHERE mode=$3 AND ((user1=$1 AND user2=$2) OR (user1=$2 AND user2=$1)) LIMIT 1`,[req.user.id,target,mode])).rows[0];\n    if(already)return res.status(409).json({error:"already_matched",matchId:already.id});\n    const tv=mode==="harmony"?targetRow.version_harmony:targetRow.version_after;');

  const decisionInsert='    await client.query(`INSERT INTO decisions(from_user,to_user,mode,decision,target_version) VALUES($1,$2,$3,$4,$5)\n      ON CONFLICT(from_user,to_user,mode) DO UPDATE SET decision=EXCLUDED.decision,target_version=EXCLUDED.target_version,created_at=NOW()`,\n      [req.user.id,target,mode,decision,tv]);';
  if(!s.includes(decisionInsert)) throw new Error('v8 features: decision insert anchor not found');
  s=s.replace(decisionInsert,'    await client.query(`INSERT INTO decisions(from_user,to_user,mode,decision,target_version,profile_snapshot) VALUES($1,$2,$3,$4,$5,$6)\n      ON CONFLICT(from_user,to_user,mode) DO UPDATE SET decision=EXCLUDED.decision,target_version=EXCLUDED.target_version,profile_snapshot=EXCLUDED.profile_snapshot,created_at=NOW()`,\n      [req.user.id,target,mode,decision,tv,JSON.stringify(v8ProfileSnapshot(targetRow.profile,mode))]);');

  const initAnchor='  await initV7Tables();';
  if(!s.includes(initAnchor)) throw new Error('v8 features: init anchor not found');
  s=s.replace(initAnchor,initAnchor+'\n  await initV8Tables();');
  return s;
};