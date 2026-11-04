export function fail(message,status=400){throw Object.assign(new Error(message),{status})}
export function date(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
export function str(v,max,min=0){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))fail('Controlla i dati inseriti.');return v.trim()}
export function cents(v){const n=typeof v==='string'?Number(v.replace(',','.')):v;if(!Number.isFinite(n)||n<=0||n>1000000||Math.abs(n*100-Math.round(n*100))>0.00001)fail('Inserisci un importo valido, con al massimo due decimali.');return Math.round(n*100)}
export function booking(b){
 if(!['dinner','pasta'].includes(b.experience))fail('Scegli un’esperienza.');
 const n=Number(b.people);if(!Number.isInteger(n)||n<1||n>(b.experience==='pasta'?6:20))fail('Controlla il numero di partecipanti.');
 if(!date(b.checkin)||!date(b.checkout)||!date(b.date)||b.checkin>b.date||b.date>=b.checkout||b.date<today())fail('La data deve rientrare nel soggiorno, prima del check-out.');
 const email=str(b.email,130,3);if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))fail('Controlla l’indirizzo email.');
 if(b.privacy!==true)fail('Leggi e accetta l’informativa privacy.');
 return {experience:b.experience,menuId:b.experience==='dinner'?str(b.menuId,60,1):null,people:n,name:str(b.name,100,2),email:email.toLowerCase(),phone:str(b.phone||'',60),checkin:b.checkin,checkout:b.checkout,date:b.date,notes:str(b.notes||'',1000),lang:['it','en','de','fr','es'].includes(b.lang)?b.lang:'it',time:str(b.time||'',50)};
}
export const fee=r=>r.experience==='dinner'&&r.status==='completed'?Math.round(r.final/10):0;
export function report(rows,payments,month){
 const list=rows.filter(r=>r.date.startsWith(month)).map(r=>({...r,fee:fee(r),settled:payments.filter(p=>p.request_id===r.id).reduce((n,p)=>n+p.cents,0)}));
 return {month,rows:list,confirmed:list.filter(r=>r.status==='confirmed').length,completed:list.filter(r=>r.status==='completed').length,cancelled:list.filter(r=>['cancelled','declined'].includes(r.status)).length,total:list.filter(r=>['confirmed','completed'].includes(r.status)).reduce((n,r)=>n+r.final,0),fees:list.reduce((n,r)=>n+r.fee,0),settled:list.reduce((n,r)=>n+r.settled,0),balance:list.reduce((n,r)=>n+r.fee-r.settled,0)};
}
