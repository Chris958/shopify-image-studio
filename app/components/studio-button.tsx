'use client';
import type {ButtonHTMLAttributes,ReactNode} from 'react';
import {Loader2} from 'lucide-react';
type Props=ButtonHTMLAttributes<HTMLButtonElement>&{primary?:boolean;loading?:boolean;loadingLabel?:string;children:ReactNode};
export function StudioButton({children,primary=false,disabled=false,loading=false,loadingLabel='处理中…',className='',onClick,...props}:Props){
 return <button {...props} type="button" disabled={disabled||loading} aria-busy={loading||undefined} onClick={loading?undefined:onClick} className={'btn '+(primary?'primary ':'')+className}>
 {loading?<><Loader2 size={16} className="spin" aria-hidden="true"/><span>{loadingLabel}</span></>:children}
 </button>;
}
