import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {authFixture,environment} from './runtime.mjs';
import {mac,unseal,hash,seal} from '../src/security.mjs';
import {deliver} from '../src/mail.mjs';
import {date,report,fee} from '../src/domain.mjs';
let auth,jwt;
before(async()=>{auth=await authFixture();jwt=await auth.jwt()});after(()=>auth.restore());
const valid=()=>({experience:'dinner',menuId:'traditional',people:6,name:'Ospite Fittizio',email:'guest@example.test',phone:'',checkin:'2027-06-10',checkout:'2027-06-15',date:'2027-06-12',notes:'Orario da concordare',lang:'it',time:'Cena',privacy:true,expectedUnit:220,website:''});
async function challenge(env,age=4000){const s=(Date.now()-age)+'.nonce';return s+'.'+await mac(env.APP_SECRET,s)}
async function call(env,path,method='GET',b,headers={}){return worker.fetch(new Request('http://localhost'+path,{method,headers:{Origin:'http://localhost','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:b?JSON.stringify(b):undefined}),env,{waitUntil:p=>p.catch(()=>{})})}
const admin=(env,path,method='GET',b)=>call(env,'/api/admin/'+path,method,b,{'Cf-Access-Jwt-Assertion':jwt});
async function create(env,overrides={},key=crypto.randomUUID()){
 const b={...valid(),challenge:await challenge(env),...overrides};const response=await call(env,'/api/requests','POST',b,{'Idempotency-Key':key});const result=await response.json();return {response,result,b,key};
}
async function tokenFor(env,id){const row=await env.DB.prepare('SELECT payload FROM outbox WHERE request_id=? ORDER BY rowid LIMIT 1').bind(id).first();const mail=await unseal(env.OUTBOX_KEY,row.payload);return {token:mail.text.match(/\/confirm#([a-f0-9]{64})/)[1],mail}}
async function confirmRow(env,id,amount=1200){const {token}=await tokenFor(env,id);const res=await call(env,'/api/confirm','POST',{version:1,status:'confirmed',final:amount,message:'Ci vediamo alle 20.'},{Authorization:'Bearer '+token});assert.equal(res.status,200,await res.text())}
async function complete(env,id){const res=await admin(env,'requests/'+id,'PATCH',{version:2,status:'completed',final:1200,message:'',reason:'Cena svolta e pagamento verificato'});assert.equal(res.status,200,await res.text())}
test('V3: portate e traduzioni copiate fedelmente, prezzi e menu stagionale',async()=>{const env=environment(auth),r=await (await call(env,'/api/config')).json();const menus=JSON.parse(readFileSync(new URL('./menus.json',import.meta.url)));for(const [i,m] of menus.entries())for(const k of Object.keys(m))assert.deepEqual(r.menus[i][k],m[k]);assert.equal(r.menus.length,3);assert.equal(r.menus.find(m=>m.id==='summer').seasonal,true);assert.equal(r.pastaPrice,200);for(const m of menus){assert.equal(m.price,220);for(const c of m.courses)for(const l of ['en','de','fr','es'])assert.ok(c[l+'Items'].length)}});
test('Registrazione privata, importo server, ricevute cifrate, link non esposto',async()=>{const env=environment(auth),{response,result}=await create(env);assert.equal(response.status,201);assert.equal(result.initial,132000);assert.ok(result.id.startsWith('VM-SIM-'));assert.equal(result.token,undefined);const row=await env.DB.prepare('SELECT * FROM requests').first();assert.equal(row.initial,132000);assert.equal(row.status,'requested');assert.equal((await env.DB.prepare('SELECT count(*) n FROM outbox').first()).n,2);const {mail,token}=await tokenFor(env,result.id);assert.ok(mail.html.includes('CONFERMA RICHIESTA'));assert.equal(row.token_hash,await hash(token));const raw=(await env.DB.prepare('SELECT payload FROM outbox LIMIT 1').first()).payload;assert.ok(!raw.includes('example.test'));assert.ok(!raw.includes(token));assert.ok(!mail.text.includes('commission'));});
test('Validazione date, partecipanti, privacy, email, menu, prezzo e antispam',async()=>{for(const overrides of [{people:0},{people:1.2},{people:21},{experience:'pasta',people:7,expectedUnit:200},{date:'2027-06-15'},{date:'2027-06-09'},{checkout:'2027-06-10'},{date:'2027-02-30'},{privacy:false},{email:'bad'},{menuId:'unknown'},{expectedUnit:1},{website:'spam'},{challenge:'bad'}]){const env=environment(auth),{response,result}=await create(env,overrides);assert.ok(response.status>=400,JSON.stringify({overrides,result}));assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,0)}});
test('Idempotenza: replay, retry concorrenti, payload diverso e rollback outbox',async()=>{const env=environment(auth),x=await create(env);const again=await call(env,'/api/requests','POST',x.b,{'Idempotency-Key':x.key});assert.equal(again.status,200);assert.equal((await again.json()).id,x.result.id);const changed=await call(env,'/api/requests','POST',{...x.b,people:3},{'Idempotency-Key':x.key});assert.equal(changed.status,409);assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1);const broken=environment(auth);broken.OUTBOX_KEY='short';assert.equal((await create(broken)).response.status,503);assert.equal((await broken.DB.prepare('SELECT count(*) n FROM requests').first()).n,0)});
test('Blocco esperienza, motivi privati e modifica/eliminazione periodi',async()=>{const env=environment(auth),res=await admin(env,'blocks','POST',{start:'2027-06-11',end:'2027-06-13',experience:'dinner',reason:'Motivo riservato'});assert.equal(res.status,201);const {id}=await res.json();const cfg=await (await call(env,'/api/config')).json();assert.equal(cfg.blocks[0].reason,undefined);assert.equal((await create(env)).response.status,409);assert.equal((await create(env,{experience:'pasta',menuId:null,expectedUnit:200})).response.status,201);assert.equal((await admin(env,'blocks/'+id,'PATCH',{start:'2027-07-01',end:'2027-07-02',experience:'all',reason:'Altro',version:1})).status,200);assert.equal((await admin(env,'blocks/'+id,'DELETE',{version:1})).status,409);assert.equal((await admin(env,'blocks/'+id,'DELETE',{version:2})).status,200);assert.equal((await create(env)).response.status,201)});
test('Link personale: GET senza conferma, variazione importo, originale conservato, duplicati',async()=>{const env=environment(auth),{result}=await create(env),{token}=await tokenFor(env,result.id);const get=await call(env,'/api/confirm','GET',null,{Authorization:'Bearer '+token});assert.equal((await get.json()).status,'requested');await confirmRow(env,result.id,1000.01);const row=await env.DB.prepare('SELECT * FROM requests WHERE id=?').bind(result.id).first();assert.equal(row.initial,132000);assert.equal(row.final,100001);assert.ok(row.confirmed_at);assert.equal((await env.DB.prepare('SELECT count(*) n FROM outbox').first()).n,4);const notices=(await env.DB.prepare("SELECT * FROM outbox WHERE kind IN ('guest','laura')").all()).results;assert.equal(notices.length,2);for(const notice of notices){const msg=await unseal(env.OUTBOX_KEY,notice.payload);assert.equal(msg.to,notice.kind==='guest'?'guest@example.test':'laura@example.test');assert.ok(msg.text.includes(new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(1000.01)))}assert.equal((await call(env,'/api/confirm','POST',{version:1,status:'confirmed',final:1400},{Authorization:'Bearer '+token})).status,409);assert.equal((await call(env,'/api/confirm','GET',null,{Authorization:'Bearer '+'a'.repeat(64)})).status,404)});
test('Rifiuto, scadenza e rotazione dei link',async()=>{const env=environment(auth),x=await create(env),{token}=await tokenFor(env,x.result.id);await env.DB.prepare('UPDATE requests SET token_expires=0').run();assert.equal((await call(env,'/api/confirm','GET',null,{Authorization:'Bearer '+token})).status,410);assert.equal((await admin(env,'requests/'+x.result.id+'/link','POST',{version:1})).status,200);assert.equal((await call(env,'/api/confirm','GET',null,{Authorization:'Bearer '+token})).status,404);const rows=(await env.DB.prepare('SELECT * FROM outbox ORDER BY rowid DESC LIMIT 1').all()).results;const mail=await unseal(env.OUTBOX_KEY,rows[0].payload),newToken=mail.text.match(/\/confirm#([a-f0-9]{64})/)[1];assert.equal((await call(env,'/api/confirm','POST',{version:2,status:'declined'},{Authorization:'Bearer '+newToken})).status,200)});
test('Autenticazione reale: JWT firmato, allowlist, scadenza, aud e CSRF',async()=>{const env=environment(auth);for(const p of ['/admin','/admin.html','/api/admin/data','/api/admin/report.pdf?month=2027-06'])assert.equal((await call(env,p)).status,401);assert.equal((await admin(env,'data')).status,200);for(const token of [jwt+'tampered',await auth.jwt('other@example.test'),await auth.jwt('laura@example.test',{exp:1}),await auth.jwt('laura@example.test',{aud:['wrong']})])assert.equal((await call(env,'/api/admin/data','GET',null,{'Cf-Access-Jwt-Assertion':token})).status,403);assert.equal((await call(env,'/api/admin/blocks','POST',{}, {'Origin':'https://evil.test','Cf-Access-Jwt-Assertion':jwt})).status,403)});
test('Menu e condizioni live, estate sempre visibile, snapshot invariabile',async()=>{const env=environment(auth),x=await create(env),before=await env.DB.prepare('SELECT snapshot FROM requests').first(),cfg=await (await admin(env,'data')).json();const summer=cfg.menus.find(m=>m.id==='summer');summer.active=false;assert.equal((await admin(env,'menus/summer','PUT',summer)).status,200);const m=cfg.menus.find(m=>m.id==='traditional');m.price=240;m.name='Menu aggiornato';assert.equal((await admin(env,'menus/traditional','PUT',m)).status,200);assert.equal((await admin(env,'menus/traditional','PUT',m)).status,409);const publicData=await (await call(env,'/api/config')).json();assert.ok(publicData.menus.some(m=>m.id==='summer'));assert.equal(publicData.menus.find(m=>m.id==='traditional').price,240);assert.equal((await create(env,{menuId:'summer'})).response.status,409);assert.equal((await env.DB.prepare('SELECT snapshot FROM requests WHERE id=?').bind(x.result.id).first()).snapshot,before.snapshot)});
test('Commissione solo svolta e pagata, pasta zero, pagamenti parziali e PDF',async()=>{const env=environment(auth),x=await create(env);await confirmRow(env,x.result.id);let r=await (await admin(env,'report?month=2027-06')).json();assert.equal(r.fees,0);assert.equal(r.confirmed,1);await complete(env,x.result.id);r=await (await admin(env,'report?month=2027-06')).json();assert.equal(r.fees,12000);for(const amount of [30,40])assert.equal((await admin(env,'payments','POST',{id:crypto.randomUUID(),requestId:x.result.id,amount,date:'2026-11-04',reference:'Pagamento fittizio'})).status,201);r=await (await admin(env,'report?month=2027-06')).json();assert.equal(r.settled,7000);assert.equal(r.balance,5000);assert.equal((await admin(env,'payments','POST',{id:crypto.randomUUID(),requestId:x.result.id,amount:51,date:'2026-11-04',reference:''})).status,409);assert.equal((await admin(env,'requests/'+x.result.id,'PATCH',{version:3,status:'cancelled',reason:'Annullamento fittizio'})).status,409);const pdf=await admin(env,'report.pdf?month=2027-06');assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.ok((await pdf.text()).startsWith('%PDF-1.4'));assert.equal(fee({experience:'pasta',status:'completed',final:120000}),0);assert.equal(fee({experience:'dinner',status:'confirmed',final:120000}),0)});
test('Pasta 200 euro, nessuna commissione anche dopo completamento',async()=>{const env=environment(auth),x=await create(env,{experience:'pasta',menuId:null,expectedUnit:200,people:6});assert.equal(x.result.initial,120000);await confirmRow(env,x.result.id);await complete(env,x.result.id);const r=await (await admin(env,'report?month=2027-06')).json();assert.equal(r.fees,0);assert.equal((await admin(env,'payments','POST',{id:crypto.randomUUID(),requestId:x.result.id,amount:10,date:'2026-11-04',reference:''})).status,409)});
test('Email disabilitate in sviluppo, retry con idempotenza e nessun contenuto in log',async()=>{const env=environment(auth);await create(env);await deliver(env);assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='pending'").first()).n,2);const delivered=[];env.EMAIL_MODE='service';env.EMAIL_SERVICE={async fetch(req){delivered.push({key:req.headers.get('Idempotency-Key'),message:await req.json()});return Response.json({accepted:true})}};await deliver(env);assert.equal(delivered.length,2);assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='sent' AND payload=''").first()).n,2);await deliver(env);assert.equal(delivered.length,2)});
test('Protezione rate limit e privacy non pronta',async()=>{const env=environment(auth);env.PRIVACY_READY='false';assert.equal((await create(env)).response.status,503);env.PRIVACY_READY='true';let last;for(let i=0;i<9;i++)last=await create(env);assert.equal(last.response.status,429)});
async function scheduledCleanup(env){let task;worker.scheduled(null,env,{waitUntil:p=>{task=p}});await task}
test('Retenzione: 180 giorni da conclusione, commissioni aperte protette e audit cancellato a saldo',async()=>{
 const env=environment(auth),x=await create(env);await confirmRow(env,x.result.id);await complete(env,x.result.id);
 await env.DB.prepare("UPDATE requests SET created=0,completed_at=0,date='2025-04-01',checkin='2025-03-31',checkout='2025-04-02'").run();
 await env.DB.prepare('UPDATE audit SET created=0').run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1);
 assert.ok((await env.DB.prepare('SELECT count(*) n FROM audit WHERE request_id=?').bind(x.result.id).first()).n>0);
 await admin(env,'payments','POST',{id:crypto.randomUUID(),requestId:x.result.id,amount:120,date:'2026-11-04',reference:''});
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,0);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM outbox').first()).n,0);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM audit WHERE request_id=?').bind(x.result.id).first()).n,0);
});
test('Retenzione: richieste anticipate non eliminate prima della data esperienza',async()=>{
 const env=environment(auth);await create(env);
 await env.DB.prepare('UPDATE requests SET created=0').run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1);
 await env.DB.prepare("UPDATE requests SET date='2025-04-01',checkin='2025-03-31',checkout='2025-04-02'").run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,0);
});
test('Retenzione: rifiuto recente preservato 180 giorni dalla chiusura, non dall\'invio',async()=>{
 const env=environment(auth),x=await create(env),{token}=await tokenFor(env,x.result.id);
 assert.equal((await call(env,'/api/confirm','POST',{version:1,status:'declined'},{Authorization:'Bearer '+token})).status,200);
 const closed=await env.DB.prepare('SELECT closed_at FROM requests').first();assert.ok(closed.closed_at>Date.now()-120000);
 await env.DB.prepare('UPDATE requests SET created=0').run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1);
 await env.DB.prepare('UPDATE requests SET closed_at=0').run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,0);
});
test('Retenzione: confermata dimenticata, cancellata dopo la data esperienza e 180 giorni',async()=>{
 const env=environment(auth),x=await create(env);await confirmRow(env,x.result.id);
 await env.DB.prepare("UPDATE requests SET created=0,confirmed_at=0,date='2025-04-01',checkin='2025-03-31',checkout='2025-04-02'").run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,0);
});
test('Retenzione: completamento recente conserva la pratica anche se la richiesta è vecchia',async()=>{
 const env=environment(auth),x=await create(env);await confirmRow(env,x.result.id);await complete(env,x.result.id);
 await admin(env,'payments','POST',{id:crypto.randomUUID(),requestId:x.result.id,amount:120,date:'2026-11-04',reference:''});
 await env.DB.prepare("UPDATE requests SET created=0,date='2025-04-01',checkin='2025-03-31',checkout='2025-04-02'").run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1);
 await env.DB.prepare('UPDATE requests SET completed_at=0').run();
 await scheduledCleanup(env);
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,0);
});
test('Concorrenza: stesso invio salva una sola richiesta e conferma CAS vince una volta',async()=>{const env=environment(auth),key=crypto.randomUUID(),b={...valid(),challenge:await challenge(env)};const results=await Promise.all([call(env,'/api/requests','POST',b,{'Idempotency-Key':key}),call(env,'/api/requests','POST',b,{'Idempotency-Key':key})]);assert.ok(results.every(r=>[200,201].includes(r.status)));const saved=await Promise.all(results.map(r=>r.json()));assert.equal(saved[0].id,saved[1].id);assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1);assert.equal((await env.DB.prepare('SELECT count(*) n FROM outbox').first()).n,2);const {token}=await tokenFor(env,saved[0].id),confirmations=await Promise.all([call(env,'/api/confirm','POST',{version:1,status:'confirmed',final:1000},{Authorization:'Bearer '+token}),call(env,'/api/confirm','POST',{version:1,status:'confirmed',final:1500},{Authorization:'Bearer '+token})]);assert.deepEqual(confirmations.map(r=>r.status).sort(),[200,409]);assert.equal((await env.DB.prepare('SELECT count(*) n FROM outbox').first()).n,4)});
test('Date malformate e indisponibilità aggiunta dopo la richiesta',async()=>{assert.equal(date('2027-99-99'),false);assert.equal(date('2027-02-30'),false);const env=environment(auth),x=await create(env),{token}=await tokenFor(env,x.result.id);await admin(env,'blocks','POST',{start:'2027-06-12',end:'2027-06-12',experience:'all',reason:'Imprevisto fittizio'});const res=await call(env,'/api/confirm','POST',{version:1,status:'confirmed',final:1200},{Authorization:'Bearer '+token});assert.equal(res.status,409);assert.equal((await env.DB.prepare('SELECT status FROM requests').first()).status,'requested')});
test('Pagamento idempotente e notifiche fallite ritentabili senza perdita',async()=>{const env=environment(auth),x=await create(env);await confirmRow(env,x.result.id);await complete(env,x.result.id);const b={id:crypto.randomUUID(),requestId:x.result.id,amount:30,date:'2026-11-04',reference:'Bonifico fittizio'};assert.equal((await admin(env,'payments','POST',b)).status,201);assert.equal((await admin(env,'payments','POST',b)).status,200);assert.equal((await env.DB.prepare('SELECT count(*) n FROM payments').first()).n,1);env.EMAIL_MODE='service';env.EMAIL_SERVICE={fetch:async()=>new Response('error',{status:503})};await deliver(env);assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='retry'").first()).n,4);assert.ok((await env.DB.prepare('SELECT payload FROM outbox LIMIT 1').first()).payload);await env.DB.prepare('UPDATE outbox SET next_at=0').run();env.EMAIL_SERVICE={fetch:async()=>new Response('ok')};await deliver(env);assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='sent'").first()).n,4)});
test('Informativa in cinque lingue e blocco configurazione incompleta',async()=>{const env=environment(auth);for(const l of ['it','en','de','fr','es']){const r=await call(env,'/privacy?lang='+l);assert.equal(r.status,200);assert.ok((await r.text()).includes('lang="'+l+'"'))}env.PRIVACY_CONTACT='';assert.equal((await create(env)).response.status,503)});
test('Vincoli SQL proteggono anche da disponibilità e prezzo cambiati dopo lettura',async()=>{const env=environment(auth),x=await create(env),row=await env.DB.prepare('SELECT * FROM requests').first();await admin(env,'blocks','POST',{start:row.date,end:row.date,experience:'all',reason:''});const fields=Object.keys(row);await assert.rejects(()=>env.DB.prepare(`INSERT INTO requests(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).bind(...fields.map(k=>k==='id'?'OTHER':k==='idem'?crypto.randomUUID():k==='token_hash'?'other-token':row[k])).run(),/DATE_UNAVAILABLE/);assert.equal((await env.DB.prepare('SELECT count(*) n FROM requests').first()).n,1)});

test('Estate: nessuna data predefinita, finestra Laura inclusiva, revoca e difesa SQL',async()=>{
 const env=environment(auth);
 let cfg=await (await call(env,'/api/config')).json();assert.equal(cfg.summerWindow,null);assert.ok(cfg.menus.some(m=>m.id==='summer'));
 assert.equal((await create(env,{menuId:'summer'})).response.status,409);
 const settings=(await (await admin(env,'data')).json()).settings;
 for(const summerWindow of [{start:'2027-02-30',end:'2027-06-14'},{start:'2027-06-14',end:'2027-06-10'},{start:'2027-06-10'}])assert.equal((await admin(env,'settings','PUT',{...settings,summerWindow})).status,400);
 assert.equal((await admin(env,'settings','PUT',{...settings,summerWindow:{start:'2027-06-12',end:'2027-06-13'}})).status,200);
 for(const date of ['2027-06-12','2027-06-13'])assert.equal((await create(env,{menuId:'summer',date})).response.status,201);
 for(const date of ['2027-06-11','2027-06-14'])assert.equal((await create(env,{menuId:'summer',date})).response.status,409);
 const saved=await env.DB.prepare("SELECT * FROM requests WHERE menu_id='summer' LIMIT 1").first();
 const next=(await (await admin(env,'data')).json()).settings;
 assert.equal((await admin(env,'settings','PUT',{...next,summerWindow:null})).status,200);
 const fields=Object.keys(saved);
 await assert.rejects(()=>env.DB.prepare(`INSERT INTO requests(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).bind(...fields.map(k=>k==='id'?'SUMMER-RACE':k==='idem'?crypto.randomUUID():k==='token_hash'?'summer-race':saved[k])).run(),/SUMMER_UNAVAILABLE/);
 cfg=await (await call(env,'/api/config')).json();assert.equal(cfg.summerWindow,null);assert.ok(cfg.menus.some(m=>m.id==='summer'));
});
test('Richieste: trasporto email obbligatorio per il frontend e l’API',async()=>{
 const env=environment(auth);
 async function blocked(){
  const cfg=await (await call(env,'/api/config')).json();assert.equal(cfg.requestsEnabled,false);
  const res=await create(env);assert.equal(res.response.status,503);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM requests').first()).n,0);
 }
 env.APP_ENV='test';env.EMAIL_MODE='disabled';await blocked();
 env.EMAIL_MODE='resend';env.RESEND_API_KEY='fixture-only';await blocked();
 env.APP_ENV='production';env.EMAIL_MODE='disabled';await blocked();
 env.EMAIL_MODE='resend';delete env.RESEND_API_KEY;await blocked();
 env.EMAIL_MODE='service';delete env.EMAIL_SERVICE;await blocked();
 env.EMAIL_MODE='resend';env.RESEND_API_KEY='fixture-only';
 assert.equal((await (await call(env,'/api/config')).json()).requestsEnabled,true);
 env.EMAIL_MODE='service';delete env.RESEND_API_KEY;env.EMAIL_SERVICE={fetch:async()=>Response.json({ok:true})};
 assert.equal((await (await call(env,'/api/config')).json()).requestsEnabled,true);
 const local=environment(auth);local.LOCAL_DEV='false';
 assert.equal((await (await call(local,'/api/config')).json()).requestsEnabled,false);
 local.LOCAL_DEV='true';local.PUBLIC_ORIGIN='https://example.test';
 assert.equal((await (await call(local,'/api/config')).json()).requestsEnabled,false);
});
test('Configurazione pubblica segnala richieste disattivate senza esporre segreti',async()=>{
 const env=environment(auth);env.PRIVACY_READY='false';delete env.APP_SECRET;
 const res=await call(env,'/api/config');assert.equal(res.status,200);const cfg=await res.json();assert.equal(cfg.requestsEnabled,false);assert.equal(cfg.menus.length,3);assert.equal(cfg.OUTBOX_KEY,undefined);
 assert.equal((await create({...env,APP_SECRET:'fixture-only-restored-secret-0000000'})).response.status,503);
});
test('Resend isolato: contratto API, retry stabile, concorrenza e accettazione senza duplicati',async()=>{
 const env=environment(auth);await create(env);Object.assign(env,{APP_ENV:'production',EMAIL_MODE:'resend',RESEND_API_KEY:'fixture-not-a-real-api-key'});
 const seen=[];let failing=true;
 const transport=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers.Authorization,'Bearer fixture-not-a-real-api-key');const payload=JSON.parse(options.body);assert.ok(payload.reply_to);assert.ok(Array.isArray(payload.to));assert.equal(payload.replyTo,undefined);seen.push({key:options.headers['Idempotency-Key'],payload});return failing?new Response('',{status:429}):Response.json({id:'fixture-provider-id'})};
 await deliver(env,transport);assert.equal(seen.length,2);
 assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='retry' AND attempts=1").first()).n,2);
 await env.DB.prepare('UPDATE outbox SET next_at=0').run();failing=false;
 await Promise.all([deliver(env,transport),deliver(env,transport)]);assert.equal(seen.length,4);
 assert.deepEqual(seen.slice(0,2),seen.slice(2));
 assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='sent' AND payload='' AND provider_id='fixture-provider-id'").first()).n,2);
 await deliver(env,transport);assert.equal(seen.length,4);
});
test('Resend: blocco TEST assoluto, configurazione chiusa, errori permanenti e retry oltre 23h sospesi',async()=>{
 const env=environment(auth);await create(env);Object.assign(env,{APP_ENV:'test',EMAIL_MODE:'resend',RESEND_API_KEY:'fixture-only'});
 const never=()=>{throw Error('External transport must not be called')};await deliver(env,never);
 env.APP_ENV='development';await deliver(env,never);env.APP_ENV='production';delete env.RESEND_API_KEY;await deliver(env,never);
 env.RESEND_API_KEY='fixture-only';await deliver(env,async()=>new Response('',{status:401}));
 assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='review' AND last_error='PROVIDER_REJECTED'").first()).n,2);
 await env.DB.prepare("UPDATE outbox SET state='retry',next_at=0,first_attempt_at=?").bind(Date.now()-23*3600000).run();await deliver(env,never);
 assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='review' AND last_error='IDEMPOTENCY_WINDOW_EXPIRED' AND payload!=''").first()).n,2);
});
test('Resend: timeout ambiguo conserva payload cifrato e stessa chiave al retry',async()=>{
 const env=environment(auth);await create(env);Object.assign(env,{APP_ENV:'production',EMAIL_MODE:'resend',RESEND_API_KEY:'fixture-only'});
 const keys=[];await deliver(env,async(url,o)=>{keys.push(o.headers['Idempotency-Key']);throw Error('SIMULATED_TIMEOUT')});
 assert.equal((await env.DB.prepare("SELECT count(*) n FROM outbox WHERE state='retry' AND payload!=''").first()).n,2);
 await env.DB.prepare('UPDATE outbox SET next_at=0').run();const retry=[];
 await deliver(env,async(url,o)=>{retry.push(o.headers['Idempotency-Key']);return Response.json({id:'fixture-accepted'})});assert.deepEqual(retry,keys);
});
