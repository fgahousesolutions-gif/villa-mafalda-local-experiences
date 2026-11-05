import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deliver} from '../src/mail.mjs';
test('TEST isolato: UUID dedicato, nessuna route, cron o pubblicazione automatica',()=>{
 const c=JSON.parse(readFileSync(new URL('../wrangler.test.jsonc',import.meta.url)));
 assert.equal(c.name,'villa-mafalda-simonetta-test');
 assert.deepEqual(c.d1_databases,[{binding:'DB',database_name:'villa-mafalda-simonetta-test',database_id:'f330dfd4-1724-40b3-b8c3-a73ec8e4056b',migrations_dir:'migrations',remote:false}]);
 assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.deepEqual(c.routes,[]);assert.equal(c.triggers,undefined);assert.equal(c.services,undefined);
 assert.equal(c.vars.APP_ENV,'test');assert.equal(c.vars.EMAIL_MODE,'disabled');assert.equal(c.vars.PRIVACY_READY,'false');
 for(const k of ['ACCESS_ISSUER','ACCESS_AUD','ADMIN_EMAILS','PUBLIC_ORIGIN'])assert.equal(c.vars[k],'');
 assert.equal(c.assets.run_worker_first,true);
});
test('TEST non invia email anche con modalità service e binding presenti per errore',async()=>{
 let touched=false;
 await deliver({APP_ENV:'test',EMAIL_MODE:'service',EMAIL_SERVICE:{fetch(){touched=true;throw Error('Unexpected delivery')}},DB:{prepare(){touched=true;throw Error('Unexpected queue read')}}});
 assert.equal(touched,false);
});
