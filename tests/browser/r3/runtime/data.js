// Test-only provider boundary. No production data modules or network access.
import {DEAL_STATE_FIXTURES} from '@/lib/dev/dealStateFixtures';
import setRows from './set-rows.json';
import savedCatalogue from './saved-catalogue.json';
import {slugifySet} from '@/lib/slugify';
export {slugifySet};
import {catalogCardSlug} from '@/lib/cardSlug';
import {setPriceSnapshot,setSpeciesList} from '@/lib/setSummary';
import {sealedFixtures} from './sealedFixtures';
const from = id => ({...DEAL_STATE_FIXTURES.find(f => f.id === id).deal,is_active:true});
export const listingRows = [from('bin_compared'),from('auction'),from('graded'),from('bin_plain'),from('non_usd'),
  {...from('bin_compared'),id:900020,price:null,total_price:null,total_price_usd:null},
  {...from('bin_compared'),id:900021,visual_authenticity_status:'IDENTITY_MISMATCH'},
  {...from('bin_compared'),id:900022,is_active:false,watchlist_id:'fixture-watchlist'}];
const card = {name:'Clefable',set:'Jungle',cardNumber:'1/64',rarity:'Holo Rare',tcgplayerId:'45120',refPrice:38.26,refCondition:'Near Mint',indexable:true,image:'https://tcgplayer-cdn.tcgplayer.com/product/45120_in_1000x1000.jpg'};
export const cardSlugs = ['fixture-hub','fixture-reference','fixture-no-reference'];
export function supabaseAdmin() {
  let id,selectedTable;
  const query = {from(table){if(!['deals','sealed_deals'].includes(table))throw Error('UNEXPECTED_FIXTURE_TABLE');selectedTable=table;return query;},select(){return query;},eq(key,value){if(key!=='id')throw Error('UNEXPECTED_FIXTURE_QUERY');id=value;return query;},async single(){const rows=selectedTable==='sealed_deals'?sealedFixtures.map(f=>f.deal):listingRows;return {data:rows.find(d=>String(d.id)===String(id))??null};}};
  return query;
}
export const supabase={from:table=>supabaseAdmin().from(table)};
export const getSealedPriceHistory=async()=>[];
export const cardColsReady = async () => true;
export const withCard = row => row;
export const resolveCardSlug = async slug => slug==='fixture-hub'?{...card,id:'fixture-hub',slug}:null;
export const resolveCatalogCard = async slug => ['fixture-reference','fixture-no-reference','clefable-jungle'].includes(slug)?{...card,slug,...(slug==='fixture-no-reference'?{tcgplayerId:null,refPrice:null,indexable:false}:{})}:null;
export const findCardHubByWatchlistId = async () => ({...card,id:'fixture-hub',slug:'fixture-hub'});
export const resolveSpeciesByName = async () => null;
export const fetchSetSlugs = async () => [...new Set(['jungle','neo-destiny','boundaries-crossed',...savedCatalogue.Dragonite.map(c=>slugifySet(c.set))])];
// Was an empty stub - RelatedDeals early-returns null on an empty array, so
// its grid (and the layout defect it once had) was unreachable through this
// fixture harness. Reuses the existing DEAL_STATE_FIXTURES variety: a long
// wrapping identity, unconfirmed-shipping BIN, unconfirmed-shipping auction,
// and a non-USD listing (GB) alongside the AUD-viewer default this fixture
// already sets in app/api/rates/route.js.
export const fetchRelatedActiveDeals = async () => [
  from('long_name'), from('bin_shipping_unconfirmed'), from('auction_shipping_unconfirmed'), from('non_usd'),
];
export const fetchCardOffers = async id => {if(id!=='fixture-hub')throw Error('UNEXPECTED_FIXTURE_CARD');return {deals:[listingRows[0]],error:null};};
export const fetchCardRelations = async () => ({sameSpecies:[],sameSet:[]});
export const fetchCardPriceHistory = async () => null;
export const fetchSpeciesHubs = async () => ({species:[{name:'Dragonite',slug:'dragonite',count:3}]});
export const fetchSets = async () => ({sets:[{set:'Jungle',slug:'jungle',count:3}]});
export const fetchDealsPage = async (options={}) => ({deals:familyDeals(options),totalPages:1,error:null});
export const fetchCardDealsPage = async (options={}) => ({deals:familyDeals(options),totalPages:1,error:null});
export const fetchHubCounts = async () => ({});
export const getFullPriceAnalysis = async id => String(id)==='45120'?{cardNumber:'1/64',raw:{currentPrice:38.26,referenceCondition:'Near Mint',history:[]},graded:[],conditionBreakdown:[],primaryRecentSales:[],rawRecentSales:[],priceUpdatedAt:'2026-09-01'}:null;
export const emailEnabled = () => false;

