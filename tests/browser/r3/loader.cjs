const swc=require('next/dist/build/swc/index.js');
module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},target:'es2020',transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};
