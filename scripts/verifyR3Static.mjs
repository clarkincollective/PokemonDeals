// Provider-isolated R3 static browser evidence; generated HTML only.
// Only reference artwork CDN requests are allowed; no application server is used.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.argv[2]) throw Error("Pass explicit generated-fixture/evidence directory");
const OUT = path.resolve(process.argv[2]);
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9373;
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
const ev=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
const records=[],anchorChecks=[];
try {
  for(const {id:name} of JSON.parse(fs.readFileSync(path.join(OUT,'r3-static','manifest.json'),'utf8'))) {
    const html=fs.readFileSync(path.join(OUT,'r3-static',name+'.html'),'utf8');
    for(const width of [1280,390,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      const {frameTree}=await send('Page.getFrameTree');
      await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html});
      await ev('window.scrollTo(0,0)');
      for(let i=0;i<30;i++){if(await ev('[...document.images].every(i=>i.complete)'))break;await sleep(200);}
      const geometry=await ev('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,images:[...document.images].map(i=>({src:i.src,loaded:i.naturalWidth>0}))})');
      const shot=await send('Page.captureScreenshot',{format:'png'});
      const filename='R3-STATIC-'+name+'-'+width+'.png';
      fs.writeFileSync(path.join(OUT,filename),Buffer.from(shot.data,'base64'));
      records.push({name,filename,...geometry});
      if(name==='hub_with_offers'){
        await ev(`document.querySelector('a[href="#card-offers"]').click()`);await sleep(350);
        anchorChecks.push({width,...await ev('({scrolled:scrollY>0,top:document.getElementById("card-offers").getBoundingClientRect().top})')});
      }
    }
  }
  fs.writeFileSync(path.join(OUT,'R3-STATIC-record.json'),JSON.stringify({records,blocked,anchorChecks},null,2));
  console.log(JSON.stringify({captures:records.length,anchorChecks,overflow:records.filter(r=>r.scrollWidth>r.width),failedImages:records.filter(r=>r.images.some(i=>!i.loaded)),blocked}));
  if(records.some(r=>r.images.some(i=>!i.loaded)||r.scrollWidth>r.width)||anchorChecks.some(c=>!c.scrolled||c.top<0||c.top>200))process.exitCode=1;
}finally{await raw('Browser.close');ws.close();chrome.kill();}
