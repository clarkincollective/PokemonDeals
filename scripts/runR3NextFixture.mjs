import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,unlinkSync,realpathSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const project=resolve(root,'.next/r3-runtime');
const mode=process.argv[2];
if(!['build','start'].includes(mode))throw Error('Use build or start for the isolated R3 fixture');
const manifest=JSON.parse(readFileSync(resolve(project,'manifest.json'),'utf8'));
if(manifest.project!==project)throw Error('Wrong fixture project');
// Never retain unstable_cache results from older fixture provider contracts.
if(mode==='build'){
 const cache=resolve(project,'.next/cache');
 if(existsSync(cache)){
  const actual=realpathSync(cache);
  if(actual!==cache||!actual.startsWith(realpathSync(project)+sep))throw Error('Fixture cache escaped project');
  rmSync(actual,{recursive:true,force:true});
 }
}
const env={};
for(const [key,value] of Object.entries(process.env))if(/^(path|systemroot|windir|temp|tmp|comspec|pathext|processor_architecture|number_of_processors)$/i.test(key))env[key]=value;
env.NEXT_TELEMETRY_DISABLED='1';
env.NODE_OPTIONS='--require '+JSON.stringify(resolve(root,'tests/browser/r3/runtime/networkGuard.cjs'));
const stop=resolve(project,'stop');
if(mode==='start'&&existsSync(stop))unlinkSync(stop);
const args=[resolve(root,'node_modules/next/dist/bin/next'),mode,project,...(mode==='build'?['--webpack']:['--hostname','127.0.0.1','--port','9483'])];
const child=spawn(process.execPath,args,{cwd:project,env,windowsHide:true,stdio:'inherit'});
writeFileSync(resolve(project,mode+'-process.json'),JSON.stringify({pid:child.pid,mode,project,credentialsInherited:false},null,2));
let stopped=false;
const timer=mode==='start'?setInterval(()=>{if(existsSync(stop)){stopped=true;child.kill();}},250):null;
const deadline=mode==='start'?setTimeout(()=>{stopped=true;child.kill();},600000):null;
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',(code,signal)=>{
 if(timer)clearInterval(timer);if(deadline)clearTimeout(deadline);
 writeFileSync(resolve(project,mode+'-exit.json'),JSON.stringify({code,signal,stopped},null,2));
 process.exitCode=stopped?0:code??1;
});
