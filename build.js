const fs=require('fs');
const zlib=require('zlib');
const path=require('path');

const parts=[1,2,3,4].map(i=>fs.readFileSync(`index.part${i}.txt`,'utf8').trim()).join('');
let full=zlib.gunzipSync(Buffer.from(parts,'base64')).toString('utf8');

const success='<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Access confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span aria-hidden="true"> · </span><a id="gymLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Practice Gym →</a> <span style="opacity:.85">Free access stays active on this browser for 30 days.</span></div>';
[
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email captured. <a href="prep-guide.html" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a></div>',
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span style="opacity:.85">This access link expires after 30 minutes.</span></div>',
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span aria-hidden="true"> · </span><a id="gymLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Practice Gym →</a> <span style="opacity:.85">Access links expire after 30 minutes.</span></div>',
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Access confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span aria-hidden="true"> · </span><a id="gymLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Practice Gym →</a> <span style="opacity:.85">Access stays active on this browser for 30 days.</span></div>'
].forEach(old=>{full=full.replace(old,success)});

full=full.replace(
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError');",
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink'),gymLink=document.getElementById('gymLink');"
);
full=full.replace(
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink');",
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink'),gymLink=document.getElementById('gymLink');"
);
full=full.replace(
  "if(!res.ok||!data.ok)throw new Error(data.error||'Your email could not be saved.');\n      success.classList.add('show');\n      button.textContent='Access unlocked';email.disabled=true;if(website)website.disabled=true;",
  "if(!res.ok||!data.ok||!data.guide||!data.gym)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;if(gymLink)gymLink.href=data.gym;\n      success.classList.add('show');\n      button.textContent='Access active';email.disabled=true;if(website)website.disabled=true;"
);
full=full.replace(
  "if(!res.ok||!data.ok||!data.guide)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;\n      success.classList.add('show');",
  "if(!res.ok||!data.ok||!data.guide||!data.gym)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;if(gymLink)gymLink.href=data.gym;\n      success.classList.add('show');"
);
if(full.includes('href="prep-guide.html"')) throw new Error('Static prep-guide link still present after patch');

fs.mkdirSync('private',{recursive:true});

let premium=full;
premium=premium.replace('<body>','<body data-aig-tier="premium">');
premium=premium.replace('<div class="brand-sub">Micro1 / Zara Pack</div>','<div class="brand-sub">Micro1 / Zara Pack · Premium</div>');
premium=premium.replace('<div class="muted small" style="padding:10px 7px 0">Think in phases, not scripts.</div>','<div class="muted small" style="padding:10px 7px 0">Premium · 29 questions · mocks · ad-free</div>');
fs.writeFileSync(path.join('private','premium-gym-content.html'),premium);

let free=full;
const sourceOpen='<script id="source" type="text/plain">';
const sourceStart=free.indexOf(sourceOpen);
const sourceEnd=free.indexOf('</script>',sourceStart);
if(sourceStart<0||sourceEnd<0) throw new Error('Could not locate embedded training source');
const mdStart=sourceStart+sourceOpen.length;
const md=free.slice(mdStart,sourceEnd);
const q6=md.indexOf('\n### 6.');
const gloss=md.indexOf('\n## Vocabulary glossary');
if(q6<0||gloss<0||gloss<=q6) throw new Error('Could not locate free/premium question boundary');
let freeMd=md.slice(0,q6)+`\n\n## Premium question bank\n\nQuestions 6–29 are intentionally omitted from the free client build. Upgrade to Premium to unlock the remaining 24 questions and the continuous mock simulator.\n`+md.slice(gloss);
free=free.slice(0,mdStart)+freeMd+free.slice(sourceEnd);

