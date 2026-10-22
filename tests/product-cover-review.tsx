'use client';
// Internal UI fixture. Copy to a temporary app route and adjust the two imports. Never publish the route.
import {useEffect,useState} from 'react';
import {ProductCoverStudio} from '../app/components/product-cover-studio';
import type {Doc} from '../lib/atmos-types';
export default function Review(){
 const [docs,setDocs]=useState<Doc[]>([]),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[calls,setCalls]=useState(0),[fail,setFail]=useState(false);
 useEffect(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d')!;x.fillStyle='#fff';x.fillRect(0,0,600,400);x.fillStyle='#d7dfd4';x.beginPath();x.ellipse(300,310,140,18,0,0,Math.PI*2);x.fill();x.fillStyle='#52785c';x.fillRect(200,105,200,200);x.fillStyle='#fbc09a';x.fillRect(235,140,130,130);setDocs([{id:'qa-source',kind:'asset',project:'qa-cover',data:{name:'test-product.png',type:'image/png',ext:'png',role:'product',url:c.toDataURL('image/png')}}]);},[]);
 async function save(d:Doc){const saved={...d,revision:(d.revision||0)+1,updated:new Date().toISOString()};setDocs(a=>[saved,...a.filter(x=>x.id!==d.id)]);return saved;}
 return <main className="main-content"><h1>白底图模块交互检查</h1><p>内部测试，不连接模型、不写项目。</p><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>模拟模型失败</label><output role="status">请求数 {calls} · {busy||notice}</output><ProductCoverStudio projectId="qa-cover" docs={docs} assets={docs.filter(d=>d.kind==='asset')} busy={busy} modelName="内部测试模型" onSave={save} onAsset={d=>setDocs(a=>[d,...a.filter(x=>x.id!==d.id)])} onBusy={setBusy} notify={setNotice} checkModel={()=>{}} onAI={async()=>{setCalls(n=>n+1);await new Promise(r=>setTimeout(r,600));if(fail)throw new Error('模拟模型失败');const source=docs.find(d=>d.id==='qa-source')!;const asset={...source,id:'qa-output-'+Date.now(),data:{...source.data,role:'generated'}};return {result:{url:source.data.url,asset}};}}/></main>;
}
