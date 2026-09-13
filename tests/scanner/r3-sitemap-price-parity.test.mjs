import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {isDisplayableDeal,isDisplayableSealedDeal,savingsClaimTrusted} from '../../lib/dealQuality.js';
import {hasPrice} from '../../lib/money.js';
import {DEAL_STATE_FIXTURES} from '../../lib/dev/dealStateFixtures.js';
import {loadRoute} from '../helpers/r3RouteHarness.mjs';
const originalFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};});
afterEach(()=>{globalThis.fetch=originalFetch;});
const source=readFileSync(new URL('../../lib/sitemap.js',import.meta.url),'utf8');
const fn=source.match(/async function fetchActiveDealIdsUncached\(table\) {[\s\S]*?\n}/)[0];
async function sitemapRows(row){
 let columns=[];
 const query={from(){return this;},select(value){columns=value.split(',').map(x=>x.trim());return this;},eq(){return this;},order(){return this;},range(){return Promise.resolve({data:row.is_active?[Object.fromEntries(columns.map(k=>[k,row[k]]))]:[]});}};
 const result=await runInNewContext('('+fn+')',{
  supabase:query,MAX_DEAL_URLS:5000,PAGE_SIZE:1000,isDisplayableDeal,isDisplayableSealedDeal,savingsClaimTrusted,hasPrice,
 })('deals');
 return Array.from(result,r=>r.id);
}
for(const amount of [null,undefined,0,-1,'invalid',30.75]){
 test('actual sitemap/page price parity: '+String(amount),async()=>{
  const row={...DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal,is_active:true,total_price:amount};
  const {route}=loadRoute('app/deals/[id]/page.js',{deal:row});
  const metadata=await route.generateMetadata({params:Promise.resolve({id:String(row.id)})});
  const ids=await sitemapRows(row);
  assert.equal(ids.includes(row.id),metadata.robots?.index!==false);
  assert.equal(ids.length,amount===30.75?1:0);
 });
}
