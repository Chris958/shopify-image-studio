import {uid,type Task,type Variant,type Device,type RegionNote} from './atmos-types';

function fingerprint(v:Variant){let n=2166136261;for(const c of JSON.stringify(v)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(36);}
/** Preserve old same-ID revision snapshots while migrating the original history. */
export function allImageVersions(task:Task):Variant[]{
 const active=new Map(task.variants.map(v=>[v.id,v])),result=new Map<string,Variant>();
 for(const v of task.imageVersions||[])if(v?.id&&v.url)result.set(v.id,v);
 for(const v of task.history||[]){
  if(!v?.id||!v.url)continue;
  const current=active.get(v.id)||result.get(v.id);
  const id=current&&JSON.stringify(current)!==JSON.stringify(v)?`${v.id}~${v.revision}-${fingerprint(v)}`:v.id;
  if(!result.has(id))result.set(id,{...v,id});
 }
 for(const v of task.variants)if(v.url)result.set(v.id,v);
 return [...result.values()];
}
export function versionsFor(task:Task,device:Device,group:number){return allImageVersions(task).filter(v=>v.device===device&&v.group===group).sort((a,b)=>a.revision-b.revision||(a.created||'').localeCompare(b.created||''));}
export function recordImageVersion(task:Task,variant:Variant):Task{
 const ledger=allImageVersions(task).filter(v=>v.id!==variant.id);
 return {...task,variants:[...task.variants.filter(v=>!(v.device===variant.device&&v.group===variant.group)),variant],imageVersions:[...ledger,variant],history:[]};
}
export function selectImageVersion(task:Task,device:Device,group:number,id:string):Task{
 const variant=versionsFor(task,device,group).find(v=>v.id===id);
 if(!variant)throw new Error('这个版本不属于当前设备与方案');
 return recordImageVersion(task,structuredClone(variant));
}
export function nextRevision(task:Task,device:Device,group:number){return Math.max(0,...versionsFor(task,device,group).map(v=>v.revision))+1;}
export function editCanvasVersion(task:Task,id:string,changes:Partial<Variant>):Task{
 const current=task.variants.find(v=>v.id===id);if(!current)return task;
 // Coalesce an unconfirmed canvas draft so dragging a slider does not create hundreds of versions.
 const draft=current.label==='画布调整'&&!current.approved;
 const variant={...current,...changes,id:draft?current.id:uid(),parentId:draft?current.parentId:current.id,revision:draft?current.revision:nextRevision(task,current.device,current.group),created:draft?current.created:new Date().toISOString(),label:'画布调整',approved:false};
 return recordImageVersion(task,variant);
}
export function selectedForExport(task:Task,group:number,devices:Device[]){
 const targets=[...new Set(devices)];if(!targets.length||targets.some(d=>!task.devices.includes(d)))throw new Error('请选择有效的输出设备');
 return targets.map(d=>{const v=task.variants.find(v=>v.device===d&&v.group===group);if(!v?.approved)throw new Error('请先确认'+(d==='desktop'?'电脑端':'手机端')+'所选版本');return v;});
}
export function validateRegions(value:unknown):RegionNote[]{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>8)throw new Error('每张图片最多添加 8 个框选区域');
 return value.map((r:any)=>{if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1.001||r.y+r.height>1.001||typeof r.note!=='string'||!r.note.trim()||r.note.length>1000)throw new Error('请检查框选范围，并为每个区域填写调整备注');return {id:String(r.id||''),x:r.x,y:r.y,width:r.width,height:r.height,note:r.note.trim()};});
}
export function regionToSource(r:Pick<RegionNote,'x'|'y'|'width'|'height'>,target:[number,number],source:[number,number],focus:[number,number],fit:'cover'|'contain'='cover'){
 const [tw,th]=target,[sw,sh]=source,scale=(fit==='contain'?Math.min:Math.max)(tw/sw,th/sh),ox=(tw-sw*scale)*focus[0]/100,oy=(th-sh*scale)*focus[1]/100;
 const x=Math.max(0,(r.x*tw-ox)/scale),y=Math.max(0,(r.y*th-oy)/scale),right=Math.min(sw,((r.x+r.width)*tw-ox)/scale),bottom=Math.min(sh,((r.y+r.height)*th-oy)/scale);
 return {x:Math.floor(x),y:Math.floor(y),width:Math.max(0,Math.ceil(right)-Math.floor(x)),height:Math.max(0,Math.ceil(bottom)-Math.floor(y))};
}

export type ImageTarget={device:Device;group:number;base?:Variant;instruction:string;regions:RegionNote[];mask?:string;sourceRegions?:RegionNote[]};
export function imageTargets(task:Task,group:number,stage:string,single?:Variant,devices?:Device[]):ImageTarget[]{
 const targets:ImageTarget[]=devices?[...new Set(devices)].map(device=>{if(!task.devices.includes(device))throw new Error('请选择有效的调整设备');const base=task.variants.find(v=>v.device===device&&v.group===group);if(!base)throw new Error((device==='desktop'?'电脑端':'手机端')+'尚未生成图片');return {device,group,base,instruction:stage==='high'?task.brief:task.editInstructions?.[device]?.trim()||'',regions:stage==='high'?[]:validateRegions(base.regions)};}):single?[{device:single.device,group:single.group,base:single.url?single:undefined,instruction:stage==='high'?task.brief:single.url?task.editInstructions?.[single.device]?.trim()||'':task.brief,regions:stage==='high'?[]:validateRegions(single.regions)}]:Array.from({length:task.groups},(_,g)=>task.devices.map(device=>({device,group:g,instruction:task.brief,regions:[]}))).flat();
 if(!targets.length)throw new Error('请选择至少一个设备');
 for(const target of targets){if(stage==='high'&&!target.base?.approved)throw new Error('请先确认'+(target.device==='desktop'?'电脑端':'手机端')+'所选版本');if(stage==='preview'&&target.base&&!target.instruction&&!target.regions.length)throw new Error('请填写'+(target.device==='desktop'?'电脑端':'手机端')+'调整指令或区域备注');}
 return targets;
}
export function duplicateImageTask(task:Task):Task{
 const versions=allImageVersions(task),ids=new Map(versions.map(v=>[v.id,uid()]));
 const ledger=versions.map(v=>({...structuredClone(v),id:ids.get(v.id)!,parentId:v.parentId?ids.get(v.parentId):undefined,approved:false}));
 return {...structuredClone(task),name:task.name+' · 副本',variants:task.variants.map(v=>ledger.find(a=>a.id===ids.get(v.id))||{...v,id:uid(),approved:false}),imageVersions:ledger,history:[],exports:[],status:'草稿'};
}
