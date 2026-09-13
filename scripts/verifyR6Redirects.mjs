// Bounded raw-header checks on the existing provider-isolated Next fixture.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const BASE='http://127.0.0.1:9483',checks=[],responses=[];
const read=route=>new Promise((resolve,reject)=>http.get(BASE+route,r=>{r.resume();r.on('end',()=>resolve({route,status:r.statusCode,headers:r.headers,rawHeaders:r.rawHeaders}));}).on('error',reject));
const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail});
for(const [route,destination] of [['/pokemon/DrAgOnItE','/pokemon/dragonite'],['/pokemon/%44ragonite?country=EBAY_CA','/pokemon/dragonite'],['/pokemon/NOT-A-SPECIES','/pokemon/not-a-species'],['/price-checker','/search']]){
 const r=await read(route);responses.push(r);
 const locations=r.rawHeaders.filter((v,i,a)=>i%2===1&&a[i-1].toLowerCase()==='location');
 check(route+' single permanent destination',r.status===308&&locations.length===1&&new URL(locations[0],BASE).href===BASE+destination,r);
 if(route.startsWith('/pokemon/')){const f=await fetch(BASE+route);await f.arrayBuffer();check(route+' redirect follower',f.url===BASE+destination&&f.status===(route.includes('NOT-A')?404:200),{status:f.status,url:f.url});}
}
for(const route of ['/pokemon/dragonite','/pokemon/dragonite']){
 const r=await read(route);responses.push(r);check('normal species retains ISR',r.status===200&&r.headers['cache-control']?.includes('s-maxage=3600')&&['HIT','MISS','STALE'].includes(r.headers['x-nextjs-cache']),r);
}
const r=await read('/deals/900022');responses.push(r);check('listing redirect remains single',r.status===308&&r.headers.location==='/cards/fixture-hub'&&r.rawHeaders.filter((h,i)=>i%2===0&&h.toLowerCase()==='location').length===1,r);
fs.writeFileSync(path.resolve(import.meta.dirname,'../../r3-review-input/r6-redirects.json'),JSON.stringify({checks,responses,limits:'Local fixture headers/cache only; proxy invocation costs and production intermediary behaviour not measured.'},null,2));
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} checks passed`);process.exitCode=checks.every(c=>c.pass)?0:1;
