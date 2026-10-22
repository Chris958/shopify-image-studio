import {canvasBlob} from './atmos-render';
export type ShopifyFormat='webp'|'jpg';
export type ShopifyExportMeta={format:ShopifyFormat;quality:number;bytes:number;originalBytes:number};
export async function encodeShopifyImage(canvas:HTMLCanvasElement,format:ShopifyFormat,quality:number){
 if(!['webp','jpg'].includes(format)||!Number.isInteger(quality)||quality<60||quality>95)throw new Error('请选择 JPG 或 WebP，质量范围为 60–95');
 const blob=await canvasBlob(canvas,format,quality/100);
 const expected=format==='jpg'?'image/jpeg':'image/webp';
 if(blob.type!==expected)throw new Error('浏览器未能导出该格式，请改用 '+(format==='webp'?'JPG':'WebP'));
 return blob;
}
export function readableBytes(bytes:number){return bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/1024/1024).toFixed(2)+' MB';}
export function byteReduction(original:number,optimized:number){return original>0?Math.round((1-optimized/original)*100):0;}
