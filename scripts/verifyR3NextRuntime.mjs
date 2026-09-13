// Actual Next fixture server only; never point this at a production server.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const BASE='http://127.0.0.1:9483';
const out=path.resolve(import.meta.dirname,'../../shots/r3-next-runtime');
fs.mkdirSync(out,{recursive:true});
const checks=[],responses=[],errors=[],blocked=[],excluded=[],failedRequests=[],httpErrors=[];
const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail});
const rates=await(await fetch(BASE+'/api/rates')).json();
check('fixture rates production shape',rates.viewer==='AUD'&&rates.marketplace==='EBAY_AU'&&rates.geo_country==='AU',rates);
// Preserve the upstream defect as a diagnostic control, separate from the
// approved dynamic production-route acceptance checks below.
const cold=await fetch(BASE+'/redirect-control/check-'+Date.now(),{redirect:'manual'});
const frameworkControl={status:cold.status,location:cold.headers.get('location'),cache:cold.headers.get('x-nextjs-cache'),singleLocation:cold.headers.get('location')==='/cards/fixture-hub'};
await cold.arrayBuffer();
for(const route of ['/deals/vintage','/deals/sealed']){
 const r=await fetch(BASE+route,{redirect:'manual'}),html=await r.text();
 check(route+' category contract',route.endsWith('sealed')?r.status===308&&r.headers.get('location')==='/sealed-deals':r.status===200&&html.includes('/deals/900001')&&html.includes('rel="canonical"'),{status:r.status,location:r.headers.get('location'),cacheControl:r.headers.get('cache-control')});
}
const routes=['/deals/900001','/deals/900004','/deals/900005','/deals/900002','/deals/900006','/deals/900020','/deals/900021','/cards/fixture-hub','/cards/fixture-reference','/cards/fixture-no-reference'];
for(const route of [...routes,'/deals/900022','/deals/999999','/cards/fixture-missing']){
 const r=await fetch(BASE+route,{redirect:'manual'}),html=await r.text();
 fs.writeFileSync(path.join(out,route.slice(1).replaceAll('/','-')+'.html'),html);
 responses.push({route,status:r.status,location:r.headers.get('location'),cache:r.headers.get('x-nextjs-cache')});
 if(routes.includes(route)){
  check(route+' server HTML',r.status===200&&/<main\b/.test(html)&&/<h1\b/.test(html)&&/<title>/.test(html));
  check(route+' canonical contract',route.endsWith('900021')?!html.includes('rel="canonical"'):html.includes('rel="canonical"'));
 }else check(route+' lifecycle',route.endsWith('900022')?r.status===308&&r.headers.get('location')==='/cards/fixture-hub':r.status===404);
 if(route.endsWith('900021'))check('gated HTML truthful',html.includes('This listing is unavailable here')&&html.includes('This does not confirm whether it has sold or ended on eBay'));
 if(route.endsWith('900001'))check('native SSR price',html.includes('$30.75')&&!html.includes('A$46.13'));
}
const og=await fetch(BASE+'/opengraph-image');
check('actual metadata image loader',og.status===200&&og.headers.get('content-type')?.startsWith('image/'));
fs.writeFileSync(path.join(out,'root-opengraph.png'),Buffer.from(await og.arrayBuffer()));
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars',`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'r3-next-'))}`,'--remote-debugging-port=9484','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
try{
 let url;for(let i=0;i<40;i++){try{url=(await(await fetch('http://127.0.0.1:9484/json/version')).json()).webSocketDebuggerUrl;break;}catch{}await sleep(250);}
 ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);
 const raw=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,sessionId}));});
 let session;const networkUrls=new Map();
 ws.onmessage=event=>{const d=JSON.parse(event.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);if(d.error)p.reject(Error(JSON.stringify(d.error)));else p.resolve(d.result);return;}
  if(d.sessionId!==session)return;
  if(d.method==='Fetch.requestPaused'){
   const u=d.params.request.url,ok=u.startsWith(BASE+'/')||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/')||u.startsWith('data:');
   if(u.startsWith(BASE+'/')){
    const p=new URL(u).pathname;
    if(!routes.includes(p)&&!['/','/api/rates','/api/deals-page','/icon.svg','/opengraph-image'].includes(p)&&!p.startsWith('/_next/')){
     excluded.push({url:u,reason:'Unimplemented local route outside R3 fixture; 404 supplied before server access'});
     raw('Fetch.fulfillRequest',{requestId:d.params.requestId,responseCode:404,body:''},session).catch(e=>errors.push(String(e)));return;
    }
   }
   if(!ok)blocked.push(u);
   raw(ok?'Fetch.continueRequest':'Fetch.failRequest',ok?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(e=>errors.push(String(e)));
  }
  if(d.method==='Runtime.exceptionThrown')errors.push({exception:d.params.exceptionDetails});
  if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push({console:d.params.args});
  if(d.method==='Network.requestWillBeSent')networkUrls.set(d.params.requestId,d.params.request.url);
  if(d.method==='Network.loadingFailed')failedRequests.push({url:networkUrls.get(d.params.requestId),error:d.params.errorText,canceled:d.params.canceled});
  if(d.method==='Network.responseReceived'&&d.params.response.status>=400)httpErrors.push({url:d.params.response.url,status:d.params.response.status});
 };
 const {targetId}=await raw('Target.createTarget',{url:'about:blank'});
 session=(await raw('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 const send=(m,p={})=>raw(m,p,session);
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 const until=async expression=>{for(let i=0;i<80;i++){if(await ev(expression))return true;await sleep(100);}return false;};
 const navigate=async route=>{await send('Page.navigate',{url:BASE+route});await until('document.readyState==="complete"');await sleep(400);};
 const key=async(key,code,text)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code,...(text?{text,unmodifiedText:text}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:code});};
 for(const [width,scheme] of [[1280,'light'],[390,'light'],[320,'dark']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
  for(const route of routes){
   await navigate(route);
   const state=await ev(`({title:document.title,h1:document.querySelector('h1')?.textContent,main:document.querySelectorAll('main').length,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,images:[...document.images].map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})),canonical:document.querySelector('link[rel="canonical"]')?.href,robots:[...document.querySelectorAll('meta[name="robots"]')].map(e=>e.content),og:[...document.querySelectorAll('meta[property="og:image"]')].map(e=>e.content),offers:[...document.querySelectorAll('a[href*="ebay."]')].map(a=>({href:a.href,rel:a.rel})),jsonLd:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>JSON.parse(e.textContent))})`);
   check(`${route} ${width} rendered`,state.main===1&&state.scrollWidth<=width&&state.images.every(i=>i.loaded),state);
   check(`${route} ${width} affiliate qualification`,state.offers.every(a=>a.rel.includes('sponsored')));
   if(route==='/deals/900001')check(`AUD hydration ${width}`,await until('document.body.innerText.includes("A$46.13")'));
   if(route==='/deals/900021')check(`gated artwork metadata ${width}`,state.og.length===0);
   await ev('document.body.tabIndex=-1;document.body.focus();document.body.removeAttribute("tabindex")');
   await key('Tab',9);check(`${route} ${width} first Tab`,await ev('document.activeElement.getAttribute("href")==="#main-content"'));
   await key('Enter',13,'\r');check(`${route} ${width} skip activation`,await ev('document.activeElement.id==="main-content"'));
   await ev('window.scrollTo(0,0)');
   await ev(`(()=>{const label=document.createElement('div');label.textContent='SIMULATED • local Next fixture • providers disabled';label.style='position:fixed;bottom:0;left:0;z-index:99999;background:#fff;color:#000;font:11px Arial;padding:3px';document.body.append(label)})()`);
   const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,route.slice(1).replaceAll('/','-')+'-'+width+'-'+scheme+'.png'),Buffer.from(shot.data,'base64'));
  }
 }
 await navigate('/deals/900001');
 await ev(`document.querySelector('button[aria-label="Save this card"]').click()`);
 check('save handler',await until(`Boolean(document.querySelector('button[aria-label="Remove from saved cards"]'))`));
 await navigate('/deals/900001');check('saved reload persistence',await until(`Boolean(document.querySelector('button[aria-label="Remove from saved cards"]'))`));
 await ev(`document.addEventListener('click',e=>{if(e.target.closest('a[href*="ebay."]'))e.preventDefault()},true);document.querySelector('a[href*="ebay."]').click()`);
 check('actual affiliate handler / stub transport',await ev(`window.__r3Captures?.some(e=>e.event==='affiliate_click')&&window.__r3Vercel?.length>0`));
 await navigate('/');await sleep(400);
 await ev(`window.__r3DocumentToken="retained";document.querySelector('a[href="/cards/fixture-hub"]').click()`);
 check('Next client navigation',await until('location.pathname==="/cards/fixture-hub"&&Boolean(document.querySelector("#main-content"))')&&await ev('window.__r3DocumentToken==="retained"'));
 check('Next route announcer',await until('Boolean(document.querySelector("next-route-announcer")?.shadowRoot?.textContent.trim())'));
 check('client navigation metadata',await ev('document.title.includes("Clefable")&&document.querySelector("link[rel=canonical]").href.endsWith("/cards/fixture-hub")'));
 check('no console or JS errors',errors.length===0,errors);check('no unexpected external requests',blocked.length===0,blocked);
 check('classified HTTP errors',httpErrors.every(e=>e.status===404&&excluded.some(x=>x.url===e.url)),httpErrors);
 check('classified failed requests',failedRequests.every(e=>e.canceled&&e.url?.startsWith(BASE+'/')),failedRequests);
 await raw('Browser.close');
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({checks,frameworkControl,responses,errors,blocked,excluded,failedRequests,httpErrors},null,2));}
const failures=checks.filter(c=>!c.pass);console.log(JSON.stringify({checks:checks.length,failures,errors,blocked},null,2));if(failures.length)process.exitCode=1;
