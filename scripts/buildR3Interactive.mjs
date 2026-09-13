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
const compiler=webpack({mode:'development',target:'web',devtool:false,entry:resolve(fixtures,'entry.jsx'),
  output:{path:out,filename:'interactive.js'},
  resolve:{extensions:['.js','.jsx','.mjs','.json'],alias:{'next/link$':resolve(fixtures,'link.jsx'),'next/image$':resolve(fixtures,'image.jsx'),'@/components/CurrencyProvider$':boundary,'@/lib/analytics/client$':boundary,'@vercel/analytics$':boundary,'@':root}},
  module:{rules:[{test:/\.[jm]?[jt]sx?$/,include:[resolve(root,'components'),resolve(root,'lib'),fixtures],use:[resolve(fixtures,'loader.cjs')]}]},
  plugins:[new webpack.NormalModuleReplacementPlugin(/supabase|pokemonPriceTracker|server-only/,resource=>{throw Error('Forbidden fixture dependency: '+resource.request);})],
});
await new Promise((ok,fail)=>compiler.run((err,stats)=>{compiler.close(()=>{});if(err||stats.hasErrors())fail(err||Error(stats.toString({all:false,errors:true})));else {
  const resources=[...stats.compilation.modules].map(m=>m.resource).filter(Boolean);
  const forbidden=resources.filter(r=>/posthog-js|components[\\/]CurrencyProvider\.js|lib[\\/]analytics[\\/]client\.js/.test(r));
  if(forbidden.length)fail(Error('Real transport dependencies: '+forbidden.join(',')));else ok();
}}));
const css=readFileSync(resolve(out,'bin_compared.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const js=readFileSync(resolve(out,'interactive.js'),'utf8').replace(/<\/script/gi,'<\\/script');
writeFileSync(resolve(out,'interactive.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+js+'</script>');
console.log('Built provider-isolated client component fixture');
