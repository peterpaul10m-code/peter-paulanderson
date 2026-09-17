const fs=require('fs');
const zlib=require('zlib');
const parts=[1,2,3,4].map(i=>fs.readFileSync(`index.part${i}.txt`,'utf8').trim()).join('');
let html=zlib.gunzipSync(Buffer.from(parts,'base64')).toString('utf8');
html=html.replace(
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email captured. <a href="prep-guide.html" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a></div>',
  '<div class="lead-success" id="leadSuccess" role="status" aria-live="polite">Email confirmed. <a id="guideLink" href="#" rel="nofollow" style="color:inherit;font-weight:800">Open the Micro1 / Zara Prep Guide →</a> <span style="opacity:.85">This access link expires after 30 minutes.</span></div>'
);
html=html.replace(
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError');",
  "const form=document.getElementById('leadForm'),email=document.getElementById('leadEmail'),website=document.getElementById('leadWebsite'),success=document.getElementById('leadSuccess'),error=document.getElementById('leadError'),guideLink=document.getElementById('guideLink');"
);
html=html.replace(
  "if(!res.ok||!data.ok)throw new Error(data.error||'Your email could not be saved.');\n      success.classList.add('show');\n      button.textContent='Access unlocked';email.disabled=true;if(website)website.disabled=true;",
  "if(!res.ok||!data.ok||!data.guide)throw new Error(data.error||'Your email could not be saved.');\n      if(guideLink)guideLink.href=data.guide;\n      success.classList.add('show');\n      button.textContent='Access unlocked';email.disabled=true;if(website)website.disabled=true;"
);
if(html.includes('href="prep-guide.html"')) throw new Error('Static prep-guide link still present after patch');
if(!html.includes("guideLink.href=data.guide")) throw new Error('Protected guide link patch failed');
fs.writeFileSync('index.html',html);
console.log('Rebuilt index.html with protected guide gate');
