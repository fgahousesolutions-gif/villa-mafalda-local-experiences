// Local QA only. Synthetic identities, in-memory database, no external emails.
import http from 'node:http';
import {writeFileSync} from 'node:fs';
import {mac,unseal} from '../src/security.mjs';
import worker from '../src/worker.mjs';
import {authFixture,environment} from '../tests/runtime.mjs';
const auth=await authFixture(),env=environment(auth),jwt=await auth.jwt();env.PUBLIC_ORIGIN='http://127.0.0.1:8787';
const challengeData=(Date.now()-4000)+'.fixture';
const fixture=await worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.PUBLIC_ORIGIN,'CF-Connecting-IP':'127.0.0.1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({experience:'dinner',menuId:'traditional',people:2,name:'Ospite Conferma Fittizio',email:'fixture@example.test',phone:'',checkin:'2027-06-10',checkout:'2027-06-15',date:'2027-06-12',notes:'',lang:'it',time:'Cena',privacy:true,expectedUnit:220,challenge:challengeData+'.'+await mac(env.APP_SECRET,challengeData)})}),env,{waitUntil:p=>p.catch(()=>{})});
const fixtureId=(await fixture.json()).id;
const mail=await unseal(env.OUTBOX_KEY,(await env.DB.prepare('SELECT payload FROM outbox WHERE request_id=? AND kind=\'request\'').bind(fixtureId).first()).payload);
writeFileSync('/tmp/vm-qa-confirm.json',JSON.stringify({id:fixtureId,token:mail.text.match(/\/confirm#([a-f0-9]{64})/)[1]}),{mode:0o600});
http.createServer(async(req,res)=>{
 try{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('CF-Connecting-IP','127.0.0.1');if(req.url.startsWith('/admin')||req.url.startsWith('/api/admin/'))headers.set('Cf-Access-Jwt-Assertion',jwt);
 const request=new Request('http://127.0.0.1:8787'+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});const response=await worker.fetch(request,env,{waitUntil:p=>p.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Local QA server error')}
}).listen(8787,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:8787 — synthetic Laura identity; database resets on restart; emails never sent.'));
