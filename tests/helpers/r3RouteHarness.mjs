// Offline route controller harness. Actual route/metadata code; fixture I/O,
// identity/price helpers retained, child component rendering deliberately stubbed.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import swc from 'next/dist/build/swc/index.js';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname,'../..');
const pure = new Set(['dealPage','listingAvailability','indexability','dealQuality','publicText',
  'cardName','pokemonSpecies','slugify','tcgplayer','ebayLinks','money','offerPresentation',
  'analytics/events','analytics/props','referenceCondition','listingImage','dealCategories','cardWorth','cardNextSteps','cardSlug','cardImage','cardLinks']);
export function loadRoute(file, {deal=null,hub=null,card=null,offers=[],analysis=null,renderComponents=false}={}) {
  const calls=[];
  const components=new Map();
  const record = (name,result) => (...args) => {calls.push({name,args});return Promise.resolve(result);};
  const data = {
    cardColsReady:record('cardColsReady',true), withCard:row=>row,
    findCardHubByWatchlistId:record('findCardHubByWatchlistId',hub),
    resolveSpeciesByName:record('resolveSpeciesByName',null),
    resolveCatalogCard:record('resolveCatalogCard',card), resolveCardSlug:record('resolveCardSlug',hub),
    fetchRelatedActiveDeals:record('fetchRelatedActiveDeals',[]), fetchSetSlugs:record('fetchSetSlugs',[]),
    fetchCardOffers:record('fetchCardOffers',{deals:offers,error:null}),
    fetchCardRelations:record('fetchCardRelations',{}), fetchCardPriceHistory:record('fetchCardPriceHistory',null),
    fetchSpeciesHubs:record('fetchSpeciesHubs',{species:[]}),fetchSets:record('fetchSets',{sets:[]}),
  };
  const query={};
  for (const name of ['from','select','eq']) query[name]=(...args)=>{calls.push({name:'fixture-db.'+name,args});return query;};
  query.single=record('fixture-db.single',{data:deal});
  const realComponents = new Set(['Price','AuctionPrice','AffiliateLink','CardPriceSummary','CatalogCardView']);
  function compile(filename) {
    const {code}=swc.transformSync(readFileSync(filename,'utf8'),{
      filename,jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},
      module:{type:'commonjs'},
    });
    const compiled={exports:{}};
    new Function('require','module','exports',code)(dependency,compiled,compiled.exports);
    return compiled.exports;
  }
  function dependency(name) {
    if (name==='react') return {...require('react'),cache:fn=>fn};
    if (name==='@/components/CurrencyProvider' && renderComponents) return {useCurrency:()=>({viewer:null,rates:null})};
    if (name==='@/lib/analytics/client') return {capture:()=>{throw Error('HARNESS_CAPTURE_NOT_ALLOWED');}};
    if (name==='@vercel/analytics') return {track:()=>{throw Error('HARNESS_TRACK_NOT_ALLOWED');}};
    if (renderComponents && name.startsWith('@/components/') && realComponents.has(name.slice(13))) {
      if (!components.has(name)) components.set(name,compile(resolve(root,name.slice(2)+'.js')).default);
      return components.get(name);
    }
    if (renderComponents && name==='next/link') return function FixtureLink({children,href,...props}) {
      return require('react').createElement('a',{href,...props},children);
    };
    if (name==='react/jsx-runtime') return require(name);
    if (name==='next/cache') return {unstable_cache:fn=>fn};
    if (name==='next/navigation') return {
      notFound:()=>{throw Error('FIXTURE_NOT_FOUND');},
      permanentRedirect:href=>{throw Error('FIXTURE_REDIRECT:'+href);},
    };
    if (name==='@/lib/deals') return data;
    if (name==='@/lib/supabaseAdmin') return {supabaseAdmin:()=>query};
    if (name==='@/lib/pokemonPriceTracker') return {getFullPriceAnalysis:record('fixture-price-analysis',analysis)};
    if (name==='@/lib/email') return {emailEnabled:()=>false};
    if (name.startsWith('@/components/') || ['next/link','next/image'].includes(name)) {
      if (!components.has(name)) {
        function FixtureChild(){return null;}
        FixtureChild.displayName=name;
        components.set(name,FixtureChild);
      }
      return components.get(name);
    }
    if (name.startsWith('@/lib/') && pure.has(name.slice(6))) return require(resolve(root,name.slice(2)+'.js'));
    throw Error('Unapproved R3 harness dependency: '+name);
  }
  return {route:compile(resolve(root,file)),calls,components};
}
export function elements(el) {
  if (!el || typeof el !== 'object') return [];
  return [el,...(Array.isArray(el.props?.children)?el.props.children.flat(Infinity):[el.props?.children]).flatMap(elements)];
}
