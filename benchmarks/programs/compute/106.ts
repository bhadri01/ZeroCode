import * as fs from 'fs';
const n: number = Number(fs.readFileSync(0,'utf8').trim());
let s = 0; const M = 4294967291;
for (let i=1;i<=n;i++) s=(s*1000003+i)%M;
console.log(s);
