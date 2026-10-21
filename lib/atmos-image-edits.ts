import {validateRegions} from './atmos-versions';
export function pngDimensions(bytes:Uint8Array){
 if(bytes.length<33||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('区域蒙版必须是有效 PNG');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 if(!width||!height||width*height>20000000)throw new Error('区域蒙版尺寸无效');return {width,height};
}
export function prepareRegionEdit(value:unknown,data:unknown,source?:Uint8Array){
 const regions=validateRegions(value);
 if(!regions.length){if(data)throw new Error('区域蒙版缺少对应备注');return {regions,prompt:'',mask:undefined};}
 if(!source||typeof data!=='string'||!data.startsWith('data:image/png;base64,')||data.length>5600000)throw new Error('框选调整需要原图及小于 4 MB 的 PNG 区域蒙版');
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(data.slice(22)),c=>c.charCodeAt(0));}catch{throw new Error('区域蒙版无法读取');}
 if(bytes.length>=4*1024*1024)throw new Error('区域蒙版必须小于 4 MB');
 const size=pngDimensions(bytes);
 if(source[0]===137&&source[1]===80){const original=pngDimensions(source);if(original.width!==size.width||original.height!==size.height)throw new Error('区域蒙版必须与原图尺寸一致');}
 const prompt=' Local edit instructions for the FIRST input image. Keep content outside the masked areas unchanged as far as possible. Coordinates below are percentages of the original input image. '+regions.map((r,i)=>`Region ${i+1} (x=${(r.x*100).toFixed(2)}%, y=${(r.y*100).toFixed(2)}%, width=${(r.width*100).toFixed(2)}%, height=${(r.height*100).toFixed(2)}%): ${r.note}`).join('; ');
 return {regions,prompt,mask:new Blob([bytes as BlobPart],{type:'image/png'})};
}
