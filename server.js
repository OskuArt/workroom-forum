const fs=require('fs');
const path=require('path');
const patchV6=require('./server-v6-patch');
const patchChat=require('./server-chat-fix');
try{
  const base=fs.readFileSync(path.join(__dirname,'server-base.js'),'utf8');
  const generated=patchChat(patchV6(base));
  const out=path.join(__dirname,'server.generated.js');
  fs.writeFileSync(out,generated);
  require(out);
}catch(err){
  console.error(err);
  process.exit(1);
}
