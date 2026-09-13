// Prepare an isolated, credential-free Next application from actual R3 source.
// This does NOT build or run the production app. See manifest for boundaries.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {GUIDES} from '../lib/guides.js';
const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'.next/r3-runtime');
const fixtures=resolve(root,'tests/browser/r3/runtime');
if(process.argv.length>2)throw Error('No fixture options: approved dynamic listing source is now the default');
const write=(name,text)=>{const path=resolve(out,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);};
const sources=[];
const configSource=readFileSync(resolve(root,'next.config.mjs'),'utf8').replace('export default nextConfig;','');
function source(name){const text=readFileSync(resolve(root,name),'utf8');sources.push({file:name,sha256:createHash('sha256').update(text).digest('hex')});return text;}
let layout=source('app/layout.js');
layout=layout.replace('import { Geist, Geist_Mono } from "next/font/google";','');
layout=layout.replace(/const geistSans = Geist\([\s\S]*?\);/,'const geistSans = { variable: "" };').replace(/const geistMono = Geist_Mono\([\s\S]*?\);/,'const geistMono = { variable: "" };');
if(layout.includes('next/font')||layout.includes('Geist('))throw Error('UNRECOGNISED_FONT_BOUNDARY');
write('app/layout.js',layout);
write('proxy.js',source('proxy.js'));
const listing=source('app/deals/[id]/page.js');
if(/export\s+(?:async\s+)?function\s+generateStaticParams/.test(listing))throw Error('Listing static generation would reintroduce the cold-redirect bug');
write('app/deals/[id]/page.js',listing);
write('app/cards/[slug]/page.js',source('app/cards/[slug]/page.js'));
write('app/sets/[slug]/page.js',source('app/sets/[slug]/page.js'));
write('app/pokemon/[slug]/page.js',source('app/pokemon/[slug]/page.js'));
write('app/sealed-deals/[id]/page.js',source('app/sealed-deals/[id]/page.js'));
for(const route of ['cards','sets','pokemon','deals','sealed-deals','japanese-cards','latest-releases','guides','about','contact','how-it-works','methodology','privacy','affiliate-disclosure','market-data','market-data/most-listed-cards','market-data/most-expensive-cards','market-data/pokemon-card-value-distribution','market-data/pokemon-reference-price-changes',...GUIDES.map(g=>'guides/'+g.slug)])write(`app/${route}/page.js`,source(`app/${route}/page.js`));
write('app/fixture-tools/page.js',`import SiteHeader from '@/components/SiteHeader';import SkipToContent from '@/components/SkipToContent';import CardMemoryStrip from '@/components/CardMemoryStrip';import PriceAlertForm from '@/components/PriceAlertForm';export default function Page(){return <><SkipToContent/><SiteHeader/><main id="main-content" tabIndex={-1}><h1 className="p-6 text-2xl font-bold">SIMULATED saved cards and alerts</h1><CardMemoryStrip/><section className="p-6"><PriceAlertForm cardSlug="fixture-hub" cardName="Clefable" suggestedPrice={30}/></section></main></>}`);
write('app/fixture-sealed/page.js',`import SealedDealCard from '@/components/SealedDealCard';import {sealedFixtures} from ${JSON.stringify(resolve(fixtures,'sealedFixtures.js').replaceAll('\\','/'))};export default function Page(){return <main className="mx-auto max-w-6xl p-5"><h1>SIMULATED sealed product states</h1><div className="mt-5 grid gap-4 sm:grid-cols-3">{sealedFixtures.filter(f=>f.deal.is_active).map(f=><section key={f.state} data-state={f.state}><h2>{f.state}</h2><SealedDealCard deal={f.deal}/></section>)}</div></main>;}`);
write('app/opengraph-image.js',source('app/opengraph-image.js'));
copyFileSync(resolve(root,'app/icon.svg'),resolve(out,'app/icon.svg'));
const offlineCss=readFileSync(resolve(root,'../shots/r3-static/bin_compared.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1];
const fonts=offlineCss?.match(/@font-face\s*\{[^}]*\}/g)?.join('\n');
if(!fonts)throw Error('Generate offline static fixtures first for local Geist fonts');
// Compile current source, so newly added classes cannot silently use a stale
// prior fixture stylesheet. Only embedded offline font faces are reused.
const css=(await postcss([tailwind({base:root})]).process(source('app/globals.css'),{from:resolve(root,'app/globals.css')})).css;
write('app/globals.css',css+'\n'+fonts+'\nbody{font-family:Geist,Arial,sans-serif}');
write('app/page.js',source('app/page.js'));
write('app/best-finds/page.js',source('app/best-finds/page.js'));
write('app/price-checker/page.js',source('app/price-checker/page.js'));
write('app/fixture-index/page.js',`import Link from 'next/link';export default function Index(){return <main><h1>SIMULATED R3 Next runtime</h1><p>Fixture prices and links. Providers disabled.</p><Link prefetch={false} href="/deals/900001">Open fixture listing</Link><br/><Link prefetch={false} href="/cards/fixture-hub">Open fixture card</Link></main>;}`);
write('app/redirect-control/[id]/page.js',`import {permanentRedirect} from 'next/navigation';export const revalidate=600;export function generateStaticParams(){return [];}export default async function Page({params}){await params;permanentRedirect('/cards/fixture-hub');}`);
write('app/api/rates/route.js',`export function GET(){return Response.json({viewer:'AUD',marketplace:'EBAY_AU',geo_country:'AU',rates:{USD:1,AUD:1.5,GBP:0.8}});}`);
write('app/api/deals-page/route.js',`import {listingRows} from ${JSON.stringify(resolve(fixtures,'data.js').replaceAll('\\','/'))};export function GET(request){const type=new URL(request.url).searchParams.get('type');return Response.json({deals:type==='graded'?[listingRows[2]]:[listingRows[0]],error:null});}`);
write('package.json',JSON.stringify({name:'r3-next-runtime-fixture',private:true},null,2));
const aliases=Object.fromEntries(['@/lib/deals','@/lib/supabaseAdmin','@/lib/supabaseClient','@/lib/pokemonPriceTracker','@/lib/email'].map(name=>[name+'$',resolve(fixtures,'data.js')]));
for(const name of ['@/lib/analytics/client','@vercel/analytics','@vercel/analytics/next','@vercel/speed-insights/next','next/script'])aliases[name+'$']=resolve(fixtures,'transports.js');
write('next.config.mjs',`${configSource}
const base=nextConfig;
import fs from 'node:fs';
export default {...base,devIndicators:false,images:{...base.images,unoptimized:true},experimental:{cpus:1,externalDir:true},webpack(config){
 config.resolve.alias={...config.resolve.alias,...${JSON.stringify(aliases)},'@':${JSON.stringify(root)}};
 config.plugins.push({apply(compiler){compiler.hooks.compilation.tap('R3ProviderIsolation',compilation=>{compilation.hooks.finishModules.tap('R3ProviderIsolation',modules=>{
 const resources=[...modules].map(m=>m.resource).filter(Boolean);
 const forbidden=resources.filter(r=>/[/\\\\]lib[/\\\\](deals|supabaseAdmin|supabaseClient|pokemonPriceTracker|email)\\.js$|posthog-js|@supabase|[/\\\\]lib[/\\\\]analytics[/\\\\]client\\.js$/.test(r));
 if(forbidden.length)throw Error('R3_PROVIDER_MODULE_FORBIDDEN:'+forbidden.join(','));
 fs.writeFileSync(${JSON.stringify(resolve(out,'module-'))}+compiler.name+'.json',JSON.stringify(resources,null,2));
 });});}});return config;}};
`);
write('manifest.json',JSON.stringify({sources,listingRendering:'dynamic',boundaries:['Fixture provider/database modules; compile-time forbidden-module assertion','Node preload denies external networking before Next/worker startup','Root Google font transform replaced with existing offline Geist CSS','Next Script / analytics transports stubbed; email disabled','Next Image component retained but optimisation disabled to prevent server image fetches','Actual approved dynamic listing route copied unchanged; card runtime params unchanged','Actual Next metadata-file loader, routes, React cache and CurrencyProvider retained'],project:out},null,2));
console.log(out);
