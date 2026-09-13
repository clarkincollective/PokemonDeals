// Uses the established provider-isolated R3 Next app, never a live URL.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {GUIDES} from '../lib/guides.js';
import {SPECIES_WITH_GENERATION} from '../lib/pokemonSpecies.js';
const BASE='http://127.0.0.1:9483',out=path.resolve(import.meta.dirname,'../../shots/r5-families');
fs.mkdirSync(out,{recursive:true});
const routes=['/cards','/sets','/pokemon','/deals','/sealed-deals','/japanese-cards','/latest-releases','/guides','/about','/contact','/how-it-works','/methodology','/privacy','/affiliate-disclosure','/market-data','/market-data/most-listed-cards','/market-data/most-expensive-cards','/market-data/pokemon-card-value-distribution','/market-data/pokemon-reference-price-changes',...GUIDES.map(g=>'/guides/'+g.slug),'/fixture-tools'];
const checks=[],errors=[],blocked=[],excluded=[],httpErrors=[],failedRequests=[],alertRequests=[],requests=new Map();
let alertMode='error';
const check=(name,pass,detail)=>{checks.push({name,pass:Boolean(pass),detail});if(!pass)console.error('FAIL',name,JSON.stringify(detail));};
const filename=route=>route.slice(1).replaceAll('/','-');
for(const route of routes){
 const res=await fetch(BASE+route),html=await res.text();fs.writeFileSync(path.join(out,filename(route)+'.html'),html);
 check(route+' initial HTML',res.status===200&&html.includes('<main')&&html.includes('<h1')&&html.includes('href="#main-content"'),{status:res.status,bytes:Buffer.byteLength(html)});
 if(route!=='/fixture-tools')check(route+' canonical',html.includes(`href="https://pokemondealfinder.com${route}"`));
 if(route==='/pokemon')check('full species destinations remain SSR',SPECIES_WITH_GENERATION.every(s=>html.includes(`href="/pokemon/${s.slug}"`)),{expected:SPECIES_WITH_GENERATION.length});
 if(['/cards','/sets'].includes(route))check(route+' full set destinations SSR',['jungle','neo-destiny','boundaries-crossed'].every(s=>html.includes(`href="/sets/${s}"`)));
 if(route==='/guides')check('all guide destinations SSR',GUIDES.every(g=>html.includes(`href="/guides/${g.slug}"`)));
}
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
   if(p==='/api/alerts'){
    alertRequests.push(JSON.parse(d.params.request.postData));
    raw('Fetch.fulfillRequest',{requestId:d.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(alertMode==='error'?{ok:false,reason:'invalid_email'}:{ok:true,status:'pending'})).toString('base64')},session).catch(e=>errors.push(String(e)));return;
   }
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
 const button=text=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
 const type=async(selector,text)=>{await click(`document.querySelector(${JSON.stringify(selector)})`);await send('Input.insertText',{text});await sleep(250);};
 const shot=async name=>{await ev(`(()=>{let b=document.getElementById('fixture-label');if(!b){b=document.createElement('aside');b.id='fixture-label';b.style='position:fixed;bottom:0;left:0;z-index:99999;padding:4px;background:#fff3cd;color:#171514;font:11px Arial';document.body.append(b);}b.textContent='SIMULATED • local Next fixture • providers disabled';})()`);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 for(const [width,scheme] of [[1280,'light'],[390,'light'],[320,'dark']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
  for(const route of routes){
   await go(route);const prefix=filename(route)+'-'+width+'-'+scheme;
   const state=await ev(`({main:document.querySelectorAll('main').length,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth&&getComputedStyle(i).visibility!=='hidden').map(i=>i.src)})`);
   check(prefix+' layout',state.main===1&&state.h1===1&&!state.overflow,state);
   if(width===1280){await ev('document.body.tabIndex=-1;document.body.focus();document.body.removeAttribute("tabindex")');await key('Tab',9);await key('Enter',13);check(prefix+' keyboard skip',await ev(`document.activeElement.id==='main-content'`));await ev('scrollTo(0,0)');}
   if(route.startsWith('/guides/')){
    const toc=await ev(`(()=>{const links=[...document.querySelectorAll('nav[aria-label="Guide contents"] a')],ids=links.map(a=>a.hash.slice(1));return{count:ids.length,unique:new Set(ids).size,targets:ids.every(id=>document.querySelectorAll('[id="'+id+'"]').length===1),font:getComputedStyle(document.querySelector('main p')).fontSize,article:[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent)).find(s=>s['@type']==='Article')}})()`);
    check(prefix+' contents and readable article',toc.count>1&&toc.unique===toc.count&&toc.targets&&toc.font==='16px'&&toc.article?.datePublished===toc.article?.dateModified,toc);
    await click(`document.querySelector('details summary')`);check(prefix+' contents opens',await ev(`document.querySelector('details').open`));
   }
   await shot(prefix);
  }
 }
 await go('/sets');await type('input[aria-label="Filter sets"]','Neo');check('set filter actual input',await ev(`document.querySelector('main').innerText.includes('1 of 3 sets match')&&!document.querySelector('main a[href="/sets/jungle"]')`));await click(`document.querySelector('button[aria-label="Clear filter"]')`);check('set clear returns full list',await ev(`!!document.querySelector('main a[href="/sets/jungle"]')`));
 await go('/pokemon');await type('input[aria-label="Filter Pokemon"]','Dragonite');check('species filter full name',await ev(`document.querySelector('main').innerText.includes('1 of 1025 Pokemon match')&&document.querySelector('main a[href="/pokemon/dragonite"]').getBoundingClientRect().width>200`));await shot('pokemon-filter-320-dark');
 await go('/sealed-deals');await click(button('Booster Pack'));check('sealed unit filter',await ev(`document.querySelector('button[aria-pressed="true"]').textContent==='Booster Pack'&&document.querySelector('main').innerText.includes('1 of 2 products match')`));await click(button('All types'));await type('input[aria-label="Search sealed products"]','unmatched');check('sealed empty filter',await ev(`document.querySelector('main').innerText.includes('No sealed products match')`));await shot('sealed-empty-filter-320-dark');
 await go('/japanese-cards');check('Japanese language and recorded freshness',await ev(`document.body.innerText.includes('Japanese')&&document.body.innerText.includes('Last refreshed')&&!document.body.innerText.includes('Live - deals refresh automatically')&&!document.querySelector('main').innerText.includes('Clefable')`));
 await go('/japanese-cards?maxPrice=1&sort=newest');check('Japanese sparse state',await ev(`!document.querySelector('main a[href*="/itm/"]')`));await shot('japanese-empty-320-dark');
 await go('/market-data/pokemon-reference-price-changes');check('dated study and citation preserved',await ev(`document.body.innerText.includes('150')&&document.body.innerText.includes('12 August 2026')&&document.body.innerText.includes('11 September 2026')&&document.body.innerText.includes('https://pokemondealfinder.com/market-data/pokemon-reference-price-changes')`));
 await go('/fixture-tools');await ev(`localStorage.setItem('pdf:savedCards',JSON.stringify([{key:'fixture-hub',slug:'fixture-hub',name:'Clefable Jungle 1/64',price:75,currency:'CAD'}]));localStorage.setItem('pdf:recentCards',JSON.stringify([{key:'fixture-hub',slug:'fixture-hub',name:'Clefable Jungle 1/64',price:75,currency:'CAD'},{key:'fixture-reference',slug:'fixture-reference',name:'Unknown reference',price:null,currency:'USD'}]));dispatchEvent(new Event('pdf:cardsChanged'))`);await sleep(400);
 check('saved snapshot native missing FX, dedupe and unknown price',await ev(`document.querySelector('main').innerText.includes('Last seen C$75.00')&&!document.querySelector('main').innerText.includes('A$112.50')&&document.querySelectorAll('main a[href="/cards/fixture-hub"]').length===1&&!document.querySelector('main').innerText.includes('$0.00')`));await shot('saved-cards-320-dark');
 await go('/fixture-tools');check('saved reload',await ev(`document.querySelector('main').innerText.includes('Last seen C$75.00')`));await click(`document.querySelector('button[aria-label="Remove Clefable Jungle 1/64"]')`);check('saved remove writes existing key',await ev(`JSON.parse(localStorage.getItem('pdf:savedCards')).length===0`));
 await click(`[...document.querySelectorAll('main button')].find(b=>b.textContent.includes('Email me if it drops'))`);
 await type('input[type="email"]','fixture@example.invalid');await type('input[type="number"]','25');
 check('alert labels and USD target',await ev(`document.querySelector('input[type=email]').getAttribute('aria-label')==='Email address'&&document.querySelector('input[type=number]').getAttribute('aria-label')==='Target price in US dollars'&&!document.querySelector('form input[type=checkbox]').checked`));
 await click(button('Notify me'));check('intercepted alert error feedback',await ev(`document.querySelector('[role=alert]')?.textContent.includes("doesn't look right")`));await shot('alert-error-320-dark');
 alertMode='success';await click(button('Notify me'));check('intercepted alert confirmation feedback',await ev(`document.querySelector('[role=status]')?.textContent.includes('confirmation link')`));check('alert payload preserves opt-in and USD amount',alertRequests.length===2&&alertRequests.every(a=>a.newsletter===false&&a.targetPrice==='25'&&a.cardSlug==='fixture-hub'),alertRequests);
 check('no captured runtime errors',errors.length===0,errors);check('no unexpected external requests',blocked.length===0,blocked);
 check('HTTP errors classified',httpErrors.every(e=>e.status===404&&excluded.includes(e.url)),httpErrors);
 check('failed requests classified',failedRequests.every(e=>e.canceled&&e.url?.startsWith(BASE+'/')),failedRequests);
 await raw('Browser.close');
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({checks,errors,blocked,excluded,httpErrors,failedRequests,alertRequests,limits:['Provider-isolated family fixture, not full production app','Alert POSTs intercepted in browser; no email or database action','Historical identities and simulated market aggregates; latest releases sparse control','No Safari/iOS, real screen reader, crawler ingestion or conversion study']},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.some(c=>!c.pass)?1:0;
