import {hydrateRoot} from 'react-dom/client';
import Price from '@/components/Price';
window.__ratesRequests=[];
window.__hydrationErrors=[];
window.fetch=(input)=>{
 if(String(input)!=='/api/rates')return Promise.reject(Error('FORBIDDEN_FIXTURE_REQUEST:'+input));
 window.__ratesRequests.push(String(input));
 return new Promise((resolve,reject)=>{
  window.__resolveRates=()=>resolve({ok:true,json:async()=>({viewer:'AUD',marketplace:'EBAY_AU',geo_country:'AU',rates:{USD:1,AUD:1.5,GBP:0.8}})});
  window.__rejectRates=()=>reject(Error('Simulated rates failure'));
 });
};
for(const [id,props] of Object.entries(window.__priceFixtures)){
 hydrateRoot(document.getElementById(id),<Price {...props}/>,{onRecoverableError:error=>window.__hydrationErrors.push(error.message)});
}
