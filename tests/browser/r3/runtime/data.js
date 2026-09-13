// Test-only provider boundary. No production data modules or network access.
import {DEAL_STATE_FIXTURES} from '@/lib/dev/dealStateFixtures';
import setRows from './set-rows.json';
import savedCatalogue from './saved-catalogue.json';
import {slugifySet} from '@/lib/slugify';
import {catalogCardSlug} from '@/lib/cardSlug';
import {setPriceSnapshot,setSpeciesList} from '@/lib/setSummary';
const from = id => ({...DEAL_STATE_FIXTURES.find(f => f.id === id).deal,is_active:true});
export const listingRows = [from('bin_compared'),from('auction'),from('graded'),from('bin_plain'),from('non_usd'),
  {...from('bin_compared'),id:900020,price:null,total_price:null,total_price_usd:null},
  {...from('bin_compared'),id:900021,visual_authenticity_status:'IDENTITY_MISMATCH'},
  {...from('bin_compared'),id:900022,is_active:false,watchlist_id:'fixture-watchlist'}];
const card = {name:'Clefable',set:'Jungle',cardNumber:'1/64',rarity:'Holo Rare',tcgplayerId:'45120',refPrice:38.26,refCondition:'Near Mint',indexable:true,image:'https://tcgplayer-cdn.tcgplayer.com/product/45120_in_1000x1000.jpg'};
export const cardSlugs = ['fixture-hub','fixture-reference','fixture-no-reference'];
export function supabaseAdmin() {
  let id;
  const query = {from(table){if(table!=='deals')throw Error('UNEXPECTED_FIXTURE_TABLE');return query;},select(){return query;},eq(key,value){if(key!=='id')throw Error('UNEXPECTED_FIXTURE_QUERY');id=value;return query;},async single(){return {data:listingRows.find(d=>String(d.id)===String(id))??null};}};
  return query;
}
export const cardColsReady = async () => true;
export const withCard = row => row;
export const resolveCardSlug = async slug => slug==='fixture-hub'?{...card,id:'fixture-hub',slug}:null;
export const resolveCatalogCard = async slug => ['fixture-reference','fixture-no-reference','clefable-jungle'].includes(slug)?{...card,slug,...(slug==='fixture-no-reference'?{tcgplayerId:null,refPrice:null,indexable:false}:{})}:null;
export const findCardHubByWatchlistId = async () => ({...card,id:'fixture-hub',slug:'fixture-hub'});
export const resolveSpeciesByName = async () => null;
export const fetchSetSlugs = async () => [...new Set(['jungle','neo-destiny','boundaries-crossed',...savedCatalogue.Dragonite.map(c=>slugifySet(c.set))])];
export const fetchRelatedActiveDeals = async () => [];
export const fetchCardOffers = async id => {if(id!=='fixture-hub')throw Error('UNEXPECTED_FIXTURE_CARD');return {deals:[listingRows[0]],error:null};};
export const fetchCardRelations = async () => ({sameSpecies:[],sameSet:[]});
export const fetchCardPriceHistory = async () => null;
export const fetchSpeciesHubs = async () => ({species:[]});
export const fetchSets = async () => ({sets:[]});
export const fetchDealsPage = async () => ({deals:[listingRows[0]],totalPages:1,error:null});
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
export const fetchSpeciesDealsPage=async()=>({deals:[],totalPages:1,error:null});
export const fetchSpeciesDealStats=async()=>({dealCards:0});
export const fetchSpeciesPrints=async()=>({prints:[]});
export const fetchCardHubs=async()=>({cards:[]});
