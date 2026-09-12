// Generate labelled static R3 fixture HTML, never fetch application routes.
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadRoute} from '../tests/helpers/r3RouteHarness.mjs';
import {DEAL_STATE_FIXTURES} from '../lib/dev/dealStateFixtures.js';
const root=resolve(import.meta.dirname,'..');
if (!process.argv[2]) throw Error('Pass an explicit fixture output directory');
const out=resolve(process.argv[2]);
mkdirSync(out,{recursive:true});
const chunks=resolve(root,'.next/dev/static/chunks');
const cssFile=readdirSync(chunks).find(n=>n.startsWith('app_globals_css_')&&n.endsWith('.css'));
if (!cssFile) throw Error('Existing compiled CSS unavailable; do not build or fetch automatically');
let css=readFileSync(resolve(chunks,cssFile),'utf8');
for (const name of readdirSync(chunks).filter(n=>n.includes('font_google_geist')&&n.endsWith('.css'))) {
  css+='\n'+readFileSync(resolve(chunks,name),'utf8').replace(/url\(["']?([^)'" ]+)["']?\)/g,(match,url)=>{
    const file=resolve(root,'.next/dev/static/media',basename(url));
    return 'url(data:font/woff2;base64,'+readFileSync(file).toString('base64')+')';
  });
}
const records=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error('SERVER_NETWORK_FORBIDDEN');};
try {
  for (const id of ['bin_compared','bin_shipping_unknown','auction','reference_only']) {
    const source=DEAL_STATE_FIXTURES.find(f=>f.id===(id==='reference_only'?'bin_compared':id)).deal;
    const reference=id==='reference_only';
    const card={name:'Clefable',set:'Jungle',cardNumber:'1/64',tcgplayerId:'45120',refPrice:30,indexable:true,image:'https://tcgplayer-cdn.tcgplayer.com/product/45120_in_1000x1000.jpg'};
    const {route,substitutes}=loadRoute(reference?'app/cards/[slug]/page.js':'app/deals/[id]/page.js',{
      deal:{...source,is_active:true},card,renderComponents:'visual',
    });
    const markup=renderToStaticMarkup(await route.default({params:Promise.resolve({id:String(source.id),slug:'fixture-clefable'})}));
    const html='<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\nbody{font-family:Arial,sans-serif}</style></head><body><aside style="padding:8px;background:#fff3cd;color:#171514;font:12px Arial">SIMULATED R3 FIXTURE: '+id+' - static SSR; prices/links simulated; no hydration; font fallback.</aside>'+markup+'</body></html>';
    writeFileSync(resolve(out,id+'.html'),html);
    records.push({id,substitutes:[...substitutes],cssFile,cssModified:statSync(resolve(chunks,cssFile)).mtime.toISOString()});
  }
  writeFileSync(resolve(out,'manifest.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify(records));
} finally {globalThis.fetch=originalFetch;}
