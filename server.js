const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.csv');
const ENTITLEMENTS_FILE = path.join(DATA_DIR, 'premium-entitlements.json');
const GUIDE_FILE = path.join(ROOT, 'private', 'guide-content.html');
const FREE_GYM_FILE = path.join(ROOT, 'private', 'free-gym-content.html');
const PREMIUM_GYM_FILE = path.join(ROOT, 'private', 'premium-gym-content.html');

const EXPORT_TOKEN = process.env.LEAD_EXPORT_TOKEN || '';
const GUIDE_SECRET = process.env.GUIDE_ACCESS_SECRET || '';
const OWNER_SECRET = process.env.OWNER_ACCESS_SECRET || '';
const FIELD_GUIDE_CHECKOUT_URL = (process.env.FIELD_GUIDE_CHECKOUT_URL || '').trim();
const LEMON_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || '';
const LEMON_VARIANT_ID = String(process.env.LEMON_SQUEEZY_VARIANT_ID || '').trim();
const PREMIUM_PERSISTENCE_READY = String(process.env.PREMIUM_PERSISTENCE_READY || '').toLowerCase() === 'true';
const PRIVATE_SOURCE_READY = String(process.env.PRIVATE_SOURCE_READY || '').toLowerCase() === 'true';
const ADSENSE_CLIENT_ID = String(process.env.ADSENSE_CLIENT_ID || '').trim();
const ADSENSE_SLOT_INLINE = String(process.env.ADSENSE_SLOT_INLINE || '').trim();
const ADSENSE_SLOT_FOOTER = String(process.env.ADSENSE_SLOT_FOOTER || '').trim();

const OWNER_CONFIGURED = OWNER_SECRET.length >= 24 && OWNER_SECRET !== 'owner-access-not-configured';
const CHECKOUT_CONFIGURED = /^https:\/\//i.test(FIELD_GUIDE_CHECKOUT_URL);
const WEBHOOK_CONFIGURED = LEMON_WEBHOOK_SECRET.length >= 6 && !!LEMON_VARIANT_ID;
const PREMIUM_SALES_ENABLED = CHECKOUT_CONFIGURED && WEBHOOK_CONFIGURED && PREMIUM_PERSISTENCE_READY && PRIVATE_SOURCE_READY;
const FREEMIUM_ACTIVE = PREMIUM_SALES_ENABLED;
const ADS_ENABLED = /^ca-pub-\d+$/i.test(ADSENSE_CLIENT_ID) && /^\d+$/.test(ADSENSE_SLOT_INLINE) && /^\d+$/.test(ADSENSE_SLOT_FOOTER);

const ACCESS_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'aig_access';
const MAX_BODY = 256 * 1024;
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 8;
const OWNER_RATE_MAX = 6;
const rate = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, 'created_at,email,source\n', { mode: 0o600 });
if (!fs.existsSync(ENTITLEMENTS_FILE)) fs.writeFileSync(ENTITLEMENTS_FILE, JSON.stringify({orders:{}}, null, 2), { mode: 0o600 });

