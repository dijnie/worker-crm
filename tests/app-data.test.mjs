import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
let dir, AppDataStore, createApiClient, ApiError;
before(async()=>{dir=await mkdtemp(join(tmpdir(),'app-data-tests-'));const file=join(dir,'module.mjs');await build({stdin:{contents:'export * from "./src/lib/app-data-store.ts";export * from "./src/lib/api.ts";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'esm',outfile:file,logLevel:'silent'});({AppDataStore,createApiClient,ApiError}=await import(pathToFileURL(file)));});
after(async()=>rm(dir,{recursive:true,force:true}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('matching loads deduplicate and invalidated requests cannot replace a newer response',async()=>{
 const store=new AppDataStore();const a=deferred();let count=0;const key=store.key('companies',{search:'A'});
 const first=store.load('companies',key,()=>{count++;return a.promise}); const same=store.load('companies',key,()=>{count++;return a.promise});await Promise.resolve();assert.equal(count,1);
 store.invalidate(['companies']);await store.load('companies',key,async()=>['new']);a.resolve(['old']);await Promise.all([first,same]);assert.deepEqual(store.state(key).data,['new']);
});
test('access epochs abort transport and discard late success; denied resources do not retry',async()=>{
 const store=new AppDataStore(), a=deferred(), controller=new AbortController();store.track(controller);const epoch=store.generation,key=store.key('members',{});const first=store.load('members',key,()=>a.promise);await Promise.resolve();store.clear(true);store.deny('members',new Error('Owner access required'));assert.equal(controller.signal.aborted,true);assert.equal(store.isCurrent(epoch),false);a.resolve(['protected']);await first;assert.equal(store.state(key),undefined);store.resume();let calls=0;await store.load('members',key,async()=>{calls++;return []});assert.equal(calls,0);assert.match(store.state(key).error.message,/Owner/);
});
test('record and membership invalidation reach later timeline, detail, stats and identity consumers',async()=>{
 const store=new AppDataStore();for(const name of ['companies','contacts:detail','deals/facets','activities:recent','stats','members','assignees','identity'])await store.load(name,store.key(name,{}),async()=>[name]);
 store.invalidate(['companies']);for(const name of ['companies','contacts:detail','deals/facets','activities:recent','stats'])assert.equal(store.state(store.key(name,{})),undefined,name);
 store.invalidate(['members']);for(const name of ['members','assignees','identity'])assert.equal(store.state(store.key(name,{})),undefined,name);
});
test('client encodes filters as JSON and preserves validated field issues and access codes',async()=>{
 let url;const client=createApiClient({fetch:async(input)=>{url=String(input);return Response.json({message:'Invalid request',issues:[{path:['name'],message:'Required'},{path:[{}],message:'bad'}],code:'FORBIDDEN_ACTION'},{status:400})}});
 await assert.rejects(client.companies.list({filters:{industry:['SaaS','Fintech']}}),e=>e instanceof ApiError && e.issues.length===1 && e.code==='FORBIDDEN_ACTION');
 assert.deepEqual(JSON.parse(new URL(url,'https://crm.test').searchParams.get('filters')),{industry:['SaaS','Fintech']});
});
test('query cancellation reaches the typed transport and waits for the last matching observer',async()=>{
 const store=new AppDataStore(),key=store.key('companies',{});let signal;
 const client=createApiClient({fetch:async(_input,init)=>{signal=init.signal;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}});
 const releaseFirst=store.retain(key),releaseSecond=store.retain(key);
 const request=store.load('companies',key,signal=>client.companies.list({}, {signal}));await Promise.resolve();
 releaseFirst();assert.equal(signal.aborted,false);releaseSecond();assert.equal(signal.aborted,true);await request;assert.equal(store.state(key),undefined);
});
test('activity writes refresh linked projections while task toggles leave stamps and aggregate counts alone', async () => {
 const resources = ['company','contact','deal','companies','contacts','deals','activities','activities:counts','activities/tasks','stats','recent-feed','tasks','facets'];
 for (const mutation of ['activity-create','activity-delete','task-complete']) {
  const store = new AppDataStore();
  for (const resource of resources) await store.load(resource,store.key(resource,{}),async()=>[resource]);
  store.invalidate([mutation]);
  for (const resource of resources) {
   const affected = mutation !== 'task-complete' || /^(activities|recent-feed|tasks)/.test(resource);
   assert.equal(store.state(store.key(resource,{})) === undefined, affected, `${mutation}: ${resource}`);
  }
 }
});
test('activity invalidation rejects a delayed pre-mutation timeline even after the latest page is read',async()=>{
 const store=new AppDataStore(),old=deferred(),key=store.key('activities',{companyId:'a',view:'all',page:1});
 const request=store.load('activities',key,()=>old.promise);await Promise.resolve();
 store.invalidate(['activity-create']);await store.load('activities',key,async()=>({items:['new'],total:1}));
 old.resolve({items:[],total:0});await request;assert.deepEqual(store.state(key).data,{items:['new'],total:1});
});
