const fs=require('fs');
const path=require('path');
const patch=require('./server-v5-patch');
const OLD_SERVER_BLOB='cd8bf5e50ea1c02c34101dff61cce5db8268dce7';
async function main(){
  const r=await fetch(`https://api.github.com/repos/OskuArt/workroom-forum/git/blobs/${OLD_SERVER_BLOB}`,{headers:{'Accept':'application/vnd.github+json','User-Agent':'constellation-render'}});
  if(!r.ok) throw new Error(`Could not load base server: ${r.status}`);
  const j=await r.json();
  const base=Buffer.from(j.content,'base64').toString('utf8');
  const generated=patch(base);
  const out=path.join(__dirname,'server.generated.js');
  fs.writeFileSync(out,generated);
  require(out);
}
main().catch(err=>{console.error(err);process.exit(1)});
