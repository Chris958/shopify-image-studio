'use client';
import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {Camera,Upload,Plus,Check,Download,Sparkles,Sun,Image as ImageIcon,Save,History} from 'lucide-react';
import type {Doc} from '../../lib/atmos-types';
import {uid,blankSpec,newTask} from '../../lib/atmos-types';
import {COVER_SIZE,defaultCoverStyle,newCoverTask,coverStyle,validateCoverTask,addCoverVersion,coverFilename,type CoverTask,type CoverStyle,type CoverVersion} from '../../lib/product-cover';
import {jsonFetch} from '../../lib/atmos-client';
import {drawProductCover,canvasBlob,createRegionMask} from '../../lib/atmos-render';
import {validateRegions} from '../../lib/atmos-versions';
import {StudioButton as Btn} from './studio-button';
import {ImageVersionPicker,RegionCanvas} from './image-version-controls';

type Props={projectId:string;docs:Doc[];assets:Doc[];busy:string;modelName:string;onSave:(doc:Doc)=>Promise<Doc>;onAsset:(doc:Doc)=>void;onAI:(body:any)=>Promise<any>;checkModel:()=>void;onBusy:(text:string)=>void;notify:(text:string)=>void};
const lightNames={left:'左上方 45°',right:'右上方 45°',top:'顶部柔光'};
export function ProductCoverStudio({projectId,docs,assets,busy,modelName,onSave,onAsset,onAI,checkModel,onBusy,notify}:Props){
 const styleDoc=docs.find(d=>d.project===projectId&&d.kind==='preset'&&d.data.purpose==='product-cover');
 const records=docs.filter(d=>d.project===projectId&&d.kind==='product-cover').sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
 const initial=records[0],record=useRef<Doc|null>(initial||null),lock=useRef(false),upload=useRef<HTMLInputElement>(null);
 const [task,setTask]=useState<CoverTask>(()=>initial?.data||newCoverTask(styleDoc?.data.style||defaultCoverStyle));
 const [activity,setActivity]=useState(''),[failure,setFailure]=useState(''),[format,setFormat]=useState('png'),[picker,setPicker]=useState(false);
 const [output,setOutput]=useState<{name:string;url:string}|null>(null);
 useEffect(()=>()=>{if(output)URL.revokeObjectURL(output.url);},[output]);
 useEffect(()=>{setOutput(null);},[task.selectedId]);
 const working=!!activity||!!busy,selected=task.versions.find(v=>v.id===task.selectedId),sources=task.sourceIds.map(id=>assets.find(a=>a.id===id)).filter(Boolean) as Doc[];
 const sourceLocked=task.versions.length>0;
 const available=assets.filter(a=>['image/png','image/jpeg','image/webp'].includes(a.data.type)&&a.data.role!=='generated');
 function patch(value:Partial<CoverTask>){setTask(t=>({...t,...value}));}
 function patchStyle(value:Partial<CoverStyle>){setTask(t=>({...t,style:{...t.style,...value}}));}
 async function persist(next:CoverTask){validateCoverTask(next);const current=record.current;const saved=await onSave({id:current?.id||uid(),kind:'product-cover',project:projectId,data:structuredClone(next),revision:current?.revision});record.current=saved;return saved;}
 async function run(kind:string,label:string,work:()=>Promise<void>){if(lock.current||busy)return;lock.current=true;setActivity(kind);setFailure('');onBusy(label);try{await work();}catch(e){const message=e instanceof Error?e.message:'处理失败';setFailure(message);notify(message);}finally{lock.current=false;setActivity('');onBusy('');}}
 async function fresh(){await run('save','正在保存任务',async()=>{if(task.sourceIds.length)await persist(task);record.current=null;setTask(newCoverTask(styleDoc?.data.style||defaultCoverStyle));setPicker(false);});}
 async function openRecord(doc:Doc){await run('save','正在切换白底图任务',async()=>{if(task.sourceIds.length&&record.current?.id!==doc.id)await persist(task);record.current=doc;setTask(structuredClone(doc.data));setPicker(false);});}
 function toggleSource(id:string){if(working||sourceLocked)return;patch({sourceIds:task.sourceIds.includes(id)?task.sourceIds.filter(x=>x!==id):task.sourceIds.length<5?[...task.sourceIds,id]:task.sourceIds});}
 async function uploadFiles(e:ChangeEvent<HTMLInputElement>){const list=Array.from(e.target.files||[]);e.target.value='';await run('upload','正在上传产品原图',async()=>{if(sourceLocked)throw new Error('更换产品请先新建白底图任务');if(task.sourceIds.length+list.length>5)throw new Error('每个任务最多选择 5 张同一产品的照片');let next=structuredClone(task);for(const file of list){if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请上传 PNG、JPG 或 WebP 产品图');const form=new FormData();form.set('project',projectId);form.set('role','product');form.set('file',file);const res=await jsonFetch('/api/files',{method:'POST',body:form});onAsset(res.doc);next.sourceIds.push(res.doc.id);if(next.name==='未命名产品白底图')next.name=file.name.replace(/\.[^.]+$/,'');setTask(structuredClone(next));}if(list.length)await persist(next);});}
 async function generate(stage:'preview'|'adjust'|'high'){await run(stage,stage==='high'?'正在生成高清白底图':stage==='adjust'?'正在调整白底图':'正在生成白底图预览',async()=>{
  checkModel();if(!task.sourceIds.length)throw new Error('请先上传或选择产品主图');validateCoverTask(task);coverStyle(task.style);
  const base=stage==='preview'?undefined:selected;
  if(stage!=='preview'&&!base)throw new Error('请先选择图片版本');if(stage==='high'&&!base?.approved)throw new Error('请先确认所选预览版本');
  const regions=stage==='adjust'?validateRegions(base?.regions):[];
  if(stage==='adjust'&&!task.adjustment.trim()&&!regions.length)throw new Error('请填写调整要求或框选备注');
  let mask:any=null;if(base&&regions.length){const square={...newTask({...blankSpec(),background:'#ffffff'}),desktop:[1500,1500] as [number,number]};mask=await createRegionMask(square,base,regions,'contain');}
  const saved=await persist(task);const res=await onAI({purpose:'product-cover',taskId:saved.id,stage,approvedVariantId:base?.id,device:'desktop',width:COVER_SIZE,height:COVER_SIZE,regions:mask?.regions,mask:mask?.dataUrl});onAsset(res.result.asset);
  const next=addCoverVersion(task,res.result.url,stage==='high'?'high':'preview',base);setTask(next);await persist(next);notify(stage==='high'?'高清白底图已保存，请核对细节并确认后导出':'已生成独立版本，可继续调整与确认');
 });}
 async function selectVersion(id:string){const v=task.versions.find(v=>v.id===id);if(!v)return;await run('save','正在切换历史版本',async()=>{const next={...task,selectedId:id,style:structuredClone(v.coverStyle)};setTask(next);await persist(next);});}
 async function approve(){if(!selected)return;await run('confirm','正在检查图片',async()=>{await drawProductCover(document.createElement('canvas'),selected.url);const next={...task,versions:task.versions.map(v=>v.id===selected.id?{...v,approved:true}:v),status:selected.stage==='high'?'高清已确认':'预览已确认'};setTask(next);await persist(next);notify('此版本已确认');});}
 async function exportCover(){await run('export','正在输出 1500 × 1500 产品图',async()=>{if(!selected?.approved||selected.stage!=='high')throw new Error('请先生成并确认高清版本');const canvas=document.createElement('canvas');await drawProductCover(canvas,selected.url,COVER_SIZE);const blob=await canvasBlob(canvas,format);const next={...task,status:'已输出',exports:[...task.exports,{versionId:selected.id,format,size:COVER_SIZE,created:new Date().toISOString()}]};await persist(next);setTask(next);setOutput({name:coverFilename(task.name,selected,format),url:URL.createObjectURL(blob)});notify('1500 × 1500 文件已就绪，点击下载链接保存');});}
 async function saveStyle(){await run('style','正在保存统一棚拍规范',async()=>{const style=coverStyle(task.style);await onSave({id:styleDoc?.id||uid(),kind:'preset',project:projectId,revision:styleDoc?.revision,data:{purpose:'product-cover',name:style.name,style}});notify('棚拍规范已保存，新任务将默认沿用');});}
 return <div className="product-cover-studio">
  <div className="cover-intro"><div><span className="hero-label">PRODUCT PHOTOGRAPHY</span><h2>把产品，交给光线。</h2><p>同一棚拍规范，让每个产品封面保持一致。</p></div><div className="cover-specs"><span>纯白背景</span><span>1:1 · 1500 × 1500 px</span><Btn disabled={working} onClick={fresh}><Plus size={15}/>新建白底图任务</Btn></div></div>
  {failure&&<div role="alert" className="cover-error">{failure}<small>已保留现有版本。请检查任务记录与模型用量后，再决定是否重新提交。</small></div>}
  <div className="product-cover-grid">
   <aside className="cover-settings">
    <section className="panel"><div className="panel-title"><h3>产品原图</h3><Camera size={17}/></div><p className="panel-copy">第一张为主图，其余为同一产品的细节参考，最多 5 张。</p>
     <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={uploadFiles}/>
     <Btn primary disabled={working||sourceLocked} loading={activity==='upload'} loadingLabel="上传中…" onClick={()=>upload.current?.click()}><Upload size={15}/>上传产品图</Btn><Btn disabled={working||sourceLocked} onClick={()=>setPicker(!picker)}>从项目素材选择</Btn>
     {picker&&<div className="cover-asset-picker" aria-label="选择同一产品的参考图">{available.length?available.map(a=><button type="button" key={a.id} disabled={working||sourceLocked||(!task.sourceIds.includes(a.id)&&task.sourceIds.length>=5)} aria-pressed={task.sourceIds.includes(a.id)} aria-label={'选择产品图 '+a.data.name} onClick={()=>toggleSource(a.id)}><img src={a.data.url} alt=""/><span>{a.data.name}</span></button>):<p>暂无可选图片，请上传产品图。</p>}</div>}
     {!!sources.length&&<div className="cover-sources">{sources.map((a,i)=><div key={a.id}><img src={a.data.url} alt={a.data.name}/><span>{i===0?'主图':'细节 '+i}</span>{!sourceLocked&&<button disabled={working} type="button" onClick={()=>patch({sourceIds:[a.id,...task.sourceIds.filter(id=>id!==a.id)]})} aria-label={'将 '+a.data.name+' 设为主图'}>设为主图</button>}</div>)}</div>}
     {sourceLocked&&<p className="cover-hint">原图已随历史版本保留；更换产品请新建任务。</p>}
     <label className="field"><span>产品 / 任务名称</span><input maxLength={150} disabled={working} value={task.name} onChange={e=>patch({name:e.target.value})}/></label>
     <label className="field"><span>产品说明</span><textarea rows={3} maxLength={3000} disabled={working} value={task.description} onChange={e=>patch({description:e.target.value})} placeholder="材质、颜色、不可改变的结构与配件；不确定的细节请补充原图。"/></label>
     <Btn disabled={working} loading={activity==='save'} loadingLabel="保存中…" onClick={()=>run('save','正在保存白底图任务',async()=>{await persist(task);notify('白底图任务已保存');})}><Save size={14}/>保存任务</Btn>
    </section>
    <section className="panel"><div className="panel-title"><h3>统一棚拍规范</h3><Sun size={17}/></div>
     <label className="field"><span>规范名称</span><input maxLength={80} disabled={working} value={task.style.name} onChange={e=>patchStyle({name:e.target.value})}/></label>
     <label className="field"><span>主光方向</span><select aria-label="主光方向" disabled={working} value={task.style.light} onChange={e=>patchStyle({light:e.target.value as CoverStyle['light']})}>{Object.entries(lightNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <label className="field"><span>投影质感</span><select aria-label="投影质感" disabled={working} value={task.style.shadow} onChange={e=>patchStyle({shadow:e.target.value as CoverStyle['shadow']})}><option value="defined">清晰接触阴影 + 自然投影</option><option value="soft">柔和短投影</option></select></label>
     <label className="field"><span>主体占比 · {task.style.fill}%</span><input aria-label="主体占比" type="range" min={60} max={90} disabled={working} value={task.style.fill} onChange={e=>patchStyle({fill:Number(e.target.value)})}/></label>
     <label className="field"><span>补充棚拍要求</span><textarea rows={2} maxLength={1000} disabled={working} value={task.style.notes} onChange={e=>patchStyle({notes:e.target.value})} placeholder="例如：突出织物纹理，控制金属反光。"/></label>
     <div className="cover-rule"><Check size={14}/>纯白背景 · 完整主体 · 保留原图角度<br/>真实材质与 Logo · 不添加营销文案</div>
     <Btn disabled={working} loading={activity==='style'} loadingLabel="保存规范中…" onClick={saveStyle}>保存为项目默认规范</Btn><p className="cover-hint">新任务默认沿用；每个图片版本单独保留当时的棚拍规范。</p>
    </section>
   </aside>
   <div className="cover-workarea">
    <section className="panel cover-preview-panel"><div className="panel-title"><div><h3>{selected?'产品白底图 · v'+selected.revision:'产品封面预览'}</h3><p className="cover-hint">低清预览 → 调整 → 确认 → 高清增强 → 确认并导出</p></div><span className="tag green">{task.status}</span></div>
     {selected?<><RegionCanvas variant={selected} deviceLabel="白底图" disabled={working} onRegions={regions=>patch({versions:task.versions.map(v=>v.id===selected.id?{...v,regions}:v)})}><div className="cover-image"><img src={selected.url} alt={task.name+' · v'+selected.revision}/></div></RegionCanvas><div className="cover-version-meta"><span>{selected.stage==='high'?'高清版本':'低清预览'} · {selected.coverStyle.name}</span><span>{selected.approved?'已确认':'待确认'}</span></div><ImageVersionPicker current={selected} versions={task.versions} deviceLabel="白底图" disabled={working} onSelect={selectVersion}/></>:<div className="cover-empty"><Camera size={46}/><h3>从一张产品原图开始</h3><p>生成精致白底、真实投影和立体光感的产品封面。</p><span>1:1 · 最终输出 1500 × 1500 px</span></div>}
     <div className="cover-primary-actions"><Btn primary disabled={working||!task.sourceIds.length} loading={activity==='preview'} loadingLabel="白底图生成中…" onClick={()=>generate('preview')}><Sparkles size={15}/>{task.versions.length?'重新生成预览':'生成低清预览'}</Btn><Btn disabled={working||!selected||selected.approved} loading={activity==='confirm'} loadingLabel="确认中…" onClick={approve}><Check size={15}/>{selected?.approved?'此版本已确认':'确认此版本'}</Btn><Btn disabled={working||!selected?.approved} loading={activity==='high'} loadingLabel="高清生成中…" onClick={()=>generate('high')}><ImageIcon size={15}/>生成高清版本</Btn></div>
     <p className="cover-hint">使用模型：{modelName||'尚未配置'}。每次提交生成一张图；请核对产品结构、Logo、材质与投影后确认。</p>
    </section>
    <div className="cover-bottom-grid"><section className="panel"><div className="panel-title"><h3>调整这张白底图</h3><Sparkles size={16}/></div><label className="field"><span>调整要求</span><textarea rows={4} maxLength={3000} disabled={working||!selected} value={task.adjustment} onChange={e=>patch({adjustment:e.target.value})} placeholder="例如：保留产品形状和颜色，让底部投影更清晰，增强面料纹理。也可在图上框选并填写备注。"/></label><Btn primary disabled={working||!selected} loading={activity==='adjust'} loadingLabel="白底图调整中…" onClick={()=>generate('adjust')}>调整所选版本</Btn><p className="cover-hint">调整会新增版本，原图与旧版保留。局部修改需要模型支持蒙版编辑。</p></section>
     <section className="panel"><div className="panel-title"><h3>封面图输出</h3><Download size={16}/></div><div className="cover-output-size"><b>1500 × 1500</b><span>px · 1:1 · 白色不透明背景</span></div><label className="field"><span>图片格式</span><select aria-label="图片格式" disabled={working} value={format} onChange={e=>setFormat(e.target.value)}><option value="png">PNG · 高质量母版</option><option value="webp">WebP · 网站使用</option><option value="jpg">JPG · 摄影图</option></select></label><Btn primary disabled={working||!selected?.approved||selected.stage!=='high'} loading={activity==='export'} loadingLabel="输出高清文件中…" onClick={exportCover}><Download size={15}/>输出 1500 × 1500 图片</Btn>{output&&<a className="btn cover-download-link" href={output.url} download={output.name}><Download size={15}/>下载文件 · {output.name}</a>}<p className="cover-hint">生成高清版本、确认细节后即可下载。最终文件尺寸固定，不随模型原生尺寸改变。</p></section></div>
    <section className="panel"><div className="panel-title"><h3>白底图任务历史</h3><History size={17}/></div>{records.length?<div className="cover-task-list">{records.map(d=><button type="button" key={d.id} disabled={working} aria-pressed={record.current?.id===d.id} onClick={()=>openRecord(d)}><b>{d.data.name}</b><span>{d.data.versions?.length||0} 个版本 · {d.data.status}</span><small>{d.updated?.slice(0,16).replace('T',' ')}</small></button>)}</div>:<p className="panel-copy">生成前自动保存需求，完成后保存图片版本。任务也可手动保存。</p>}</section>
   </div>
  </div>
 </div>;
}
