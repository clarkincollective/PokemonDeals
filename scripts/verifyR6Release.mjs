// Cross-family checks on the existing provider-isolated Next app only.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const BASE='http://127.0.0.1:9483',out=path.resolve(import.meta.dirname,'../../shots/r6-release');
fs.mkdirSync(out,{recursive:true});
const routes=['/','/best-finds','/deals/vintage','/pokemon','/pokemon/dragonite','/guides/how-to-find-pokemon-card-set-and-number','/market-data/pokemon-reference-price-changes'];
const checks=[],errors=[],blocked=[],excluded=[],httpErrors=[],failedRequests=[],requests=new Map(),performance=[],accessibility=[];
const axeSource=fs.readFileSync(path.resolve(import.meta.dirname,'../node_modules/axe-core/axe.min.js'),'utf8');
const check=(name,pass,detail)=>{checks.push({name,pass:Boolean(pass),detail});if(!pass)console.error('FAIL',name,JSON.stringify(detail));};
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars',`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'r5-families-'))}`,'--remote-debugging-port=9484','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map();
try{
 let url;for(let i=0;i<40;i++){try{url=(await(await fetch('http://127.0.0.1:9484/json/version')).json()).webSocketDebuggerUrl;break;}catch{}await sleep(250);}
 ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);
 const raw=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,sessionId}));});let session;
 ws.onmessage=event=>{const d=JSON.parse(event.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);return;}if(d.sessionId!==session)return;
  if(d.method==='Network.requestWillBeSent')requests.set(d.params.requestId,d.params.request.url);
  if(d.method==='Network.responseReceived'&&d.params.response.status>=400)httpErrors.push({url:d.params.response.url,status:d.params.response.status});
  if(d.method==='Network.loadingFailed')failedRequests.push({...d.params,url:requests.get(d.params.requestId)});
  if(d.method==='Fetch.requestPaused'){
   const u=d.params.request.url,p=u.startsWith(BASE+'/')?new URL(u).pathname:null;
   const ok=p||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/')||u.startsWith('https://images.pokemontcg.io/')||u.startsWith('https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/')||u.startsWith('data:');
   if(p&&!routes.includes(p)&&!['/api/rates','/api/deals-page','/icon.svg'].includes(p)&&!p.startsWith('/_next/')){excluded.push(u);raw('Fetch.fulfillRequest',{requestId:d.params.requestId,responseCode:404,body:''},session).catch(e=>errors.push(String(e)));return;}
   if(!ok)blocked.push(u);raw(ok?'Fetch.continueRequest':'Fetch.failRequest',ok?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(e=>errors.push(String(e)));
  }
  if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);
  if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args);
 };
 const {targetId}=await raw('Target.createTarget',{url:'about:blank'});session=(await raw('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 const send=(m,p={})=>raw(m,p,session);
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 const go=async route=>{await send('Page.navigate',{url:BASE+route});for(let i=0;i<100;i++){if(await ev(`location.pathname===${JSON.stringify(route.split('?')[0])}&&document.readyState==='complete'&&!!document.querySelector('main')`))break;await sleep(100);}await sleep(450);};
 const key=async(key,code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});await sleep(100);};
 const click=async selector=>{await ev(`(${selector}).scrollIntoView({block:'center'})`);const p=await ev(`(()=>{const r=(${selector}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(200);};
 const shot=async name=>{await ev(`(()=>{let b=document.getElementById('fixture-label');if(!b){b=document.createElement('aside');b.id='fixture-label';b.style='position:fixed;bottom:0;left:0;z-index:99999;padding:4px;background:#fff3cd;color:#171514;font:11px Arial';document.body.append(b);}b.textContent='SIMULATED • local Next fixture • providers disabled';})()`);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__r6={cls:0,lcp:null};new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__r6.cls+=e.value}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{window.__r6.lcp=l.getEntries().at(-1)?.startTime}).observe({type:'largest-contentful-paint',buffered:true});`});
 for(const [width,scheme] of [[1440,'light'],[1280,'light'],[390,'light'],[320,'dark']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme},{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const route of routes){
   await go(route);const prefix=(route==='/'?'home':route.slice(1).replaceAll('/','-'))+'-'+width+'-'+scheme;
   const state=await ev(`({main:document.querySelectorAll('main').length,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth,canonical:document.querySelector('link[rel=canonical]')?.href,offerLinks:[...document.querySelectorAll('a[href*="ebay."]')].filter(a=>a.getBoundingClientRect().height>0).map(a=>({href:a.href,rel:a.rel,text:a.textContent.trim(),height:a.getBoundingClientRect().height})),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})`);
   check(prefix+' layout/canonical',state.main===1&&state.h1===1&&!state.overflow&&state.canonical?.replace(/\/$/,'')==='https://pokemondealfinder.com'+(route==='/'?'':route),state);
   check(prefix+' reduced motion',state.reduced&&await ev(`(()=>{const s=getComputedStyle(document.querySelector('main a'));return s.transitionDuration.split(',').every(v=>parseFloat(v)<=0.001)&&s.animationDuration.split(',').every(v=>parseFloat(v)<=0.001)&&s.scrollBehavior==='auto'})()`));
   await ev('document.body.tabIndex=-1;document.body.focus();document.body.removeAttribute("tabindex")');await key('Tab',9);await key('Enter',13);check(prefix+' keyboard skip',await ev(`document.activeElement===document.querySelector('main')`));await ev('scrollTo(0,0)');
   check(prefix+' paid links qualified',state.offerLinks.every(a=>a.rel.includes('sponsored')),state.offerLinks);
   if(route==='/'||route==='/best-finds'){
    check(prefix+' direct exact offer actions',state.offerLinks.some(a=>/\/itm\/\d+/.test(a.href)&&a.height>=44&&/eBay/.test(a.text)),state.offerLinks);
    const first=await ev(`(()=>{const a=[...document.querySelectorAll('main a[href*="/itm/"]')].find(a=>a.getBoundingClientRect().height>=44);const r=a?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom}:null})()`);
    check(prefix+' first offer action in initial viewport',route!=='/'||width===320||first?.bottom<=(width===390?844:900),first);
   }
   performance.push({route,width,scheme,...await ev(`({navigation:performance.getEntriesByType('navigation').map(n=>({duration:n.duration,responseEnd:n.responseEnd,domContentLoaded:n.domContentLoadedEventEnd})),resources:performance.getEntriesByType('resource').length,cls:window.__r6.cls,lcp:window.__r6.lcp,domNodes:document.getElementsByTagName('*').length})`)});
   await shot(prefix);
   if(width===390||width===320){
    await send('Runtime.evaluate',{expression:axeSource});
    const run=await send('Runtime.evaluate',{expression:`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>({violations:r.violations,incomplete:r.incomplete.map(i=>({id:i.id,nodes:i.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}))`,awaitPromise:true,returnByValue:true});
    if(run.exceptionDetails)throw Error(JSON.stringify(run.exceptionDetails));
    accessibility.push({route,width,scheme,...run.result.value});
    check(prefix+' automated accessibility',run.result.value.violations.length===0,run.result.value.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
   }
  }
 }
 await go('/');await click(`[...document.querySelectorAll('a')].find(a=>a.textContent.trim()==='Buy it now')`);await sleep(650);check('homepage native mode navigation',await ev(`new URL(location.href).searchParams.get('listing')==='FIXED_PRICE'`));
 await go('/?maxPrice=1&sort=newest');check('homepage honest empty feed',await ev(`!document.querySelector('main a[href*="/itm/"]')&&document.querySelector('main').innerText.length>50`));await shot('home-empty-320-dark');
 await go('/best-finds?type=graded');check('best finds graded context',await ev(`document.querySelector('h1').textContent.includes('graded')&&document.querySelector('main').innerText.includes('PSA')`));await shot('best-finds-graded-320-dark');
 await go('/');await ev(`document.addEventListener('click',e=>{if(e.target.closest('a[href*="/itm/"]'))e.preventDefault()},true);document.querySelector('main a[href*="/itm/"]').click()`);check('actual homepage affiliate handler',await ev(`window.__r3Captures?.some(e=>e.event==='affiliate_click')&&window.__r3Vercel?.length>0`));
 check('no captured runtime errors',errors.length===0,errors);check('no unexpected external requests',blocked.length===0,blocked);check('HTTP errors classified',httpErrors.every(e=>e.status===404&&excluded.includes(e.url)),httpErrors);check('failed requests classified',failedRequests.every(e=>e.canceled&&e.url?.startsWith(BASE+'/')),failedRequests);
 await raw('Browser.close');
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({checks,errors,blocked,excluded,httpErrors,failedRequests,performance,accessibility,limits:['Provider-isolated local timings; not production Core Web Vitals','Actual affiliate handler with stub transports; no provider ingestion','Automated axe checks require manual interpretation; not complete WCAG or screen-reader certification','Chrome only; Safari/iOS and real screen reader unavailable']},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.some(c=>!c.pass)?1:0;
