import {hash,mac,randomToken,authorize} from './security.mjs';
import {booking,fail,str,date,cents,today,report} from './domain.mjs';
import {mailRows,enqueue,deliver} from './mail.mjs';
import {pdf} from './pdf.mjs';
import {privacy} from './privacy.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const audit=(db,actor,action,data={},requestId=null)=>db.prepare('INSERT INTO audit(request_id,actor,action,data,created) VALUES(?,?,?,?,?)').bind(requestId,actor,action,JSON.stringify(data),Date.now());
async function body(req){if(Number(req.headers.get('content-length'))>50000)fail('Richiesta troppo grande.',413);if(!req.headers.get('content-type')?.startsWith('application/json'))fail('Formato non valido.',415);const reader=req.body?.getReader();if(!reader)fail('Dati mancanti.');let size=0,text='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>50000){await reader.cancel();fail('Richiesta troppo grande.',413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();try{return JSON.parse(text)}catch{fail('Dati non validi.')}}
function writeOrigin(req,url){if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==url.origin)fail('Origine non autorizzata.',403)}
async function rate(req,env,scope,limit){const ip=req.headers.get('CF-Connecting-IP');if(!ip&&env.LOCAL_DEV!=='true')fail('Configurazione rete incompleta.',503);const now=Date.now(),key=await mac(env.APP_SECRET,scope+':'+(ip||'local')+':'+Math.floor(now/3600000));const r=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+3600000).first();if(r.count>limit)fail('Troppi tentativi. Riprova più tardi.',429)}
async function config(db){const row=await one(db,'SELECT * FROM settings WHERE id=1');return {...JSON.parse(row.data),version:row.version}}
// Production requests need a configured email sender. Capture mode is for loopback development only.
function localEmailCapture(env){
 if(env.APP_ENV!=='development'||env.LOCAL_DEV!=='true'||env.EMAIL_MODE!=='capture')return false;
 try{const origin=new URL(env.PUBLIC_ORIGIN);return origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)}catch{return false}
}
const liveEmailReady=env=>env.APP_ENV==='production'&&((env.EMAIL_MODE==='resend'&&!!env.RESEND_API_KEY)||(env.EMAIL_MODE==='service'&&!!env.EMAIL_SERVICE));
const requestsEnabled=env=>(liveEmailReady(env)||localEmailCapture(env))&&env.PRIVACY_READY==='true'&&!!env.PRIVACY_CONTROLLER&&!!env.PRIVACY_CONTACT&&!!env.APP_SECRET&&!!env.OUTBOX_KEY&&!!env.PUBLIC_ORIGIN&&!!env.SIMONETTA_EMAIL&&!!env.LAURA_EMAIL&&!!env.MAIL_FROM;
async function publicConfig(env){const db=env.DB,settings=await config(db);return {requestsEnabled:requestsEnabled(env),summerWindow:settings.summerWindow||null,menus:(await all(db,'SELECT * FROM menus')).map(r=>({...JSON.parse(r.data),version:r.version})).filter(m=>m.active||m.id==='summer'),pastaPrice:settings.pastaPrice,referencePrice:settings.referencePrice,conditions:settings.conditions,blocks:await all(db,'SELECT start AS "from",end AS "to",experience FROM blocks WHERE end>=?',today())}}
function storedMenu(m){const {version,...data}=m;return data}
async function requestCreate(req,env,ctx){
 if(!requestsEnabled(env))fail('Il servizio richieste non è ancora attivo.',503);
 const b=await body(req),r=booking(b),db=env.DB;
 const idem=req.headers.get('Idempotency-Key');if(!idem||!/^[0-9a-f-]{36}$/i.test(idem))fail('Identificativo invio non valido.');
 const fingerprint=await hash(JSON.stringify(r));
 let prior=await one(db,'SELECT id,fingerprint,initial FROM requests WHERE idem=?',idem);
 if(prior){if(prior.fingerprint!==fingerprint)fail('Invio già usato per dati diversi.',409);return json({id:prior.id,initial:prior.initial,registered:true,emailQueued:true},200)}
 await rate(req,env,'booking',8);
 if(b.website)fail('Richiesta non valida.');
 const [stamp,nonce,signature]=String(b.challenge||'').split('.');const age=Date.now()-Number(stamp);
 if(!nonce||signature!==await mac(env.APP_SECRET,stamp+'.'+nonce)||age<2000||age>7200000)fail('Aggiorna la pagina e riprova tra qualche secondo.');
 const settings=await config(db);let menu=null;
 if(r.experience==='dinner'){const m=await one(db,'SELECT data FROM menus WHERE id=?',r.menuId);if(!m||(!JSON.parse(m.data).active&&r.menuId!=='summer'))fail('Menu non disponibile.',409);menu=JSON.parse(m.data);if(menu.id==='summer'&&(!settings.summerWindow||r.date<settings.summerWindow.start||r.date>settings.summerWindow.end))fail('Il menu estivo è visibile tutto l’anno, ma è richiedibile solo nella finestra configurata da Laura. Al momento la data scelta non è disponibile.',409)}
 const price=r.experience==='dinner'?menu.price:settings.pastaPrice;
 if(b.expectedUnit!==price)fail('Il prezzo è stato aggiornato. Ricarica la pagina prima di inviare.',409);
 const token=randomToken(),now=Date.now();const row={id:'VM-SIM-'+crypto.randomUUID().toUpperCase(),...r,menu_id:r.menuId,initial:cents(price)*r.people,final:null,status:'requested',preferred_time:r.time,snapshot:JSON.stringify({menu,conditions:settings.conditions,unitPrice:price,pastaReference:settings.referencePrice,privacyVersion:env.PRIVACY_VERSION||'1'}),token_hash:await hash(token),token_expires:now+Number(env.TOKEN_HOURS||168)*3600000,created:now};
 const mails=await mailRows(db,env,row,['request','receipt'],token);
 const fields=['id','idem','fingerprint','name','email','phone','checkin','checkout','date','experience','menu_id','snapshot','people','initial','notes','lang','preferred_time','token_hash','token_expires','created'];
 const values={...row,idem,fingerprint};
 try{await db.batch([db.prepare(`INSERT INTO requests(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).bind(...fields.map(f=>values[f])),...enqueue(db,mails),audit(db,'guest','request.created',{initial:row.initial},row.id)])}catch(e){
  prior=await one(db,'SELECT id,fingerprint,initial FROM requests WHERE idem=?',idem);if(prior?.fingerprint===fingerprint)return json({id:prior.id,initial:prior.initial,registered:true,emailQueued:true});
  if(/DATE_UNAVAILABLE|MENU_CHANGED|SUMMER_UNAVAILABLE|PRICE_CHANGED/.test(e.message))fail('Disponibilità o menu aggiornati. Ricarica la pagina e scegli di nuovo.',409);throw e;
 }
 ctx.waitUntil(deliver(env));return json({id:row.id,initial:row.initial,registered:true,emailQueued:true},201);
}
async function tokenRequest(req,env){const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';if(!/^[0-9a-f]{64}$/.test(token))fail('Collegamento non valido.',404);const row=await one(env.DB,'SELECT * FROM requests WHERE token_hash=?',await hash(token));if(!row)fail('Collegamento non valido.',404);if(row.token_expires<Date.now())fail('Collegamento scaduto. Contatta Villa Mafalda per riceverne uno nuovo.',410);return row}
function summary(r){return {id:r.id,name:r.name,date:r.date,experience:r.experience,menu:JSON.parse(r.snapshot).menu,people:r.people,initial:r.initial,final:r.final,status:r.status,version:r.version,message:r.message}}
async function change(req,env,ctx,r,actor,admin=false){
 const b=await body(req),db=env.DB;
 if(b.version!==r.version)fail('La richiesta è già stata aggiornata. Ricarica.',409);
 if(!admin&&r.status!=='requested')fail('Questa richiesta è già stata gestita.',409);
 const allowed=admin?['confirmed','completed','declined','cancelled']:['confirmed','declined'];if(!allowed.includes(b.status))fail('Stato non valido.');
 if(!admin&&b.status==='confirmed'&&r.date<today())fail('La data dell’esperienza è trascorsa.',409);
 if(admin&&b.status==='completed'&&!['confirmed','completed'].includes(r.status))fail('Conferma prima la richiesta.',409);
 if(b.status==='confirmed'&&await one(db,"SELECT id FROM blocks WHERE ? BETWEEN start AND end AND experience IN ('all',?)",r.date,r.experience))fail('Data non disponibile. Contatta Villa Mafalda.',409);
 const reason=admin?str(b.reason,500,4):'';
 const final=['confirmed','completed'].includes(b.status)?cents(b.final):r.final;
 const message=str(b.message??r.message,1000),now=Date.now();
 const updated={...r,status:b.status,final,message};const notify=['requested'].includes(r.status)&&['confirmed','declined'].includes(b.status);
 const mails=notify?await mailRows(db,env,updated,['guest','laura']):[];
 const op=crypto.randomUUID();
 const statements=[db.prepare('UPDATE requests SET status=?,final=?,message=?,confirmed_at=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_at END,completed_at=CASE WHEN ?=\'completed\' THEN ? ELSE completed_at END,version=version+1 WHERE id=? AND version=?').bind(b.status,final,message,b.status,now,b.status,now,r.id,r.version),db.prepare('INSERT INTO audit(request_id,actor,action,data,created) SELECT ?,?,?,?,? WHERE changes()=1').bind(r.id,actor,'request.updated:'+op,JSON.stringify({from:r.status,to:b.status,oldFinal:r.final,final,reason}),now),...enqueue(db,mails,'EXISTS(SELECT 1 FROM audit WHERE action=?)',['request.updated:'+op])];
 const result=await db.batch(statements);if(!result[0].meta.changes)fail('La richiesta è già stata aggiornata.',409);ctx.waitUntil(deliver(env));return json({ok:true,status:b.status});
}
function validateMenu(b,id){
 const m=storedMenu(b);if(!['traditional','elegance','summer'].includes(id)||m.id!==id)fail('Menu non valido.');str(m.name,120,2);str(m.summary,1000);str(m.tag,100);for(const l of ['en','de','fr','es']){str(m[l+'Summary'],1000,1);str(m[l+'Tag'],100,1)}cents(m.price);if(typeof m.active!=='boolean'||typeof m.seasonal!=='boolean'||!Array.isArray(m.courses)||m.courses.length<1||m.courses.length>12)fail('Menu non valido.');
 for(const c of m.courses){for(const l of ['','en','de','fr','es']){const label=l?l+'Label':'label',items=l?l+'Items':'items';str(c[label],100,1);if(!Array.isArray(c[items])||!c[items].length||c[items].length>15)fail('Inserisci le portate in tutte le lingue.');c[items].forEach(x=>str(x,1000,1))}}
 if(id==='summer'){m.active=true;m.seasonal=true}return m;
}
async function adminRoute(req,url,env,ctx,actor){
 const db=env.DB,path=url.pathname,b=async()=>body(req);
 if(path==='/api/admin/data'&&req.method==='GET')return json({requests:await all(db,'SELECT id,name,email,phone,checkin,checkout,date,experience,menu_id,snapshot,people,initial,final,status,notes,lang,preferred_time,created,confirmed_at,completed_at,message,version FROM requests ORDER BY date DESC'),menus:(await all(db,'SELECT * FROM menus')).map(m=>({...JSON.parse(m.data),version:m.version})),settings:await config(db),blocks:await all(db,'SELECT * FROM blocks ORDER BY start'),payments:await all(db,'SELECT * FROM payments ORDER BY date'),audit:await all(db,'SELECT * FROM audit ORDER BY id DESC LIMIT 300'),outbox:await all(db,'SELECT id,request_id,state,attempts,next_at,last_error FROM outbox ORDER BY created DESC LIMIT 200'),emailMode:env.APP_ENV==='test'?'disabled':env.EMAIL_MODE||'disabled'});
 const rid=path.match(/^\/api\/admin\/requests\/([^/]+)$/);
 if(rid&&req.method==='PATCH'){const r=await one(db,'SELECT * FROM requests WHERE id=?',rid[1]);if(!r)fail('Richiesta non trovata.',404);return change(req,env,ctx,r,actor,true)}
 const resend=path.match(/^\/api\/admin\/requests\/([^/]+)\/link$/);
 if(resend&&req.method==='POST'){
  const r=await one(db,'SELECT * FROM requests WHERE id=?',resend[1]);if(!r||r.status!=='requested')fail('Richiesta non disponibile.',409);
  const input=await b();if(input.version!==r.version)fail('Richiesta aggiornata.',409);
  const token=randomToken(),rows=await mailRows(db,env,r,['request'],token),op=crypto.randomUUID();
  const res=await db.batch([db.prepare('UPDATE requests SET token_hash=?,token_expires=?,version=version+1 WHERE id=? AND version=?').bind(await hash(token),Date.now()+Number(env.TOKEN_HOURS||168)*3600000,r.id,r.version),db.prepare('INSERT INTO audit(request_id,actor,action,data,created) SELECT ?,?,?,?,? WHERE changes()=1').bind(r.id,actor,'token.rotated:'+op,'{}',Date.now()),db.prepare("UPDATE outbox SET state='cancelled',payload='' WHERE request_id=? AND kind='request' AND state IN ('pending','retry') AND EXISTS(SELECT 1 FROM audit WHERE action=?)").bind(r.id,'token.rotated:'+op),...enqueue(db,rows,'EXISTS(SELECT 1 FROM audit WHERE action=?)',['token.rotated:'+op])]);if(!res[0].meta.changes)fail('Richiesta aggiornata.',409);ctx.waitUntil(deliver(env));return json({ok:true})
 }
 if(path==='/api/admin/blocks'&&req.method==='POST'){
  const x=await b();if(!date(x.start)||!date(x.end)||x.start>x.end||!['all','dinner','pasta'].includes(x.experience))fail('Controlla periodo ed esperienza.');const reason=str(x.reason||'',500),id=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO blocks(id,start,end,experience,reason) VALUES(?,?,?,?,?)').bind(id,x.start,x.end,x.experience,reason),audit(db,actor,'block.created',{id,start:x.start,end:x.end,experience:x.experience})]);return json({id},201)
 }
 const block=path.match(/^\/api\/admin\/blocks\/([^/]+)$/);
 if(block&&['PATCH','DELETE'].includes(req.method)){
  const old=await one(db,'SELECT * FROM blocks WHERE id=?',block[1]);if(!old)fail('Periodo non trovato.',404);const x=await b();if(x.version!==old.version)fail('Periodo aggiornato.',409);
  let statement;if(req.method==='DELETE')statement=db.prepare('DELETE FROM blocks WHERE id=? AND version=?').bind(old.id,x.version);
  else {if(!date(x.start)||!date(x.end)||x.start>x.end||!['all','dinner','pasta'].includes(x.experience))fail('Periodo non valido.');statement=db.prepare('UPDATE blocks SET start=?,end=?,experience=?,reason=?,version=version+1 WHERE id=? AND version=?').bind(x.start,x.end,x.experience,str(x.reason||'',500),old.id,x.version)}
  const res=await db.batch([statement,db.prepare('INSERT INTO audit(actor,action,data,created) SELECT ?,?,?,? WHERE changes()=1').bind(actor,'block.changed',JSON.stringify({old,new:x}),Date.now())]);if(!res[0].meta.changes)fail('Periodo aggiornato.',409);return json({ok:true})
 }
 const menu=path.match(/^\/api\/admin\/menus\/([^/]+)$/);
 if(menu&&req.method==='PUT'){
  const x=await b(),m=validateMenu(x,menu[1]),old=await one(db,'SELECT * FROM menus WHERE id=?',menu[1]);if(!old)fail('Menu non trovato.',404);
  const res=await db.batch([db.prepare('UPDATE menus SET data=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(m),menu[1],x.version),db.prepare('INSERT INTO audit(actor,action,data,created) SELECT ?,?,?,? WHERE changes()=1').bind(actor,'menu.changed',JSON.stringify({old:JSON.parse(old.data),new:m}),Date.now())]);if(!res[0].meta.changes)fail('Menu già aggiornato.',409);return json({ok:true})
 }
 if(path==='/api/admin/settings'&&req.method==='PUT'){
  const x=await b(),old=await config(db);cents(x.pastaPrice);cents(x.referencePrice);if(!x.conditions||!['it','en','de','fr','es'].every(l=>x.conditions[l])||Object.keys(x.conditions).some(k=>!['it','en','de','fr','es'].includes(k)))fail('Condizioni non valide.');for(const t of Object.values(x.conditions)){str(t.included,2000,1);str(t.excluded,2000,1)}
  const w=x.summerWindow??null;if(w!==null&&(!date(w.start)||!date(w.end)||w.start>w.end))fail('Imposta entrambe le date della finestra estiva, in ordine cronologico.');
  const next={summerWindow:w,pastaPrice:x.pastaPrice,referencePrice:x.referencePrice,conditions:x.conditions};const res=await db.batch([db.prepare('UPDATE settings SET data=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(next),x.version),db.prepare('INSERT INTO audit(actor,action,data,created) SELECT ?,?,?,? WHERE changes()=1').bind(actor,'settings.changed',JSON.stringify({old,new:next}),Date.now())]);if(!res[0].meta.changes)fail('Configurazione già aggiornata.',409);return json({ok:true})
 }
 if(path==='/api/admin/payments'&&req.method==='POST'){
  const x=await b(),amount=cents(x.amount);if(!date(x.date)||x.date>today())fail('Data pagamento non valida.');const id=str(x.id,36,36);if(!/^[a-f0-9-]{36}$/i.test(id))fail('Identificativo pagamento non valido.');const prior=await one(db,'SELECT * FROM payments WHERE id=?',id);if(prior){if(prior.request_id===x.requestId&&prior.cents===amount&&prior.date===x.date&&prior.reference===x.reference)return json({ok:true});fail('Pagamento già utilizzato.',409)}
  await db.batch([db.prepare('INSERT INTO payments(id,request_id,cents,date,reference,created) VALUES(?,?,?,?,?,?)').bind(id,str(x.requestId,60,1),amount,x.date,str(x.reference||'',200),Date.now()),audit(db,actor,'payment.created',{id,cents:amount,date:x.date},x.requestId)]);return json({ok:true},201)
 }
 if(['/api/admin/report','/api/admin/report.pdf'].includes(path)&&req.method==='GET'){
  const month=url.searchParams.get('month');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))fail('Seleziona un mese.');
  const r=report(await all(db,'SELECT * FROM requests WHERE date LIKE ?',month+'-%'),await all(db,'SELECT * FROM payments'),month);
  if(path.endsWith('.pdf'))return new Response(pdf(r),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Villa-Mafalda-Simonetta-${month}.pdf"`}});return json(r)
 }
 fail('Risorsa non trovata.',404);
}
async function route(req,env,ctx){
 const url=new URL(req.url),path=url.pathname;writeOrigin(req,url);
 if(path.startsWith('/api/admin/')||path==='/admin'||path==='/admin.html'){
  const actor=await authorize(req,env);if(path.startsWith('/api/'))return adminRoute(req,url,env,ctx,actor);
  return env.ASSETS.fetch(new Request(url.origin+'/admin.html',req));
 }
 if(path==='/api/config'&&req.method==='GET')return json(await publicConfig(env));
 if(path==='/api/challenge'&&req.method==='GET'){await rate(req,env,'challenge',60);const data=Date.now()+'.'+randomToken();return json({challenge:data+'.'+await mac(env.APP_SECRET,data)})}
 if(path==='/api/requests'&&req.method==='POST')return requestCreate(req,env,ctx);
 if(path==='/api/confirm'&&['GET','POST'].includes(req.method)){await rate(req,env,'confirm',120);const row=await tokenRequest(req,env);return req.method==='GET'?json(summary(row)):change(req,env,ctx,row,'simonetta')}
 if(path.startsWith('/api/'))fail('Risorsa non trovata.',404);
 if(!['GET','HEAD'].includes(req.method))fail('Metodo non consentito.',405);
 if(path==='/'||path==='/simonetta-garelli/'||path==='/simonetta-garelli')return env.ASSETS.fetch(new Request(url.origin+'/index.html',req));
 if(path==='/confirm')return env.ASSETS.fetch(new Request(url.origin+'/confirm.html',req));
 if(path==='/privacy')return privacy(env,url.searchParams.get('lang'));
 return env.ASSETS.fetch(req);
}
export default {
 async fetch(req,env,ctx){let res;try{res=await route(req,env,ctx)}catch(e){const known=/DATE_UNAVAILABLE|MENU_CHANGED|SUMMER_UNAVAILABLE|PRICE_CHANGED|INVALID_PAYMENT|PAYMENTS_EXIST/.test(e.message);res=json({error:e.status?e.message:known?'Operazione non consentita: controlla disponibilità, importi e pagamenti già registrati.':'Servizio temporaneamente non disponibile. La registrazione non è stata confermata; riprova con gli stessi dati.',code:e.status|| (known?409:503)},e.status||(known?409:503))}
  const headers=new Headers(res.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://storage.googleapis.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");return new Response(res.body,{status:res.status,headers});
 },
 async scheduled(event,env,ctx){ctx.waitUntil((async()=>{await deliver(env);const days=Number(env.RETENTION_DAYS);if(!Number.isInteger(days)||days<30||days>3650)return;const cutoff=Date.now()-days*86400000;await env.DB.batch([env.DB.prepare("DELETE FROM requests WHERE created<? AND status IN ('declined','cancelled','requested')").bind(cutoff),env.DB.prepare("DELETE FROM requests WHERE created<? AND status='completed' AND (experience='pasta' OR COALESCE((SELECT SUM(cents) FROM payments WHERE request_id=requests.id),0)>=CAST(ROUND(final*0.1) AS INTEGER))").bind(cutoff),env.DB.prepare('DELETE FROM audit WHERE created<?').bind(cutoff),env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(Date.now())])})())}
};