free=free.replace('<body>','<body data-aig-tier="free">');
free=free.replace('<div class="brand-sub">Micro1 / Zara Pack</div>','<div class="brand-sub">Micro1 / Zara Pack · Free</div>');
free=free.replace('<div class="muted small" style="padding:10px 7px 0">Think in phases, not scripts.</div>','<div class="muted small" style="padding:10px 7px 0">Free · Questions 1–5 · opening + mechanics</div>');
free=free.replace('<b id="qCount">29</b>','<b id="qCount">5</b>');
free=free.replace('<b id="masteryCount">0 / 29</b>','<b id="masteryCount">0 / 5</b>');
free=free.replace('<button class="nav" data-view="mock">Mock Session</button>','<button class="nav" data-view="mock" title="Premium unlocks continuous 6- and 8-question mocks">Mock Session · Premium</button>');
free=free.replace('<button class="nav cat" data-cat="all">All 29</button><button class="nav cat" data-cat="mechanics">1–12 + 29 · AI evaluation</button><button class="nav cat" data-cat="transfer">13–18 · Professional transfer</button><button class="nav cat" data-cat="behavioral">19–24 · Behavioral adaptability</button><button class="nav cat" data-cat="edge">25–28 · Edge cases & endurance</button>',
  '<button class="nav cat" data-cat="all">Free questions 1–5</button><a class="nav" href="/offer">Unlock Questions 6–29 →</a>');
free=free.replace('29-question mastery bank + Zara Intro + Interview Mechanics','5-question free bank + Interview Opening + Delivery Mechanics');

const mockStart=free.indexOf('<section id="mock" class="hidden">');
const glossStart=free.indexOf('<section id="gloss" class="hidden">',mockStart);
if(mockStart<0||glossStart<0) throw new Error('Could not locate mock section');
const mockLocked=`<section id="mock" class="hidden"><div class="hero"><div class="num">PREMIUM FEATURE</div><h1>Continuous Mock Session</h1><p>The 6- and 8-question cumulative-clock simulator is part of Premium.</p></div><div class="module-card" style="max-width:760px"><h3>Unlock the full rehearsal environment</h3><p>Premium adds Questions 6–29, mixed 6- and 8-question mock interviews, and an ad-free Gym. Your $29 purchase also includes the downloadable Zara Candidate Field Guide.</p><p style="margin-top:18px"><a class="btn primary" href="/offer">See Premium Upgrade - $29</a></p></div></section>\n`;
free=free.slice(0,mockStart)+mockLocked+free.slice(glossStart);

const freeTierBanner=`<div style="margin:0 0 18px;padding:14px 16px;border:1px solid #c9d5e7;border-radius:14px;background:#f6f9ff"><strong>Free plan:</strong> Questions 1–5, Interview Opening, and Delivery Mechanics. <a href="/offer" style="font-weight:800">Upgrade for Questions 6–29 + Mock Sessions + Field Guide →</a></div>`;
free=free.replace('<section id="train">','<section id="train">'+freeTierBanner);

const adCss=`<style>.aig-ad-zone{margin:28px auto;padding:12px;border-top:1px solid #d8e1ee;border-bottom:1px solid #d8e1ee;text-align:center;max-width:970px}.aig-ad-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7d8aa0;margin-bottom:8px}.aig-ad-zone ins{display:block;min-height:90px}</style><!--AIG_ADS_HEAD-->`;
free=free.replace('</head>',adCss+'</head>');
const safeAd1=`<!--AIG_AD_1_START--><div class="aig-ad-zone" aria-label="Advertisement"><div class="aig-ad-label">Advertisement</div><ins class="adsbygoogle" style="display:block" data-ad-client="__ADSENSE_CLIENT__" data-ad-slot="__ADSENSE_SLOT_1__" data-ad-format="auto" data-full-width-responsive="true"></ins></div><!--AIG_AD_1_END-->`;
const safeAd2=`<!--AIG_AD_2_START--><div class="aig-ad-zone" aria-label="Advertisement"><div class="aig-ad-label">Advertisement</div><ins class="adsbygoogle" style="display:block" data-ad-client="__ADSENSE_CLIENT__" data-ad-slot="__ADSENSE_SLOT_2__" data-ad-format="auto" data-full-width-responsive="true"></ins></div><!--AIG_AD_2_END-->`;
free=free.replace('</section>\n\n<section id="interview-mechanics"',safeAd1+'</section>\n\n<section id="interview-mechanics"');
free=free.replace('</main></div><div id="drawer"',safeAd2+'</main></div><div id="drawer"');
free=free.replace('</body></html>','<!--AIG_ADS_BOOT--></body></html>');
fs.writeFileSync(path.join('private','free-gym-content.html'),free);

