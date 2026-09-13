// Local actual Next fixture only. Never accepts a production URL.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {catalogCardSlug} from '../lib/cardSlug.js';
const BASE='http://127.0.0.1:9483',out=path.resolve(import.meta.dirname,'../../shots/r4-catalogue');
fs.mkdirSync(out,{recursive:true});
const sets=JSON.parse(fs.readFileSync(new URL('../tests/browser/r3/runtime/set-rows.json',import.meta.url),'utf8'));
const dragonite=JSON.parse(fs.readFileSync(new URL('../tests/browser/r3/runtime/dragonite-links.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const saved=JSON.parse(fs.readFileSync(new URL('../tests/browser/r3/runtime/saved-catalogue.json',import.meta.url),'utf8'));
const cases=[['/sets/jungle','Jungle',64],['/sets/neo-destiny','Neo Destiny',113],['/sets/boundaries-crossed','Boundaries Crossed',153],['/pokemon/dragonite','Dragonite',dragonite.length],['/pokemon/cleffa','Cleffa',4]];
const routes=cases.map(c=>c[0]),checks=[],errors=[],blocked=[],excluded=[];
const check=(name,pass,detail)=>{checks.push({name,pass:Boolean(pass),detail});if(!pass)console.error('FAIL',name,JSON.stringify(detail));};
for(const [route,name,count] of cases){
 const res=await fetch(BASE+route),html=await res.text();fs.writeFileSync(path.join(out,route.slice(1).replaceAll('/','-')+'.html'),html);
 const expected=saved[name]?.length?saved[name].map(c=>'/cards/'+(c.hubSlug||c.catalogSlug)):route.startsWith('/sets/')?sets[route.split('/').at(-1)].map(r=>'/cards/'+catalogCardSlug(`${r.name} ${r.number}`,name)):[];
 check(route+' full initial-HTML link population',res.status===200&&expected.every(h=>html.includes(`href="${h}"`)),{status:res.status,expected:expected.length,count});
 const inventoryAt=html.indexOf('id="inventory"'),valueAt=html.indexOf('Most valuable');
 check(route+' initial inventory precedes value section',inventoryAt>0&&(valueAt<0||inventoryAt<valueAt),{inventory:inventoryAt,value:valueAt});
}
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars',`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'r4-catalogue-'))}`,'--remote-debugging-port=9484','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map();
try{
 let url;for(let i=0;i<40;i++){try{url=(await(await fetch('http://127.0.0.1:9484/json/version')).json()).webSocketDebuggerUrl;break;}catch{}await sleep(250);}
 ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);
 const raw=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,sessionId}));});let session;
 ws.onmessage=event=>{const d=JSON.parse(event.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);return;}if(d.sessionId!==session)return;
  if(d.method==='Fetch.requestPaused'){
   const u=d.params.request.url;let ok=u.startsWith(BASE+'/')||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/')||u.startsWith('https://images.pokemontcg.io/')||u.startsWith('data:');
   if(u.startsWith(BASE+'/')){const p=new URL(u).pathname;if(!routes.includes(p)&&!['/api/rates','/api/deals-page','/icon.svg'].includes(p)&&!p.startsWith('/_next/')){excluded.push(u);raw('Fetch.fulfillRequest',{requestId:d.params.requestId,responseCode:404,body:''},session).catch(e=>errors.push(String(e)));return;}}
   if(!ok)blocked.push(u);raw(ok?'Fetch.continueRequest':'Fetch.failRequest',ok?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(e=>errors.push(String(e)));
  }
  if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);
  if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error')errors.push(d.params.args);
 };
 const {targetId}=await raw('Target.createTarget',{url:'about:blank'});session=(await raw('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 const send=(m,p={})=>raw(m,p,session);
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 const go=async route=>{await send('Page.navigate',{url:BASE+route});for(let i=0;i<100;i++){if(await ev(`document.readyState==='complete'&&!!document.querySelector('[data-catalogue-primary]')`))break;await sleep(100);}await sleep(600);};
 const click=async selector=>{await ev(`(${selector}).scrollIntoView({block:'center'})`);const p=await ev(`(()=>{const r=(${selector}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(180);};
 const button=label=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
 const shot=async name=>{await ev(`(()=>{let b=document.getElementById('fixture-label');if(!b){b=document.createElement('aside');b.id='fixture-label';b.setAttribute('data-print-hide','');b.style='position:fixed;bottom:0;left:0;z-index:99999;padding:4px 8px;background:#fff3cd;color:#171514;font:11px Arial';document.body.append(b);}b.textContent='SIMULATED • local Next fixture • providers disabled';})()`);fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 for(const [width,scheme] of [[1280,'light'],[390,'light'],[320,'dark']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
  for(const [route,name,count] of cases){
   await go(route);const prefix=route.slice(1).replaceAll('/','-')+'-'+width+'-'+scheme;
   const state=await ev(`({main:document.querySelectorAll('main').length,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth,primary:!document.querySelector('[data-catalogue-primary]').hidden,rows:document.querySelectorAll('[data-catalogue-primary] tbody td:nth-child(2) a,[data-catalogue-primary] [data-row-key]').length,own:document.querySelectorAll('[data-catalogue-primary] input[type=checkbox]').length,canonical:document.querySelector('link[rel=canonical]')?.href})`);
   check(prefix+' layout and initial view',state.main===1&&state.h1===1&&!state.overflow&&state.primary,state);
   check(prefix+' inventory rows and ownership scope',(route.startsWith('/sets/')?state.rows===count&&state.own===count:state.rows===count&&state.own===0),state);
   if(route.startsWith('/sets/')){
    const fit=await ev(`(()=>{const t=document.querySelector('[data-checklist-print] table');return {width:t.scrollWidth,available:t.parentElement.clientWidth,prices:[...t.querySelectorAll('tbody td:last-child')].every(c=>c.getBoundingClientRect().right<=innerWidth)}})()`);
    check(prefix+' whole table fits',fit.width<=fit.available&&fit.prices,fit);
   }
   if(width===1280){
    await ev('document.activeElement?.blur();scrollTo(0,0)');
    for(const [key,code] of [['Tab',9],['Enter',13]]){await send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});}
    check(prefix+' keyboard skip',await ev(`document.activeElement.id==='main-content'`));await ev('scrollTo(0,0)');
   }
   await shot(prefix+'-top');await ev(`document.querySelector('[data-catalogue-primary] table')?.scrollIntoView({block:'start'});scrollBy(0,-80)`);await shot(prefix+'-list');
   await click(button('Search & gallery'));check(prefix+' gallery switch',await ev(`document.querySelector('[data-catalogue-primary]').hidden&&document.querySelector('[aria-label="Inventory view"] button[aria-pressed=true]').textContent==='Search & gallery'`));
   await shot(prefix+'-gallery');await click(button(route.startsWith('/sets/')?'Checklist':'Card list'));
  }
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
 for(const [route,name,count] of cases.filter(c=>c[0].startsWith('/sets/'))){
  await go(route);await ev('localStorage.clear()');await go(route);
  const owned=()=>ev(`document.querySelectorAll('[data-checklist-print] input:checked').length`);
  await click(`document.querySelector('[data-checklist-print] input[type=checkbox]')`);check(name+' own',await owned()===1);
  await click(button('Show missing only'));check(name+' missing',await ev(`document.querySelectorAll('[data-row-key]').length`)===count-1);
  await click(button('Search & gallery'));await click(button('Checklist'));check(name+' view preserves missing filter',await ev(`document.querySelectorAll('[data-row-key]').length`)===count-1);
  await click(button('Search & gallery'));await send('Emulation.setEmulatedMedia',{media:'print'});
  check(name+' hidden list printable from gallery',await ev(`document.querySelector('[data-checklist-print] table').getBoundingClientRect().height>100`));
  const pdf=Buffer.from((await send('Page.printToPDF',{printBackground:false,preferCSSPageSize:true})).data,'base64');fs.writeFileSync(path.join(out,route.split('/').at(-1)+'-missing.pdf'),pdf);
  check(name+' text print no artwork',!pdf.toString('latin1').match(/\/Subtype\s*\/Image/),{bytes:pdf.length});
  await send('Emulation.setEmulatedMedia',{media:''});await go(route);check(name+' reload persists owned',await owned()===1);
  await click(button('Reset progress'));await click(button('Yes, clear progress'));check(name+' reset and returned focus',await owned()===0&&await ev(`document.activeElement.textContent.trim()==='Reset progress'`));
 }
 await go('/sets/jungle');await ev(`Storage.prototype.setItem=function(){throw new DOMException('Fixture denied','QuotaExceededError')}`);await click(`document.querySelector('[data-checklist-print] input[type=checkbox]')`);
 check('storage failure honest copy',await ev(`document.querySelector('[data-checklist-persist]').textContent.includes("Progress isn't saved")`));await shot('jungle-storage-failure');
 check('no unexpected external requests',blocked.length===0,blocked);check('no captured runtime errors',errors.length===0,errors);
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({checks,errors,blocked,excluded,limits:['Historical saved cards for Jungle, Neo Destiny and Dragonite; simulated references and URLs for all 153 Boundaries Crossed rows','No Safari/iOS or real screen reader','Only original reference artwork permitted externally']},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.some(c=>!c.pass)?1:0;

