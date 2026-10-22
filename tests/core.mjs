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
// Device-specific image histories, legacy migration, branching and independent export.
const versions=await moduleFor(path.resolve('lib/atmos-versions.ts'));await versions.evaluate();
const baseVariant={id:'desktop-v1',device:'desktop',group:0,url:valid.result.url,source:'api',label:'AI 生成',layers:[],approved:true,revision:1,created:'2026-01-01',focusX:50,focusY:50,overlay:0};
const phone={...baseVariant,id:'mobile-v1',device:'mobile',approved:false};
let timeline={...repaired,variants:[baseVariant,phone],imageVersions:[],history:[],editInstructions:{desktop:'Make the background brighter',mobile:'Move the product lower'}};
const desktop2={...baseVariant,id:'desktop-v2',revision:2,approved:false,parentId:baseVariant.id};
timeline=versions.namespace.recordImageVersion(timeline,desktop2);
assert.equal(versions.namespace.versionsFor(timeline,'desktop',0).length,2);assert.equal(timeline.variants.find(v=>v.device==='mobile').id,phone.id);
timeline=versions.namespace.selectImageVersion(timeline,'desktop',0,baseVariant.id);
assert.equal(versions.namespace.selectedForExport(timeline,0,['desktop'])[0].id,baseVariant.id);
assert.throws(()=>versions.namespace.selectedForExport(timeline,0,['mobile']),/手机端/);
assert.throws(()=>versions.namespace.selectImageVersion(timeline,'mobile',0,desktop2.id),/不属于/);
const requests=versions.namespace.imageTargets(timeline,0,'preview',undefined,['desktop','mobile']);
assert.equal(requests.length,2);assert.equal(requests[0].base.id,baseVariant.id);assert.equal(requests[0].instruction,timeline.editInstructions.desktop);assert.equal(requests[1].instruction,timeline.editInstructions.mobile);
assert.equal(versions.namespace.imageTargets(timeline,0,'high',undefined,['desktop']).length,1);
assert.throws(()=>versions.namespace.imageTargets(timeline,0,'high',undefined,['desktop','mobile']),/手机端/);
const brokenNotes={...timeline,variants:timeline.variants.map(v=>v.device==='mobile'?{...v,regions:[{id:'empty',x:.1,y:.1,width:.2,height:.2,note:''}]}:v)};
assert.throws(()=>versions.namespace.imageTargets(brokenNotes,0,'preview',undefined,['desktop','mobile']),/备注/);
assert.equal(versions.namespace.nextRevision(timeline,'desktop',0),3);
const edited=versions.namespace.editCanvasVersion(timeline,baseVariant.id,{overlay:.25});
assert.notEqual(edited.variants.find(v=>v.device==='desktop').id,baseVariant.id);assert.equal(versions.namespace.versionsFor(edited,'desktop',0).find(v=>v.id===baseVariant.id).overlay,0);
const draft=edited.variants.find(v=>v.device==='desktop'),editedAgain=versions.namespace.editCanvasVersion(edited,draft.id,{overlay:.35});
assert.equal(versions.namespace.versionsFor(editedAgain,'desktop',0).length,3,'coalesce an unconfirmed canvas draft');
let many=timeline;for(let i=3;i<=45;i++)many=versions.namespace.recordImageVersion(many,{...baseVariant,id:'desktop-v'+i,revision:i,approved:false});
assert.equal(versions.namespace.versionsFor(many,'desktop',0).length,45,'history must not truncate at 30');
assert.equal(versions.namespace.versionsFor(JSON.parse(JSON.stringify(many)),'desktop',0).length,45);
const legacy={...timeline,imageVersions:[],variants:[{...baseVariant,revision:2}],history:[{...baseVariant,revision:1}]};
const migrated=versions.namespace.versionsFor(legacy,'desktop',0);assert.equal(migrated.length,2);assert.notEqual(migrated[0].id,migrated[1].id);
const duplicate=versions.namespace.duplicateImageTask(timeline);assert.equal(versions.namespace.allImageVersions(duplicate).length,3);assert.ok(duplicate.variants.every(v=>!v.approved));assert.equal(duplicate.exports.length,0);
const region={id:'one',x:.1,y:.2,width:.3,height:.4,note:'Remove the small prop'};
assert.equal(versions.namespace.validateRegions([region])[0].note,region.note);assert.throws(()=>versions.namespace.validateRegions([{...region,x:.9}]),/框选/);
assert.equal(JSON.stringify(versions.namespace.regionToSource({x:0,y:0,width:1,height:1},[1920,720],[1536,1024],[50,50])),JSON.stringify({x:0,y:224,width:1536,height:576}));
// A real streamed edit request sends the selected original first and attaches the PNG mask.
const png=new Uint8Array(await (await BUCKET.get(valid.result.asset.data.key)).arrayBuffer()),mask='data:image/png;base64,'+Buffer.from(png).toString('base64');
let editCalls=0;
upstreamFetch=async(url,options)=>{editCalls++;assert.ok(url.endsWith('/images/edits'));assert.ok(options.body instanceof FormData);assert.ok((options.body.get('prompt')).includes(region.note));assert.ok(options.body.get('mask') instanceof Blob);assert.equal(Buffer.from(await options.body.getAll('image[]')[0].arrayBuffer()).toString('base64'),Buffer.from(png).toString('base64'));return Response.json({data:[{b64_json:Buffer.from(png).toString('base64')}]});};
const local=await requestImage(repaired,{variantUrl:valid.result.url,regions:[region],mask});assert.equal(local.type,'result');assert.equal(editCalls,1);
const invalidMask=await requestImage(repaired,{variantUrl:valid.result.url,regions:[region],mask:'data:image/png;base64,bm90LXBuZw=='});assert.equal(invalidMask.type,'error');assert.equal(editCalls,1);
const noMask=await requestImage(repaired,{variantUrl:valid.result.url,regions:[region]});assert.equal(noMask.type,'error');assert.equal(editCalls,1);
// Desktop enhancement works while the phone remains unconfirmed.
const highTaskId=crypto.randomUUID();await server.namespace.writeDoc({id:highTaskId,kind:'task',project:pid,data:timeline},'qa-owner');
upstreamFetch=async(url,options)=>{editCalls++;assert.equal(options.body.get('quality'),'high');assert.equal(options.body.get('mask'),null);return Response.json({data:[{b64_json:Buffer.from(png).toString('base64')}]});};
const high=await requestImage(timeline,{stage:'high',taskId:highTaskId,approvedVariantId:baseVariant.id,variantUrl:valid.result.url});assert.equal(high.type,'result');assert.equal(editCalls,2);
const wrongDevice=await requestImage(timeline,{stage:'high',device:'mobile',taskId:highTaskId,approvedVariantId:baseVariant.id,variantUrl:valid.result.url});assert.equal(wrongDevice.type,'error');assert.equal(editCalls,2);
// Product covers use their own saved recipe and require real product references, not an atmosphere spec.
const cover=await moduleFor(path.resolve('lib/product-cover.ts'));await cover.evaluate();
const recipe=structuredClone(cover.namespace.defaultCoverStyle);let coverTask=cover.namespace.newCoverTask(recipe);
assert.equal(cover.namespace.coverNativeSize('gpt-image-2','high'),'1536x1536');assert.equal(cover.namespace.coverNativeSize('gpt-image-1','high'),'1024x1024');
assert.throws(()=>cover.namespace.coverStyle({...recipe,fill:99}));
const originalId=crypto.randomUUID(),originalKey='qa-owner/'+pid+'/'+originalId;await BUCKET.put(originalKey,png);
await server.namespace.writeDoc({id:originalId,kind:'asset',project:pid,data:{name:'actual-product.png',type:'image/png',ext:'png',role:'product',key:originalKey,url:'/api/files/'+originalId}},'qa-owner');
coverTask={...coverTask,name:'Product / A',description:'Keep original woven texture.',sourceIds:[originalId]};
const coverId=crypto.randomUUID();
async function saveCover(task){const r=await data.namespace.PUT(request('PUT',{doc:{id:coverId,kind:'product-cover',project:pid,data:task}}));assert.equal(r.status,200,await r.clone().text());}
async function requestCover(extra={}){const r=await ai.namespace.POST(new Request('https://atmos.example/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://atmos.example'},body:JSON.stringify({action:'image',purpose:'product-cover',project:pid,taskId:coverId,stage:'preview',profile:{baseUrl:'https://api.openai.com/v1',model:'gpt-image-2',size:'1536x1024',quality:'high',endpoint:'images'},apiKey:'dummy-key',...extra})}));assert.equal(r.status,200,await r.clone().text());return (await r.text()).trim().split('\n').map(l=>JSON.parse(l)).at(-1);}
await saveCover(coverTask);let coverCalls=0,coverMode='preview';
upstreamFetch=async(url,options)=>{coverCalls++;assert.ok(url.endsWith('/images/edits'));const f=options.body;assert.ok(f instanceof FormData);assert.equal(f.get('size'),coverMode==='high'?'1536x1536':'1024x1024');assert.equal(f.get('quality'),coverMode==='high'?'high':'low');const prompt=f.get('prompt');assert.match(prompt,/pure WHITE #FFFFFF/);assert.match(prompt,/Keep original woven texture/);assert.match(prompt,/contact shadow/);assert.doesNotMatch(prompt,/atmosphere image|FORGED INPUT/);assert.equal(f.getAll('image[]').length,coverMode==='preview'?1:2);return Response.json({data:[{b64_json:Buffer.from(png).toString('base64')}]});};
const coverPreview=await requestCover({prompt:'FORGED INPUT',task:{spec:{tone:'FORGED INPUT'}}});assert.equal(coverPreview.type,'result',coverPreview.error);assert.equal(coverCalls,1);
coverTask=cover.namespace.addCoverVersion(coverTask,coverPreview.result.url,'preview');const firstCover=coverTask.versions[0];await saveCover(coverTask);
let event=await requestCover({stage:'high',approvedVariantId:firstCover.id,task:{versions:[{...firstCover,approved:true}]}});assert.equal(event.type,'error');assert.equal(coverCalls,1,'body cannot bypass saved confirmation');
coverTask={...coverTask,versions:[{...firstCover,approved:true}],style:{...recipe,light:'right'}};await saveCover(coverTask);coverMode='high';
event=await requestCover({stage:'high',approvedVariantId:firstCover.id,variantUrl:'https://untrusted.invalid/image.png'});assert.equal(event.type,'result',event.error);assert.equal(coverCalls,2);
assert.match(cover.namespace.coverPrompt(coverTask,'high',firstCover),/upper left/,'enhancement must preserve the selected version recipe');
let history=cover.namespace.addCoverVersion(coverTask,event.result.url,'high',coverTask.versions[0]);assert.equal(history.versions.length,2);assert.equal(history.versions[1].approved,false);assert.equal(history.versions[1].parentId,firstCover.id);assert.equal(history.versions[1].coverStyle.light,'left');assert.equal(cover.namespace.coverFilename(history.name,history.versions[1],'png'),'Product _ A_white-cover_1500x1500_v2.png');
coverMode='adjust';coverTask={...coverTask,adjustment:'Make the contact shadow clearer.'};await saveCover(coverTask);event=await requestCover({stage:'adjust',approvedVariantId:firstCover.id});assert.equal(event.type,'result',event.error);assert.equal(coverCalls,3);
await saveCover({...coverTask,sourceIds:[]});event=await requestCover();assert.equal(event.type,'error');assert.equal(coverCalls,3,'missing product must not trigger a billed text-to-image call');
const otherSource=crypto.randomUUID(),otherKey='qa-owner/'+otherProjectId+'/'+otherSource;await BUCKET.put(otherKey,png);await server.namespace.writeDoc({id:otherSource,kind:'asset',project:otherProjectId,data:{name:'foreign.png',type:'image/png',key:otherKey,url:'/api/files/'+otherSource}},'qa-owner');
await saveCover({...coverTask,sourceIds:[otherSource]});event=await requestCover();assert.equal(event.type,'error');assert.equal(coverCalls,3,'a different project source must be rejected');await BUCKET.delete(otherKey);
assert.deepEqual(JSON.parse(JSON.stringify(versions.namespace.regionToSource({x:0,y:.25,width:1,height:.5},[1500,1500],[2000,1000],[50,50],'contain'))),{x:0,y:0,width:2000,height:1000});
upstreamFetch=fetch;
res=await data.namespace.PUT(new Request('https://atmos.example/api/data',{method:'PUT',headers:{Origin:'https://malicious.example','Content-Type':'application/json'},body:JSON.stringify({doc:{id:pid,kind:'project',project:pid,data:{name:'spoof'}}})}));assert.equal(res.status,400);
const render=await moduleFor(path.resolve('lib/atmos-render.ts'));await render.evaluate();assert.equal(render.namespace.crc32(new TextEncoder().encode('123456789')),0xcbf43926);const zip=await render.namespace.zipFiles([{name:'规范.txt',blob:new Blob(['规则'])},{name:'test.json',blob:new Blob(['{"ok":true}'])}]);fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/core-test.zip',Buffer.from(await zip.arrayBuffer()));
res=await data.namespace.DELETE(new Request('https://atmos.example/api/data?id='+pid,{method:'DELETE'}));assert.equal(res.status,200);assert.equal(stored.size,0);
console.log('PASS: owner isolation, auth gate, immutable specs, credential exclusion, asset roundtrip, SSRF URL guard, edge-safe AI requests, redirect rejection, streamed model connection tests, real-project selection and empty defaults, draft-to-published task binding, pinned version restoration, image spec ownership, per-device version history and export, region masks, single-device enhancement, product-cover recipes and source isolation, square quality routing, confirmed cover enhancement, origin guard, ZIP CRC and archive, project deletion cleanup.');
