// Actual Next search wrapper/client/API behind the established provider stubs.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw Error('Use before or after');
const base='http://127.0.0.1:9483',out=path.resolve(import.meta.dirname,`../../shots/search-journey/${phase}`);
fs.mkdirSync(out,{recursive:true});
const cases=[['bare',''],['offers','?q=Clefable'],['reference','?q=reference'],['empty','?q=missing']];
const checks=[],states=[],errors=[],blocked=[],searchRequests=[];
const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});if(!pass)console.error(name,JSON.stringify(detail));};
for(const [name,query] of cases){const response=await fetch(base+'/search'+query),html=await response.text();fs.writeFileSync(path.join(out,name+'.html'),html);check(name+' initial response',response.status===200);check(name+' canonical',html.includes('href="https://pokemondealfinder.com/search"'));if(query)check(name+' query noindex',html.includes('noindex'));if(name==='offers'||name==='reference')check(name+' exact card link in initial HTML',html.includes('/cards/fixture-hub'));}
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars',`--user-data-dir=${fs.mkdtempSync(path.join(out,'chrome-'))}`,'--remote-debugging-port=9484','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0,session;const pending=new Map();
try{
 let endpoint;for(let i=0;i<50;i++){try{endpoint=(await(await fetch('http://127.0.0.1:9484/json/version')).json()).webSocketDebuggerUrl;break;}catch{}await sleep(200);}if(!endpoint)throw Error('Chrome debugging endpoint unavailable');
 ws=new WebSocket(endpoint);await new Promise(r=>ws.onopen=r);
 const raw=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,sessionId}));});
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);return;}if(d.sessionId!==session)return;
  if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);
  if(d.method==='Fetch.requestPaused'){
   const u=new URL(d.params.request.url),own=u.origin===base;
   if(own&&u.pathname==='/api/card-search'){searchRequests.push(u.search);if(u.searchParams.has('tcgplayerId')){blocked.push(u.href);raw('Fetch.failRequest',{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(()=>{});return;}}
   const okay=own&&(u.pathname==='/search'||u.pathname==='/api/card-search'||u.pathname==='/api/rates'||u.pathname.startsWith('/_next/')||/\.(png|svg|jpg|webp)$/.test(u.pathname))||['tcgplayer-cdn.tcgplayer.com','images.pokemontcg.io'].includes(u.hostname);
   if(own&&!okay){raw('Fetch.fulfillRequest',{requestId:d.params.requestId,responseCode:404,body:''},session).catch(()=>{});return;}
   if(!okay)blocked.push(u.href);raw(okay?'Fetch.continueRequest':'Fetch.failRequest',okay?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(e=>errors.push(e.message));
  }
 };
 const tab=await raw('Target.createTarget',{url:'about:blank'});session=(await raw('Target.attachToTarget',{targetId:tab.targetId,flatten:true})).sessionId;
 const send=(m,p={})=>raw(m,p,session),ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 const go=async query=>{await send('Page.navigate',{url:base+'/search'+query});for(let i=0;i<100;i++){if(await ev(`location.pathname==='/search'&&location.search===${JSON.stringify(query)}&&document.readyState==='complete'&&!!document.querySelector('#pc-q')`))break;await sleep(100);}await sleep(800);};
 for(const [width,scheme] of [[1280,'light'],[390,'light'],[320,'dark']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
  for(const [name,query] of cases){const requestsBefore=searchRequests.length;await go(query);
   const state=await ev(`(()=>{const offer=document.querySelector('[data-offer-state]');const action=[...document.querySelectorAll('main a')].find(a=>a.textContent.includes('View deal on eBay'));return{overflow:document.documentElement.scrollWidth>innerWidth,inputTop:document.querySelector('#pc-q').getBoundingClientRect().top,offerTop:offer?.getBoundingClientRect().top??null,actionBottom:action?.getBoundingClientRect().bottom??null,mainId:document.querySelector('main')?.id,skip:!!document.querySelector('a[href="#main-content"]'),card:!!document.querySelector('main a[href="/cards/fixture-hub"]'),text:document.querySelector('main').innerText.slice(0,400)}})()`);
   const label=name+'-'+width+'-'+scheme;states.push({label,...state});check(label+' no overflow',!state.overflow);check(label+' search input early',state.inputTop<450);check(label+' no duplicate initial API search',searchRequests.length===requestsBefore,{requests:searchRequests.slice(requestsBefore)});
   if(name==='offers'||name==='reference')check(label+' card destination retained',state.card);
   if(name==='reference'||name==='empty')check(label+' no invented offers',state.offerTop===null);
   if(phase==='after'){check(label+' shared skip target',state.skip&&state.mainId==='main-content');if(name==='offers'){check(label+' first offer early',state.offerTop!==null&&state.offerTop<700,state);check(label+' primary offer action within first screen',state.actionBottom!==null&&state.actionBottom<900,state);}}
   for(let i=0;i<30;i++){if(await ev(`[...document.images].filter(im=>im.getBoundingClientRect().top<innerHeight).every(im=>im.complete)`))break;await sleep(100);}
   await ev(`(()=>{const a=document.createElement('aside');a.textContent='SIMULATED search • providers disabled';a.style='position:fixed;bottom:0;left:0;z-index:99999;background:#fff3cd;color:#171514;font:11px Arial;padding:4px';document.body.append(a);})()`);
   fs.writeFileSync(path.join(out,label+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
 }
 await go('');await ev(`document.querySelector('#pc-q').focus()`);await send('Input.insertText',{text:'Clefable'});await ev(`document.querySelector('#pc-q').form.requestSubmit()`);
 for(let i=0;i<60;i++){if(await ev(`!!document.querySelector('main a[href="/cards/fixture-hub"]')`))break;await sleep(100);}
 check('actual client submit returns fixture identity',await ev(`location.search.includes('q=Clefable')&&!!document.querySelector('main a[href="/cards/fixture-hub"]')`));check('actual submit reaches isolated API',searchRequests.some(q=>q.includes('q=Clefable')));
 if(phase==='after'){
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Refine deals')).click()`);
  check('optional filters expand',await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Refine deals')).getAttribute('aria-expanded')==='true'`));
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Under $25').click()`);
  for(let i=0;i<60;i++){if(await ev(`location.search.includes('maxPrice=25')&&!document.querySelector('[data-offer-state]')`))break;await sleep(100);}
  check('budget refines offers while retaining reference card',await ev(`location.search.includes('maxPrice=25')&&!document.querySelector('[data-offer-state]')&&!!document.querySelector('a[href="/cards/fixture-hub"]')`));
  await ev('history.back()');for(let i=0;i<60;i++){if(await ev(`!location.search.includes('maxPrice')&&!!document.querySelector('[data-offer-state]')`))break;await sleep(100);}
  check('back restores prior search offers',await ev(`!location.search.includes('maxPrice')&&!!document.querySelector('[data-offer-state]')`));
  await go('');await ev('document.body.tabIndex=-1;document.body.focus();document.body.removeAttribute("tabindex")');for(const [key,code]of[['Tab',9],['Enter',13]]){await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});await sleep(100);}check('keyboard skip includes primary search form',await ev(`document.activeElement.id==='main-content'&&document.activeElement.contains(document.querySelector('#pc-q'))`));
 }
 check('no runtime errors',errors.length===0,errors);check('no unexpected external requests',blocked.length===0,blocked);await raw('Browser.close');
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({phase,checks,states,errors,blocked,searchRequests,limits:['Actual wrapper/client/API; search engine and providers replaced with deterministic fixture data','No live search, paid calls, provider eligibility or ranking proof','Chrome only; no Safari/iOS, assistive-user or customer-comprehension proof']},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.every(c=>c.pass)?0:1;
