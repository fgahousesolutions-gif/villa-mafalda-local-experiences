import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deliver} from '../src/mail.mjs';
test('TEST isolato: UUID dedicato, dominio dedicato, nessun cron o pubblicazione automatica',()=>{
 const c=JSON.parse(readFileSync(new URL('../wrangler.test.jsonc',import.meta.url)));
 assert.equal(c.name,'villa-mafalda-simonetta-test');
 assert.deepEqual(c.d1_databases,[{binding:'DB',database_name:'villa-mafalda-simonetta-test',database_id:'f330dfd4-1724-40b3-b8c3-a73ec8e4056b',migrations_dir:'migrations',remote:false}]);
 assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.deepEqual(c.routes,c.vars.PUBLIC_ORIGIN?[{pattern:new URL(c.vars.PUBLIC_ORIGIN).hostname,custom_domain:true}]:[]);assert.equal(c.triggers,undefined);assert.equal(c.services,undefined);
 assert.equal(c.vars.APP_ENV,'test');assert.equal(c.vars.EMAIL_MODE,'disabled');assert.equal(c.vars.PRIVACY_READY,'false');
 if(c.vars.PUBLIC_ORIGIN){assert.match(new URL(c.vars.PUBLIC_ORIGIN).hostname,/test/);assert.equal(new URL(c.vars.PUBLIC_ORIGIN).protocol,'https:');assert.ok(c.vars.ACCESS_ISSUER.startsWith('https://'));assert.ok(c.vars.ACCESS_AUD);assert.ok(c.vars.ADMIN_EMAILS)}
 assert.equal(c.assets.run_worker_first,true);
});
test('TEST non invia email anche con modalità service e binding presenti per errore',async()=>{
 let touched=false;
 await deliver({APP_ENV:'test',EMAIL_MODE:'service',EMAIL_SERVICE:{fetch(){touched=true;throw Error('Unexpected delivery')}},DB:{prepare(){touched=true;throw Error('Unexpected queue read')}}});
 assert.equal(touched,false);
});