function send(res, status, body, type='application/json; charset=utf-8', extra={}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function redirect(res, location){res.writeHead(302,{'Location':location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}
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
function normalizeEmail(v){return String(v||'').trim().toLowerCase();}
function appendLead(email, source){
  const normalized=normalizeEmail(email);
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
function sessionFromRequest(req){return verifyToken(parseCookies(req)[SESSION_COOKIE]||'','lead-session');}
function sessionCookie(role,email=''){
  const token=signToken({role,email:normalizeEmail(email)},SESSION_TTL_MS,'lead-session');
  const maxAge=Math.floor(SESSION_TTL_MS/1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function clearSessionCookie(){return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;}
function safeEqual(a,b){
  const aa=Buffer.from(String(a||'')), bb=Buffer.from(String(b||''));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function readBody(req){
  return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(new Error('too_large'));req.destroy();return;}chunks.push(c);});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});
}
function parseBodyBuffer(buffer,ct){
  const raw=buffer.toString('utf8');
  if(ct.includes('application/json')) return JSON.parse(raw||'{}');
  if(ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  throw new Error('unsupported');
}
function safeStatic(urlPath){
  const map={'/':'index.html','/index.html':'index.html','/README.txt':'README.txt'};
  return map[urlPath] ? path.join(ROOT,map[urlPath]) : null;
}
function baseCsp(ads=false){
  if(!ads) return "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
  return "default-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://www.googletagservices.com; media-src 'self' blob:; connect-src 'self' https:; img-src 'self' data: https:; frame-src https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
}
function serveFile(res,file,extra={},ads=false){
  fs.readFile(file,(err,data)=>{if(err)return send(res,404,'Not found','text/plain; charset=utf-8');const ext=path.extname(file);const type=ext==='.html'?'text/html; charset=utf-8':ext==='.txt'?'text/plain; charset=utf-8':'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':baseCsp(ads),...extra});res.end(data);});
}
function authorizedExport(auth){return !!EXPORT_TOKEN && safeEqual(auth,EXPORT_TOKEN);}

function readEntitlements(){
  try{const data=JSON.parse(fs.readFileSync(ENTITLEMENTS_FILE,'utf8'));return data&&typeof data==='object'&&data.orders?data:{orders:{}};}catch(_){return {orders:{}};}
}
function writeEntitlements(data){
  const tmp=ENTITLEMENTS_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});
  fs.renameSync(tmp,ENTITLEMENTS_FILE);
}
function hasPremium(email){
  const e=normalizeEmail(email); if(!e) return false;
  const data=readEntitlements();
  return Object.values(data.orders||{}).some(o=>o&&o.active===true&&normalizeEmail(o.email)===e);
}
function grantPremium({email,orderId,variantId,purchasedAt,testMode}){
  const e=normalizeEmail(email); if(!validEmail(e)||!orderId) return false;
  const data=readEntitlements();
  data.orders[String(orderId)]={email:e,active:true,variantId:String(variantId||''),purchasedAt:purchasedAt||new Date().toISOString(),refundedAt:null,testMode:!!testMode};
  writeEntitlements(data);return true;
}
function revokePremium({orderId,refundedAt}){
  const data=readEntitlements(); const key=String(orderId||'');
  if(!key||!data.orders[key]) return false;
  data.orders[key].active=false;data.orders[key].refundedAt=refundedAt||new Date().toISOString();
  writeEntitlements(data);return true;
}
function hasPremiumSession(session){
  if(!session) return false;
  if(session.role==='owner') return true;
  return !!session.email && hasPremium(session.email);
}
function sessionTier(session){return session?(hasPremiumSession(session)?'premium':'free'):null;}
function authorizedAccess(req,token){
  const session=sessionFromRequest(req);
  if(session && (session.role==='lead'||session.role==='owner')) return {session,tier:sessionTier(session)};
  const short=verifyToken(token||'','lead-access');
  if(short) return {session:short,tier:short.email&&hasPremium(short.email)?'premium':'free'};
  return null;
}
function renderFreeGym(){
  let html=fs.readFileSync(FREE_GYM_FILE,'utf8');
  if(!ADS_ENABLED){
    html=html.replace(/<!--AIG_ADS_HEAD-->/g,'').replace(/<!--AIG_ADS_BOOT-->/g,'');
    html=html.replace(/<!--AIG_AD_1_START-->[\s\S]*?<!--AIG_AD_1_END-->/g,'').replace(/<!--AIG_AD_2_START-->[\s\S]*?<!--AIG_AD_2_END-->/g,'');
    return html;
  }
  html=html.replace(/__ADSENSE_CLIENT__/g,ADSENSE_CLIENT_ID).replace(/__ADSENSE_SLOT_1__/g,ADSENSE_SLOT_INLINE).replace(/__ADSENSE_SLOT_2__/g,ADSENSE_SLOT_FOOTER);
  html=html.replace('<!--AIG_ADS_HEAD-->',`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}" crossorigin="anonymous"></script>`);
  html=html.replace('<!--AIG_ADS_BOOT-->',`<script>document.querySelectorAll('ins.adsbygoogle').forEach(()=>{try{(adsbygoogle=window.adsbygoogle||[]).push({})}catch(_){}});</script>`);
  return html;
}
function serveGym(req,res,token){
  const access=authorizedAccess(req,token);
  if(!access) return send(res,401,'Access requires a valid signup session or unexpired access link.','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  if(!FREEMIUM_ACTIVE || access.tier==='premium') return serveFile(res,PREMIUM_GYM_FILE,{'X-Robots-Tag':'noindex, nofollow, noarchive','Content-Disposition':'inline'},false);
  let html;try{html=renderFreeGym();}catch(_){return send(res,500,'Free Gym unavailable','text/plain; charset=utf-8');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':baseCsp(ADS_ENABLED)});res.end(html);
}
function checkoutUrlFor(email){
  if(!PREMIUM_SALES_ENABLED) return '';
  try{
    const u=new URL(FIELD_GUIDE_CHECKOUT_URL);
    const e=normalizeEmail(email);
    if(e){u.searchParams.set('checkout[email]',e);u.searchParams.set('checkout[custom][aig_email]',e);}
    u.searchParams.set('checkout[custom][source]','ai-interview-gym');
    return u.toString();
  }catch(_){return '';}
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function offerPage(session){
  const tier=sessionTier(session);
  if(tier==='premium') return null;
  const checkout=checkoutUrlFor(session?.email||'');
  const configured=!!checkout;
  const buy=configured?`<a class="buy" href="${escapeHtml(checkout)}" target="_blank" rel="noopener noreferrer">Unlock Premium - $29</a>`:`<span class="buy disabled" aria-disabled="true">Premium checkout coming soon</span>`;
  const status=configured?`<button class="check" id="checkPremium">I completed checkout - check Premium</button><div id="status" class="status"></div>`:`<div class="status">Premium sales are not active yet. Free practice remains available.</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Premium Upgrade · AI Interview Gym</title><style>:root{--bg:#07101f;--card:#101b2f;--ink:#eaf1fb;--muted:#a9b7ca;--blue:#5b8cff;--line:#263955;--green:#8ce0c1}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#07101f,#0b1424);color:var(--ink);font:16px/1.55 system-ui,-apple-system,Segoe UI,Arial,sans-serif}.wrap{max-width:920px;margin:0 auto;padding:52px 22px 72px}.tag{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#9db7ff;font-weight:800}.hero{margin-top:12px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:32px;box-shadow:0 22px 70px rgba(0,0,0,.2)}h1{font-size:44px;line-height:1.03;letter-spacing:-.045em;margin:10px 0 14px}.sub{font-size:19px;color:var(--muted)}.price{display:flex;align-items:end;gap:10px;margin:24px 0 8px}.price b{font-size:48px;line-height:1}.price span{color:var(--muted);padding-bottom:7px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}.item{border:1px solid var(--line);border-radius:14px;padding:16px;background:#0c1728}.item b{display:block;margin-bottom:4px}.item span{color:var(--muted);font-size:14px}.cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.buy,.skip,.check{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:13px 18px;text-decoration:none;font-weight:850;border:0;font-size:15px}.buy{background:var(--blue);color:#fff;min-width:225px}.buy.disabled{opacity:.55}.skip,.check{border:1px solid var(--line);color:var(--ink);background:#0b1525;cursor:pointer}.trust{margin-top:18px;padding:14px 16px;border-left:3px solid var(--green);background:#0c1a27;color:#cce9df;border-radius:8px}.status{margin-top:12px;color:var(--muted);font-size:14px}.foot{margin-top:34px;color:#71839c;font-size:12px}@media(max-width:680px){h1{font-size:35px}.grid{grid-template-columns:1fr}.hero{padding:24px}}</style></head><body><main class="wrap"><div class="tag">Premium · one-time purchase</div><section class="hero"><h1>Unlock the complete interview-prep system.</h1><p class="sub">Keep Questions 1–5 free. Upgrade once for the remaining 24 questions, full mock sessions, an ad-free Gym, and the downloadable Zara Candidate Field Guide.</p><div class="price"><b>$29</b><span>USD · one time</span></div><div class="grid"><div class="item"><b>Questions 6–29</b><span>Unlock the remaining 24 practice questions and follow-ups.</span></div><div class="item"><b>6- and 8-question mocks</b><span>Continuous cumulative-clock interview rehearsal.</span></div><div class="item"><b>Ad-free Premium Gym</b><span>No AdSense code is loaded for Premium users.</span></div><div class="item"><b>33-page Field Guide</b><span>Delivered through your Lemon Squeezy purchase.</span></div></div><div class="trust"><b>Your free Gym remains active.</b> Premium is optional; you can continue Questions 1–5 without purchasing.</div><div class="cta">${buy}<a class="skip" href="/api/gym#gym">Continue Free Gym</a><a class="skip" href="/api/guide">Open Free Prep Guide</a></div>${status}<p class="status">Independent Micro1/Zara preparation material. Premium access is granted only after a verified payment webhook.</p></section><div class="foot">AI Interview Gym · Candidate preparation, not an official Micro1 product.</div></main>${configured?`<script>document.getElementById('checkPremium').onclick=async()=>{const s=document.getElementById('status');s.textContent='Checking purchase status…';try{const r=await fetch('/api/access',{headers:{Accept:'application/json'}}),d=await r.json();if(d.tier==='premium'){s.innerHTML='Premium confirmed. <a style="color:#9db7ff" href="/api/gym#gym">Open Premium Gym →</a>';}else{s.textContent='Payment has not been confirmed yet. If checkout just completed, wait a moment and check again.';}}catch(_){s.textContent='Could not check access right now.';}};</script>`:''}</body></html>`;
}
function ownerPage(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Interview Gym · Owner Access</title><style>body{font:16px/1.5 system-ui;margin:0;background:#0f172a;color:#e2e8f0}.box{max-width:460px;margin:10vh auto;padding:28px;background:#111827;border:1px solid #334155;border-radius:16px}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;margin-top:10px}button{font-weight:800;cursor:pointer}.msg{min-height:24px;margin-top:12px}a{color:#93c5fd}</style></head><body><main class="box"><h1>Owner access</h1><p>Sign in once on this browser to create a 30-day owner Premium session.</p><form id="f"><input id="s" type="password" autocomplete="current-password" required placeholder="Owner access secret"><button>Sign in</button></form><div class="msg" id="m"></div></main><script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const m=document.getElementById('m');m.textContent='Signing in…';const r=await fetch('/api/owner/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:document.getElementById('s').value})});let d={};try{d=await r.json()}catch(_){ }if(r.ok&&d.ok){m.innerHTML='<a href="/api/gym#gym">Open Premium Gym</a> · <a href="/api/guide">Open Prep Guide</a>';}else m.textContent=d.error||'Sign-in failed.';});</script></body></html>`;}
function verifyLemonSignature(raw,signature){
  if(!LEMON_WEBHOOK_SECRET||!signature) return false;
  const digest=Buffer.from(crypto.createHmac('sha256',LEMON_WEBHOOK_SECRET).update(raw).digest('hex'),'utf8');
  const sig=Buffer.from(String(signature),'utf8');
  return digest.length===sig.length && crypto.timingSafeEqual(digest,sig);
}
function processLemonWebhook(payload,eventName){
  const event=String(eventName||payload?.meta?.event_name||'');
  const attrs=payload?.data?.attributes||{};
  const item=attrs.first_order_item||{};
  if(String(item.variant_id||'')!==LEMON_VARIANT_ID) return {ignored:true,reason:'variant'};
  const custom=payload?.meta?.custom_data||{};
  const email=normalizeEmail(custom.aig_email||attrs.user_email||'');
  const orderId=String(payload?.data?.id||item.order_id||'');
  if(!validEmail(email)||!orderId) return {ignored:true,reason:'identity'};
  if(event==='order_created'){
    if(String(attrs.status||'').toLowerCase()!=='paid' || attrs.refunded===true) return {ignored:true,reason:'not_paid'};
    grantPremium({email,orderId,variantId:item.variant_id,purchasedAt:attrs.created_at,testMode:attrs.test_mode});
    return {granted:true};
  }
  if(event==='order_refunded'){
    const total=Number(attrs.total||0), refundedAmount=Number(attrs.refunded_amount||0);
    const fullyRefunded=attrs.refunded===true || (total>0 && refundedAmount>=total);
    if(fullyRefunded){revokePremium({orderId,refundedAt:attrs.refunded_at||new Date().toISOString()});return {revoked:true};}
    return {ignored:true,reason:'partial_refund'};
  }
  return {ignored:true,reason:'event'};
}

const server=http.createServer(async (req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,service:'ai-interview-gym',accessGate:!!GUIDE_SECRET,accessGateVersion:'v6-freemium-server-split',ownerAccess:OWNER_CONFIGURED,premiumSales:PREMIUM_SALES_ENABLED,freemiumActive:FREEMIUM_ACTIVE,premiumPersistence:PREMIUM_PERSISTENCE_READY,privateSource:PRIVATE_SOURCE_READY,lemonWebhook:WEBHOOK_CONFIGURED,ads:ADS_ENABLED});
  if(req.method==='GET' && url.pathname==='/api/access'){
    const session=sessionFromRequest(req), paidTier=sessionTier(session), tier=session?(FREEMIUM_ACTIVE?paidTier:'full'):null;
    return send(res,200,{ok:true,authorized:!!session,role:session?.role||null,tier,guide:session?'/api/guide':null,gym:session?'/api/gym#gym':null,offer:session&&FREEMIUM_ACTIVE&&paidTier==='free'?'/offer':null,sessionDays:30});
  }
  if(req.method==='POST' && url.pathname==='/api/access/logout') return send(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':clearSessionCookie()});
  if(req.method==='GET' && url.pathname==='/owner') return send(res,200,ownerPage(),'text/html; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  if(req.method==='POST' && url.pathname==='/api/owner/session'){
    if(limited(req,'owner',OWNER_RATE_MAX)) return send(res,429,{ok:false,error:'Too many owner sign-in attempts. Try again later.'});
    if(!OWNER_CONFIGURED || !GUIDE_SECRET) return send(res,503,{ok:false,error:'Owner access is not configured.'});
    try{
      const body=parseBodyBuffer(await readBody(req),(req.headers['content-type']||'').toLowerCase());
      if(!safeEqual(body.secret,OWNER_SECRET)) return send(res,401,{ok:false,error:'Invalid owner access secret.'});
      return send(res,200,{ok:true,role:'owner',tier:'premium',guide:'/api/guide',gym:'/api/gym#gym',sessionDays:30},'application/json; charset=utf-8',{'Set-Cookie':sessionCookie('owner')});
    }catch(_){return send(res,400,{ok:false,error:'Unable to sign in.'});}
  }
  if(req.method==='POST' && url.pathname==='/api/lemon/webhook'){
    if(!WEBHOOK_CONFIGURED || !PREMIUM_PERSISTENCE_READY) return send(res,404,'Not found','text/plain; charset=utf-8');
    try{
      const raw=await readBody(req);
      if(!verifyLemonSignature(raw,req.headers['x-signature'])) return send(res,401,{ok:false,error:'Invalid webhook signature.'});
      const payload=JSON.parse(raw.toString('utf8')||'{}');
      const result=processLemonWebhook(payload,req.headers['x-event-name']);
      return send(res,200,{ok:true,...result});
    }catch(_){return send(res,400,{ok:false,error:'Invalid webhook payload.'});
    }
  }
  if(req.method==='GET' && url.pathname==='/offer'){
    const session=sessionFromRequest(req);
    if(!session) return redirect(res,'/#access');
    if(sessionTier(session)==='premium') return redirect(res,'/api/gym#gym');
    return send(res,200,offerPage(session),'text/html; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
  }
  if(req.method==='POST' && url.pathname==='/api/leads'){
    if(limited(req,'lead',RATE_MAX)) return send(res,429,{ok:false,error:'Too many attempts. Please try again later.'});
    try{
      const body=parseBodyBuffer(await readBody(req),(req.headers['content-type']||'').toLowerCase());
      if(body.website) return send(res,200,{ok:true});
      if(!validEmail(body.email)) return send(res,400,{ok:false,error:'Enter a valid email address.'});
      if(!GUIDE_SECRET) return send(res,503,{ok:false,error:'Access is temporarily unavailable.'});
      const result=appendLead(body.email,body.source);
      const premium=hasPremium(result.email);
      const tier=FREEMIUM_ACTIVE?(premium?'premium':'free'):'full';
      const token=signToken({kind:'signup',email:result.email},ACCESS_TTL_MS,'lead-access');
      const encoded=encodeURIComponent(token);
      return send(res,result.duplicate?200:201,{ok:true,tier,guide:`/api/guide?token=${encoded}`,gym:`/api/gym?token=${encoded}#gym`,offer:!premium&&PREMIUM_SALES_ENABLED?'/offer':null,expiresIn:Math.floor(ACCESS_TTL_MS/1000),sessionDays:30,duplicate:result.duplicate,status:result.duplicate?'already_registered':'created'},'application/json; charset=utf-8',{'Set-Cookie':sessionCookie('lead',result.email)});
    }catch(err){
      if(err.message==='unsupported') return send(res,415,{ok:false,error:'Unsupported request format.'});
      return send(res,400,{ok:false,error:'Unable to process signup.'});
    }
  }
  if(req.method==='GET' && url.pathname==='/api/guide'){
    const access=authorizedAccess(req,url.searchParams.get('token'));
    if(!access) return send(res,401,'Access requires a valid signup session or unexpired access link.','text/plain; charset=utf-8',{'X-Robots-Tag':'noindex, nofollow, noarchive'});
    return serveFile(res,GUIDE_FILE,{'X-Robots-Tag':'noindex, nofollow, noarchive','Content-Disposition':'inline'});
  }
  if(req.method==='GET' && url.pathname==='/api/gym') return serveGym(req,res,url.searchParams.get('token'));
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
