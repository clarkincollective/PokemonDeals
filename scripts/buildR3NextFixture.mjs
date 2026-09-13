// Prepare an isolated, credential-free Next application from actual R3 source.
// This does NOT build or run the production app. See manifest for boundaries.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'.next/r3-runtime');
const fixtures=resolve(root,'tests/browser/r3/runtime');
const write=(name,text)=>{const path=resolve(out,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);};
const sources=[];
const configSource=readFileSync(resolve(root,'next.config.mjs'),'utf8').replace('export default nextConfig;','');
function source(name){const text=readFileSync(resolve(root,name),'utf8');sources.push({file:name,sha256:createHash('sha256').update(text).digest('hex')});return text;}
let layout=source('app/layout.js');
layout=layout.replace('import { Geist, Geist_Mono } from "next/font/google";','');
layout=layout.replace(/const geistSans = Geist\([\s\S]*?\);/,'const geistSans = { variable: "" };').replace(/const geistMono = Geist_Mono\([\s\S]*?\);/,'const geistMono = { variable: "" };');
if(layout.includes('next/font')||layout.includes('Geist('))throw Error('UNRECOGNISED_FONT_BOUNDARY');
write('app/layout.js',layout);
let listing=source('app/deals/[id]/page.js');
const old='return DEAL_CATEGORY_SLUGS.map((id) => ({ id }));';
if(!listing.includes(old))throw Error('UNRECOGNISED_STATIC_PARAMS');
listing=listing.replace(old,'return [900001,900004,900005,900002,900006,900020,900021].map(id => ({id:String(id)}));');
write('app/deals/[id]/page.js',listing);
write('app/cards/[slug]/page.js',source('app/cards/[slug]/page.js'));
write('app/opengraph-image.js',source('app/opengraph-image.js'));
copyFileSync(resolve(root,'app/icon.svg'),resolve(out,'app/icon.svg'));
const css=readFileSync(resolve(root,'../shots/r3-static/bin_compared.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1];
if(!css)throw Error('Generate offline static fixtures first');
write('app/globals.css',css+'\nbody{font-family:Geist,Arial,sans-serif}');
write('app/page.js',`import Link from 'next/link';export default function Index(){return <main><h1>SIMULATED R3 Next runtime</h1><p>Fixture prices and links. Providers disabled.</p><Link prefetch={false} href="/deals/900001">Open fixture listing</Link><br/><Link prefetch={false} href="/cards/fixture-hub">Open fixture card</Link></main>;}`);
write('app/redirect-control/[id]/page.js',`import {permanentRedirect} from 'next/navigation';export const revalidate=600;export function generateStaticParams(){return [];}export default async function Page({params}){await params;permanentRedirect('/cards/fixture-hub');}`);
write('app/api/rates/route.js',`export function GET(){return Response.json({viewer:'AUD',marketplace:'EBAY_AU',geo_country:'AU',rates:{USD:1,AUD:1.5,GBP:0.8}});}`);
write('app/api/deals-page/route.js',`import {listingRows} from ${JSON.stringify(resolve(fixtures,'data.js').replaceAll('\\','/'))};export function GET(request){const type=new URL(request.url).searchParams.get('type');return Response.json({deals:type==='graded'?[listingRows[2]]:[listingRows[0]],error:null});}`);
write('package.json',JSON.stringify({name:'r3-next-runtime-fixture',private:true},null,2));
const aliases=Object.fromEntries(['@/lib/deals','@/lib/supabaseAdmin','@/lib/pokemonPriceTracker','@/lib/email'].map(name=>[name+'$',resolve(fixtures,'data.js')]));
for(const name of ['@/lib/analytics/client','@vercel/analytics','@vercel/analytics/next','@vercel/speed-insights/next','next/script'])aliases[name+'$']=resolve(fixtures,'transports.js');
aliases['@/components/DealCategoryPage$']=resolve(fixtures,'category.js');
write('next.config.mjs',`${configSource}
const base=nextConfig;
import fs from 'node:fs';
export default {...base,devIndicators:false,images:{...base.images,unoptimized:true},experimental:{cpus:1,externalDir:true},webpack(config){
 config.resolve.alias={...config.resolve.alias,...${JSON.stringify(aliases)},'@':${JSON.stringify(root)}};
 config.plugins.push({apply(compiler){compiler.hooks.compilation.tap('R3ProviderIsolation',compilation=>{compilation.hooks.finishModules.tap('R3ProviderIsolation',modules=>{
 const resources=[...modules].map(m=>m.resource).filter(Boolean);
 const forbidden=resources.filter(r=>/[/\\\\]lib[/\\\\](deals|supabaseAdmin|pokemonPriceTracker|email)\\.js$|posthog-js|@supabase|[/\\\\]lib[/\\\\]analytics[/\\\\]client\\.js$/.test(r));
 if(forbidden.length)throw Error('R3_PROVIDER_MODULE_FORBIDDEN:'+forbidden.join(','));
 fs.writeFileSync(${JSON.stringify(resolve(out,'module-'))}+compiler.name+'.json',JSON.stringify(resources,null,2));
 });});}});return config;}};
`);
write('manifest.json',JSON.stringify({sources,boundaries:['Fixture provider/database modules; compile-time forbidden-module assertion','Node preload denies external networking before Next/worker startup','Root Google font transform replaced with existing offline Geist CSS','Next Script / analytics transports stubbed; email disabled','Next Image component retained but optimisation disabled to prevent server image fetches','Listing build params restricted to fixture IDs; card runtime params unchanged','Actual Next metadata-file loader, routes, React cache and CurrencyProvider retained'],project:out},null,2));
console.log(out);
