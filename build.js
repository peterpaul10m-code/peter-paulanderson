const fs=require('fs');
const zlib=require('zlib');
const path=require('path');
const parts=[1,2,3,4].map(i=>fs.readFileSync(`index.part${i}.txt`,'utf8').trim()).join('');
let full=zlib.gunzipSync(Buffer.from(parts,'base64')).toString('utf8');

full=full.replace(
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email captured. <a href="prep-guide.html" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a></div>',
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span aria-hidden="true"> · </span><a id="gymLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Practice Gym →</a> <span style="opacity:.85">Access links expire after 30 minutes.</span></div>'
);
full=full.replace(
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError');",
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink'),gymLink=document.getElementById('gymLink');"
);
full=full.replace(
  "if(!res.ok||!data.ok)throw new Error(data.error||'Your email could not be saved.');\n      success.classList.add('show');\n      button.textContent='Access unlocked';email.disabled=true;if(website)website.disabled=true;",
  "if(!res.ok||!data.ok||!data.guide||!data.gym)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;if(gymLink)gymLink.href=data.gym;\n      success.classList.add('show');\n      button.textContent='Access unlocked';email.disabled=true;if(website)website.disabled=true;"
);
full=full.replace(
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span style="opacity:.85">This access link expires after 30 minutes.</span></div>',
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span aria-hidden="true"> · </span><a id="gymLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Practice Gym →</a> <span style="opacity:.85">Access links expire after 30 minutes.</span></div>'
);
full=full.replace(
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink');",
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink'),gymLink=document.getElementById('gymLink');"
);
full=full.replace(
  "if(!res.ok||!data.ok||!data.guide)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;\n      success.classList.add('show');",
  "if(!res.ok||!data.ok||!data.guide||!data.gym)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;if(gymLink)gymLink.href=data.gym;\n      success.classList.add('show');"
);

if(full.includes('href="prep-guide.html"')) throw new Error('Static prep-guide link still present after patch');
if(!full.includes("guideLink.href=data.guide") || !full.includes("gymLink.href=data.gym")) throw new Error('Protected access-link patch failed');

fs.mkdirSync('private',{recursive:true});
fs.writeFileSync(path.join('private','gym-content.html'),full);

const marker='<div class="gym-intro" id="gym">';
const gymStart=full.indexOf(marker);
if(gymStart<0) throw new Error('Could not locate Gym boundary');
let publicHtml=full.slice(0,gymStart);
publicHtml=publicHtml.replace(/href="#gym"/g,'href="#access"');
publicHtml=publicHtml.replace('Open Practice Gym','Unlock Practice Gym');
publicHtml=publicHtml.replace('then use the Gym below to start building stronger spoken answers.','then unlock the Practice Gym and start building stronger spoken answers.');

const lockedPreview=`\n<section class="marketing-section" id="gym-preview"><div class="marketing-inner"><div class="section-kicker">Practice Gym · email access</div><h2>The 29-question Gym is locked until signup.</h2><p class="section-lead">Submit your email above to receive short-lived access links to the Micro1/Zara Prep Guide and the full Practice Gym. The question bank, guided answers, mock sessions, delivery mechanics, and glossary are not included in the public page source.</p><div class="proof-stats"><div class="proof-stat"><b>29</b><span>practice questions</span></div><div class="proof-stat"><b>35</b><span>adaptive follow-ups</span></div><div class="proof-stat"><b>6 / 8</b><span>mock formats</span></div><div class="proof-stat"><b>30m</b><span>access-link life</span></div></div><div class="hero-actions" style="margin-top:24px"><a class="marketing-primary" href="#access">Unlock Guide + Gym</a></div></div></section>`;

const leadScript=`\n<script>\n(()=>{\n const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink'),gymLink=document.getElementById('gymLink');\n if(!form||!email||!success||!error)return;\n const button=form.querySelector('button[type="submit"]');\n form.addEventListener('submit',async e=>{\n  e.preventDefault();error.classList.remove('show');success.classList.remove('show');\n  if(!email.checkValidity()){email.reportValidity();return;}\n  const original=button.textContent;button.disabled=true;button.textContent='Submitting…';\n  try{\n   const res=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email:email.value.trim(),website:website?website.value:'',source:'micro1-zara-pack'})});\n   let data={};try{data=await res.json()}catch(_){}\n   if(!res.ok||!data.ok||!data.guide||!data.gym)throw new Error(data.error||'Your email could not be saved.');\n   guideLink.href=data.guide;gymLink.href=data.gym;success.classList.add('show');button.textContent='Access unlocked';email.disabled=true;if(website)website.disabled=true;\n  }catch(err){button.disabled=false;button.textContent=original;error.textContent='We could not confirm your signup, so access was not unlocked. Please try again.';error.classList.add('show');}\n });\n})();\n</script>\n</body></html>`;

publicHtml+=lockedPreview+leadScript;
if(publicHtml.includes('Micro1 Generalist Practice Studio') || publicHtml.includes('D.E.R.T.N. · Verbal scenario framework') || publicHtml.includes('CONTINUOUS INTERVIEW REHEARSAL')) throw new Error('Protected Gym content leaked into public index');
if(!publicHtml.includes('The 29-question Gym is locked until signup.')) throw new Error('Locked preview missing');
fs.writeFileSync('index.html',publicHtml);

if(fs.existsSync('prep-guide.html')) throw new Error('Public prep-guide.html must not be present in deployment');
console.log('Built public landing + protected Guide/Gym v3; substantive Gym absent from public HTML');
