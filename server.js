const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.csv');
const GUIDE_FILE = path.join(ROOT, 'private', 'guide-content.html');
const GYM_FILE = path.join(ROOT, 'private', 'gym-content.html');
const EXPORT_TOKEN = process.env.LEAD_EXPORT_TOKEN || '';
const GUIDE_SECRET = process.env.GUIDE_ACCESS_SECRET || '';
const OWNER_SECRET = process.env.OWNER_ACCESS_SECRET || '';
const FIELD_GUIDE_CHECKOUT_URL = (process.env.FIELD_GUIDE_CHECKOUT_URL || '').trim();
const OWNER_CONFIGURED = OWNER_SECRET.length >= 24 && OWNER_SECRET !== 'owner-access-not-configured';
const OFFER_ENABLED = /^https:\/\//i.test(FIELD_GUIDE_CHECKOUT_URL);
const ACCESS_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'aig_access';
const MAX_BODY = 16 * 1024;
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 8;
const OWNER_RATE_MAX = 6;
const rate = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, 'created_at,email,source\n', { mode: 0o600 });

function send(res, status, body, type='application/json; charset=utf-8', extra={}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function ipKey(req){
  const raw=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0,24);
}
function limited(req,bucket='lead',max=RATE_MAX){
  const key=`${bucket}:${ipKey(req)}`, now=Date.now();
  const hits=(rate.get(key)||[]).filter(t=>now-t<RATE_WINDOW);
  hits.push(now); rate.set(key,hits);
  return hits.length>max;
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
function b64url(input){return Buffer.from(input).toString('base64url');}
function signToken(data, ttlMs, aud){
  if(!GUIDE_SECRET) return '';
  const payload=b64url(JSON.stringify({aud,...data,exp:Date.now()+ttlMs}));
  const sig=crypto.createHmac('sha256',GUIDE_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyToken(token,aud){
  if(!GUIDE_SECRET || typeof token!=='string' || !token) return null;
  const parts=token.split('.'); if(parts.length!==2) return null;
  const [payload,sig]=parts;
  const expected=crypto.createHmac('sha256',GUIDE_SECRET).update(payload).digest('base64url');
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  try{
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(data.aud!==aud || !Number.isFinite(data.exp) || Date.now()>data.exp) return null;
    return data;
  }catch(_){return null;}
}
function parseCookies(req){
  const out={};
  const raw=(req.headers.cookie||'').toString();
  for(const part of raw.split(';')){
    const i=part.indexOf('='); if(i<0) continue;
    const k=part.slice(0,i).trim(), v=part.slice(i+1).trim();
    if(k) out[k]=decodeURIComponent(v);
  }
  return out;
}
function sessionFromRequest(req){
  return verifyToken(parseCookies(req)[SESSION_COOKIE]||'','lead-session');
}
function sessionCookie(role){
  const token=signToken({role},SESSION_TTL_MS,'lead-session');
  const maxAge=Math.floor(SESSION_TTL_MS/1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function clearSessionCookie(){
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a||'')), bb=Buffer.from(String(b||''));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function readBody(req){
  return new Promise((resolve,reject)=>{let data='',size=0;req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(new Error('too_large'));req.destroy();return;}data+=c;});req.on('end',()=>resolve(data));req.on('error',reject);});
}
function parseBody(raw,ct){
  if(ct.includes('application/json')) return JSON.parse(raw||'{}');
  if(ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  throw new Error('unsupported');
}
function safeStatic(urlPath){
  const map={'/':'index.html','/index.html':'index.html','/README.txt':'README.txt'};
  return map[urlPath] ? path.join(ROOT,map[urlPath]) : null;
}
function serveFile(res,file,extra={}){
  fs.readFile(file,(err,data)=>{if(err)return send(res,404,'Not found','text/plain; charset=utf-8');const ext=path.extname(file);const type=ext==='.html'?'text/html; charset=utf-8':ext==='.txt'?'text/plain; charset=utf-8':'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",...extra});res.end(data);});
}
function authorizedExport(auth){return !!EXPORT_TOKEN && safeEqual(auth,EXPORT_TOKEN);}
function authorizedAccess(req,token){
  const session=sessionFromRequest(req);
  if(session && (session.role==='lead'||session.role==='owner')) return session;
  return verifyToken(token||'','lead-access');
}
function protectedHtml(req,res,file,token){
  const access=authorizedAccess(req,token);
  if(!access) return send(res,401,'Access requires a valid signup session or unexpired access link.','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  return serveFile(res,file,{'X-Robots-Tag':'noindex, nofollow, noarchive','Content-Disposition':'inline'});
}

function offerPage(checkoutUrl){
  const safeCheckout=String(checkoutUrl||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Special Offer · Zara Candidate Field Guide</title><style>
  :root{--bg:#07101f;--card:#101b2f;--ink:#eaf1fb;--muted:#a9b7ca;--blue:#5b8cff;--line:#263955;--green:#8ce0c1}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#07101f,#0b1424);color:var(--ink);font:16px/1.55 Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif}.wrap{max-width:900px;margin:0 auto;padding:52px 22px 72px}.tag{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#9db7ff;font-weight:800}.hero{margin-top:12px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:32px;box-shadow:0 22px 70px rgba(0,0,0,.2)}h1{font-size:44px;line-height:1.03;letter-spacing:-.045em;margin:10px 0 14px;max-width:760px}.sub{font-size:19px;color:var(--muted);max-width:760px}.price{display:flex;align-items:end;gap:10px;margin:24px 0 8px}.price b{font-size:48px;line-height:1}.price span{color:var(--muted);padding-bottom:7px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.item{border:1px solid var(--line);border-radius:14px;padding:16px;background:#0c1728}.item b{display:block;margin-bottom:4px}.item span{color:var(--muted);font-size:14px}.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.buy,.skip{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:13px 18px;text-decoration:none;font-weight:850}.buy{background:var(--blue);color:#fff;min-width:245px}.skip{border:1px solid var(--line);color:var(--ink);background:#0b1525}.note{margin-top:16px;color:var(--muted);font-size:13px}.trust{margin-top:18px;padding:14px 16px;border-left:3px solid var(--green);background:#0c1a27;color:#cce9df;border-radius:8px}.foot{margin-top:34px;color:#71839c;font-size:12px}@media(max-width:680px){h1{font-size:35px}.grid{grid-template-columns:1fr}.hero{padding:24px}}
  </style></head><body><main class="wrap"><div class="tag">Post-signup special offer · one-time purchase</div><section class="hero"><h1>Go beyond the free Gym with the Zara Candidate Field Guide.</h1><p class="sub">A focused 33-page rehearsal asset for candidates who want stronger spoken answers without memorizing scripts.</p><div class="price"><b>$29</b><span>USD · one time</span></div><div class="grid"><div class="item"><b>29 response labs</b><span>Stronger vs. weaker model responses for every core practice theme.</span></div><div class="item"><b>D.E.R.T.N. speaking map</b><span>A printable framework for direct answers, evidence, reasoning, tradeoffs, and next steps.</span></div><div class="item"><b>Cutoff-risk reduction</b><span>Practical delivery patterns that reduce false endings and premature turn-taking risk.</span></div><div class="item"><b>Role plug-in templates</b><span>Adaptable examples for audit/risk, quality assurance, and finance/analysis candidates.</span></div></div><div class="trust"><b>Your free Gym access is already active.</b> Buying the guide is optional. Skip this offer and continue practicing immediately.</div><div class="cta"><a class="buy" href="${safeCheckout}" rel="noopener noreferrer">Get the Field Guide - $29</a><a class="skip" href="/api/gym#gym">No thanks - continue to free Gym</a><a class="skip" href="/api/guide">Open free Prep Guide</a></div><p class="note">Independent Micro1/Zara preparation material. No subscription. No claim of access to Micro1 proprietary scoring rules or internal speech-pipeline triggers.</p></section><div class="foot">AI Interview Gym · Candidate preparation, not an official Micro1 product.</div></main></body></html>`;
}

function ownerPage(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Interview Gym · Owner Access</title><style>body{font:16px/1.5 system-ui;margin:0;background:#0f172a;color:#e2e8f0}.box{max-width:460px;margin:10vh auto;padding:28px;background:#111827;border:1px solid #334155;border-radius:16px}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;margin-top:10px}button{font-weight:800;cursor:pointer}.msg{min-height:24px;margin-top:12px}a{color:#93c5fd}</style></head><body><main class="box"><h1>Owner access</h1><p>Sign in once on this browser to create a 30-day owner session.</p><form id="f"><input id="s" type="password" autocomplete="current-password" required placeholder="Owner access secret"><button>Sign in</button></form><div class="msg" id="m"></div></main><script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const m=document.getElementById('m');m.textContent='Signing in…';const r=await fetch('/api/owner/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:document.getElementById('s').value})});let d={};try{d=await r.json()}catch(_){ }if(r.ok&&d.ok){m.innerHTML='<a href="/api/gym#gym">Open Practice Gym</a> · <a href="/api/guide">Open Prep Guide</a>';}else m.textContent=d.error||'Sign-in failed.';});</script></body></html>`;}

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,service:'ai-interview-gym-leads',accessGate:!!GUIDE_SECRET,accessGateVersion:'v5-tripwire-ready',ownerAccess:OWNER_CONFIGURED,fieldGuideOffer:OFFER_ENABLED});
  if(req.method==='GET' && url.pathname==='/api/access'){
    const session=sessionFromRequest(req);
    return send(res,200,{ok:true,authorized:!!session,role:session?.role||null,guide:session?'/api/guide':null,gym:session?'/api/gym#gym':null,offer:session&&OFFER_ENABLED?'/offer':null,sessionDays:30});
  }
  if(req.method==='POST' && url.pathname==='/api/access/logout') return send(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':clearSessionCookie()});
  if(req.method==='GET' && url.pathname==='/owner') return send(res,200,ownerPage(),'text/html; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  if(req.method==='GET' && url.pathname==='/offer'){
    if(!OFFER_ENABLED) return send(res,404,'Offer not configured','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
    const session=sessionFromRequest(req);
    if(!session) return send(res,401,'This offer follows confirmed signup access.','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
    return send(res,200,offerPage(FIELD_GUIDE_CHECKOUT_URL),'text/html; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  }
  if(req.method==='POST' && url.pathname==='/api/owner/session'){
    if(limited(req,'owner',OWNER_RATE_MAX)) return send(res,429,{ok:false,error:'Too many owner sign-in attempts. Try again later.'});
    if(!OWNER_CONFIGURED || !GUIDE_SECRET) return send(res,503,{ok:false,error:'Owner access is not configured.'});
    try{
      const body=parseBody(await readBody(req),(req.headers['content-type']||'').toLowerCase());
      if(!safeEqual(body.secret,OWNER_SECRET)) return send(res,401,{ok:false,error:'Invalid owner access secret.'});
      return send(res,200,{ok:true,role:'owner',guide:'/api/guide',gym:'/api/gym#gym',sessionDays:30},'application/json; charset=utf-8',{'Set-Cookie':sessionCookie('owner')});
    }catch(_){return send(res,400,{ok:false,error:'Unable to sign in.'});}
  }
  if(req.method==='POST' && url.pathname==='/api/leads'){
    if(limited(req,'lead',RATE_MAX)) return send(res,429,{ok:false,error:'Too many attempts. Please try again later.'});
    try{
      const body=parseBody(await readBody(req),(req.headers['content-type']||'').toLowerCase());
      if(body.website) return send(res,200,{ok:true});
      if(!validEmail(body.email)) return send(res,400,{ok:false,error:'Enter a valid email address.'});
      if(!GUIDE_SECRET) return send(res,503,{ok:false,error:'Access is temporarily unavailable.'});
      const result=appendLead(body.email,body.source);
      const token=signToken({kind:'signup'},ACCESS_TTL_MS,'lead-access');
      const encoded=encodeURIComponent(token);
      return send(res,result.duplicate?200:201,{ok:true,guide:`/api/guide?token=${encoded}`,gym:`/api/gym?token=${encoded}#gym`,offer:OFFER_ENABLED?'/offer':null,expiresIn:Math.floor(ACCESS_TTL_MS/1000),sessionDays:30,duplicate:result.duplicate,status:result.duplicate?'already_registered':'created'},'application/json; charset=utf-8',{'Set-Cookie':sessionCookie('lead')});
    }catch(err){
      if(err.message==='unsupported') return send(res,415,{ok:false,error:'Unsupported request format.'});
      return send(res,400,{ok:false,error:'Unable to process signup.'});
    }
  }
  if(req.method==='GET' && url.pathname==='/api/guide') return protectedHtml(req,res,GUIDE_FILE,url.searchParams.get('token'));
  if(req.method==='GET' && url.pathname==='/api/gym') return protectedHtml(req,res,GYM_FILE,url.searchParams.get('token'));
  if(req.method==='GET' && url.pathname==='/prep-guide.html') return send(res,410,'This public guide URL has been retired. Submit the email form to receive access.','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  if(req.method==='GET' && (url.pathname==='/gym' || url.pathname==='/gym.html')) return send(res,401,'The Practice Gym requires an active access session.','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  if(req.method==='GET' && url.pathname==='/api/leads/export'){
    if(!EXPORT_TOKEN) return send(res,404,'Not found','text/plain; charset=utf-8');
    const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    if(!authorizedExport(auth)) return send(res,401,{ok:false,error:'Unauthorized'});
    const data=fs.readFileSync(LEADS_FILE);
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ai-interview-gym-leads.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});return res.end(data);
  }
  if(req.method==='GET'){
    const file=safeStatic(url.pathname);if(file)return serveFile(res,file);
  }
  return send(res,404,'Not found','text/plain; charset=utf-8');
});
server.listen(PORT,HOST,()=>console.log(`AI Interview Gym running on http://${HOST}:${PORT}`));
