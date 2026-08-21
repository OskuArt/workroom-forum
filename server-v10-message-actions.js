module.exports=function patchV10MessageActions(source){
  let s=source;
  const staticAnchor='app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));';
  if(!s.includes(staticAnchor)) throw new Error('v10 messages: static anchor not found');

  // Use only broadly supported emoji in the reaction picker. Existing stored reactions remain readable.
  s=s.replace(
    'const V7_REACTIONS = new Set(["❤️","😂","🥹","😮","😢","😡","🔥","👏","😍","🤝"]);',
    'const V7_REACTIONS = new Set(["❤️","😂","😊","😮","😢","😡","🔥","👍","😍","😏","🥹","👏","🤝"]);'
  );

  const block=`
async function initV10MessageTables(){
  await pool.query("CREATE TABLE IF NOT EXISTS message_hidden(message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(message_id,user_id))");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_message_hidden_user ON message_hidden(user_id,message_id)");
  await pool.query("UPDATE message_reactions SET emoji='😊' WHERE emoji='🥹'");
}

app.get("/api/matches/:id/messages-v10", requireUser, async(req,res,next)=>{
  try{
    const m=await getMatchFor(req.user.id,req.params.id);
    if(!m)return res.status(404).json({error:"match_not_found"});
    await pool.query("UPDATE messages SET read_at=COALESCE(read_at,NOW()) WHERE match_id=$1 AND sender_id IS NOT NULL AND sender_id<>$2 AND read_at IS NULL",[m.id,req.user.id]);
    const rows=(await pool.query("SELECT msg.* FROM messages msg WHERE msg.match_id=$1 AND NOT EXISTS(SELECT 1 FROM message_hidden mh WHERE mh.message_id=msg.id AND mh.user_id=$2) ORDER BY msg.created_at ASC LIMIT 500",[m.id,req.user.id])).rows;
    const rr=(await pool.query("SELECT mr.message_id,mr.emoji,mr.user_id FROM message_reactions mr JOIN messages msg ON msg.id=mr.message_id WHERE msg.match_id=$1 ORDER BY mr.created_at ASC",[m.id])).rows;
    const grouped={};
    for(const r of rr){
      const k=String(r.message_id);
      grouped[k]=grouped[k]||{};
      grouped[k][r.emoji]=grouped[k][r.emoji]||{emoji:r.emoji,count:0,mine:false};
      grouped[k][r.emoji].count++;
      if(r.user_id===req.user.id)grouped[k][r.emoji].mine=true;
    }
    res.json({messages:rows.map(x=>({id:String(x.id),kind:x.kind,body:x.body,image:x.image_data,senderId:x.sender_id,createdAt:x.created_at,readAt:x.read_at,reactions:Object.values(grouped[String(x.id)]||{})}))});
  }catch(e){next(e)}
});

app.delete("/api/matches/:id/messages/:messageId-v10", requireUser, async(req,res,next)=>{
  try{
    const m=await getMatchFor(req.user.id,req.params.id);
    if(!m)return res.status(404).json({error:"match_not_found"});
    const messageId=String(req.params.messageId||"");
    if(!/^\\d+$/.test(messageId))return res.status(400).json({error:"bad_message_id"});
    const msg=(await pool.query("SELECT id,sender_id FROM messages WHERE id=$1 AND match_id=$2",[messageId,m.id])).rows[0];
    if(!msg)return res.status(404).json({error:"message_not_found"});
    if(!msg.sender_id || msg.sender_id!==req.user.id)return res.status(403).json({error:"own_messages_only"});
    const scope=String(req.body?.scope||"self");
    if(scope==="self"){
      await pool.query("INSERT INTO message_hidden(message_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[messageId,req.user.id]);
      return res.json({ok:true,scope:"self"});
    }
    if(scope==="all"){
      await pool.query("DELETE FROM messages WHERE id=$1 AND match_id=$2",[messageId,m.id]);
      return res.json({ok:true,scope:"all"});
    }
    res.status(400).json({error:"bad_scope"});
  }catch(e){next(e)}
});
`;
  s=s.replace(staticAnchor,block+'\n'+staticAnchor);

  const initAnchor='  await initV8Tables();';
  if(!s.includes(initAnchor)) throw new Error('v10 messages: init anchor not found');
  s=s.replace(initAnchor,initAnchor+'\n  await initV10MessageTables();');
  return s;
};
