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
  'affiliateSurfaces','dealFilters','navLinks','socialProfiles','trustContent','time','recentCards','ebaySearch','returnContext','analytics/events','analytics/props','referenceCondition','listingImage','dealCategories','cardWorth','cardNextSteps','cardSlug','cardImage','cardLinks','marketplaceScope']);
export function loadRoute(file, {deal=null,hub=null,card=null,offers=[],analysis=null,renderComponents=false,currency={viewer:null,rates:null}}={}) {
  const calls=[];
  const components=new Map();
  const record = (name,result) => (...args) => {calls.push({name,args});return Promise.resolve(result);};
  const data = {
    cardColsReady:record('cardColsReady',true), withCard:row=>row,
    findCardHubByWatchlistId:record('findCardHubByWatchlistId',hub),
    resolveSpeciesByName:record('resolveSpeciesByName',null),
    resolveCatalogCard:record('resolveCatalogCard',card), resolveCardSlug:record('resolveCardSlug',hub),
    // audit-r1: the hub path reads the same catalogue record by id (no provider call on render)
    resolveCatalogCardById:record('resolveCatalogCardById',card),
    fetchRelatedActiveDeals:record('fetchRelatedActiveDeals',[]), fetchSetSlugs:record('fetchSetSlugs',[]),
    fetchCardOffers:record('fetchCardOffers',{deals:offers,error:null}),
    fetchCardRelations:record('fetchCardRelations',{}), fetchCardPriceHistory:record('fetchCardPriceHistory',null),
    fetchSpeciesHubs:record('fetchSpeciesHubs',{species:[]}),fetchSets:record('fetchSets',{sets:[]}),
  };
  const query={};
  for (const name of ['from','select','eq']) query[name]=(...args)=>{calls.push({name:'fixture-db.'+name,args});return query;};
  query.single=record('fixture-db.single',{data:deal});
  const realComponents = new Set(['Price','AuctionPrice','AffiliateLink','CardPriceSummary','CatalogCardView','CardWorthAnswer','SkipToContent']);
  const substitutes = new Set();
  if (renderComponents === 'visual') for (const name of ['SiteHeader','SiteFooter','Logo','NavMenu','NavDropdown','RegionControl','DealImage','CardImagePlaceholder','Breadcrumbs','CardPriceIntelligence','CardWorthAnswer','CardNextSteps','RelatedCards','VariantPriceGrid','ListingChecks','PriceHistoryChart','CardDealFilters','DealCard','FilterToggle','RecentSales','EbaySearchLink','MiniSparkline','ShareButton','SaveCardButton','DealBackLink','RelativeTime','StickyDealCta']) realComponents.add(name);
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
    if (name==='react-dom') return require(name);
    if (name==='@/components/RenderClock') return compile(resolve(root,'components/RenderClock.js'));
    if (name==='@/lib/useRegion') return compile(resolve(root,'lib/useRegion.js'));
    if (renderComponents === 'visual' && name==='next/image') {
      substitutes.add('next/image: native img; no Next image optimisation');
      return function FixtureImage({src,alt,fill,priority,quality,unoptimized,sizes,style,...props}) {
        return require('react').createElement('img',{...props,src,alt,sizes,style:fill?{position:'absolute',height:'100%',width:'100%',inset:0,...style}:style});
      };
    }
    if (name==='react') return {...require('react'),cache:fn=>fn};
    if (name==='@/components/CurrencyProvider' && renderComponents) return {useCurrency:()=>currency};
    if (name==='@/lib/analytics/client') return {capture:()=>{throw Error('HARNESS_CAPTURE_NOT_ALLOWED');}};
    if (name==='@vercel/analytics') return {track:()=>{throw Error('HARNESS_TRACK_NOT_ALLOWED');}};
    if (renderComponents && name.startsWith('@/components/') && realComponents.has(name.slice(13))) {
      if (!components.has(name)) {
        const exports=compile(resolve(root,name.slice(2)+'.js'));
        components.set(name,Object.assign(exports.default,exports));
      }
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
    if (name==='@/lib/supabaseClient') return {supabase:query};
    if (name==='@/lib/pokemonPriceTracker') return {getFullPriceAnalysis:record('fixture-price-analysis',analysis),getSealedPriceHistory:record('fixture-sealed-history',[])};
    if (name==='@/lib/email') return {emailEnabled:()=>false};
    // ppt-telemetry-r1 consumer attribution: pass-through (the fixture price analysis records nothing)
    if (name==='@/lib/pptTelemetry') return {withPptConsumer:(consumer,fn)=>fn(),setPptConsumer:()=>{}};
    if (name.startsWith('@/components/') || ['next/link','next/image'].includes(name)) {
      if (!components.has(name)) {
        substitutes.add(name);
        function FixtureChild(){return null;}
        FixtureChild.displayName=name;
        // a module's named component exports substitute the same way (swc's CJS
        // interop copies enumerable keys, so they must be real properties)
        const named={'@/components/CardMarketPanel':['CardMarketSummary']}[name]??[];
        for (const n of named) FixtureChild[n]=FixtureChild;
        components.set(name,FixtureChild);
      }
      return components.get(name);
    }
    if (name.startsWith('@/lib/') && pure.has(name.slice(6))) return require(resolve(root,name.slice(2)+'.js'));
    throw Error('Unapproved R3 harness dependency: '+name);
  }
  return {route:compile(resolve(root,file)),calls,components,substitutes};
}
export function elements(el) {
  if (!el || typeof el !== 'object') return [];
  return [el,...(Array.isArray(el.props?.children)?el.props.children.flat(Infinity):[el.props?.children]).flatMap(elements)];
}
