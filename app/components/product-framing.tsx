'use client';
import {useEffect,useRef,useState} from 'react';
import type {CoverVersion} from '../../lib/product-cover';
import {coverVersionBackground} from '../../lib/product-cover';
import type {SafeArea} from '../../lib/art-direction';
import {validArea} from '../../lib/art-direction';
import {productFrame} from '../../lib/product-framing';
import {drawProductCover} from '../../lib/atmos-render';
import {StudioButton as Btn} from './studio-button';
export function CoverPreview({version,name}:{version:CoverVersion;name:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setError('');if(canvas.current)drawProductCover(canvas.current,version.url,750,coverVersionBackground(version),version.boundsConfirmed?version.subjectBounds:undefined).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[version]);
 return <div className="cover-image" style={{background:coverVersionBackground(version)}}>{error?<p role="alert">{error}</p>:<canvas ref={canvas} role="img" aria-label={name+' · '+(version.boundsConfirmed?'80% 构图输出预览':'原始生成结果')}/>}</div>;
}
export function ProductFraming({version,disabled,onCommit}:{version:CoverVersion;disabled:boolean;onCommit:(bounds:SafeArea)=>void}){
 const [bounds,setBounds]=useState<SafeArea|undefined>(version.subjectBounds),[dimensions,setDimensions]=useState<[number,number]>([0,0]),[error,setError]=useState('');const start=useRef<{x:number;y:number}|null>(null);
 useEffect(()=>{setBounds(version.subjectBounds);setError('');},[version.id]);
 let frame;try{if(bounds&&dimensions[0])frame=productFrame(...dimensions,1500,bounds);}catch{}
 return <details className="product-framing" open={!version.boundsConfirmed}><summary>主体边界与 80% 构图校验{version.boundsConfirmed?' · 已标定':' · 待标定'}</summary><p className="cover-hint">在原图上从产品左上角拖到右下角，包住完整主体，不包含投影。确认后按边界计算缩放与居中；1500px 输出的主体最长边为 1200px。标定准确度决定实际结果。</p>
  <div className="subject-bounds-editor" onPointerDown={e=>{if(disabled)return;const r=e.currentTarget.getBoundingClientRect();start.current={x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!start.current||disabled)return;const r=e.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),a=start.current;setBounds({x:Math.min(a.x,x),y:Math.min(a.y,y),width:Math.abs(x-a.x),height:Math.abs(y-a.y)});}} onPointerUp={()=>{start.current=null;}} onPointerCancel={()=>{start.current=null;}}>
   <img src={version.url} alt="用于标定的生成原图" draggable={false} onLoad={e=>setDimensions([e.currentTarget.naturalWidth,e.currentTarget.naturalHeight])}/>{bounds&&<span className="subject-bounds-box" style={{left:bounds.x*100+'%',top:bounds.y*100+'%',width:bounds.width*100+'%',height:bounds.height*100+'%'}}/>}
  </div>
  {bounds&&<div className="direction-area-inputs">{(['x','y','width','height'] as const).map((k,i)=><label key={k}><span>{['左','上','宽','高'][i]}</span><input disabled={disabled} aria-label={'主体边界'+k} type="number" min={0} max={100} step={.1} value={Math.round(bounds[k]*1000)/10} onChange={e=>setBounds({...bounds,[k]:Number(e.target.value)/100})}/><small>%</small></label>)}</div>}
  {frame&&<p className="cover-hint">标定主体在原画布中占 {frame.sourceFill.toFixed(1)}% → 输出按 80% 校正，最长边 1200px。</p>}
  {error&&<p role="alert">{error}</p>}<Btn disabled={disabled||!bounds||!validArea(bounds)||!frame} onClick={()=>{try{if(bounds){productFrame(...dimensions,1500,bounds);onCommit(bounds);}}catch(e){setError(e instanceof Error?e.message:'标定无效');}}}>保存标定并生成 80% 构图版本</Btn><small className="cover-hint">在浏览器中完成，不调用图片模型；保留原图与历史版本。</small>
 </details>;
}
