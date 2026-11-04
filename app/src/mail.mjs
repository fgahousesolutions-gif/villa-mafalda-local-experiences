import {seal,unseal} from './security.mjs';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n/100);
export function email(kind,r,env,token=''){
 const menu=JSON.parse(r.snapshot).menu;
 const common=`Codice: ${r.id}\nOspite: ${r.name}\nEmail: ${r.email}\nTelefono: ${r.phone||'Non indicato'}\nSoggiorno: ${r.checkin} – ${r.checkout}\nData esperienza: ${r.date}\nEsperienza: ${r.experience==='dinner'?'Cena privata in Villa Mafalda':'Lezione di pasta fresca con cena a casa di Simonetta'}\nMenu: ${menu?.name||'Non applicabile'}\nPartecipanti: ${r.people}\nOrario: ${r.preferred_time}\nImporto iniziale: ${euro(r.initial)}\n${r.final!==null?'Importo concordato: '+euro(r.final)+'\n':''}Note: ${r.notes||'Nessuna'}\n${r.message||''}`;
 let title,body,to,buttons='';
 if(kind==='request'){title='Richiesta di disponibilità';to=env.SIMONETTA_EMAIL;body=common+'\n\nConcorda direttamente i dettagli con l’ospite. Il link scade fra '+(env.TOKEN_HOURS||168)+' ore.';const link=env.PUBLIC_ORIGIN+'/confirm#'+token;buttons=`<p><a style="display:inline-block;background:#233c2e;color:#fff;padding:15px;text-decoration:none" href="${esc(link)}">CONFERMA RICHIESTA</a></p><p><a href="${esc(link+'!decline')}">Indica che non sei disponibile</a></p>`;body+='\nConferma o rifiuta: '+link;}
 else if(kind==='receipt'){title='Abbiamo ricevuto la tua richiesta';to=r.email;body=`Gentile ${r.name},\n\nGrazie per aver scelto le esperienze di Villa Mafalda. La richiesta è registrata e attende la conferma personale di Simonetta. Non è ancora una prenotazione.\n\n`+common;}
 else if(kind==='laura'){title='Aggiornamento richiesta: '+r.status;to=env.LAURA_EMAIL;body=common+'\nStato: '+r.status;}
 else {title=r.status==='confirmed'?'La tua esperienza è confermata':'Aggiornamento della tua richiesta';to=r.email;body=`Gentile ${r.name},\n\n${r.status==='confirmed'?'Simonetta Garelli ha confermato la tua esperienza. Ti aspetta un incontro speciale con i sapori dell’Emilia.':'Simonetta non può confermare la disponibilità per questa richiesta.'}\n\n`+common+`\n\nPer dettagli e pagamento contatta direttamente Simonetta: ${env.SIMONETTA_EMAIL}.\nUn caro saluto,\nVilla Mafalda – Local Experiences`;}
 return {to,from:env.MAIL_FROM,replyTo:kind==='request'?r.email:env.SIMONETTA_EMAIL,subject:`[${r.id}] ${title}`,text:body,html:`<!doctype html><html><body style="background:#f7f5ef;color:#233c2e;font-family:Georgia,serif;padding:30px"><div style="max-width:640px;margin:auto;background:#fffdf9;padding:32px;border-top:4px solid #b69b68"><p>VILLA MAFALDA · LOCAL EXPERIENCES</p><h1>${esc(title)}</h1><p style="white-space:pre-line;font:15px/1.8 Arial,sans-serif">${esc(body)}</p>${buttons}</div></body></html>`};
}
export async function mailRows(db,env,r,kinds,token=''){
 const now=Date.now(), rows=[];
 for(const kind of kinds){const message=email(kind,r,env,token);if(!message.to||!message.from)throw Object.assign(new Error('Configurazione email incompleta.'),{status:503});rows.push({kind,id:crypto.randomUUID(),payload:await seal(env.OUTBOX_KEY,message),created:now,request_id:r.id})}return rows;
}
export function enqueue(db,rows,condition='1',params=[]){return rows.map(row=>db.prepare(`INSERT INTO outbox(id,request_id,payload,kind,next_at,created) SELECT ?,?,?,?,?,? WHERE ${condition}`).bind(row.id,row.request_id,row.payload,row.kind,row.created,row.created,...params))}
export async function deliver(env){
 if(env.EMAIL_MODE!=='service'||!env.EMAIL_SERVICE)return;
 const db=env.DB,now=Date.now();
 const rows=(await db.prepare("SELECT * FROM outbox WHERE state IN ('pending','retry') AND next_at<=? AND lease_until<? LIMIT 20").bind(now,now).all()).results;
 for(const r of rows){
  const lease=await db.prepare("UPDATE outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND lease_until<? AND state IN ('pending','retry')").bind(now+120000,r.id,now).run();if(!lease.meta.changes)continue;
  try{
   const payload=await unseal(env.OUTBOX_KEY,r.payload);
   // Internal service-binding contract. The configured adapter implements the real provider.
   const res=await env.EMAIL_SERVICE.fetch(new Request('https://email-adapter.internal/send',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':r.id},body:JSON.stringify(payload)}));
   if(!res.ok)throw new Error('PROVIDER_'+res.status);
   await db.prepare("UPDATE outbox SET state='sent',payload='',lease_until=0,last_error=NULL WHERE id=?").bind(r.id).run();
  }catch{
   await db.prepare("UPDATE outbox SET state='retry',lease_until=0,next_at=?,last_error='DELIVERY_FAILED' WHERE id=?").bind(now+Math.min(86400000,60000*2**Math.min(r.attempts,10)),r.id).run();
  }
 }
}
