// Preloaded in Next and its worker processes before any application module.
// Only local framework traffic is allowed. Provider modules are separately
// excluded at compilation; this guard also catches accidental new I/O paths.
const http=require('node:http'),https=require('node:https'),net=require('node:net');
function allowed(host){return ['localhost','127.0.0.1','::1','[::1]'].includes(host);}
function assertTarget(value){
  let host;
  if(typeof value==='string'||value instanceof URL)host=new URL(value).hostname;
  else host=value?.hostname??value?.host??'localhost';
  if(!allowed(host))throw Error('R3_NETWORK_FORBIDDEN:'+host);
}
const fetch=globalThis.fetch;
globalThis.fetch=(input,...args)=>{assertTarget(typeof input==='object'&&input.url?input.url:input);return fetch(input,...args);};
for(const mod of [http,https])for(const method of ['request','get']){
  const original=mod[method];mod[method]=function(...args){assertTarget(args[0]);return original.apply(this,args);};
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
  const first=Array.isArray(args[0])?args[0][0]:args[0];
  const options=typeof first==='object'?first:null;
  const pipe=options?.path??(typeof first==='string'&&!/^\d+$/.test(first)?first:null);
  if(pipe){if(!String(pipe).startsWith('\\\\.\\pipe\\'))throw Error('R3_NETWORK_FORBIDDEN:socket-path');}
  else assertTarget({hostname:options?.host??(typeof args[1]==='string'?args[1]:'localhost')});
  return connect.apply(this,args);
};
// Verify denial occurs synchronously, without touching the network.
for(const probe of [()=>globalThis.fetch('https://provider.invalid'),()=>https.get('https://provider.invalid')]){
  try{probe();throw Error('R3_GUARD_CONTROL_FAILED');}catch(error){if(!error.message.startsWith('R3_NETWORK_FORBIDDEN:'))throw error;}
}
