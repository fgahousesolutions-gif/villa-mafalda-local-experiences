import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {b64} from '../src/security.mjs';
export const appRoot=fileURLToPath(new URL('../',import.meta.url));
const realD1=process.env.TEST_D1==='workerd' ? await import('./workerd-d1.mjs') : null;
export class D1 {
 constructor(filename=':memory:'){if(realD1)return new realD1.WorkerdD1();this.sqlite=new DatabaseSync(filename);this.sqlite.exec('PRAGMA foreign_keys=ON;');for(const file of readdirSync(path.join(appRoot,'migrations')).filter(f=>f.endsWith('.sql')).sort())this.sqlite.exec(readFileSync(path.join(appRoot,'migrations',file),'utf8'))}
 prepare(sql){const self=this;return {sql,args:[],bind(...args){return {...this,args}},async first(){return self.sqlite.prepare(this.sql).get(...this.args)||null},async all(){return {results:self.sqlite.prepare(this.sql).all(...this.args)}},async run(){const r=self.sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}}
 async batch(items){this.sqlite.exec('BEGIN');try{const results=[];for(const s of items){const r=this.sqlite.prepare(s.sql).run(...s.args);results.push({meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}})}this.sqlite.exec('COMMIT');return results}catch(e){this.sqlite.exec('ROLLBACK');throw e}}
}
export async function authFixture(){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='local-test';
 const url64=s=>b64(typeof s==='string'?new TextEncoder().encode(s):s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 const issuer='https://villa-mafalda-fixture.cloudflareaccess.com';
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(input,options)=>String(input)===issuer+'/cdn-cgi/access/certs'?Promise.resolve(Response.json({keys:[jwk]})):originalFetch(input,options);
 return {issuer,async jwt(email='laura@example.test',overrides={}){const data=url64(JSON.stringify({alg:'RS256',kid:jwk.kid}))+'.'+url64(JSON.stringify({iss:issuer,aud:['fixture-audience'],email,iat:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+3600,...overrides}));return data+'.'+url64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data)))},restore(){globalThis.fetch=originalFetch}};
}
export function environment(auth,db=new D1()){
 return {DB:db,APP_SECRET:'local-fixture-only-secret-000000000000',OUTBOX_KEY:'local-fixture-only-encryption-00000000',ACCESS_ISSUER:auth.issuer,ACCESS_AUD:'fixture-audience',ADMIN_EMAILS:'laura@example.test',SIMONETTA_EMAIL:'chef@example.test',LAURA_EMAIL:'laura@example.test',MAIL_FROM:'experiences@example.test',PUBLIC_ORIGIN:'http://localhost',APP_ENV:'development',LOCAL_DEV:'true',EMAIL_MODE:'capture',PRIVACY_READY:'true',PRIVACY_CONTROLLER:'Villa Mafalda – titolare fittizio',PRIVACY_CONTACT:'privacy@example.test',RETENTION_DAYS:'180',TOKEN_HOURS:'168',ASSETS:{async fetch(req){let p=new URL(req.url).pathname;try{if(!/^\/[a-zA-Z0-9._-]+$/.test(p))return new Response('Not found',{status:404});const file=readFileSync(path.join(appRoot,'public',p));const type=p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'text/plain';return new Response(file,{headers:{'Content-Type':type}})}catch{return new Response('Not found',{status:404})}}}};
}
