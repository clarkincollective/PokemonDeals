import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import swc from 'next/dist/build/swc/index.js';
const require=createRequire(import.meta.url);
const {NextRequest}=require('next/server');
// Installed 16.3.3 exports the older helper name despite its proxy docs.
const {unstable_doesMiddlewareMatch:doesProxyMatch}=require('next/experimental/testing/server');
const file=new URL('../../proxy.js',import.meta.url);
const {code}=swc.transformSync(readFileSync(file,'utf8'),{filename:file.pathname,jsc:{parser:{syntax:'ecmascript'},target:'es2022'},module:{type:'commonjs'}});
const mod={exports:{}};new Function('require','module','exports',code)(require,mod,mod.exports);
const {proxy,config}=mod.exports;
for(const [path,destination] of [
 ['/pokemon/DrAgOnItE','/pokemon/dragonite'],
 ['/pokemon/%44ragonite?country=EBAY_CA','/pokemon/dragonite'],
 ['/pokemon/NOT-A-SPECIES','/pokemon/not-a-species'],
])test('case canonicalisation '+path,()=>{
 const response=proxy(new NextRequest('https://fixture.invalid'+path));
 assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://fixture.invalid'+destination);
});
for(const path of ['/pokemon/dragonite','/pokemon/cleffa','/pokemon/%ZZ','/cards/DRAGONITE','/pokemon/dragonite/extra'])test('pass through '+path,()=>{
 const response=proxy(new NextRequest('https://fixture.invalid'+path));
 assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('x-middleware-next'),'1');
});
test('proxy matcher excludes other route families and assets',()=>{
 for(const url of ['/','/pokemon','/cards/dragonite','/api/deals-page','/_next/static/a.js','/icon.svg'])assert.equal(doesProxyMatch({config,nextConfig:{},url}),false,url);
 assert.equal(doesProxyMatch({config,nextConfig:{},url:'/pokemon/DrAgOnItE'}),true);
});
