const fs=require('fs');
const zlib=require('zlib');
const bundle=[1,2,3,4].map(i=>fs.readFileSync(`server.commerce.part${i}.txt`,'utf8').trim()).join('');
const source=zlib.gunzipSync(Buffer.from(bundle,'base64')).toString('utf8');
new Function('require','__dirname','__filename','process','Buffer',source)(require,__dirname,__filename,process,Buffer);
