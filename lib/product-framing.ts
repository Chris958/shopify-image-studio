import {validArea,type SafeArea} from './art-direction';
export function productFrame(sourceWidth:number,sourceHeight:number,size:number,bounds:SafeArea){
 if(!validArea(bounds)||![sourceWidth,sourceHeight,size].every(n=>Number.isFinite(n)&&n>0))throw new Error('请框定完整产品主体，不包含投影，且边界不得超出原图');
 const subjectWidth=sourceWidth*bounds.width,subjectHeight=sourceHeight*bounds.height,longest=Math.max(subjectWidth,subjectHeight);
 if(longest<Math.max(sourceWidth,sourceHeight)*.05)throw new Error('主体框过小，请重新框定完整产品');
 const scale=size*.8/longest;
 return {scale,x:size/2-(bounds.x*sourceWidth+subjectWidth/2)*scale,y:size/2-(bounds.y*sourceHeight+subjectHeight/2)*scale,width:sourceWidth*scale,height:sourceHeight*scale,subjectLongest:size*.8,sourceFill:longest/Math.max(sourceWidth,sourceHeight)*100};
}
export function productRegionToSource(r:SafeArea,target:[number,number],source:[number,number],bounds:SafeArea){
 const f=productFrame(...source,target[0],bounds),x=Math.max(0,(r.x*target[0]-f.x)/f.scale),y=Math.max(0,(r.y*target[1]-f.y)/f.scale),right=Math.min(source[0],((r.x+r.width)*target[0]-f.x)/f.scale),bottom=Math.min(source[1],((r.y+r.height)*target[1]-f.y)/f.scale);
 return {x:Math.floor(x),y:Math.floor(y),width:Math.max(0,Math.ceil(right)-Math.floor(x)),height:Math.max(0,Math.ceil(bottom)-Math.floor(y))};
}
