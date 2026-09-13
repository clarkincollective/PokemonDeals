// Test-only provider boundary. No production data modules or network access.
import {DEAL_STATE_FIXTURES} from '@/lib/dev/dealStateFixtures';
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
export const fetchSetSlugs = async () => [];
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
