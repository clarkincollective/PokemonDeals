import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
// Execute the installed Next resolver. Only its server-only marker is
// replaced for this Node test; actual resolver/dependency code is retained.
const require=createRequire(import.meta.url);
const filename=require.resolve('next/dist/lib/metadata/resolve-metadata.js');
const nextRequire=createRequire(filename),mod={exports:{}};
new Function('require','module','exports',readFileSync(filename,'utf8'))(name=>name==='server-only'?{}:nextRequire(name),mod,mod.exports);
const {accumulateMetadata}=mod.exports;
const layout=readFileSync(new URL('../../app/layout.js',import.meta.url),'utf8');
const constant=name=>JSON.parse(layout.match(new RegExp('const '+name+' =\\s*("[^"\\n]*")'))[1]);
const root=runInNewContext('('+layout.match(/export const metadata = ([\s\S]*?);\s*export default/)[1]+')',{URL,SITE_URL:constant('SITE_URL'),SITE_TITLE:constant('SITE_TITLE'),SITE_DESCRIPTION:constant('SITE_DESCRIPTION')});
// Model the generated file descriptor at the root segment. The actual image
// module/loader is not executed here; this checks Next's merge precedence.
const rootImage={openGraph:[{url:'https://pokemondealfinder.com/opengraph-image',width:1200,height:630,type:'image/png'}]};
async function mergeLeaf(route,path,leaf){
 return accumulateMetadata(route,[[root,rootImage],[null,null],[leaf,null]],Promise.resolve(path),{trailingSlash:false,isStaticMetadataRouteFile:false});
}
for(const state of ['plain','unavailable','expired']){
 test('Next merged previews reflect '+state,async()=>{
  const deal={...DEAL_STATE_FIXTURES.find(f=>f.id===(state==='plain'?'bin_plain':'bin_compared')).deal,is_active:state!=='expired',...(state==='unavailable'?{total_price:null}:{})};
  const path='/deals/'+deal.id;
  const {route}=loadRoute('app/deals/[id]/page.js',{deal});
  const leaf=await route.generateMetadata({params:Promise.resolve({id:String(deal.id)})});
  const merged=await mergeLeaf('/deals/[id]',path,leaf);
  assert.equal(merged.robots.basic,'noindex, follow');
  assert.equal(merged.openGraph.description,leaf.description);
  assert.equal(merged.twitter.description,leaf.description);
  assert.notEqual(merged.openGraph.description,root.description);
  assert.ok(!(merged.openGraph.images??[]).some(image=>image.url===rootImage.openGraph[0].url));
 });
}

test('root image descriptor is included when leaf has no image override',async()=>{
 const merged=await mergeLeaf('/cards/[slug]','/cards/fixture',{});
 assert.equal(merged.openGraph.images[0].url,rootImage.openGraph[0].url);
});
test('missing card preview does not promote site-wide deals or artwork',async()=>{
 const {route}=loadRoute('app/cards/[slug]/page.js');
 const leaf=await route.generateMetadata({params:Promise.resolve({slug:'fixture-missing'})});
 const merged=await mergeLeaf('/cards/[slug]','/cards/fixture-missing',leaf);
 assert.equal(merged.robots.basic,'noindex, follow');
 assert.match(merged.description,/not.*available/i);
 assert.equal(merged.openGraph.description,merged.description);
 assert.equal(merged.twitter.description,merged.description);
 assert.equal((merged.openGraph.images??[]).length,0);
 assert.equal((merged.twitter.images??[]).length,0);
});
for(const kind of ['catalogue','hub']){
 test('valid '+kind+' keeps exact artwork and canonical through Next merge',async()=>{
  const artwork='https://tcgplayer-cdn.tcgplayer.com/product/45120_in_1000x1000.jpg';
  const options=kind==='catalogue'
   ?{card:{name:'Clefable',set:'Jungle',cardNumber:'1/64',tcgplayerId:'45120',image:artwork,refPrice:30,indexable:true}}
   :{hub:{id:'fixture-hub',name:'Clefable',set:'Jungle',tcgplayerId:'45120'},offers:[]};
  const {route}=loadRoute('app/cards/[slug]/page.js',options);
  const leaf=await route.generateMetadata({params:Promise.resolve({slug:'fixture-clefable'})});
  const merged=await mergeLeaf('/cards/[slug]','/cards/fixture-clefable',leaf);
  assert.equal(merged.openGraph.images[0].url,artwork);
  assert.equal(merged.twitter.images[0].url,artwork);
  assert.equal(merged.openGraph.description,leaf.description);
  assert.equal(merged.alternates.canonical.url,'https://pokemondealfinder.com/cards/fixture-clefable');
 });
}
