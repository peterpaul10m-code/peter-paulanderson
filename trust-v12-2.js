const fs=require('fs');

function patchFile(path){
  let s=fs.readFileSync(path,'utf8');

  const oldPrivacy='<div class="resume-privacy"><b>Privacy by design:</b> the file is processed in memory and is not saved to the server. Only extracted facts are returned to this browser. You choose whether to save the resulting plan locally on this device.</div>';
  const newPrivacy='<div class="resume-privacy"><b>Before you upload:</b> your résumé is sent to this site\'s server over HTTPS and processed temporarily in memory to extract interview-preparation facts. The Resume Lab does not intentionally save the raw résumé to server storage and does not currently send the résumé to an external AI/LLM API. Extracted facts are returned to this browser; you decide whether to save the resulting plan on this device. <a href="/data-handling" target="_blank" rel="noopener">Read how résumé data is handled</a>.</div>';
  if(!s.includes(oldPrivacy)) throw new Error('resume privacy marker missing in '+path);
  s=s.replace(oldPrivacy,newPrivacy);

  const oldUpload='<div class="resume-upload"><label><div class="label">PDF, DOCX, or TXT · maximum 3 MB</div><input id="resumeFile" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"></label><button class="btn primary" id="resumeAnalyze">Analyze Resume</button></div>';
  const newUpload='<div class="resume-upload"><label><div class="label">PDF, DOCX, or TXT · maximum 3 MB</div><input id="resumeFile" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"></label><button class="btn primary" id="resumeAnalyze" disabled>Analyze Resume</button></div><label class="resume-consent" style="display:flex;gap:9px;align-items:flex-start;margin:10px 0 4px;font-size:13px;line-height:1.45"><input id="resumePrivacyAck" type="checkbox" style="margin-top:3px"><span>I understand this résumé will be transmitted to AI Interview Gym for temporary in-memory processing as described above. I have removed information I do not want processed.</span></label>';
  if(!s.includes(oldUpload)) throw new Error('resume upload marker missing in '+path);
  s=s.replace(oldUpload,newUpload);

  const oldVars="const file=document.getElementById('resumeFile'),analyze=document.getElementById('resumeAnalyze'),status=document.getElementById('resumeStatus'),factsBox=document.getElementById('resumeFacts'),generate=document.getElementById('resumeGenerate'),save=document.getElementById('resumeSave'),clear=document.getElementById('resumeClear'),riskBox=document.getElementById('resumeRiskMap'),planBox=document.getElementById('resumePlan');";
  const newVars="const file=document.getElementById('resumeFile'),analyze=document.getElementById('resumeAnalyze'),ack=document.getElementById('resumePrivacyAck'),status=document.getElementById('resumeStatus'),factsBox=document.getElementById('resumeFacts'),generate=document.getElementById('resumeGenerate'),save=document.getElementById('resumeSave'),clear=document.getElementById('resumeClear'),riskBox=document.getElementById('resumeRiskMap'),planBox=document.getElementById('resumePlan');\n if(ack){analyze.disabled=!ack.checked;ack.addEventListener('change',()=>{analyze.disabled=!ack.checked;});}";
  if(!s.includes(oldVars)) throw new Error('resume vars marker missing in '+path);
  s=s.replace(oldVars,newVars);

  const oldPost="async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});let d={};try{d=await r.json()}catch(_){}if(!r.ok||!d.ok)throw new Error(d.error||'Resume Lab request failed.');return d;}";
  const newPost="async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-AIG-Resume-Privacy':'accepted'},cache:'no-store',body:JSON.stringify(body)});let d={};try{d=await r.json()}catch(_){}if(!r.ok||!d.ok)throw new Error(d.error||'Resume Lab request failed.');return d;}";
  if(!s.includes(oldPost)) throw new Error('resume post marker missing in '+path);
  s=s.replace(oldPost,newPost);

  const oldAnalyze="analyze.onclick=async()=>{const f=file.files?.[0];if(!f){status.textContent='Choose a PDF, DOCX, or TXT résumé first.';return}";
  const newAnalyze="analyze.onclick=async()=>{if(!ack?.checked){status.textContent='Please acknowledge the résumé privacy notice before analysis.';return}const f=file.files?.[0];if(!f){status.textContent='Choose a PDF, DOCX, or TXT résumé first.';return}";
  if(!s.includes(oldAnalyze)) throw new Error('resume analyze marker missing in '+path);
  s=s.replace(oldAnalyze,newAnalyze);

  const oldClear="clear.onclick=()=>{localStorage.removeItem('aigResumePlanV1');current=null;file.value='';";
  const newClear="clear.onclick=()=>{localStorage.removeItem('aigResumePlanV1');current=null;file.value='';if(ack){ack.checked=false;analyze.disabled=true;}";
  if(!s.includes(oldClear)) throw new Error('resume clear marker missing in '+path);
  s=s.replace(oldClear,newClear);

  const asideMarker='</aside><main>';
  const legalNav='<div class="navh">Trust & privacy</div><a class="nav" href="/privacy" target="_blank" rel="noopener">Privacy Policy</a><a class="nav" href="/data-handling" target="_blank" rel="noopener">Data Handling</a><a class="nav" href="/terms" target="_blank" rel="noopener">Terms of Use</a></aside><main>';
  if(!s.includes(asideMarker)) throw new Error('aside marker missing in '+path);
  s=s.replace(asideMarker,legalNav);
  fs.writeFileSync(path,s);
}

patchFile('private/free-gym-content.html');
patchFile('private/premium-gym-content.html');

let index=fs.readFileSync('index.html','utf8');
const footer='AI Interview Gym is an independent preparation product and is not affiliated with, endorsed by, or an official recruiting channel or question bank for Micro1. We do not offer jobs, submit applications, guarantee project availability, guarantee earnings, or guarantee a hiring outcome. Current role details may change; candidates should verify the live Micro1 listing before applying. Candidate-reported patterns are treated as field intelligence, not guaranteed platform rules.';
const footerNew=footer+'<div class="trust-links" style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap"><a href="/privacy">Privacy Policy</a><a href="/data-handling">Data Handling</a><a href="/terms">Terms of Use</a></div>';
if(!index.includes(footer)) throw new Error('marketing footer marker missing');
index=index.replace(footer,footerNew);
const trustBlock='<section class="marketing-section" id="trust"><div class="marketing-inner"><div class="section-kicker">Privacy before conversion</div><h2>Your résumé is sensitive. We treat it that way.</h2><p class="section-lead">Resume Lab processing is currently temporary and server-side: the raw file is parsed in memory, is not intentionally written to application storage, and is not currently sent to an external AI/LLM API. You review the extracted facts before they are used for practice. Speech analytics are based on your browser transcript; our app does not upload your recorded practice audio to our server.</p><div class="hero-actions"><a class="marketing-secondary" href="/data-handling">See exactly how data is handled</a><a class="marketing-secondary" href="/privacy">Read Privacy Policy</a></div></div></section>';
const gymPreview='<section class="marketing-section" id="gym-preview">';
if(!index.includes(gymPreview)) throw new Error('gym preview marker missing');
index=index.replace(gymPreview,trustBlock+gymPreview);
fs.writeFileSync('index.html',index);

console.log('Trust & Privacy V12.2 applied: policies linked, resume consent required, public content separation preserved');