// Real local D1 API. Each fixture gets a separate in-memory workerd database.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {readFileSync,readdirSync} from 'node:fs';
import {after} from 'node:test';
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local D1 QA")}}',compatibilityDate:'2026-10-01',d1Databases:Object.fromEntries(Array.from({length:100},(_,i)=>['DB'+i,'fixture-'+i]))}));
after(()=>mf.dispose());
const dir=new URL('../migrations/',import.meta.url);
const statements=readdirSync(dir).filter(x=>x.endsWith('.sql')).sort().flatMap(x=>unstable_splitSqlQuery(readFileSync(new URL(x,dir),'utf8')));
let index=0;
export class WorkerdD1 {
 constructor(){
  const binding='DB'+index++;
  this.ready=mf.getD1Database(binding).then(async db=>{await db.batch(statements.map(s=>db.prepare(s)));return db});
 }
 prepare(sql){const self=this;return {sql,args:[],bind(...args){return {...this,args}},async first(){return (await self.ready).prepare(this.sql).bind(...this.args).first()},async all(){return (await self.ready).prepare(this.sql).bind(...this.args).all()},async run(){return (await self.ready).prepare(this.sql).bind(...this.args).run()}}}
 async batch(items){const db=await this.ready;return db.batch(items.map(s=>db.prepare(s.sql).bind(...s.args)))}
}
