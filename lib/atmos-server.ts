import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import type {Doc} from './atmos-types';
export async function owner(){const u=await getChatGPTUser();if(!u)throw new Error('AUTH_REQUIRED');return u.userId;}
export function db(){if(!env.DB)throw new Error('项目存储尚未就绪');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('文件存储尚未就绪');return env.BUCKET;}
export async function readDoc(id:string,u:string){const r=await db().prepare('SELECT * FROM documents WHERE id=? AND owner=?').bind(id,u).first<any>();return r?{id:r.id,kind:r.kind,project:r.project,data:JSON.parse(r.data),revision:r.revision,updated:r.updated} as Doc:null;}
export async function writeDoc(doc:Doc,u:string,expected?:number){const current=await readDoc(doc.id,u);if(current&&current.kind==='spec'&&current.data.status==='published')throw new Error('已发布规范不可覆盖，请另存新版本');const now=new Date().toISOString();if(current){const r=await db().prepare('UPDATE documents SET data=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(doc.data),now,doc.id,u,expected??current.revision).run();if(!r.meta.changes)throw new Error('内容已在其他窗口更新，请刷新后重试');}else {await db().prepare('INSERT INTO documents(id,owner,kind,project,data,revision,updated) VALUES(?,?,?,?,?,1,?)').bind(doc.id,u,doc.kind,doc.project,JSON.stringify(doc.data),now).run();}return readDoc(doc.id,u);}
export function fail(e:unknown){const message=e instanceof Error?e.message:'操作失败';return Response.json({error:message==='AUTH_REQUIRED'?'请先登录后保存项目':message},{status:message==='AUTH_REQUIRED'?401:400});}
export function checkOrigin(req:Request){const o=req.headers.get('origin');if(o&&o!==new URL(req.url).origin)throw new Error('请求来源不匹配');}
export function safeBase(raw:string){const u=new URL(raw);const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^\d+(\.\d+)+$/.test(h)||h.includes(':')||/(localhost|\.local|\.internal|\.test|\.invalid|\.example|metadata\.google\.internal)$/.test(h)||u.search||u.hash)throw new Error('API 地址必须是公开 HTTPS 域名，不允许内网地址、端口或查询参数');return raw.replace(/\/$/,'');}
export async function apiFetch(base:string,path:string,key:string,body?:any){
 const response=await fetch(safeBase(base)+path,{method:body?'POST':'GET',redirect:'manual',headers:{Authorization:'Bearer '+key,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(280000)});
 // Workers supports manual/follow only. Never forward credentials or reference
 // materials to an API redirect destination; ask for the final configured URL.
 if(response.status>=300&&response.status<400){
  try{await response.body?.cancel();}catch{}
  throw new Error('模型 API 返回重定向（HTTP '+response.status+'）。请将 Base URL 设置为服务商的最终 HTTPS API 地址（包含正确的版本路径），再测试连接。');
 }
 return response;
}
export async function checkedJson(res:Response){let j:any;try{j=await res.json();}catch{throw new Error('服务未返回有效 JSON（HTTP '+res.status+'）');}if(!res.ok){const code=j?.error?.code||j?.error?.type||'';throw new Error('模型请求失败（HTTP '+res.status+(code?' / '+code:'')+'）。请检查配置、权限或参数。');}return j;}
