import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {loadRoute} from '../tests/helpers/r3RouteHarness.mjs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {webpack}=require('next/dist/compiled/webpack/webpack');
const root=resolve(import.meta.dirname,'..');
if(!process.argv[2])throw Error('Pass explicit output directory');
const out=resolve(process.argv[2]);
const fixtures=resolve(root,'tests/browser/r3');
const boundary=resolve(fixtures,'boundaries.js');
const compiler=webpack({mode:'development',target:'web',devtool:false,entry:resolve(fixtures,'currency.jsx'),
  output:{path:out,filename:'currency.js'},
  resolve:{extensions:['.js','.jsx','.mjs','.json'],alias:{'next/link$':resolve(fixtures,'link.jsx'),'next/image$':resolve(fixtures,'image.jsx'),'@/lib/analytics/client$':boundary,'@vercel/analytics$':boundary,'@':root}},
  module:{rules:[{test:/\.[jm]?[jt]sx?$/,include:[resolve(root,'components'),resolve(root,'lib'),fixtures],use:[resolve(fixtures,'loader.cjs')]}]},
  plugins:[new webpack.NormalModuleReplacementPlugin(/supabase|pokemonPriceTracker|server-only/,resource=>{throw Error('Forbidden fixture dependency: '+resource.request);})],
});
await new Promise((ok,fail)=>compiler.run((err,stats)=>{compiler.close(()=>{});if(err||stats.hasErrors())fail(err||Error(stats.toString({all:false,errors:true})));else {
  const resources=[...stats.compilation.modules].map(m=>m.resource).filter(Boolean);
  const forbidden=resources.filter(r=>/posthog-js|lib[\\/]analytics[\\/]client\.js/.test(r));
  if(forbidden.length)fail(Error('Real transport dependencies: '+forbidden.join(',')));else ok();
}}));
const css=readFileSync(resolve(out,'bin_compared.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const js=readFileSync(resolve(out,'currency.js'),'utf8').replace(/<\/script/gi,'<\\/script');

const prices={listing:{usd:125,native:{amount:100,currency:'GBP'}},reference:{usd:200,native:{amount:160,currency:'GBP'}},saving:{usd:75,native:{amount:60,currency:'GBP'}},unknown:{usd:null,native:{amount:100,currency:'GBP'}}};
const {components}=loadRoute('app/deals/[id]/page.js',{renderComponents:true});
const Price=components.get('@/components/Price');
const markup=Object.entries(prices).map(([id,props])=>'<p>'+id+'</p><div id="'+id+'">'+renderToString(createElement(Price,props))+'</div>').join('');
writeFileSync(resolve(out,'currency.html'),'<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><main style="padding:24px"><h1>SIMULATED currency hydration fixture</h1>'+markup+'</main><script>window.__priceFixtures='+JSON.stringify(prices)+'</script><script>'+js+'</script>');
console.log('Built isolated real-currency-store fixture; rates transport is mocked');
