'use client';
import {useEffect,useRef,useState,type UIEvent} from 'react';
import {Download,SlidersHorizontal,Check} from 'lucide-react';
import {StudioButton as Btn} from './studio-button';
import type {CoverVersion} from '../../lib/product-cover';
import {COVER_SIZE,coverFilename} from '../../lib/product-cover';
import {drawProductCover,canvasBlob} from '../../lib/atmos-render';
import {encodeShopifyImage,readableBytes,byteReduction,type ShopifyFormat,type ShopifyExportMeta} from '../../lib/shopify-image-export';

type Props={variant?:CoverVersion;name:string;disabled:boolean;onRun:(label:string,work:()=>Promise<void>)=>Promise<void>;onRecord:(meta:ShopifyExportMeta)=>Promise<void>};
type Preview=ShopifyExportMeta&{url:string;originalUrl:string};
export function ShopifyImageExport({variant,name,disabled,onRun,onRecord}:Props){
 const [format,setFormat]=useState<ShopifyFormat>('webp'),[quality,setQuality]=useState(85),[preview,setPreview]=useState<Preview|null>(null),[preparing,setPreparing]=useState(false),[confirming,setConfirming]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[zoom,setZoom]=useState('fit');
 const cache=useRef<{canvas:HTMLCanvasElement;blob:Blob;url:string}|null>(null),alive=useRef(true),left=useRef<HTMLDivElement>(null),right=useRef<HTMLDivElement>(null);
 const enabled=!!variant?.approved&&variant.stage==='high',current=!!preview&&preview.format===format&&preview.quality===quality;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(cache.current)URL.revokeObjectURL(cache.current.url);};},[]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
 function settings(nextFormat:ShopifyFormat,nextQuality:number){setFormat(nextFormat);setQuality(nextQuality);setReady(false);setError('');}
 async function prepare(){await onRun('正在生成 Shopify 压缩预览',async()=>{setPreparing(true);setReady(false);setError('');try{
  if(!enabled||!variant)throw new Error('请先生成并确认高清版本');
  let original=cache.current;if(!original){const canvas=document.createElement('canvas');await drawProductCover(canvas,variant.url,COVER_SIZE);const blob=await canvasBlob(canvas,'png');if(!alive.current)return;original={canvas,blob,url:URL.createObjectURL(blob)};cache.current=original;}
  // Always encode from the original rendered canvas, never from an already compressed preview.
  const blob=await encodeShopifyImage(original.canvas,format,quality);if(!alive.current)return;
  setPreview({url:URL.createObjectURL(blob),originalUrl:original.url,originalBytes:original.blob.size,bytes:blob.size,format,quality});
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'压缩预览失败');}finally{if(alive.current)setPreparing(false);}});}
 async function confirm(){if(!preview||!current)return;await onRun('正在准备 Shopify 优化文件',async()=>{setConfirming(true);setError('');try{await onRecord({format:preview.format,quality:preview.quality,bytes:preview.bytes,originalBytes:preview.originalBytes});if(alive.current)setReady(true);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'文件准备失败');}finally{if(alive.current)setConfirming(false);}});}
 function sync(event:UIEvent<HTMLDivElement>,other:HTMLDivElement|null){if(other){other.scrollLeft=event.currentTarget.scrollLeft;other.scrollTop=event.currentTarget.scrollTop;}}
 const reduction=preview?byteReduction(preview.originalBytes,preview.bytes):0;
 const fileName=variant&&preview?coverFilename(name,variant,preview.format).replace(/\.(webp|jpg)$/,'_shopify_q'+preview.quality+'.$1'):'';
 return <section className="panel shopify-export" aria-label="Shopify 优化导出">
  <div className="panel-title"><div><h3>Shopify 优化导出</h3><p className="cover-hint">保留 1500 × 1500，比较体积与细节后，再输出网站版。</p></div><SlidersHorizontal size={18}/></div>
  {!enabled&&<p className="small-callout">请先生成并确认高清版本，再进行 Shopify 优化导出。</p>}
  <div className="shopify-export-controls">
   <label className="field"><span>网站图片格式</span><select aria-label="网站图片格式" disabled={disabled||!enabled} value={format} onChange={e=>settings(e.target.value as ShopifyFormat,quality)}><option value="webp">WebP · 更小体积</option><option value="jpg">JPG · 通用摄影格式</option></select></label>
   <label className="field"><span>压缩质量 · {quality}</span><input aria-label="压缩质量" type="range" min={60} max={95} step={1} value={quality} disabled={disabled||!enabled} onChange={e=>settings(format,Number(e.target.value))}/></label>
   <div className="shopify-quality-presets" aria-label="压缩质量预设">{[[90,'优先画质'],[85,'均衡'],[75,'更小体积']].map(([q,label])=><button type="button" key={q} aria-pressed={quality===q} disabled={disabled||!enabled} onClick={()=>settings(format,Number(q))}>{label}</button>)}</div>
   <Btn primary disabled={disabled||!enabled} loading={preparing} loadingLabel="生成压缩预览中…" onClick={prepare}>{preview?'更新压缩预览':'生成优化预览'}</Btn>
  </div>
  <p className="cover-hint">压缩在浏览器中完成，不调用模型。可将 150–300 KB 作为参考目标，实际以细节清晰为准。</p>
  {error&&<p className="cover-error" role="alert">{error}</p>}
  {preview&&<>
   <div className="shopify-export-stats" aria-live="polite"><div><span>PNG 母版</span><b>{readableBytes(preview.originalBytes)}</b></div><div><span>{preview.format.toUpperCase()} · 质量 {preview.quality}</span><b>{readableBytes(preview.bytes)}</b></div><div><span>体积变化</span><b>{reduction>=0?'减少 '+reduction+'%':'增加 '+Math.abs(reduction)+'%'}</b></div><div><span>输出尺寸</span><b>1500 × 1500 px</b></div></div>
   {!current&&<p className="shopify-export-dirty" role="status">参数已更改，请更新压缩预览后再确认导出。</p>}
   {reduction<0&&<p className="cover-hint">这张 PNG 母版本身较小，当前压缩格式体积更大，可切换格式、调整质量或保留 PNG。</p>}
   <div className="shopify-compare-heading"><span>检查纹理、Logo 边缘和投影渐变</span><label>对比缩放<select aria-label="对比缩放" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">适应宽度</option><option value="1">100% 像素</option><option value="2">200% 像素</option></select></label></div>
   <div className="shopify-compare-grid">{[{label:'压缩前 · PNG 母版',url:preview.originalUrl,ref:left,other:right},{label:'压缩后 · '+preview.format.toUpperCase()+' / Q'+preview.quality,url:preview.url,ref:right,other:left}].map(item=><figure key={item.label}><figcaption>{item.label}</figcaption><div className="shopify-compare-image" ref={item.ref} onScroll={e=>sync(e,item.other.current)} tabIndex={0} aria-label={item.label+'图片对比，可滚动查看'}><img src={item.url} alt={item.label} style={{width:zoom==='fit'?'100%':COVER_SIZE*Number(zoom)+'px',maxWidth:'none'}}/></div></figure>)}</div>
   <div className="shopify-export-actions"><Btn primary disabled={disabled||!current||!enabled||ready} loading={confirming} loadingLabel="准备文件中…" onClick={confirm}><Check size={15}/>{ready&&current?'优化文件已就绪':'确认优化并导出'}</Btn>{ready&&current&&<a className="btn cover-download-link" href={preview.url} download={fileName}><Download size={15}/>下载 Shopify 优化图 · {readableBytes(preview.bytes)}</a>}</div>
  </>}
 </section>;
}
