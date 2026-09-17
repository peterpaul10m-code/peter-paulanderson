const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.csv');
const EXPORT_TOKEN = process.env.LEAD_EXPORT_TOKEN || '';
const MAX_BODY = 16 * 1024;
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 8;
const rate = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, 'created_at,email,source\n', { mode: 0o600 });

function send(res, status, body, type='application/json; charset=utf-8', extra={}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function ipKey(req){
  const raw=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0,24);
}
function limited(req){
  const key=ipKey(req), now=Date.now();
  const hits=(rate.get(key)||[]).filter(t=>now-t<RATE_WINDOW);
  hits.push(now); rate.set(key,hits);
  return hits.length>RATE_MAX;
}
function csv(v){
  let value=String(v).replace(/[\r\n]+/g,' ');
  if (/^\s*[=+\-@]/.test(value)) value = "'" + value;
  return '"'+value.replace(/"/g,'""')+'"';
}
function validEmail(v){return typeof v==='string' && v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function appendLead(email, source){
  const normalized=email.trim().toLowerCase();
  const existing=fs.readFileSync(LEADS_FILE,'utf8').split(/\r?\n/).slice(1).some(line=>line.includes(csv(normalized)));
  if(!existing) fs.appendFileSync(LEADS_FILE, `${csv(new Date().toISOString())},${csv(normalized)},${csv(source||'micro1-zara-pack')}\n`, { mode:0o600 });
  return {email:normalized, duplicate:existing};
}
function readBody(req){
  return new Promise((resolve,reject)=>{let data='',size=0;req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(new Error('too_large'));req.destroy();return;}data+=c;});req.on('end',()=>resolve(data));req.on('error',reject);});
}
function safeStatic(urlPath){
  const map={'/':'index.html','/index.html':'index.html','/prep-guide.html':'prep-guide.html','/README.txt':'README.txt'};
  return map[urlPath] ? path.join(ROOT,map[urlPath]) : null;
}
function serveFile(res,file){
  fs.readFile(file,(err,data)=>{if(err)return send(res,404,'Not found','text/plain; charset=utf-8');const ext=path.extname(file);const type=ext==='.html'?'text/html; charset=utf-8':ext==='.txt'?'text/plain; charset=utf-8':'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(data);});
}

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,service:'ai-interview-gym-leads'});
  if(req.method==='POST' && url.pathname==='/api/leads'){
    if(limited(req)) return send(res,429,{ok:false,error:'Too many attempts. Please try again later.'});
    try{
      const raw=await readBody(req);let body={};
      const ct=(req.headers['content-type']||'').toLowerCase();
      if(ct.includes('application/json')) body=JSON.parse(raw||'{}');
      else if(ct.includes('application/x-www-form-urlencoded')) body=Object.fromEntries(new URLSearchParams(raw));
      else return send(res,415,{ok:false,error:'Unsupported request format.'});
      if(body.website) return send(res,200,{ok:true,guide:'/prep-guide.html'});
      if(!validEmail(body.email)) return send(res,400,{ok:false,error:'Enter a valid email address.'});
      const result=appendLead(body.email,body.source);
      return send(res,result.duplicate?200:201,{ok:true,guide:'/prep-guide.html',duplicate:result.duplicate,status:result.duplicate?'already_registered':'created'});
    }catch(err){return send(res,400,{ok:false,error:'Unable to process signup.'});}
  }
  if(req.method==='GET' && url.pathname==='/api/leads/export'){
    if(!EXPORT_TOKEN) return send(res,404,'Not found','text/plain; charset=utf-8');
    const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    if(!crypto.timingSafeEqual(Buffer.from(auth.padEnd(EXPORT_TOKEN.length)),Buffer.from(EXPORT_TOKEN.padEnd(auth.length)))) return send(res,401,{ok:false,error:'Unauthorized'});
    const data=fs.readFileSync(LEADS_FILE);
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ai-interview-gym-leads.csv"','Cache-Control':'no-store'});return res.end(data);
  }
  if(req.method==='GET'){
    const file=safeStatic(url.pathname);if(file)return serveFile(res,file);
  }
  return send(res,404,'Not found','text/plain; charset=utf-8');
});
server.listen(PORT,HOST,()=>console.log(`AI Interview Gym running on http://${HOST}:${PORT}`));
