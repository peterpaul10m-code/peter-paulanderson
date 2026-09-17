const fs=require('fs');
const path=require('path');

const files=[
  {file:path.join('private','free-gym-content.html'), premium:false},
  {file:path.join('private','premium-gym-content.html'), premium:true}
];

function mustReplace(s,needle,repl,label){
  if(!s.includes(needle)) throw new Error(`Speech Analytics V11 patch failed: ${label}`);
  return s.replace(needle,repl);
}

const css=`
<style id="speechAnalyticsV11Css">
.delivery-analytics{margin-top:14px;border:1px solid var(--line,#d9e1ee);border-radius:14px;padding:14px;background:var(--panel,#fff);display:none}
.delivery-analytics.show{display:block}.da-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.da-head h4{margin:0;font-size:15px}.da-badge{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:5px 8px;border-radius:999px;background:var(--chip,#eef3fb);white-space:nowrap}.da-note{font-size:11px;line-height:1.5;color:var(--muted,#667085);margin:6px 0 0}.da-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.da-metric{border:1px solid var(--line,#d9e1ee);border-radius:11px;padding:10px;background:color-mix(in srgb,var(--panel,#fff) 94%,var(--ink,#111827) 6%)}.da-metric b{display:block;font-size:18px;line-height:1.1}.da-metric span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#667085);margin-top:5px}.da-section{margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#d9e1ee)}.da-section strong{font-size:12px}.da-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.da-chip{font-size:11px;padding:5px 7px;border-radius:999px;background:var(--chip,#eef3fb);border:1px solid var(--line,#d9e1ee)}.da-list{margin:7px 0 0;padding-left:18px;font-size:12px;line-height:1.55}.da-snips{display:grid;gap:6px;margin-top:8px}.da-snip{font-size:11px;line-height:1.45;padding:7px 9px;border-radius:9px;background:var(--chip,#eef3fb)}.da-history{display:grid;gap:6px;margin-top:8px}.da-history-row{display:grid;grid-template-columns:1fr repeat(3,auto);gap:10px;align-items:center;font-size:11px;padding:7px 9px;border:1px solid var(--line,#d9e1ee);border-radius:9px}.da-lock{margin-top:10px;padding:10px;border-radius:10px;border:1px dashed var(--line,#d9e1ee);font-size:11px;line-height:1.5;color:var(--muted,#667085)}
@media(max-width:700px){.da-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.da-history-row{grid-template-columns:1fr auto}.da-history-row span:nth-child(3),.da-history-row span:nth-child(4){display:none}}
</style>`;

