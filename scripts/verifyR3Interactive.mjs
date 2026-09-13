// Provider-isolated R3 interactive browser evidence; generated HTML only.
// Only reference artwork CDN requests are allowed; no application server is used.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.argv[2]) throw Error("Pass explicit generated-fixture/evidence directory");
const OUT = path.resolve(process.argv[2]);
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9375;
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

const html=fs.readFileSync(path.join(OUT,'r3-static','interactive.html'),'utf8');
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
    if(u.startsWith(fixtureURL)&&new URL(u).pathname==='/')raw('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from(html).toString('base64')},sessionId);
    else if(u.startsWith('data:')||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/'))raw('Fetch.continueRequest',{requestId},sessionId);
    else {blocked.push(u);raw('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sessionId);}
  }
});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const check=async(name,expr)=>{await sleep(180);const ok=await ev(expr);checks.push({name,ok});console.log((ok?'PASS ':'FAIL ')+name);};
try{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:fixtureURL});await sleep(700);
  await check('initial real cards render',"document.querySelectorAll('a[href*=\"/itm/\"]').length>=2");

  const {root:domRoot}=await send('DOM.getDocument');
  const {nodeId:regionButton}=await send('DOM.querySelector',{nodeId:domRoot.nodeId,selector:'#region-fixture > div > button'});
  const {nodes:regionAX}=await send('Accessibility.getPartialAXTree',{nodeId:regionButton,fetchRelatives:false});
  checks.push({name:'mobile region control has accessible name',ok:Boolean(regionAX[0]?.name?.value),value:regionAX[0]?.name?.value});
  await check('region opener is 44px',"document.querySelector('#region-fixture button').getBoundingClientRect().height>=44");
  await ev("document.querySelector('#region-fixture button').focus()");
  const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
  await key('ArrowDown',40);
  await check('keyboard opens region menu and focuses selected option',"document.activeElement.getAttribute('role')==='menuitemradio'&&document.activeElement.getAttribute('aria-checked')==='true'");
  await key('End',35);
  await check('region End reaches final country',"document.activeElement.textContent.includes('Italy')");
  await key('Escape',27);
  await check('region Escape closes and restores opener',"!document.querySelector('#region-fixture [role=menu]')&&document.activeElement===document.querySelector('#region-fixture button')");

  await key('ArrowDown',40);await sleep(180);await key('Tab',9);
  await check('Tab exits region menu to next control',"!document.querySelector('#region-fixture [role=menu]')&&document.activeElement===document.querySelector('#save-fixture button')");
  await ev("history.replaceState({},'', '?type=graded&page=3');document.querySelector('#region-fixture button').click()");await sleep(200);
  const regionShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'R3-REGION-MENU-390.png'),Buffer.from(regionShot.data,'base64'));
  await check('country options are 44px',"[...document.querySelectorAll('#region-fixture [role=menuitemradio]')].every(b=>b.getBoundingClientRect().height>=44)");
  await ev("[...document.querySelectorAll('#region-fixture [role=menuitemradio]')].find(b=>b.textContent.includes('United Kingdom')).click()");await sleep(650);
  await check('country selection persists and preserves filters',"localStorage.getItem('pdf:region')==='EBAY_GB'&&location.search.includes('country=EBAY_GB')&&location.search.includes('type=graded')&&!new URLSearchParams(location.search).has('page')");
  await ev("document.querySelector('#region-fixture button').click()");await sleep(200);
  await ev("[...document.querySelectorAll('#region-fixture [role=menuitemradio]')].find(b=>b.textContent.includes('All countries')).click()");await sleep(650);
  await check('all countries clears country filter explicitly',"localStorage.getItem('pdf:region')===''&&!new URLSearchParams(location.search).has('country')");
  await ev("history.replaceState({},'', '/');window.dispatchEvent(new PopStateEvent('popstate'))");
  await ev("document.querySelector('#save-fixture button').click()");
  await check('save changes existing storage key',"JSON.parse(localStorage.getItem('pdf:savedCards')).some(c=>c.slug==='fixture-clefable')");
  await send('Page.reload');await sleep(700);
  await check('save survives reload',"document.querySelector('#save-fixture button').getAttribute('aria-pressed')==='true'");
  await ev("document.querySelector('#save-fixture button').click()");
  await check('save reverses',"document.querySelector('#save-fixture button').getAttribute('aria-pressed')==='false'");
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Filters')).click()");
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Graded').click()");
  await check('graded control updates URL and fixture request',"location.search.includes('type=graded') && window.__requests.some(q=>q.includes('type=graded'))");
  await ev('history.back()');await sleep(300);
  await check('back restores filter URL',"!location.search.includes('type=graded')");
  await ev("document.querySelector('button[aria-label=\"Open menu\"]').click()");
  await check('menu opens and focuses close',"document.activeElement.getAttribute('aria-label')==='Close menu'");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await check('escape restores menu opener',"document.activeElement.getAttribute('aria-label')==='Open menu'");
  await ev('window.scrollTo(0,700)');await sleep(400);
  await check('sticky action appears after scroll',"[...document.querySelectorAll('a')].some(a=>a.closest('.fixed') && a.getBoundingClientRect().top<innerHeight && a.getBoundingClientRect().bottom>0)");
  await ev("document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault()},true);document.querySelector('a[href*=\"/itm/\"]').click()");
  await check('actual affiliate handler reaches fixture SDK',"window.__captures.some(c=>c.event==='affiliate_click')");

  await ev('window.scrollTo(0,0)');await sleep(400);
  await check('hidden sticky refuses focus',`(()=>{const a=document.querySelector('a[href*="customid=deal_page"]');a.focus();return a.closest('[inert]')!==null&&document.activeElement!==a;})()`);
  for(const width of [390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
    for(const [name,props] of Object.entries({unavailable:{priceLabel:'Recorded price',priceNote:'Check the listing on eBay',priceNative:{amount:null,currency:'USD'},priceUsd:null},unknown:{priceLabel:'Recorded auction price',priceNote:'Shipping breakdown not recorded'},unconfirmed:{priceLabel:'Listing price',priceNote:'Shipping not confirmed'},large:{priceLabel:'Listing total',priceNote:'Includes recorded shipping',priceNative:{amount:123456.78,currency:'AUD'}}})){
      await ev('window.__renderSticky('+JSON.stringify(props)+');window.scrollTo(0,700)');await sleep(400);
      await check('sticky readable '+name+' '+width,`(()=>{const a=document.querySelector('a[href*="customid=deal_page"]');const bar=a.closest('.fixed');const r=bar.getBoundingClientRect();const p=a.previousElementSibling;return !bar.inert&&r.top>=0&&r.bottom<=innerHeight+1&&a.getBoundingClientRect().height>=44&&p.scrollWidth<=p.clientWidth&&document.documentElement.scrollWidth<=innerWidth;})()`);
      await ev('window.scrollTo(0,document.documentElement.scrollHeight)');await sleep(200);
      await check('footer clears sticky '+name+' '+width,`(()=>{const bar=document.querySelector('a[href*="customid=deal_page"]').closest('.fixed');return document.getElementById('fixture-footer').getBoundingClientRect().bottom<=bar.getBoundingClientRect().top;})()`);
      const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'R3-STICKY-'+name+'-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
    }
  }
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,'R3-INTERACTIVE-390.png'),Buffer.from(shot.data,'base64'));
  fs.writeFileSync(path.join(OUT,'R3-INTERACTIVE-record.json'),JSON.stringify({checks,errors,blocked},null,2));
  console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,total:checks.length,errors,blocked}));
  if(checks.some(c=>!c.ok)||errors.length)process.exitCode=1;
}finally{await raw('Browser.close');ws.close();chrome.kill();}
