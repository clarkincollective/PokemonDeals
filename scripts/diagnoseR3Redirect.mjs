// Narrow diagnostic against the existing provider-isolated Next fixture only.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const base='http://127.0.0.1:9483';
const out=path.resolve(import.meta.dirname,'../../r3-review-input');
const stamp=Date.now();
const record={node:process.version,http:[],browser:{redirects:[],failures:[],blocked:[]}};
async function rawGet(route){return new Promise((resolve,reject)=>http.get(base+route,r=>{r.resume();r.on('end',()=>resolve({route,status:r.statusCode,rawHeaders:r.rawHeaders}));}).on('error',reject));}
for(const route of [`/redirect-control/raw-${stamp}`,`/redirect-control/raw-${stamp}`])record.http.push(await rawGet(route));
const followed=await fetch(base+`/redirect-control/fetch-${stamp}`);
record.fetch={url:followed.url,status:followed.status,redirected:followed.redirected};await followed.arrayBuffer();
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions',`--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(),'r3-redirect-'))}`,'--remote-debugging-port=9485','about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try{
 let url;for(let i=0;i<40;i++){try{url=(await(await fetch('http://127.0.0.1:9485/json/version')).json()).webSocketDebuggerUrl;break;}catch{}await sleep(250);}
 ws=new WebSocket(url);await new Promise(r=>ws.onopen=r);let id=0,session;const pending=new Map();
 const raw=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,sessionId}));});
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);if(d.error)p.reject(Error(JSON.stringify(d.error)));else p.resolve(d.result);return;}if(d.sessionId!==session)return;
  if(d.method==='Fetch.requestPaused'){
   const u=d.params.request.url,ok=u.startsWith(base+'/')||u.startsWith('https://tcgplayer-cdn.tcgplayer.com/')||u.startsWith('data:');
   if(!ok)record.browser.blocked.push(u);
   raw(ok?'Fetch.continueRequest':'Fetch.failRequest',ok?{requestId:d.params.requestId}:{requestId:d.params.requestId,errorReason:'BlockedByClient'},session).catch(e=>record.browser.failures.push(String(e)));
  }
  if(d.method==='Network.requestWillBeSent'&&d.params.redirectResponse)record.browser.redirects.push(d.params.redirectResponse);
  if(d.method==='Network.loadingFailed')record.browser.failures.push(d.params);
 };
 record.browser.version=await raw('Browser.getVersion');
 const {targetId}=await raw('Target.createTarget',{url:'about:blank'});session=(await raw('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 const send=(m,p={})=>raw(m,p,session);
 await send('Page.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 record.browser.navigation=await send('Page.navigate',{url:base+`/redirect-control/chrome-${stamp}`});
 await sleep(2000);
 const state=await send('Runtime.evaluate',{expression:'({url:location.href,title:document.title,text:document.body.innerText.slice(0,1200)})',returnByValue:true});
 record.browser.state=state.result.value;
 await send('Runtime.evaluate',{expression:`(()=>{const label=document.createElement('div');label.textContent='SIMULATED • cold redirect diagnostic • providers disabled';label.style='position:fixed;bottom:0;left:0;z-index:99999;background:white;color:black;font:11px Arial;padding:3px';document.body.append(label)})()`});
 const shot=await send('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync(path.resolve(out,'../shots/R3-COLD-REDIRECT-CHROME.png'),Buffer.from(shot.data,'base64'));
 await raw('Browser.close');
}finally{ws?.close();chrome.kill();fs.writeFileSync(path.join(out,'r3-redirect-diagnostic.json'),JSON.stringify(record,null,2));}
const expected=base+'/cards/fixture-hub';
record.checks={
 singleLocation:record.http.every(r=>r.rawHeaders.filter((h,i)=>i%2===0&&h.toLowerCase()==='location').length===1),
 nodeDestination:record.fetch.url===expected&&record.fetch.status===200,
 chromeDestination:record.browser.state?.url===expected&&record.browser.state?.title.includes('Clefable'),
};
record.pass=Object.values(record.checks).every(Boolean);
fs.writeFileSync(path.join(out,'r3-redirect-diagnostic.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify({fetch:record.fetch,browser:record.browser.state,navigation:record.browser.navigation,pass:record.pass},null,2));
if(!record.pass)process.exitCode=1;
