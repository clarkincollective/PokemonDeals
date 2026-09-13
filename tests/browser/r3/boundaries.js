export function useCurrency(){return {viewer:null,rates:null};}
export function capture(event,props){window.__captures.push({event,props});}
export function track(event,props){window.__vercel.push({event,props});}
