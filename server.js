const fs=require('fs');
const path=require('path');
const patch=require('./server-v5-patch');
try{
  const base=fs.readFileSync(path.join(__dirname,'server-base.js'),'utf8');
  const generated=patch(base);
  const out=path.join(__dirname,'server.generated.js');
  fs.writeFileSync(out,generated);
  require(out);
}catch(err){
  console.error(err);
  process.exit(1);
}
