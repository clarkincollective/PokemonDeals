// Bounded owner-feedback check. Existing local provider-isolated fixture only.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw Error('Use before or after');
const base='http://127.0.0.1:9483', out=path.resolve(import.meta.dirname,`../../shots/set-hierarchy/${phase}`);
fs.mkdirSync(out,{recursive:true});
const routes=['/sets/jungle','/sets/neo-destiny'],checks=[],positions=[],errors=[],blocked=[];
const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail});
for(const route of routes){const response=await fetch(base+route);const html=await response.text();const filename=route.split('/').at(-1)+'.html';fs.writeFileSync(path.join(out,filename),html);check(route+' HTTP',response.status===200);
 if(phase==='after'){const before=fs.readFileSync(path.resolve(out,'../before',filename),'utf8');const cards=text=>[...new Set([...text.matchAll(/href="(\/cards\/[^"#?]+)"/g)].map(m=>m[1]))].sort();check(route+' complete initial card destinations preserved',JSON.stringify(cards(before))===JSON.stringify(cards(html))&&cards(html).length>0,{before:cards(before).length,after:cards(html).length});for(const pattern of [/<title>.*?<\/title>/,/<meta name="description"[^>]*>/,/<link rel="canonical"[^>]*>/])check(route+' metadata preserved '+pattern, before.match(pattern)?.[0]===html.match(pattern)?.[0]);}
}
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--hide-scrollbars',`--user-data-dir=${fs.mkdtempSync(path.join(out,'chrome-'))}`,'--remote-debugging-port=9484','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,id=0,session;const pending=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let endpoint;for(let i=0;i<40;i++){try{endpoint=(await(await fetch('http://127.0.0.1:9484/json/version')).json()).webSocketDebuggerUrl;break;}catch{}await sleep(250);}
 ws=new WebSocket(endpoint);await new Promise(r=>ws.onopen=r);
 const raw=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,sessionId}));});
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);return;}if(d.sessionId!==session)return;
  if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails);
  if(d.method==='Fetch.requestPaused'){const u=new URL(d.params.request.url),own=u.origin===base;const okay=own&&(routes.includes(u.pathname)||['/api/rates','/api/deals-page','/icon.svg'].includes(u.pathname)||u.pathname.startsWith('/_next/'))||['tcgplayer-cdn.tcgplayer.com','images.pokemontcg.io'].includes(u.hostname);if(own&&!okay){raw('Fetch.fulfillRequest',{requestId:d.params.requestId,responseCode:404,body:''},session).catch(e=>errors.push(e.message));return;}if(!okay)blocked.push(u.href);raw(okay?'Fetch.continueRequest':'Fetch.failRequest',okay?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(e=>errors.push(e.message));}
 };
 const t=await raw('Target.createTarget',{url:'about:blank'});session=(await raw('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;
 const send=(m,p={})=>raw(m,p,session),ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 for(const [width,scheme] of [[1280,'light'],[390,'light'],[320,'dark']])for(const route of routes){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});await send('Page.navigate',{url:base+route});
  for(let i=0;i<100;i++){if(await ev(`location.pathname===${JSON.stringify(route)}&&document.readyState==='complete'&&!!document.querySelector('#inventory')`))break;await sleep(100);}await sleep(600);await ev("scrollTo({top:0,behavior:'instant'})");
  const state=await ev(`(()=>{const y=s=>document.querySelector(s)?.getBoundingClientRect().top??null;const action=[...document.querySelectorAll('[data-offer-state] a')].find(a=>a.textContent.includes('on eBay'));return {width:innerWidth,scroll:document.documentElement.scrollWidth,inventory:y('#inventory'),deals:y('#deals'),offer:y('[data-offer-state]'),cta:action?.getBoundingClientRect().bottom??null,jump:y('nav[aria-label="On this page"] a[href="#inventory"]'),rows:document.querySelectorAll('[data-row-key]').length,notes:y('[data-set-reference]')};})()`);
  const label=route.split('/').at(-1)+'-'+width+'-'+scheme;positions.push({label,...state});check(label+' no page overflow',state.scroll<=width,state);
  if(phase==='after'){
   check(label+' checklist shortcut early',state.jump!==null&&state.jump<450,state.jump);
   if(route.endsWith('/jungle')){check(label+' offers before full catalogue',state.offer!==null&&state.offer<state.inventory,state);check(label+' first offer begins in first screen',state.offer<700,state.offer);check(label+' primary offer action within first screen',state.cta<900,state.cta);}
   else check(label+' no invented offer; checklist leads',state.offer===null&&state.inventory<600,state);
   await ev(`document.querySelector('nav[aria-label="On this page"] a[href="#inventory"]').click()`);for(let i=0;i<20;i++){if(await ev(`Math.abs(document.querySelector('#inventory').getBoundingClientRect().top)<150`))break;await sleep(100);}check(label+' checklist jump reaches controls',await ev(`Math.abs(document.querySelector('#inventory').getBoundingClientRect().top)<150`));
   if(route.endsWith('/jungle')){const button=`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('More filters'))`;await ev(`(${button}).click()`);check(label+' filters expand',await ev(`(${button}).getAttribute('aria-expanded')==='true'`));await ev(`(${button}).click()`);check(label+' filters collapse',await ev(`(${button}).getAttribute('aria-expanded')==='false'`));}
   await ev("document.activeElement?.blur();scrollTo({top:0,behavior:'instant'})");
  }
  for(let i=0;i<50;i++){if(await ev(`[...document.images].filter(im=>{const r=im.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).every(im=>im.complete)`))break;await sleep(100);}await sleep(200);
  await ev(`(()=>{const a=document.createElement('aside');a.textContent='SIMULATED • local Next fixture • providers disabled';a.style='position:fixed;bottom:0;left:0;z-index:99999;padding:4px 8px;background:#fff3cd;color:#171514;font:11px Arial';a.setAttribute('data-print-hide','');document.body.append(a);})()`);
  fs.writeFileSync(path.join(out,label+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 check('no unexpected external requests',blocked.length===0,blocked);check('no runtime exceptions',errors.length===0,errors);await raw('Browser.close');
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'record.json'),JSON.stringify({phase,checks,positions,errors,blocked,limits:['Historical catalogue identities and simulated offers; not current production inventory','Chrome fixture only; not Safari/iOS or screen-reader proof']},null,2));}
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);for(const c of checks.filter(c=>!c.pass))console.error(c.name,JSON.stringify(c.detail));process.exitCode=checks.every(c=>c.pass)?0:1;
