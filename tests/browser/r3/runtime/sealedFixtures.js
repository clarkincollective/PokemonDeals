// Offline sealed-product states; same real product identity, simulated offers.
const base={id:910001,is_active:true,title:'Pokemon TCG 25th Anniversary Celebrations Elite Trainer Box (2021) Factory Sealed',sealed_watchlist_id:76,
 sealed_watchlist:{name:'Celebrations Elite Trainer Box',set:'Celebrations',tcgplayer_id:'242811'},
 image_url:'https://tcgplayer-cdn.tcgplayer.com/product/242811_in_1000x1000.jpg',
 listing_id:'fixture-910001',listing_url:'https://www.ebay.com/itm/910001',affiliate_url:'https://www.ebay.com/itm/910001',
 marketplace:'EBAY_US',currency:'USD',listing_type:'FIXED_PRICE',price:45,shipping:5,total_price:50,total_price_usd:50,
 market_price:100,discount_pct:0.5,seller_feedback_pct:99.8,first_seen_at:'2026-09-13T01:00:00Z',last_seen_at:'2026-09-13T02:00:00Z'};
export const sealedFixtures=[
 ['compared',{}],['native_no_usd',{currency:'CAD',marketplace:'EBAY_CA',price:70,total_price:75,total_price_usd:null}],
 ['shipping_unconfirmed',{shipping:0,price:50}],['shipping_unknown',{shipping:null}],
 ['auction',{listing_type:'AUCTION',auction_end_at:'2030-01-01T00:00:00Z'}],
 ['unpriced',{price:null,total_price:null,total_price_usd:null,market_price:null}],
 ['unavailable',{is_active:false}],
 ['market_unavailable',{market_price:null}],
].map(([state,overrides],i)=>({state,deal:{...base,...overrides,id:910001+i,listing_id:`fixture-${910001+i}`,listing_url:`https://www.ebay.com/itm/000000${910001+i}`,affiliate_url:`https://www.ebay.com/itm/000000${910001+i}`}}));
