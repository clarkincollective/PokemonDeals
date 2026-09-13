// Provider-isolated R3 currency hydration evidence; generated HTML only.
// Only reference artwork CDN requests are allowed; no application server is used.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.argv[2]) throw Error("Pass explicit generated-fixture/evidence directory");
const OUT = path.resolve(process.argv[2]);
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9377;
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

const html=fs.readFileSync(path.join(OUT,'r3-static','currency.html'),'utf8');
const fixtureURL='http://r3-fixture.invalid/';
const blocked=[],errors=[],checks=[];
await send('Page.enable');await send('Runtime.enable');
await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
handlers.push(d=>{
  if(d.sessionId!==sessionId)return;
  if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);
  if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args.map(a=>a.value??a.description));
  if(d.method==='Fetch.requestPaused'){
    const u=d.params.request.url,requestId=d.params.requestId;
    if(u===fixtureURL)raw('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from(html).toString('base64')},sessionId);
    else if(u.startsWith('data:')||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/'))raw('Fetch.continueRequest',{requestId},sessionId);
    else {blocked.push(u);raw('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sessionId);}
  }
});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const check=async(name,expr)=>{await sleep(180);const ok=await ev(expr);checks.push({name,ok});console.log((ok?'PASS ':'FAIL ')+name);};
try{
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:fixtureURL});await sleep(500);
 await check('native price before rates',"document.getElementById('listing').textContent==='\u00a3100.00'");
 await check('one request for all price subscribers',"window.__ratesRequests.length===1");
 await ev('window.__resolveRates()');
 await check('listing converts from stored USD',"document.getElementById('listing').textContent==='\u2248 A$187.50'");
 await check('reference and saving convert consistently',"document.getElementById('reference').textContent==='\u2248 A$300.00'&&document.getElementById('saving').textContent==='\u2248 A$112.50'");
 await check('unknown USD remains native',"document.getElementById('unknown').textContent==='\u00a3100.00'");
 await check('rates cache excludes geography',"(()=>{const c=JSON.parse(localStorage.getItem('pdf_rates_v1'));return c.viewer==='AUD'&&!('geoCountry' in c)&&!('geo_country' in c);})()");
 await check('hydration reports no recovery',"window.__hydrationErrors.length===0");
 await send('Page.reload');await sleep(500);
 await check('cached currency primes before rates reply',"document.getElementById('listing').textContent==='\u2248 A$187.50'&&window.__ratesRequests.length===1");
 await ev('window.__rejectRates()');
 await check('cached rates survive network failure',"document.getElementById('listing').textContent==='\u2248 A$187.50'&&window.__hydrationErrors.length===0");
 await ev("localStorage.removeItem('pdf_rates_v1')");
 await send('Page.reload');await sleep(500);await ev('window.__rejectRates()');
 await check('uncached rates failure keeps native price',"document.getElementById('listing').textContent==='\u00a3100.00'&&window.__hydrationErrors.length===0");
 await check('narrow currency fixture has no overflow','document.documentElement.scrollWidth<=innerWidth');
 const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'R3-CURRENCY-320.png'),Buffer.from(shot.data,'base64'));
 fs.writeFileSync(path.join(OUT,'R3-CURRENCY-record.json'),JSON.stringify({checks,errors,blocked},null,2));
 console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,total:checks.length,errors,blocked}));
 if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
}finally{await raw('Browser.close');ws.close();chrome.kill();}
