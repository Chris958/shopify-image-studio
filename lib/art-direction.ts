import {uid,type Task,type Spec,type Device,type Variant} from './atmos-types';

export const anchors=['居中聚焦','左侧主体','右侧主体','底部视觉重心','编辑式错位'] as const;
export type SafeArea={x:number;y:number;width:number;height:number};
export type DeviceDirection={anchor:typeof anchors[number];subject:string;background:string;framing:string;textArea:SafeArea};
export type ArtDirection={schema:1;id:string;created:string;source:'rules'|'ai'|'manual';fingerprint:string;specId:string;specVersion:number;brief:string;concept:string;lighting:string;material:string;treatment:string;avoid:string;desktop:DeviceDirection;mobile:DeviceDirection};
export const reviewCategories=['品牌一致性','产品真实性','构图与留白','背景与材质','生成瑕疵'] as const;
export type DesignReview={variantId:string;created:string;status:'pass'|'attention';summary:string;checks:{category:string;status:'pass'|'attention'|'uncertain';note:string}[];suggestions:string[];error?:string};
export function directionFingerprint(t:Task){const data=JSON.stringify([t.specId,t.spec,t.module,t.desktop,t.mobile,t.brief,t.campaign,t.negative,t.mode,t.creative,t.assets,t.title,t.subtitle,t.description,t.cta,t.layoutInstruction,t.withText]);let n=2166136261;for(const c of data){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(36);}
export function moduleDirection(module:string){
 if(module.includes('集合'))return '集合页 Header：突出系列共同特征，适应扁长画幅，关键产品与识别特征不得落在裁切边缘。';
 if(/购物车|政策|联系/.test(module))return '功能页 Header：低干扰、低视觉密度、克制的品牌氛围；为页面标题保留连续清楚的区域。';
 if(module.includes('氛围条'))return '页面 Header：克制、清晰、适应扁长画幅，为页面标题留出可读区域，避免复杂场景和关键主体被裁切。';
 if(module.includes('活动'))return '活动模块：只突出一个活动主题，产品与活动信息形成明确主次，背景装饰服务于主题。';
 return '首页 Banner：形成明确的开场视觉主题，以真实产品或有品牌依据的场景建立吸引力，保持一个主要视觉焦点。';
}
export function createArtDirection(t:Task):ArtDirection{
 const copy=!!(t.title||t.subtitle||t.description||t.cta),quiet=/氛围条|购物车|政策|联系/.test(t.module);
 const instruction=(t.spec.composition+' '+t.layoutInstruction).toLowerCase();
 const preferred=/右侧文案|右侧标题|text.{0,8}right/.test(instruction)?'左侧主体':/左侧文案|左侧标题|left title|text.{0,8}left/.test(instruction)?'右侧主体':/居中|center/.test(instruction)?'居中聚焦':/编辑|editorial|magazine/.test(t.spec.tone+' '+t.spec.visual)?'编辑式错位':'居中聚焦';
 const make=(d:Device):DeviceDirection=>{const [w,h]=t[d],portrait=h/w>.85,anchor=portrait&&copy?'底部视觉重心':preferred;
  const textArea=portrait?{x:.08,y:.07,width:.84,height:.32}:anchor==='右侧主体'?{x:.07,y:.12,width:.4,height:.72}:anchor==='左侧主体'?{x:.53,y:.12,width:.4,height:.72}:{x:.1,y:.62,width:.8,height:.3};
  const subject=anchor==='底部视觉重心'?'主体安排在下半区，完整保留产品特征':anchor==='右侧主体'?'主体安排在右侧，保留左侧清晰文案区':anchor==='左侧主体'?'主体安排在左侧，保留右侧清晰文案区':anchor==='编辑式错位'?'依据品牌构图采用有秩序的不对称取景，保持一个清晰视觉焦点':'主体居中聚焦，依据品牌构图组织画面，文案区与主体关键特征分开';
  return {anchor,subject,background:quiet?'使用品牌允许的克制背景，减少细节干扰':`依据品牌视觉规范选择背景，色彩围绕 ${(t.spec.colors||[]).join('、')}，保持产品真实颜色`,framing:portrait?'针对此端尺寸重新安排上下关系，不从电脑图机械居中裁切':'按目标画幅组织景别，关键特征避开裁切边缘',textArea};
 };
 return {schema:1,id:uid(),created:new Date().toISOString(),source:'rules',fingerprint:directionFingerprint(t),specId:t.specId,specVersion:t.spec.version,brief:t.brief,concept:t.brief||t.campaign||`${t.module} · ${t.spec.tone}`,lighting:t.spec.visual||'使用与品牌调性一致、方向清楚且自然的光线，保留真实立体感',material:'材质与道具须有品牌或产品依据，控制数量，不改变产品本身的材质',treatment:t.spec.visual||'统一摄影、调色和质感处理，产品颜色保持真实',avoid:[t.spec.forbidden,t.negative,'不添加未经提供的卖点、标章、装饰元素或营销文字'].filter(Boolean).join('；'),desktop:make('desktop'),mobile:make('mobile')};
}
export function validArea(r:any):r is SafeArea{return !!r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.001&&r.y+r.height<=1.001;}
function short(v:any,label:string,max=1800){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('视觉方案的'+label+'无效，请完善后重试');return v.trim();}
export function validateArtDirection(value:any,t:Task,source?:ArtDirection['source']):ArtDirection{
 if(!value||typeof value!=='object')throw new Error('视觉导演方案缺失');
 const devices={} as Record<Device,DeviceDirection>;
 for(const d of ['desktop','mobile'] as Device[]){const v=value[d];if(!v||!anchors.includes(v.anchor)||!validArea(v.textArea))throw new Error('请检查'+(d==='desktop'?'电脑端':'手机端')+'构图与文案安全区');devices[d]={anchor:v.anchor,subject:short(v.subject,'主体位置'),background:short(v.background,'背景'),framing:short(v.framing,'取景'),textArea:{x:v.textArea.x,y:v.textArea.y,width:v.textArea.width,height:v.textArea.height}};}
 return {schema:1,id:typeof value.id==='string'?value.id:uid(),created:typeof value.created==='string'?value.created:new Date().toISOString(),source:source||(['ai','manual','rules'].includes(value.source)?value.source:'manual'),fingerprint:directionFingerprint(t),specId:t.specId,specVersion:t.spec.version,brief:source==='ai'?t.brief:typeof value.brief==='string'?value.brief:t.brief,concept:short(value.concept,'视觉主题'),lighting:short(value.lighting,'光线'),material:short(value.material,'材质'),treatment:short(value.treatment,'图像处理'),avoid:short(value.avoid,'禁止项'),...devices};
}
export function currentArtDirection(t:Task){return t.artDirection?.fingerprint===directionFingerprint(t)&&t.artDirection.specId===t.specId;}
export function ensureArtDirection(t:Task){return currentArtDirection(t)?validateArtDirection(t.artDirection,t):createArtDirection(t);}
function uniqueRules(items:string[]){return [...new Set(items.map(x=>x.trim()).filter(Boolean))];}
/** Send scene constraints once; keep storage/evidence/font IDs out of image instructions. */
export function brandConstraints(s:Spec){
 const scene={tone:s.tone,palette:s.colors,background:s.background,visual:s.visual,composition:s.composition,forbidden:s.forbidden,lockedRules:uniqueRules((s.rules||[]).filter(r=>r.locked).map(r=>r.text)),rules:uniqueRules((s.rules||[]).filter(r=>!r.locked).map(r=>r.text))};
 return `Brand scene rules: ${JSON.stringify(scene)}. Locked rules and prohibitions take priority. The explicit palette governs background and accents; keep actual product colors faithful. Typography and original logos are composed separately: interpret headline/font/logo instructions as space reservations, not requests to draw lettering or recreate brand assets.`;
}
export function artPlanningPrompt(t:Task){return `你是电商图片视觉导演。只规划所选图片模块，不设计整站。${brandConstraints(t.spec)} ${moduleDirection(t.module)}\n读取随附的产品、品牌和风格参考，结合任务内容规划可执行的摄影、背景和双端构图。保留所有用户禁止项、原始文案和品牌字体。一个主要视觉焦点，留白有用途，材质与装饰必须有依据；遵守品牌调性，避免惯用构图和无关装饰。手机与电脑分别取景，同一品牌与活动主题。不得虚构产品特征或替换品牌。不要输出网页组件、按钮或图片内文字。只返回JSON，字段 concept,lighting,material,treatment,avoid 均为非空string，desktop 和 mobile 均为 {anchor: ${JSON.stringify(anchors)}, subject:string,background:string,framing:string,textArea:{x:number,y:number,width:number,height:number}}；anchor只能选数组中的一个值。坐标归一化0到1且矩形不得越界。需求：${JSON.stringify({module:t.module,brief:t.brief,campaign:t.campaign,mode:t.mode,creative:t.creative,negative:t.negative,desktop:t.desktop,mobile:t.mobile,copy:{title:t.title,subtitle:t.subtitle,description:t.description,cta:t.cta},withText:t.withText,layout:t.layoutInstruction})}。现有方案（可完善，品牌约束不变）：${JSON.stringify(ensureArtDirection(t))}`;}
export function atmospherePrompt(t:Task,device:Device,stage:string,instruction:string,base?:Variant,group=0){
 const plan=base?.artDirection?validateArtDirection(base.artDirection,t):ensureArtDirection(t),d=plan[device],[w,h]=t[device],hasCopy=!!(t.title||t.subtitle||t.description||t.cta);
 const scene=uniqueRules([stage==='high'?plan.brief:t.brief,plan.concept,plan.lighting,plan.material,plan.treatment,d.subject,d.background,d.framing]);
 const prompt=[
  `Create one finished Shopify ${t.module} BACKGROUND IMAGE. ${moduleDirection(t.module+' '+t.name+' '+t.campaign)}`,
  brandConstraints(t.spec),
  `Visual direction: ${scene.join(' / ')}. Composition anchor: ${d.anchor}. Creative range: ${t.creative}.`,
  `Device ${device}; final display ${w}x${h}. One clear visual focus. Keep essential features safe for this final crop. ${hasCopy?`Keep this normalized rectangle calm for separately rendered copy: x=${d.textArea.x}, y=${d.textArea.y}, width=${d.textArea.width}, height=${d.textArea.height}.`:'Use negative space for visual balance.'}`,
  `Preserve product identity and material detail in product references. Style references guide mood only; do not reproduce their webpage, lettering or logos. Functional-page names such as shopping cart describe placement; do not generate a checkout UI. No text, no watermark, do not redraw any logo.`,
  `Avoid: ${uniqueRules([t.negative||'',plan.avoid||'']).join('; ')}.`,
  stage==='high'?'Enhance the supplied CONFIRMED image: preserve its subject placement, framing, color, lighting and text-safe area; improve fine detail.':base?'Edit the supplied selected version, retaining unchanged product identity and brand rules.':`Candidate ${group+1}: use a considered composition within this same brand direction.`,
  stage==='high'?'':instruction&&instruction!==t.brief?`Requested change: ${instruction}`:''
 ].filter(Boolean).join('\n');return {prompt,plan};
}
export function designReviewPrompt(t:Task,v:Variant,cover=false){return `你是电商品牌视觉质检。${brandConstraints(t.spec)} 对照提供的原始产品参考审查待评图片，不可确认的细节明确为 uncertain，不编造事实。${cover?'产品目录棚拍：背景#f3f3f3，保留产品细节和自然清晰投影。主体占比需单独测量，不能因为提示词写80%就判定达到80%。':moduleDirection(t.module)} 视觉方案 ${JSON.stringify(v.artDirection||ensureArtDirection(t))}。设备 ${v.device}，目标尺寸 ${JSON.stringify(t[v.device])}。检查品牌一致性、产品真实性、构图与留白、背景与材质、生成瑕疵。图片是背景源图；真实文字层、字体和导出尺寸由程序校验，不要声称已看到了未提供的最终文字排版。仅返回JSON {summary:string,checks:[{category:上述五个中文分类之一,status:"pass"|"attention"|"uncertain",note:string}],suggestions:string[]}。必须覆盖五类。发现偏差给出具体可执行的修正建议；不要给虚假的审美分数或自动确认。`;}
export function parseDesignReview(value:any,variantId:string):DesignReview{
 if(!value||!Array.isArray(value.checks)||typeof value.summary!=='string'||value.summary.length>2500||!Array.isArray(value.suggestions)||value.suggestions.length>12||value.suggestions.some((x:any)=>typeof x!=='string'||x.length>1800))throw new Error('评审结果不完整，请重新评审；图片已保留');
 const checks=reviewCategories.map(category=>{const a=value.checks.find((x:any)=>x.category===category);if(!a||!['pass','attention','uncertain'].includes(a.status)||typeof a.note!=='string'||a.note.length>2500)throw new Error('评审分类不完整，请重新评审；图片已保留');return {category,status:a.status,note:a.note};});
 return {variantId,created:new Date().toISOString(),status:checks.every(x=>x.status==='pass')?'pass':'attention',summary:value.summary,checks,suggestions:value.suggestions};
}
