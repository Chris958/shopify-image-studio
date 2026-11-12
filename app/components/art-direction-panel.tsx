'use client';
import type {Task,Device} from '../../lib/atmos-types';
import {anchors,createArtDirection,currentArtDirection,moduleDirection,type ArtDirection,type DesignReview} from '../../lib/art-direction';
import {StudioButton as Btn} from './studio-button';

export function ArtDirectionPanel({task,disabled,loading,onChange,onPlan}:{task:Task;disabled:boolean;loading:boolean;onChange:(p:ArtDirection)=>void;onPlan:()=>void}){
 const p=task.artDirection,valid=currentArtDirection(task);
 function edit(change:Partial<ArtDirection>){if(p)onChange({...p,...change,source:'manual'});}
 return <section className="panel direction-panel" aria-label="视觉导演方案">
  <div className="panel-title"><div><h3>视觉导演方案</h3><p className="panel-copy">{moduleDirection(task.module)}</p></div><span className={'tag '+(p&&valid?'green':'amber')}>{p?(valid?'已绑定规范 v'+p.specVersion:'需求已更新 · 待重新规划'):'待规划'}</span></div>
  <div className="button-row"><Btn disabled={disabled} onClick={()=>onChange(createArtDirection(task))}>{p?'按当前需求重新规划':'按品牌规则建立方案'}</Btn><Btn primary disabled={disabled} loading={loading} loadingLabel="正在分析素材与规划…" onClick={onPlan}>AI 分析素材并规划</Btn></div>
  <p className="quiet-note">方案可修改并随任务保存。AI 规划使用现有“文案与构图规划”模型；生成时会保存方案快照。图片中的文案和 Logo 由真实资产合成。</p>
  {p&&<fieldset disabled={disabled} className="direction-fields"><legend className="sr-only">方案内容</legend>
   <div className="direction-summary">{(['concept','lighting','material','treatment','avoid'] as const).map((k,i)=><label className="field" key={k}><span>{['视觉主题','光线方向与质感','材质与道具','摄影与调色','禁止事项'][i]}</span><textarea rows={2} maxLength={1800} value={p[k]} onChange={e=>onChange({...p,[k]:e.target.value,source:'manual'})}/></label>)}</div>
   <div className="direction-devices">{(['desktop','mobile'] as Device[]).map(d=><div className="direction-device" key={d}><h4>{d==='desktop'?'电脑端':'手机端'} · {task[d].join(' × ')}</h4>
    <label className="field"><span>构图重心</span><select value={p[d].anchor} onChange={e=>edit({[d]:{...p[d],anchor:e.target.value as typeof p.desktop.anchor}})}>{anchors.map(a=><option key={a}>{a}</option>)}</select></label>
    {(['subject','background','framing'] as const).map((k,i)=><label className="field" key={k}><span>{['主体位置与大小','背景形式','取景与裁切'][i]}</span><textarea rows={2} maxLength={1800} value={p[d][k]} onChange={e=>onChange({...p,[d]:{...p[d],[k]:e.target.value},source:'manual'})}/></label>)}
    <span className="direction-caption">文案安全区 · 画布百分比</span><div className="direction-area-inputs">{(['x','y','width','height'] as const).map((k,i)=><label key={k}><span>{['左','上','宽','高'][i]}</span><input aria-label={(d==='desktop'?'电脑':'手机')+'安全区'+k} type="number" min={0} max={100} step={1} value={Math.round(p[d].textArea[k]*100)} onChange={e=>onChange({...p,[d]:{...p[d],textArea:{...p[d].textArea,[k]:Number(e.target.value)/100}},source:'manual'})}/><small>%</small></label>)}</div>
    <div className="direction-map" style={{aspectRatio:task[d][0]+'/'+task[d][1]}} aria-label="文案安全区示意"><span style={{left:p[d].textArea.x*100+'%',top:p[d].textArea.y*100+'%',width:p[d].textArea.width*100+'%',height:p[d].textArea.height*100+'%'}}>文案区</span></div>
   </div>)}</div>
  </fieldset>}
 </section>;
}

export function DesignReviewPanel({report,onApply}:{report?:DesignReview;onApply?:(text:string)=>void}){
 if(!report)return null;
 return <details className="design-review"><summary>{report.error?'复核未完成 · 图片已保留':report.status==='pass'?'AI 视觉复核完成':'AI 视觉复核 · 有待检查项'}</summary><p>{report.summary}</p>{report.error&&<p role="alert">{report.error}</p>}<ul>{report.checks.map(c=><li key={c.category}><b>{c.category}</b><span className={'review-state '+c.status}>{c.status==='pass'?'符合':c.status==='attention'?'需调整':'待人工核对'}</span><p>{c.note}</p></li>)}</ul>{report.suggestions.length>0&&<><p>建议：{report.suggestions.join('；')}</p>{onApply&&<button type="button" className="text-button" onClick={()=>onApply(report.suggestions.join('；'))}>填入该端调整框</button>}</>}<small>AI 复核提供参考；文字、字体与尺寸另行检查，图片由你最终确认。</small></details>;
}