const runtime=(premium)=>`
<script id="speechAnalyticsV11Runtime">
(function(){
  const PREMIUM=${premium?'true':'false'};
  const STORE='aig_delivery_v11';
  const CORE=[
    {label:'um',rx:/\\bum+\\b/gi},{label:'uh',rx:/\\buh+\\b/gi},{label:'erm',rx:/\\berm+\\b/gi},{label:'hmm',rx:/\\bhm+m+\\b/gi},
    {label:'you know',rx:/\\byou\\s+know\\b/gi},{label:'I mean',rx:/\\bi\\s+mean\\b/gi},{label:'sort of',rx:/\\bsort\\s+of\\b/gi},{label:'kind of',rx:/\\bkind\\s+of\\b/gi}
  ];
  const esc=s=>String(s==null?'':s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const words=s=>(String(s||'').trim().match(/[A-Za-z0-9’'-]+/g)||[]);
  function pace(wpm){if(!wpm)return '—';if(wpm<90)return 'slow / deliberate';if(wpm<=120)return 'measured';if(wpm<=170)return 'conversational';if(wpm<=200)return 'fast';return 'very fast';}
  function occurrences(text){
    const found=[];for(const item of CORE){for(const m of text.matchAll(item.rx)){found.push({label:item.label,index:m.index||0,raw:m[0]});}}
    found.sort((a,b)=>a.index-b.index);return found;
  }
  function likeCount(text){return (text.match(/\\blike\\b/gi)||[]).length;}
  function snippets(text,found){return found.slice(0,8).map(f=>{const a=Math.max(0,f.index-34),b=Math.min(text.length,f.index+String(f.raw).length+34);return '…'+text.slice(a,b).trim()+'…';});}
  function route(q,text){
    const anchors=String(q&&q.route||'').split('→').map(x=>x.trim()).filter(Boolean);
    const lower=text.toLowerCase();
    const rows=anchors.map(a=>{const keys=a.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>=4);return {anchor:a,hit:keys.some(k=>lower.includes(k))};});
    return {total:rows.length,hits:rows.filter(x=>x.hit).length,rows};
  }
  function coach(m){
    const notes=[];
    if(m.words<25)notes.push('The transcript is quite short. Rehearse enough evidence and reasoning to make the answer defensible.');
    if(m.wpm>200)notes.push('This attempt was very fast. Try a deliberate pause between major reasoning steps and check whether clarity improves.');
    else if(m.wpm&&m.wpm<90)notes.push('This attempt was very deliberate. Try reducing dead space while keeping the reasoning clear.');
    if(m.hesitations>=4 || (m.words>=60 && m.hesitations/m.words>.06))notes.push('Hesitation markers were frequent. Replace a filler with a silent pause, especially before evidence or a judgment call.');
    if(m.route.total && m.route.hits<Math.ceil(m.route.total/2))notes.push('Few route anchors had related wording in the transcript. Review the reasoning route, then answer again without memorizing a script.');
    if(m.seconds>100)notes.push('This ran beyond the Gym’s 90-second rehearsal target. Practice a tighter version while preserving the core evidence.');
    if(!notes.length)notes.push('No obvious delivery flag stood out from these transcript-based signals. Use playback to judge tone, emphasis, and naturalness.');
    return notes;
  }
  function load(){try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch(_){return []}}
  function save(row){if(!PREMIUM)return;try{let a=load();a.push(row);if(a.length>120)a=a.slice(-120);localStorage.setItem(STORE,JSON.stringify(a));}catch(_){}}
  function history(qid){return load().filter(x=>String(x.qid)===String(qid)).slice(-5).reverse();}
  window.deliveryAnalyticsV11=function(q,text,seconds){
    const box=document.getElementById('deliveryAnalytics');if(!box)return;
    text=String(text||'').trim(); seconds=Math.max(1,Number(seconds)||1);
    if(!text){box.classList.add('show');box.innerHTML='<div class="da-head"><h4>Delivery Analytics</h4><span class="da-badge">Transcript unavailable</span></div><p class="da-note">Your audio was recorded, but this browser did not produce a usable speech transcript. WPM, hesitation markers, and structure signals cannot be calculated reliably from audio alone in this version. Use playback for self-review.</p>';return;}
    const wc=words(text).length,wpm=Math.round(wc/(seconds/60)),found=occurrences(text),likes=likeCount(text),r=route(q,text);
    const m={qid:q&&q.id,ts:new Date().toISOString(),seconds,words:wc,wpm,hesitations:found.length,likes,route:r};
    const notes=coach(m); save(m);
    let html='<div class="da-head"><div><h4>Delivery Analytics</h4><p class="da-note">Calculated from your browser-generated transcript and recording duration. These are coaching signals, not a Micro1/Zara score or published hiring rubric.</p></div><span class="da-badge">'+(PREMIUM?'Premium detail':'Core metrics')+'</span></div>'+
      '<div class="da-grid"><div class="da-metric"><b>'+seconds+'s</b><span>duration</span></div><div class="da-metric"><b>'+wc+'</b><span>words</span></div><div class="da-metric"><b>'+wpm+'</b><span>words / min</span></div><div class="da-metric"><b>'+found.length+'</b><span>hesitation markers</span></div></div>'+
      '<div class="da-section"><strong>Pacing</strong><div class="da-chips"><span class="da-chip">'+esc(pace(wpm))+'</span><span class="da-chip">“like” occurrences: '+likes+' (context-sensitive; not automatically treated as filler)</span></div></div>';
    if(PREMIUM){
      const hits=r.rows.filter(x=>x.hit),miss=r.rows.filter(x=>!x.hit);
      html+='<div class="da-section"><strong>Reasoning-route coverage</strong><p class="da-note">'+r.hits+' of '+r.total+' route anchors had related wording in the transcript. This is a heuristic coverage check, not semantic grading.</p><div class="da-chips">'+hits.map(x=>'<span class="da-chip">✓ '+esc(x.anchor)+'</span>').join('')+miss.map(x=>'<span class="da-chip">Review: '+esc(x.anchor)+'</span>').join('')+'</div></div>';
      html+='<div class="da-section"><strong>Coaching notes</strong><ul class="da-list">'+notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></div>';
      if(found.length){html+='<div class="da-section"><strong>Where hesitation markers appeared</strong><div class="da-snips">'+snippets(text,found).map(s=>'<div class="da-snip">'+esc(s)+'</div>').join('')+'</div></div>';}
      const hist=history(q&&q.id); if(hist.length){html+='<div class="da-section"><strong>Recent attempts on this question</strong><div class="da-history">'+hist.map((x,i)=>'<div class="da-history-row"><span>'+(i===0?'Latest':new Date(x.ts).toLocaleDateString())+'</span><span>'+x.wpm+' WPM</span><span>'+x.hesitations+' hesitations</span><span>'+x.seconds+'s</span></div>').join('')+'</div><p class="da-note">History stays in this browser’s local storage.</p></div>';}
    }else{
      html+='<div class="da-lock"><strong>Premium coaching adds:</strong> reasoning-route coverage, hesitation locations, actionable coaching notes, and local attempt history. The free metrics above remain available for every recorded answer.</div>';
    }
    box.innerHTML=html;box.classList.add('show');
  };
})();
</script>`;

