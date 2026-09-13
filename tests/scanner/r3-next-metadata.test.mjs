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
for(const state of ['plain','unavailable','expired']){
 test('Next merged previews reflect '+state,async()=>{
  const deal={...DEAL_STATE_FIXTURES.find(f=>f.id===(state==='plain'?'bin_plain':'bin_compared')).deal,is_active:state!=='expired',...(state==='unavailable'?{total_price:null}:{})};
  const path='/deals/'+deal.id;
  const {route}=loadRoute('app/deals/[id]/page.js',{deal});
  const leaf=await route.generateMetadata({params:Promise.resolve({id:String(deal.id)})});
  const merged=await accumulateMetadata('/deals/[id]',[[root,null],[null,null],[leaf,null]],Promise.resolve(path),{trailingSlash:false,isStaticMetadataRouteFile:false});
  assert.equal(merged.robots.basic,'noindex, follow');
  assert.equal(merged.openGraph.description,leaf.description);
  assert.equal(merged.twitter.description,leaf.description);
  assert.notEqual(merged.openGraph.description,root.description);
 });
}
