import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,X} from 'lucide-react';
import {bannerService} from '../services/bannerService.js';

const dismissKey=b=>b.dismissKey||`banner-${b.id}`;
function wasDismissed(b){
 if(b.frequency==='always')return false;
 try{const key=dismissKey(b);if(b.frequency==='days'){const saved=JSON.parse(localStorage.getItem(key)||'null');return Boolean(saved&&saved.until>Date.now());}return sessionStorage.getItem(key)==='1';}catch{return false;}
}
export default function AnnouncementPopup(){
 const [ann,setAnn]=useState(null);const closeRef=useRef(null),opener=useRef(null);
 useEffect(()=>{const c=new AbortController();bannerService.listActive(c.signal).then(list=>{
  const now=Date.now();const campaign=(list||[]).filter(b=>b.placement==='popup'&&b.enabled!==false&&(!b.startsAt||now>=Date.parse(b.startsAt))&&(!b.endsAt||now<=Date.parse(b.endsAt))&&!wasDismissed(b)).sort((a,b)=>(b.priority||0)-(a.priority||0))[0];
  if(campaign){opener.current=document.activeElement;setAnn(campaign);}
 }).catch(()=>{});return()=>c.abort();},[]);
 useEffect(()=>{if(ann)closeRef.current?.focus();},[ann]);
 const close=()=>{if(!ann)return;try{const key=dismissKey(ann);if(ann.frequency==='days')localStorage.setItem(key,JSON.stringify({until:Date.now()+(ann.frequencyDays||1)*86400000}));else if(ann.frequency!=='always')sessionStorage.setItem(key,'1');}catch{}setAnn(null);opener.current?.focus?.();};
 const onKey=e=>{if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const f=[...e.currentTarget.querySelectorAll('button,a[href]')];const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 if(!ann)return null;
 const external=/^https?:\/\//i.test(ann.ctaUrl||'');
 return <div className="campaign-overlay fixed inset-0 z-50 flex items-center justify-center bg-[#07172f]/65 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={onKey}>
  <div role="dialog" aria-modal="true" aria-labelledby="ann-title" className="campaign-dialog relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.7rem] border border-white/70 bg-white p-6 shadow-2xl sm:p-8">
   <button ref={closeRef} onClick={close} aria-label="Close announcement" className="absolute right-4 top-4 rounded-full p-2 text-slate-600 transition hover:bg-slate-100"><X size={18}/></button>
   {ann.image&&<img src={ann.image} alt="" width="800" height="400" loading="lazy" className="mb-5 aspect-[2/1] w-full rounded-2xl object-cover"/>}
   <span className="eyebrow">TutorAtHome update</span><h2 id="ann-title" className="mt-3 pr-8 font-serif text-3xl leading-tight text-slate-900">{ann.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{ann.message}</p>
   {ann.ctaLabel&&(external?<a href={ann.ctaUrl} rel="noreferrer" target="_blank" onClick={close} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0c284b] px-5 py-3 font-semibold text-white">{ann.ctaLabel}<ArrowUpRight size={16}/></a>:<Link to={ann.ctaUrl||'/parent-enquiry'} onClick={close} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0c284b] px-5 py-3 font-semibold text-white">{ann.ctaLabel}<ArrowUpRight size={16}/></Link>)}
  </div>
 </div>;
}
