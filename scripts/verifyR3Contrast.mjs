// Provider-isolated R3 static browser evidence; generated HTML only.
// Only reference artwork CDN requests are allowed; no application server is used.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.argv[2]) throw Error("Pass explicit generated-fixture/evidence directory");
const OUT = path.resolve(process.argv[2]);
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9381;
fs.mkdirSync(OUT, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-fold-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions", "--hide-scrollbars", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browserWs;
for (let i = 0; i < 40; i++) { try { const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); browserWs = v.webSocketDebuggerUrl; if (browserWs) break; } catch {} await sleep(500); }
const ws = new WebSocket(browserWs);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const handlers = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else for (const h of handlers) h(d); };
const raw = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { browserContextId } } = await raw("Target.createBrowserContext");
const { result: { targetId } } = await raw("Target.createTarget", { url: "about:blank", browserContextId });
const { result: { sessionId } } = await raw("Target.attachToTarget", { targetId, flatten: true });
const send = (m, p) => raw(m, p, sessionId).then((d) => d.result);

const blocked=[];
await send('Page.enable');
await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
handlers.push(d=>{if(d.method==='Fetch.requestPaused'&&d.sessionId===sessionId){
  const u=d.params.request.url;
  const ok=u.startsWith('data:')||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/');
  if(!ok)blocked.push(u);
  raw(ok?'Fetch.continueRequest':'Fetch.failRequest',ok?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},sessionId);
}});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};

// Diagnostic contrast scan: solid CSS backgrounds only. Gradients, images,
// opacity, overlap, hover/focus and screen-reader usability require other checks.
function inspectText(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
 const over=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3])).concat(1);
 const luminance=color=>color.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
 const failures=[],skipped=[];let checked=0;
 for(const el of document.querySelectorAll('body *')){
  if(['SCRIPT','STYLE','SVG'].includes(el.tagName)||el.closest('svg'))continue;
  const text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(' ');
  if(!text||!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
  if(el.closest('[aria-hidden="true"]')||el.closest('span.inline-flex')?.querySelector('linearGradient[id^="logo-glass-"]')){
   skipped.push({text,reason:'decorative or brand wordmark'});continue;
  }
  const style=getComputedStyle(el),chain=[];let node=el,reason;
  while(node){const s=getComputedStyle(node);if(s.backgroundImage!=='none'||Number(s.opacity)!==1||s.mixBlendMode!=='normal'||s.filter!=='none')reason='complex paint';chain.unshift(rgba(s.backgroundColor));node=node.parentElement;}
  if(reason){skipped.push({text,reason});continue;}
  let bg=[255,255,255,1];for(const color of chain)bg=over(color,bg);
  const fg=over(rgba(style.color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  const size=parseFloat(style.fontSize),bold=Number(style.fontWeight)>=700,minimum=(size>=24||(size>=18.6667&&bold))?3:4.5;
  checked++;
  if(ratio<minimum)failures.push({text,tag:el.tagName,className:el.className,color:style.color,background:bg,size,ratio,minimum});
 }
 return {checked,failures,skipped};
}
const records=[];
const fixtures=JSON.parse(fs.readFileSync(path.join(OUT,"r3-static","manifest.json"),"utf8"));
try{
 const {frameTree:controlFrame}=await send('Page.getFrameTree');
 await send('Page.setDocumentContent',{frameId:controlFrame.frame.id,html:'<body style="background:white"><p style="color:black;font:16px Arial">control readable</p><p style="color:#aaa;font:16px Arial">control faint</p><p aria-hidden="true" style="color:#aaa">control decorative</p></body>'});
 const control=await ev('('+inspectText.toString()+')()');
 if(control.checked!==2||control.failures.length!==1||control.failures[0].text!=='control faint'||!control.skipped.some(s=>s.text==='control decorative'))throw Error('Contrast diagnostic controls failed');
 for(const {id:name} of fixtures){
  const html=fs.readFileSync(path.join(OUT,'r3-static',name+'.html'),'utf8');
  for(const scheme of ['light','dark'])for(const width of [1280,390,320]){
   await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   const {frameTree}=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html});
   await ev('document.fonts.ready.then(()=>true)');
   records.push({name,scheme,width,...await ev('('+inspectText.toString()+')()')});
  }
 }
 fs.writeFileSync(path.join(OUT,'R3-CONTRAST-record.json'),JSON.stringify({records,blocked},null,2));
 if(records.length!==fixtures.length*6||records.some(r=>r.checked===0))throw Error('Incomplete contrast matrix');
 const unique=[...new Map(records.flatMap(r=>r.failures.map(f=>[r.scheme+f.text+f.color,{name:r.name,scheme:r.scheme,...f}]))).values()];
 console.log(JSON.stringify({pages:records.length,checked:records.reduce((s,r)=>s+r.checked,0),uniqueFailures:unique},null,2));
 if(unique.length)process.exitCode=1;
}finally{await raw('Browser.close');ws.close();chrome.kill();}
