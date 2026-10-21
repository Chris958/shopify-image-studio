'use client';
import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {ScanLine,Trash2} from 'lucide-react';
import type {RegionNote,Variant} from '../../lib/atmos-types';

export function ImageVersionPicker({versions,current,disabled,onSelect}:{versions:Variant[];current:Variant;disabled:boolean;onSelect:(id:string)=>void}){
 const label=current.device==='desktop'?'电脑端':'手机端';
 return <div className="image-version-picker"><label>{label}历史版本<select aria-label={label+'历史版本'} value={current.id} disabled={disabled} onChange={e=>onSelect(e.target.value)}>{versions.map(v=><option key={v.id} value={v.id}>v{v.revision} · {v.label}{v.approved?' · 已确认':''}</option>)}</select></label><div className="version-filmstrip" aria-label={label+'版本缩略图'}>{versions.map(v=><button type="button" disabled={disabled} aria-pressed={v.id===current.id} aria-label={label+'选择版本 v'+v.revision} title={v.editRequest?.instruction||v.label} key={v.id} onClick={()=>onSelect(v.id)}><img src={v.url} alt=""/><span>v{v.revision}{v.id===current.id?' · 当前':''}</span></button>)}</div></div>;
}

export function RegionCanvas({variant,children,disabled,onRegions}:{variant:Variant;children:ReactNode;disabled:boolean;onRegions:(regions:RegionNote[])=>void}){
 const [drawing,setDrawing]=useState(false),[draft,setDraft]=useState<RegionNote|null>(null),start=useRef<{x:number;y:number}|null>(null);
 const label=variant.device==='desktop'?'电脑端':'手机端',regions=variant.regions||[];
 useEffect(()=>{setDrawing(false);setDraft(null);start.current=null;},[variant.id]);
 function point(event:PointerEvent<HTMLDivElement>){const r=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))};}
 function rectangle(end:{x:number;y:number}){const p=start.current!;return {id:'region-'+Date.now(),x:Math.min(p.x,end.x),y:Math.min(p.y,end.y),width:Math.abs(p.x-end.x),height:Math.abs(p.y-end.y),note:''};}
 return <div className="region-editor"><div className={'preview-surface '+(drawing?'drawing':'')}>
 {children}
 <div className="region-draw-layer" role="application" aria-label={label+'框选画布'} tabIndex={drawing?0:-1} aria-disabled={!drawing||disabled}
 onKeyDown={e=>{if(e.key==='Escape'){setDrawing(false);setDraft(null);start.current=null;}}}
 onPointerDown={e=>{if(!drawing||disabled||regions.length>=8)return;e.preventDefault();start.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);setDraft(rectangle(start.current));}}
 onPointerMove={e=>{if(start.current)setDraft(rectangle(point(e)));}}
 onPointerCancel={()=>{start.current=null;setDraft(null);}}
 onPointerUp={e=>{if(!start.current)return;const r=rectangle(point(e));start.current=null;setDraft(null);if(r.width>=.015&&r.height>=.015){onRegions([...regions,r]);setDrawing(false);}}}>
 <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{[...regions,...(draft?[draft]:[])].map((r,i)=><g key={r.id}><rect x={r.x*100} y={r.y*100} width={r.width*100} height={r.height*100}/><text x={r.x*100+1} y={r.y*100+3}>{i+1}</text></g>)}</svg>
 </div></div>
 <div className="region-tools"><button type="button" className={'btn '+(drawing?'primary':'')} disabled={disabled||regions.length>=8} aria-pressed={drawing} onClick={()=>setDrawing(!drawing)}><ScanLine size={14}/>{drawing?'取消框选':'框选备注'}</button><small>{regions.length}/8 个区域 · 拖动框选后填写备注</small></div>
 {regions.length>0&&<div className="region-notes">{regions.map((r,i)=><div className="region-note" key={r.id}><label>{label}区域 {i+1} 备注<textarea aria-label={label+'区域 '+(i+1)+' 备注'} rows={2} disabled={disabled} maxLength={1000} value={r.note} placeholder="例如：将框内背景改为浅绿色，保留主体" onChange={e=>onRegions(regions.map(a=>a.id===r.id?{...a,note:e.target.value}:a))}/></label><button type="button" className="icon-button" disabled={disabled} aria-label={label+'删除区域 '+(i+1)} onClick={()=>onRegions(regions.filter(a=>a.id!==r.id))}><Trash2 size={15}/></button></div>)}</div>}
 </div>;
}