for(const item of files){
  if(!fs.existsSync(item.file)) throw new Error(`Speech Analytics V11 missing ${item.file}`);
  let html=fs.readFileSync(item.file,'utf8');
  if(html.includes('speechAnalyticsV11Runtime')) continue;
  html=mustReplace(html,'</head>',css+'\n</head>',`${item.file} css insertion`);
  html=mustReplace(html,'<div id="signalCheck" class="signal-check"></div>','<div id="signalCheck" class="signal-check"></div><div id="deliveryAnalytics" class="delivery-analytics" aria-live="polite"></div>',`${item.file} analytics panel`);
  html=mustReplace(html,"setRecordStatus('Recorded '+seconds+'s · spoken attempt logged. Use playback before revealing the guided answer.','good');routeSignalCheck(q,recordTranscript);","setRecordStatus('Recorded '+seconds+'s · spoken attempt logged. Use playback before revealing the guided answer.','good');routeSignalCheck(q,recordTranscript);if(window.deliveryAnalyticsV11)window.deliveryAnalyticsV11(q,recordTranscript,seconds);",`${item.file} recorder hook`);
  html=mustReplace(html,'</body>',runtime(item.premium)+'\n</body>',`${item.file} runtime`);
  if(!html.includes('Delivery Analytics')||!html.includes('deliveryAnalyticsV11')) throw new Error(`Speech Analytics V11 verification failed for ${item.file}`);
  fs.writeFileSync(item.file,html,'utf8');
}

const pub='index.html';
if(fs.existsSync(pub)){
  const h=fs.readFileSync(pub,'utf8');
  for(const forbidden of ['window.deliveryAnalyticsV11','Where hesitation markers appeared','Recent attempts on this question']){
    if(h.includes(forbidden)) throw new Error(`Speech Analytics V11 public leak check failed: ${forbidden}`);
  }
}
console.log('Speech Analytics V11: transcript-based WPM, hesitation, pacing, premium route coaching, and local attempt trends applied');
