// Execute the real guest script against a minimal DOM fixture. No browser or network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {environment} from './runtime.mjs';
import worker from '../src/worker.mjs';
function fixture(config){
 const nodes=new Map(),calls=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{value:id==='guest-people'?'2':'',textContent:'',innerHTML:'',hidden:true,disabled:false,options:[{},{},{}],classList:{add(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector:s=>node(id+s),querySelectorAll:()=>[],scrollIntoView(){}});return nodes.get(id)}
 const context=vm.createContext({Intl,Date,Number,String,Math,Array,Object,JSON,Promise,Uint8Array,TextEncoder,crypto,console,setInterval(){},window:{addEventListener(){}},document:{hidden:false,documentElement:{},body:{classList:{toggle(){}}},getElementById:node,querySelector:node,querySelectorAll:()=>[],addEventListener(){}},fetch:async path=>{calls.push(path);if(path==='/api/config')return Response.json(config);throw Error('Challenge must not be requested for disabled requests')}});
 const script=readFileSync(new URL('../public/guest.js',import.meta.url),'utf8').replace("setLanguage('it');load();","setLanguage('it');");
 vm.runInContext(script,context);return {context,node,calls,run:code=>vm.runInContext(code,context)};
}
test('Guest TEST: menu e cinque lingue disponibili anche senza challenge o segreti',async()=>{
 const env=environment({issuer:'https://fixture.test'});env.PRIVACY_READY='false';delete env.APP_SECRET;
 const config=await (await worker.fetch(new Request('http://localhost/api/config'),env,{})).json();
 const f=fixture(config);await f.run('load()');assert.deepEqual(f.calls,['/api/config']);
 for(const lang of ['it','en','de','fr','es']){
  f.run(`setLanguage('${lang}')`);assert.equal(f.node('guest-submit').disabled,true);
  assert.ok(f.node('date-alert').textContent.length>30);assert.notEqual(f.node('date-alert').textContent,f.run("text('error')"));
  assert.equal((f.node('menu-list').innerHTML.match(/class="course-block"/g)||[]).length,14);
  assert.ok(f.node('menu-list').innerHTML.includes('Summer Modena Experience'));
 }
});
test('Guest: menu estivo consultabile, invio bloccato senza finestra e fuori intervallo',()=>{
 const f=fixture({});f.run("ready=true;state={requestsEnabled:true,menus:[],blocks:[],summerWindow:null};chosenMenu='summer';renderGuestSummary()");
 assert.equal(f.node('guest-submit').disabled,true);assert.match(f.node('date-alert').textContent,/Laura/);
 f.run("state.summerWindow={start:'2027-06-12',end:'2027-06-13'}");
 for(const [date,disabled] of [['2027-06-11',true],['2027-06-12',false],['2027-06-13',false],['2027-06-14',true]]){f.node('guest-day').value=date;f.run('renderGuestSummary()');assert.equal(f.node('guest-submit').disabled,disabled,date)}
});
