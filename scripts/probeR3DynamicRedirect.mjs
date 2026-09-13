// Run only after building the existing fixture with --probe-dynamic-listings.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.next/r3-runtime/manifest.json'),'utf8'));
if(manifest.dynamicListingProbe!==true)throw Error('Requires explicitly generated dynamic-listing probe');
const base='http://127.0.0.1:9483';
const responses=[];
for(const route of ['/deals/900001','/deals/900001','/deals/900022']){
 responses.push(await new Promise((resolve,reject)=>http.get(base+route,r=>{let html='';r.setEncoding('utf8');r.on('data',chunk=>html+=chunk);r.on('end',()=>resolve({route,status:r.statusCode,rawHeaders:r.rawHeaders,headers:r.headers,main:html.includes('<main')}));}).on('error',reject)));
}
const followed=await fetch(base+'/deals/900022');
await followed.arrayBuffer();
const checks={
 livePages:responses.slice(0,2).every(r=>r.status===200&&r.main),
 livePageCacheLost:responses.slice(0,2).every(r=>r.headers['cache-control']?.includes('no-store')&&!r.headers['x-nextjs-cache']),
 singleRedirect:responses[2].status===308&&responses[2].headers.location==='/cards/fixture-hub'&&responses[2].rawHeaders.filter((h,i)=>i%2===0&&h.toLowerCase()==='location').length===1,
 followed:followed.status===200&&followed.url===base+'/cards/fixture-hub',
};
const result={checks,responses,followed:{status:followed.status,url:followed.url},limitation:'Test-only removal of generateStaticParams. Data-cache source preserved; provider-call counts, production costs and category rendering not measured.'};
fs.writeFileSync(path.resolve(root,'../r3-review-input/r3-dynamic-redirect-probe.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));if(!Object.values(checks).every(Boolean))process.exitCode=1;
