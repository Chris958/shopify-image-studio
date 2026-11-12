import type {Profile} from './atmos-types';
/** A provider model alias does not prove support for arbitrary native dimensions. */
export function atmosphereNativeSize(profile:Pick<Profile,'size'|'customImageSize'>,width:number,height:number){
 if(profile.size&&profile.size!=='adaptive'){
  if(!/^\d{3,4}x\d{3,4}$/.test(profile.size))throw new Error('模型原生尺寸格式无效');
  if(!['1024x1024','1536x1024','1024x1536'].includes(profile.size)&&!profile.customImageSize)throw new Error('当前模型档案选择了自定义原生尺寸。请切换为“自动适配 · 标准兼容尺寸”，或在确认服务商支持后启用自定义原生尺寸。');
  return profile.size;
 }
 const tw=Number(width)||1920,th=Number(height)||720;
 if(!profile.customImageSize)return tw/th>1.1?'1536x1024':tw/th<.9?'1024x1536':'1024x1024';
 let w=Math.ceil(Math.min(3840,tw)/16)*16,h=Math.ceil(Math.min(3840,th)/16)*16;
 if(w/h>3)h=Math.ceil(w/3/16)*16;if(h/w>3)w=Math.ceil(h/3/16)*16;
 if(w*h<700000){const k=Math.sqrt(700000/(w*h));w=Math.ceil(w*k/16)*16;h=Math.ceil(h*k/16)*16;}
 if(w*h>8200000||Math.max(w,h)>3840){const k=Math.min(Math.sqrt(8200000/(w*h)),3840/Math.max(w,h));w=Math.floor(w*k/16)*16;h=Math.floor(h*k/16)*16;}
 if(w/h>3)w=Math.floor(h*3/16)*16;if(h/w>3)h=Math.floor(w*3/16)*16;
 return w+'x'+h;
}