const marker='<div class="gym-intro" id="gym">';
const gymStart=full.indexOf(marker);
if(gymStart<0) throw new Error('Could not locate Gym boundary');
let publicHtml=full.slice(0,gymStart);
publicHtml=publicHtml.replace(/href="#gym"/g,'href="#access"');
publicHtml=publicHtml.replace('Open Practice Gym','Unlock Free Practice Gym');
publicHtml=publicHtml.replace('then use the Gym below to start building stronger spoken answers.','then unlock the free Practice Gym and start building stronger spoken answers.');

const lockedPreview=`\n<section class="marketing-section" id="gym-preview"><div class="marketing-inner"><div class="section-kicker">Freemium Practice Gym · email access</div><h2>Start free with Questions 1–5. Upgrade only if you need the full bank.</h2><p class="section-lead">Email signup unlocks Interview Opening, Delivery Mechanics, the first five practice questions, and a 30-day browser session. Premium unlocks Questions 6–29, continuous 6- and 8-question mocks, an ad-free Gym, and the Zara Candidate Field Guide.</p><div class="proof-stats"><div class="proof-stat"><b>5</b><span>free questions</span></div><div class="proof-stat"><b>24</b><span>premium questions</span></div><div class="proof-stat"><b>6 / 8</b><span>premium mocks</span></div><div class="proof-stat"><b>$29</b><span>one-time premium</span></div></div><div class="hero-actions" style="margin-top:24px"><a class="marketing-primary" href="#access">Unlock Free Gym</a></div></div></section>`;

const leadScript=`\n<script>\n(()=>{\n const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink'),gymLink=document.getElementById('gymLink');\n if(!form||!email||!success||!error)return;\n const button=form.querySelector('button[type="submit"]');\n const activate=(guide,gym,tier)=>{guideLink.href=guide||'/api/guide';gymLink.href=gym||'/api/gym#gym';const full=tier==='premium'||tier==='full';gymLink.textContent=full?'Open Practice Gym →':'Open Free Practice Gym →';success.classList.add('show');button.textContent=tier==='premium'?'Premium active':(tier==='full'?'Access active':'Free access active');email.disabled=true;if(website)website.disabled=true;};\n fetch('/api/access',{headers:{'Accept':'application/json'}}).then(r=>r.json()).then(d=>{if(d&&d.authorized)activate(d.guide,d.gym,d.tier);}).catch(()=>{});\n form.addEventListener('submit',async e=>{\n  e.preventDefault();error.classList.remove('show');success.classList.remove('show');\n  if(!email.checkValidity()){email.reportValidity();return;}\n  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';\n  try{\n   const res=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email:email.value.trim(),website:website?website.value:'',source:'micro1-zara-pack'})});\n   let data={};try{data=await res.json()}catch(_){}\n   if(!res.ok||!data.ok||!data.guide||!data.gym)throw new Error(data.error||'Your email could not be saved.');\n   if(data.offer){window.location.assign(data.offer);return;}\n   activate(data.guide,data.gym,data.tier);\n  }catch(err){button.disabled=false;button.textContent=original;error.textContent='We could not confirm your signup, so access was not unlocked. Please try again.';error.classList.add('show');}\n });\n})();\n</script>\n</body></html>`;

publicHtml+=lockedPreview+leadScript;
if(publicHtml.includes('Micro1 Generalist Practice Studio') || publicHtml.includes('D.E.R.T.N. · Verbal scenario framework') || publicHtml.includes('CONTINUOUS INTERVIEW REHEARSAL')) throw new Error('Gym content leaked into public index');
if(!publicHtml.includes('Start free with Questions 1–5')) throw new Error('Freemium preview missing');
fs.writeFileSync('index.html',publicHtml);

if(fs.existsSync('prep-guide.html')) throw new Error('Public prep-guide.html must not be present in deployment');
const premiumOut=fs.readFileSync(path.join('private','premium-gym-content.html'),'utf8');
const freeOut=fs.readFileSync(path.join('private','free-gym-content.html'),'utf8');
if(!premiumOut.includes('### 29. Alignment despite a high-quality answer')) throw new Error('Premium build lost question 29');
if(!freeOut.includes('### 5. AI factuality')) throw new Error('Free build lost question 5');
if(freeOut.includes('### 6. Version control') || freeOut.includes('### 29. Alignment despite a high-quality answer')) throw new Error('Premium questions leaked into free build');
if(freeOut.includes('id="mockApp"')) throw new Error('Mock application leaked into free build');
console.log('Built freemium v6: public landing + 5-question free Gym + 29-question premium Gym; paid content absent from free HTML');
