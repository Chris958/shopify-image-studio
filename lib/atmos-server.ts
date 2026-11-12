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
function safeDiagnostic(value:unknown){return typeof value==='string'&&/^[a-zA-Z0-9_.:/-]{1,180}$/.test(value)?value:undefined;}
export class ModelAPIError extends Error{
 constructor(message:string,readonly upstream:{status:number;code?:string;parameter?:string;requestId?:string;category:string}){super(message);this.name='ModelAPIError';}
}
export function modelFailure(res:Response,j:any){
 const code=safeDiagnostic(j?.error?.code)||safeDiagnostic(j?.error?.type),parameter=safeDiagnostic(j?.error?.param),requestId=safeDiagnostic(res.headers.get('x-request-id'))||safeDiagnostic(res.headers.get('request-id'))||safeDiagnostic(j?.request_id)||safeDiagnostic(String(j?.error?.message||'').match(/traceid\s*[:=]\s*([a-zA-Z0-9-]{16,100})/i)?.[1]),status=res.status;
 let category='request',reason='模型服务拒绝了请求，请核对服务商支持的接口、模型和请求参数。';
 if(code==='get_channel_failed'||code==='no_available_channel'){category='channel';reason='服务商未找到可用模型通道。请核对模型 ID、API Key 所属分组及该分组的生图/编辑权限，或联系服务商开通通道。';}
 else if(status===401||status===403){category='authorization';reason='模型服务拒绝了当前密钥或权限。请核对 API Key、所属分组及模型访问权限。';}
 else if(status===429){category='capacity';reason='模型服务触发限流或额度限制。请核查服务商用量、余额和并发限制后再重试。';}
 else if(status>=500&&/没有按照预期生成图片|未.{0,8}生成图片|no image|failed to generate/i.test(String(j?.error?.message||''))){category='generation';reason='上游模型未产出图片。可减少相互冲突的场景要求、使用更少的相关参考图后手动重试；若仍失败，请让服务商按请求 ID 核查。';}
 else if(status>=500){category='provider';reason='模型服务商内部异常或上游通道故障。请联系服务商核查通道状态；系统不会自动重复提交生图请求。';}
 else if(code==='model_not_found'){category='model';reason='当前服务商或密钥无法访问此模型 ID。请从该密钥可用的模型列表中确认准确名称。';}
 else if(parameter){category='parameter';reason='模型服务拒绝了参数 '+parameter+'。请按此服务商的接口要求核对该参数。';}
 const message=`模型请求失败（HTTP ${status}${code?' / '+code:''}）。${reason}${requestId?' 请求 ID：'+requestId:''}`;
 return new ModelAPIError(message,{status,code,parameter,requestId,category});
}
export async function checkedJson(res:Response){let j:any;try{j=await res.json();}catch{throw new ModelAPIError('模型服务未返回有效 JSON（HTTP '+res.status+'），请检查 API 地址和服务商状态。',{status:res.status,category:'response'});}if(!res.ok)throw modelFailure(res,j);return j;}
