import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_shallow_thanos.sql','utf8'));
const stored=new Map();let currentUser='qa-owner';
const DB={prepare(query){let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}};}};
const BUCKET={async put(key,value){stored.set(key,new Uint8Array(value));},async get(key){const bytes=stored.get(key);return bytes?{size:bytes.length,body:bytes,async arrayBuffer(){return bytes.buffer;}}:null;},async delete(key){stored.delete(key);}};
let upstreamFetch=fetch;
const ctx=createContext({console,crypto,structuredClone,ReadableStream,Response,Request,URL,Blob,File,FormData,AbortSignal,TextEncoder,TextDecoder,Uint8Array,DataView,ArrayBuffer,Map,Buffer,setInterval,clearInterval,atob,btoa,fetch:(...args)=>upstreamFetch(...args)});
const cache=new Map();
async function moduleFor(file){if(cache.has(file))return cache.get(file);let mod;if(file==='cloudflare:workers')mod=new SyntheticModule(['env'],function(){this.setExport('env',{DB,BUCKET});},{context:ctx});else if(file==='auth')mod=new SyntheticModule(['getChatGPTUser'],function(){this.setExport('getChatGPTUser',async()=>currentUser?{userId:currentUser,email:currentUser+'@example.invalid'}:null);},{context:ctx});else {const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;mod=new SourceTextModule(source,{context:ctx,identifier:file});}cache.set(file,mod);await mod.link(async(spec,ref)=>{if(spec==='cloudflare:workers')return moduleFor(spec);if(spec.endsWith('/chatgpt-auth'))return moduleFor('auth');let f=path.resolve(path.dirname(ref.identifier),spec);if(!path.extname(f))f+='.ts';return moduleFor(f);});return mod;}
const server=await moduleFor(path.resolve('lib/atmos-server.ts'));await server.evaluate();const data=await moduleFor(path.resolve('app/api/data/route.ts'));await data.evaluate();const upload=await moduleFor(path.resolve('app/api/files/route.ts'));await upload.evaluate();const files=await moduleFor(path.resolve('app/api/files/[id]/route.ts'));await files.evaluate();
const request=(method,body)=>new Request('https://atmos.example/api/data',{method,headers:{'Content-Type':'application/json','Origin':'https://atmos.example'},body:body?JSON.stringify(body):undefined});
let res;currentUser=null;res=await data.namespace.GET();assert.equal(res.status,401);currentUser='qa-owner';
const pid=crypto.randomUUID(),sid=crypto.randomUUID();res=await data.namespace.PUT(request('PUT',{doc:{id:pid,kind:'project',project:pid,data:{name:'QA Project'}}}));assert.equal(res.status,200,await res.clone().text());
const spec={version:1,status:'published',tone:'natural',composition:'left title',forbidden:'no distortion'};res=await data.namespace.PUT(request('PUT',{doc:{id:sid,kind:'spec',project:pid,data:spec}}));assert.equal(res.status,200);res=await data.namespace.PUT(request('PUT',{doc:{id:sid,kind:'spec',project:pid,data:{...spec,tone:'changed'}}}));assert.equal(res.status,400);
currentUser='other-owner';res=await data.namespace.GET();assert.equal((await res.json()).docs.length,0);res=await files.namespace.GET(new Request('https://atmos.example/api/files/'+sid),{params:{id:sid}});assert.equal(res.status,404);currentUser='qa-owner';
res=await data.namespace.PUT(request('PUT',{doc:{id:crypto.randomUUID(),kind:'task',project:pid,data:{apiKey:'dummy-never-a-real-key'}}}));assert.equal(res.status,400);
const f=new FormData();f.append('project',pid);f.append('file',new File(['test text'],'brand.txt',{type:'text/plain'}));f.append('role','document');res=await upload.namespace.POST(new Request('https://atmos.example/api/files',{method:'POST',body:f}));assert.equal(res.status,200,await res.clone().text());const asset=(await res.json()).doc;res=await files.namespace.GET(new Request('https://atmos.example/api/files/'+asset.id),{params:{id:asset.id}});assert.equal(res.status,200);assert.equal(await res.text(),'test text');
for(const url of ['http://api.example.com','https://127.0.0.1','https://[::1]','https://metadata.google.internal','https://localhost','https://api.example.com:123'])assert.throws(()=>server.namespace.safeBase(url));assert.equal(server.namespace.safeBase('https://api.openai.com/v1/'),'https://api.openai.com/v1');
// Reproduce Workers' unsupported redirect mode and exercise every AI transport.
const calls=[];let upstreamStatus=200;
upstreamFetch=async(url,options)=>{
 if(options.redirect==='error')throw new TypeError('Invalid redirect value');
 assert.equal(options.redirect,'manual');calls.push({url,options});
 return new Response(JSON.stringify({ok:true}),{status:upstreamStatus,headers:{Location:'https://other-provider.example/collect'}});
};
const imageForm=new FormData();imageForm.set('model','qa-model');
for(const [endpoint,payload] of [['/models',undefined],['/responses',{model:'qa-model'}],['/chat/completions',{model:'qa-model'}],['/images/generations',{model:'qa-model'}],['/images/edits',imageForm]]){
 const response=await server.namespace.apiFetch('https://api.openai.com/v1/',endpoint,'dummy-key',payload);
 assert.equal(response.status,200);const {url,options}=calls.at(-1);
 assert.equal(url,'https://api.openai.com/v1'+endpoint);assert.equal(options.headers.Authorization,'Bearer dummy-key');assert.equal(options.method,payload?'POST':'GET');
 if(payload===imageForm){assert.equal(options.body,imageForm);assert.equal(options.headers['Content-Type'],undefined);}
}
for(const status of [301,302,303,307,308]){
 upstreamStatus=status;const before=calls.length;
 await assert.rejects(()=>server.namespace.apiFetch('https://api.openai.com/v1','/models','dummy-key'),error=>error.message.includes('HTTP '+status)&&error.message.includes('Base URL')&&!error.message.includes('other-provider'));
 assert.equal(calls.length,before+1,'redirects must not cause a second upstream request');
}
upstreamStatus=401;res=await server.namespace.apiFetch('https://api.openai.com/v1','/models','dummy-key');assert.equal(res.status,401);await assert.rejects(()=>server.namespace.checkedJson(res),/HTTP 401/);
// Verify the actual streamed connection-test route for all supported interfaces.
const ai=await moduleFor(path.resolve('app/api/ai/route.ts'));await ai.evaluate();
for(const endpoint of ['images','responses','chat']){
 for(const redirected of [false,true]){
  let count=0;
  upstreamFetch=async(url,options)=>{
   count++;assert.equal(options.redirect,'manual');
   if(redirected)return new Response(null,{status:307,headers:{Location:'https://other-provider.example/collect'}});
   assert.ok(url.endsWith(endpoint==='images'?'/models':endpoint==='chat'?'/chat/completions':'/responses'));
   return Response.json(endpoint==='images'?{data:[{id:'qa-model'}]}:endpoint==='chat'?{choices:[{message:{content:'{"ok":true}'}}]}:{output_text:'{"ok":true}'});
  };
  res=await ai.namespace.POST(new Request('https://atmos.example/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://atmos.example'},body:JSON.stringify({action:'test',profile:{baseUrl:'https://api.openai.com/v1',model:'qa-model',endpoint},apiKey:'dummy-key'})}));
  assert.equal(res.status,200,await res.clone().text());const events=(await res.text()).trim().split('\n').map(line=>JSON.parse(line));assert.equal(count,1);
  const terminal=events.at(-1);assert.equal(terminal.type,redirected?'error':'result');
  const job=await server.namespace.readDoc(events[0].jobId,'qa-owner');assert.equal(job.data.status,redirected?'failed':'succeeded');
  if(redirected)assert.match(terminal.error,/HTTP 307.*Base URL/);else assert.equal(endpoint==='images'?terminal.result.reachable:terminal.result.ok,true);
 }
}
// Reproduce: a task saved before publication keeps its draft snapshot on reload.
const types=await moduleFor(path.resolve('lib/atmos-types.ts'));await types.evaluate();
const taskSpecs=await moduleFor(path.resolve('lib/atmos-task-spec.ts'));await taskSpecs.evaluate();
const noProject=types.namespace.resolveProjectId([],'sample');assert.equal(noProject,'');
const projectChoices=[{id:'sample',kind:'project',data:{name:'Old built-in'}},{id:'demo-marker',kind:'project',data:{sample:true}},{id:'real-brand',kind:'project',data:{name:'YASTEE'}},{id:'second-brand',kind:'project',data:{name:'Other'}}];
assert.equal(types.namespace.brandProjects(projectChoices).length,2);
assert.equal(types.namespace.resolveProjectId(projectChoices,'sample'),'real-brand');
assert.equal(types.namespace.resolveProjectId(projectChoices,'second-brand'),'second-brand');
assert.equal(types.namespace.resolveProjectId(projectChoices.filter(p=>p.id==='sample')),'');
const emptySpec=types.namespace.blankSpec(),emptyTask=types.namespace.newTask(emptySpec);
assert.equal(emptySpec.status,'draft');assert.equal(emptyTask.specId,'');assert.equal(emptyTask.brief,'');assert.equal(emptyTask.title,'');assert.equal(emptyTask.variants.length,0);
const lifecycleSpecId=crypto.randomUUID(),lifecycleTaskId=crypto.randomUUID();
const draftSpec={...types.namespace.blankSpec(),status:'draft',tone:'QA natural brand',composition:'Left title, full product'};
await server.namespace.writeDoc({id:lifecycleSpecId,kind:'spec',project:pid,data:draftSpec},'qa-owner');
const pending={...types.namespace.newTask(draftSpec,''),name:'用户原任务',brief:'保留用户创意要求',title:'Keep my exact copy',desktop:[1600,600],assets:[asset.id]};
await server.namespace.writeDoc({id:lifecycleTaskId,kind:'task',project:pid,data:pending},'qa-owner');
assert.equal(taskSpecs.namespace.syncPendingTaskSpec(pending),pending);
res=await data.namespace.PUT(request('PUT',{doc:{id:lifecycleSpecId,kind:'spec',project:pid,data:{...draftSpec,status:'published'},revision:1}}));assert.equal(res.status,200,await res.clone().text());const publishedDoc=(await res.json()).doc;
const stale=(await server.namespace.readDoc(lifecycleTaskId,'qa-owner')).data;
assert.equal(stale.spec.status,'draft');assert.equal(stale.specId,'');
const repaired=taskSpecs.namespace.syncPendingTaskSpec(stale,publishedDoc);
assert.equal(repaired.spec.status,'published');assert.equal(repaired.specId,lifecycleSpecId);
for(const field of ['name','brief','title','desktop','assets'])assert.equal(JSON.stringify(repaired[field]),JSON.stringify(pending[field]));
assert.equal(stale.spec.status,'draft');assert.notEqual(repaired.spec,publishedDoc.data);
assert.equal(taskSpecs.namespace.syncPendingTaskSpec(repaired,publishedDoc),repaired,'binding must be idempotent');
await server.namespace.writeDoc({id:lifecycleTaskId,kind:'task',project:pid,data:repaired},'qa-owner');
assert.equal((await server.namespace.readDoc(lifecycleTaskId,'qa-owner')).data.specId,lifecycleSpecId);
const newer=await server.namespace.writeDoc({id:crypto.randomUUID(),kind:'spec',project:pid,data:{...publishedDoc.data,version:2,tone:'new version'}},'qa-owner');
assert.equal(taskSpecs.namespace.syncPendingTaskSpec(repaired,newer),repaired,'published task must stay pinned to v1');
const withOutputs={...pending,variants:[{id:'existing-preview',approved:true}],exports:[{file:'keep.png'}],history:[{id:'previous-preview'}]};
assert.equal(taskSpecs.namespace.syncPendingTaskSpec(withOutputs,publishedDoc),withOutputs,'existing visuals require an explicit version choice');
const copy=taskSpecs.namespace.copyTaskForSpec(withOutputs,newer);
assert.equal(copy.specId,newer.id);assert.equal(copy.title,pending.title);assert.equal(copy.variants.length,0);assert.equal(copy.exports.length,0);assert.equal(copy.history.length,0);
assert.equal(withOutputs.variants[0].approved,true);assert.equal(withOutputs.exports.length,1);
assert.throws(()=>taskSpecs.namespace.bindTaskSpec(pending,{...publishedDoc,data:draftSpec}),/已发布/);
// The image API checks the persisted published reference before any paid request.
const otherProjectId=crypto.randomUUID();await server.namespace.writeDoc({id:otherProjectId,kind:'project',project:otherProjectId,data:{name:'Other project'}},'qa-owner');
const foreign=await server.namespace.writeDoc({id:crypto.randomUUID(),kind:'spec',project:otherProjectId,data:{...publishedDoc.data}},'qa-owner');
const stillDraft=await server.namespace.writeDoc({id:crypto.randomUUID(),kind:'spec',project:pid,data:draftSpec},'qa-owner');
let imageCalls=0;
upstreamFetch=async(url,options)=>{
 imageCalls++;const payload=JSON.parse(options.body);assert.ok(payload.prompt.includes('QA natural brand'));assert.ok(!payload.prompt.includes('FORGED BRAND'));
 return Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2cS0AAAAASUVORK5CYII='}]});
};
async function requestImage(task,extra={}){
 const response=await ai.namespace.POST(new Request('https://atmos.example/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://atmos.example'},body:JSON.stringify({action:'image',project:pid,profile:{baseUrl:'https://api.openai.com/v1',model:'qa-image',endpoint:'images'},apiKey:'dummy-key',task,device:'desktop',width:1600,height:600,...extra})}));
 assert.equal(response.status,200,await response.clone().text());return (await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1);
}
for(const specId of ['',stillDraft.id,foreign.id]){
 const event=await requestImage({...repaired,specId});assert.equal(event.type,'error');assert.match(event.error,/规范未发布或不属于当前项目/);assert.equal(imageCalls,0);
}
const valid=await requestImage({...repaired,spec:{...repaired.spec,tone:'FORGED BRAND'}});
assert.equal(valid.type,'result');assert.equal(imageCalls,1);assert.equal(valid.result.asset.project,pid);
const mismatchedHigh=await requestImage({...repaired,specId:newer.id},{stage:'high',taskId:lifecycleTaskId,approvedVariantId:'missing'});
assert.equal(mismatchedHigh.type,'error');assert.equal(imageCalls,1);
upstreamFetch=fetch;
res=await data.namespace.PUT(new Request('https://atmos.example/api/data',{method:'PUT',headers:{Origin:'https://malicious.example','Content-Type':'application/json'},body:JSON.stringify({doc:{id:pid,kind:'project',project:pid,data:{name:'spoof'}}})}));assert.equal(res.status,400);
const render=await moduleFor(path.resolve('lib/atmos-render.ts'));await render.evaluate();assert.equal(render.namespace.crc32(new TextEncoder().encode('123456789')),0xcbf43926);const zip=await render.namespace.zipFiles([{name:'规范.txt',blob:new Blob(['规则'])},{name:'test.json',blob:new Blob(['{"ok":true}'])}]);fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/core-test.zip',Buffer.from(await zip.arrayBuffer()));
res=await data.namespace.DELETE(new Request('https://atmos.example/api/data?id='+pid,{method:'DELETE'}));assert.equal(res.status,200);assert.equal(stored.size,0);
console.log('PASS: owner isolation, auth gate, immutable specs, credential exclusion, asset roundtrip, SSRF URL guard, edge-safe AI requests, redirect rejection, streamed model connection tests, real-project selection and empty defaults, draft-to-published task binding, pinned version restoration, image spec ownership, origin guard, ZIP CRC and archive, project deletion cleanup.');