// R4: historical saved RSC cards for Jungle/Neo Destiny/Dragonite, without
// live offers. Boundaries Crossed uses 17C.12 identities plus simulated
// references and numbered URLs. These are offline fixtures, not live prices.
const setNames={'jungle':'Jungle','neo-destiny':'Neo Destiny','boundaries-crossed':'Boundaries Crossed'};
const fixtureCards = set => savedCatalogue[set]?.length?savedCatalogue[set]:(setRows[Object.keys(setNames).find(k=>setNames[k]===set)]??[]).map((r,i)=>({
 tcgplayerId:r.key,name:r.name,set,cardNumber:r.number,rarity:r.rarity,
 catalogSlug:catalogCardSlug(`${r.name} ${r.number}`,set),image:`https://tcgplayer-cdn.tcgplayer.com/product/${r.key}_in_1000x1000.jpg`,
 refPrice:i%9===8?null:10+i/2,refCondition:i%3===0?'Near Mint':null,deal:null
}));
export const SET_CATALOG_MIN_CARDS=4;
export const SET_SEALED_MIN_PRODUCTS=3;
export const resolveSetSlug=async slug=>setNames[slug]?{set:setNames[slug],catalogue:slug!=='jungle'}:null;
export const fetchSetDealsPage=async()=>({deals:[listingRows[0]],totalPages:1,error:null});
export const fetchSetSealedCatalog=async()=>({products:[],totalProducts:0,truncated:false});
export const fetchSetCatalog=async set=>{const cards=fixtureCards(set);const priceSnapshot=setPriceSnapshot(cards);return {cards,indexCards:cards,totalCards:cards.length,truncated:false,stats:priceSnapshot,priceSnapshot,speciesList:setSpeciesList(cards),topValueCards:cards.filter(c=>c.refPrice).slice(0,12)};};
const dragoniteCards=savedCatalogue.Dragonite;
export const resolveSpeciesSlug=async slug=>slug==='dragonite'?{name:'Dragonite',image:null}:null;
export const fetchSpeciesCatalog=async name=>({cards:name==='Dragonite'?dragoniteCards:fixtureCards('Jungle').slice(0,4).map(c=>({...c,name})),stats:{cardCount:name==='Dragonite'?dragoniteCards.length:4,setCount:2,minPrice:20,maxPrice:90},indexable:true});
// Owner hierarchy feedback: reuse the existing, explicitly simulated Light
// Dragonite offer to exercise a populated species page as well as Cleffa's
// no-offer catalogue path. No live inventory or eligibility proof is implied.
export const fetchSpeciesDealsPage=async({speciesName}={})=>({deals:speciesName==='Dragonite'?[listingRows[4]]:[],totalPages:1,error:null});
export const fetchSpeciesDealStats=async name=>({dealCards:name==='Dragonite'?1:0});
export const fetchSpeciesPrints=async()=>({prints:[]});
export const fetchCardHubs=async()=>({cards:[],hubs:[]});

