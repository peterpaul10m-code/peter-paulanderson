const fs=require('fs');
const zlib=require('zlib');
const bundle=fs.readFileSync('server.bundle.txt','utf8').trim();
const source=zlib.gunzipSync(Buffer.from(bundle,'base64')).toString('utf8');
eval(source);
