const fs=require('fs');
const path=require('path');
const patchV6=require('./server-v6-patch');
const patchChat=require('./server-chat-fix');
const patchV7Features=require('./server-v7-features');
const patchV8Features=require('./server-v8-features');
const patchV9AccountDelete=require('./server-v9-account-delete');
const patchV10MessageActions=require('./server-v10-message-actions');
try{
  const base=fs.readFileSync(path.join(__dirname,'server-base.js'),'utf8');
  const generated=patchV10MessageActions(patchV9AccountDelete(patchV8Features(patchV7Features(patchChat(patchV6(base))))));
  const out=path.join(__dirname,'server.generated.js');
  fs.writeFileSync(out,generated);
  require(out);
}catch(err){
  console.error(err);
  process.exit(1);
}