// R5 family fixtures: historical card identities plus explicitly simulated
// aggregates/offers. No current production-market accuracy is implied.
export const fetchCatalogSets=async()=>({sets:Object.entries(setNames).map(([slug,set])=>({slug,set}))});
export const fetchCardDirectorySummary=async()=>({totalCards:330,pricedCards:300,setCount:3,error:null});
export const fetchTopCatalogCards=async({limit=24}={})=>({cards:savedCatalogue.Jungle.slice(0,limit).map(c=>({...c,slug:c.catalogSlug,displayName:c.name,species:c.name}))});
export const fetchCatalogSpecies=async()=>({species:[{species:'Dragonite',slug:'dragonite',count:75},{species:'Cleffa',slug:'cleffa',count:4}]});
export const fetchLastScanTime=async()=> '2026-09-10T12:00:00Z';
// Actual search wrapper/API/client, deterministic boundary only. No real search
// resolution, eligibility, provider fallback or live prices are claimed here.
export async function runCardSearch({q='',page=1,filters={}}={}){
 const empty=q.toLowerCase()==='missing',reference=q.toLowerCase()==='reference';
 const rows=empty?[]:[{tcgplayerId:'45120',name:'Clefable',displayName:'Clefable',set:'Jungle',cardNumber:'1/64',rarity:'Holo Rare',imageUrl:'https://tcgplayer-cdn.tcgplayer.com/product/45120_in_1000x1000.jpg',marketPrice:38.26,cardHref:'/cards/fixture-hub'}];
 const dealRows=empty||reference||(filters.maxPrice!=null&&Number(filters.maxPrice)<30.75)?[]:[listingRows[0]];
 return {ok:true,body:{deals:dealRows,catalog:{results:rows,total:rows.length,page,hasMore:false},interpreted:null,exact:null,resolution:{mode:'catalogue',effective_filters:filters,deals_scoped:true,filter_notes:[],recognized_not_applied:[]}}};
}
export const getRawPrice=()=>{throw Error('UNEXPECTED_FIXTURE_CARD_DETAIL_PROVIDER');};
export const getRawPriceHistory=()=>{throw Error('UNEXPECTED_FIXTURE_CARD_DETAIL_PROVIDER');};
const japaneseRow={...listingRows[0],id:920001,watchlist_id:'japanese-control',title:'Pikachu 025/165 Japanese Pokemon Card 151 Near Mint',card_name:'Pikachu',card_set:'Pokemon Card 151',card_language:'japanese',card_tcgplayer_id:null,image_verdict:'NO_TRUSTED_IMAGE',image_url:null,display_image_url:null,watchlist:{name:'Pikachu',set:'Pokemon Card 151',language:'japanese',justtcg_tcgplayer_id:null}};
function familyDeals(options){
 if(options.sets&&!options.sets.includes('Jungle'))return []; // Sparse modern releases; retain the vintage category's Jungle control.
 const row=options.language==='japanese'?japaneseRow:options.cardType==='graded'?listingRows[2]:options.listingType==='AUCTION'?listingRows[1]:listingRows[0];
 if(options.maxPrice!=null&&(!Number.isFinite(row.total_price_usd)||row.total_price_usd>options.maxPrice))return [];
 return [row];
}
export const fetchDealsPool=async(options={})=>({data:familyDeals(options),error:null});
export const fetchHomepageLanes=async()=>({pools:{flagship:[listingRows[0],listingRows[2],listingRows[4],from('long_name')],grid:[listingRows[1],listingRows[3]],auctions:[],justAdded:[],underPrice:[]},error:null});
export const fetchBestFinds=async(options={})=>({deals:options.maxPrice===1?[]:[options.graded?listingRows[2]:listingRows[0]],error:null});
export const fetchSealedDealsPool=async()=>({data:[sealedFixtures[0].deal],error:null});
export const fetchSealedCatalog=async()=>({groups:[{set:'Celebrations',slug:'celebrations',dealCount:0,products:[
 {name:'Celebrations Elite Trainer Box',set:'Celebrations',tcgplayerId:'242811',image:sealedFixtures[0].deal.image_url,productType:'Elite Trainer Box',refPrice:100,refCondition:null,deal:null},
 {name:'Celebrations Booster Pack',set:'Celebrations',productType:'Booster Pack',refPrice:null,deal:null,image:null},
]}],productCount:2,dealCount:0,error:null});
export const fetchMarketDataSummary=async()=>({activeDeals:8,activeSealed:1,cardsWithMultipleSellers:2,activeSets:3});
export const fetchMostListedCards=async()=>({cards:savedCatalogue.Jungle.slice(0,4).map((c,i)=>({...c,id:c.tcgplayerId,slug:c.catalogSlug,count:8-i})),snapshotAt:'2026-09-10T12:00:00Z'});
export const fetchCatalogComposition=async()=>({pricedCards:100,setCount:3,speciesCount:20,medianReference:3.50,snapshotAt:'2026-09-10T12:00:00Z',error:null,bands:[
 {key:'under5',label:'Under $5',count:60,pct:60},{key:'5to25',label:'$5 to $25',count:20,pct:20},{key:'25to100',label:'$25 to $100',count:15,pct:15},{key:'over100',label:'$100 or more',count:5,pct:5},
]});
