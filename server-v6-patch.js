const patchV5=require('./server-v5-patch');

module.exports=function patchServerV6(source){
  let s=patchV5(source);
  const anchor='app.get("/api/admin/audit"';
  if(!s.includes(anchor)) throw new Error('admin audit anchor missing');
  const route=`app.post("/api/admin/appeals/:id/decision", requireAdmin, async(req,res,next)=>{\n  const client=await pool.connect();\n  try{\n    const status=String(req.body.status||"");\n    if(!["reviewing","accepted","rejected"].includes(status)) return res.status(400).json({error:"bad_status"});\n    await client.query("BEGIN");\n    const appeal=(await client.query(\`SELECT * FROM appeals WHERE id=$1 FOR UPDATE\`,[req.params.id])).rows[0];\n    if(!appeal){ await client.query("ROLLBACK"); return res.status(404).json({error:"appeal_not_found"}); }\n    let banRevoked=false;\n    if(status==="accepted"){\n      const result=await client.query(\`UPDATE bans SET active=FALSE,revoked_at=NOW() WHERE id=$1 AND active=TRUE RETURNING id\`,[appeal.ban_id]);\n      banRevoked=result.rowCount>0;\n    }\n    await client.query(\`UPDATE appeals SET status=$2,updated_at=NOW() WHERE id=$1\`,[appeal.id,status]);\n    await client.query(\`INSERT INTO audit_log(actor,action,target,payload) VALUES('admin',$1,$2,$3)\`,[status==="accepted"?"appeal_accept_unban":status==="rejected"?"appeal_reject":"appeal_review",appeal.user_id||appeal.email||appeal.id,JSON.stringify({appealId:appeal.id,banId:appeal.ban_id,banRevoked})]);\n    await client.query("COMMIT");\n    res.json({ok:true,status,banRevoked});\n  }catch(e){\n    try{await client.query("ROLLBACK")}catch{}\n    next(e);\n  }finally{client.release()}\n});\n\n`;
  return s.replace(anchor,route+anchor);
};
