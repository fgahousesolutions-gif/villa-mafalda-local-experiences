const enc=new TextEncoder();
export const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
export const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret,algorithm,usage){if(!secret||secret.length<32)throw new Error('SECURITY_CONFIGURATION');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(secret)),algorithm,false,usage)}
export async function mac(secret,s){return hex(await crypto.subtle.sign('HMAC',await key(secret,{name:'HMAC',hash:'SHA-256'},['sign']),enc.encode(s)))}
export async function seal(secret,value){const iv=crypto.getRandomValues(new Uint8Array(12));const c=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret,'AES-GCM',['encrypt']),enc.encode(JSON.stringify(value)));return b64(iv)+'.'+b64(c)}
export async function unseal(secret,s){const [iv,c]=s.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},await key(secret,'AES-GCM',['decrypt']),un64(c))))}
const cache=new Map();
export async function authorize(request,env){
 const jwt=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!jwt||!env.ACCESS_ISSUER||!env.ACCESS_AUD||!env.ADMIN_EMAILS)throw Object.assign(new Error('Accesso riservato. Accedi con il tuo account autorizzato.'),{status:401});
 try{
  const parts=jwt.split('.');if(parts.length!==3)throw 0;
  const header=JSON.parse(new TextDecoder().decode(un64(parts[0]))),claims=JSON.parse(new TextDecoder().decode(un64(parts[1])));
  const issuer=env.ACCESS_ISSUER.replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||header.alg!=='RS256'||claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud.includes(env.ACCESS_AUD):claims.aud===env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||(claims.nbf&&claims.nbf>Date.now()/1000)||!Number.isFinite(claims.iat)||claims.iat>Date.now()/1000+60)throw 0;
  let entry=cache.get(issuer);
  if(!entry||entry.until<Date.now()){const response=await fetch(issuer+'/cdn-cgi/access/certs');if(!response.ok)throw 0;entry={keys:(await response.json()).keys,until:Date.now()+300000};cache.set(issuer,entry)}
  const jwk=entry.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw 0;
  const k=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',k,un64(parts[2]),enc.encode(parts[0]+'.'+parts[1])))throw 0;
  const email=String(claims.email||'').toLowerCase();if(!env.ADMIN_EMAILS.split(',').map(x=>x.trim().toLowerCase()).includes(email))throw 0;
  return email;
 }catch{throw Object.assign(new Error('Accesso non autorizzato.'),{status:403})}
}
