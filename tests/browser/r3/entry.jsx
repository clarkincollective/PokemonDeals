import {createRoot} from 'react-dom/client';
import CardDealFilters from '@/components/CardDealFilters';
import SaveCardButton from '@/components/SaveCardButton';
import StickyDealCta from '@/components/StickyDealCta';
import NavMenu from '@/components/NavMenu';
import {DEAL_STATE_FIXTURES} from '@/lib/dev/dealStateFixtures';
const raw=DEAL_STATE_FIXTURES.find(f=>f.id==='bin_compared').deal;
const graded=DEAL_STATE_FIXTURES.find(f=>f.id==='graded').deal;
window.__captures=[];window.__vercel=[];window.__requests=[];
window.fetch=async(input)=>{
  const url=new URL(String(input),location.href);
  if(url.origin!==location.origin||url.pathname!=='/api/deals-page')throw Error('FORBIDDEN_FIXTURE_REQUEST:'+url);
  window.__requests.push(url.search);
  const deals=url.searchParams.get('type')==='graded'?[graded]:[raw,graded];
  return {ok:true,json:async()=>({deals,error:null})};
};
const root=createRoot(document.getElementById('root'));
window.__renderSticky=(sticky={})=>root.render(<>
  <header style={{display:'flex',justifyContent:'space-between',padding:16}}><strong>R3 INTERACTIVE FIXTURE - simulated offers</strong><NavMenu/></header>
  <main style={{maxWidth:1000,margin:'auto',padding:16}}>
    <div id="save-fixture"><SaveCardButton card={{slug:'fixture-clefable',name:'Clefable',set:'Jungle',price:30,currency:'USD'}}/></div>
    <CardDealFilters slug="fixture-clefable" initial={[raw,graded]} totalActive={2}/>
    <div style={{height:1000}}>Fixture scroll space</div>
  </main>
  <footer id="fixture-footer">Fixture final footer link</footer>
  <div className="h-32 lg:hidden" aria-hidden="true"/>
  <StickyDealCta href="https://www.ebay.com/itm/000000000001?customid=deal_page" priceUsd={30} priceNative={{amount:30,currency:'USD'}} priceLabel="Listing price" priceNote="Shipping not confirmed" {...sticky}/>
</>);
window.__renderSticky();
