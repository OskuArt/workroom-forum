module.exports=function patchV9AccountDelete(source){
  let s=source;
  const anchor='app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));';
  if(!s.includes(anchor)) throw new Error('v9 delete: static anchor not found');
  const block=`
app.delete("/api/account", requireUser, async(req,res,next)=>{
  const client=await pool.connect();
  try{
    if(String(req.body?.confirm||"")!=="DELETE_FOREVER") return res.status(400).json({error:"confirmation_required"});
    const uid=req.user.id;
    const email=req.user.email;
    await client.query("BEGIN");

    // Remove moderation records that would otherwise keep identifying data via SET NULL.
    const banRows=(await client.query("SELECT id FROM bans WHERE user_id=$1",[uid])).rows;
    const banIds=banRows.map(x=>x.id);
    if(banIds.length){
      await client.query("DELETE FROM appeals WHERE ban_id = ANY($1::text[])",[banIds]);
      await client.query("DELETE FROM bans WHERE id = ANY($1::text[])",[banIds]);
    }
    await client.query("DELETE FROM appeals WHERE user_id=$1 OR LOWER(COALESCE(email,''))=LOWER($2)",[uid,email]);
    await client.query("DELETE FROM reports WHERE reporter_id=$1 OR reported_user_id=$1",[uid]);

    // Remove notifications and audit rows held by other accounts if their payload references this user.
    await client.query("DELETE FROM notifications WHERE user_id=$1 OR payload->>'from'=$1 OR payload->>'otherUserId'=$1 OR payload::text LIKE '%' || $1 || '%'",[uid]);
    await client.query("DELETE FROM audit_log WHERE actor=$1 OR target=$1 OR payload::text LIKE '%' || $1 || '%'",[uid]);
    await client.query("DELETE FROM auth_codes WHERE LOWER(email)=LOWER($1)",[email]);

    // All direct account data (sessions, decisions, matches, messages, dates, tests,
    // reactions, achievements, blocks and chat preferences) is removed by FK cascades.
    await client.query("DELETE FROM users WHERE id=$1",[uid]);
    await client.query("COMMIT");

    res.setHeader("Set-Cookie","sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.json({ok:true,deleted:true});
  }catch(e){
    await client.query("ROLLBACK").catch(()=>{});
    next(e);
  }finally{client.release()}
});
`;
  s=s.replace(anchor,block+'\n'+anchor);
  return s;
};
