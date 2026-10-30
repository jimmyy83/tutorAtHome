import {useEffect,useState} from 'react';
import {homepageWhatsAppUrl,shouldShowHomepageWhatsApp} from '../utils/homepageWhatsApp.js';

export default function FloatingWhatsAppButton({recipient}){
 const [atTop,setAtTop]=useState(()=>typeof window==='undefined'||shouldShowHomepageWhatsApp('/',window.scrollY));
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   if(frame)return;
   frame=window.requestAnimationFrame(()=>{frame=0;setAtTop(shouldShowHomepageWhatsApp('/',window.scrollY));});
  };
  window.addEventListener('scroll',update,{passive:true});
  update();
  return()=>{window.removeEventListener('scroll',update);if(frame)window.cancelAnimationFrame(frame);};
 },[]);
 const href=homepageWhatsAppUrl(recipient);
 if(!atTop||!href)return null;
 return <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Contact us on WhatsApp" title="Contact us on WhatsApp" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-950/25 transition duration-200 hover:-translate-y-1 hover:bg-[#1fbd5c] hover:shadow-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 sm:right-6 sm:h-16 sm:w-16">
  <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 fill-current sm:h-8 sm:w-8"><path d="M16.02 3.2a12.65 12.65 0 0 0-10.8 19.23L3.5 28.8l6.52-1.7a12.7 12.7 0 0 0 6 .99h.01A12.65 12.65 0 0 0 16.02 3.2Zm0 22.74h-.01a10.5 10.5 0 0 1-5.35-1.46l-.38-.22-3.87 1.01 1.03-3.77-.25-.39A10.5 10.5 0 1 1 16.02 25.94Zm5.76-7.86c-.32-.16-1.89-.93-2.18-1.03-.29-.11-.5-.16-.71.16-.22.32-.82 1.03-1 1.24-.18.22-.36.24-.68.08-.32-.16-1.34-.5-2.55-1.58-.94-.84-1.58-1.88-1.76-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.36.48-.54.16-.18.22-.32.32-.53.11-.22.05-.4-.03-.56-.08-.16-.71-1.72-.97-2.36-.25-.62-.52-.54-.71-.55l-.61-.01c-.22 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.3c.16.22 2.24 3.42 5.43 4.8.76.33 1.35.53 1.81.68.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.51.27-.75.27-1.39.19-1.52-.08-.14-.29-.22-.61-.38Z"/></svg>
 </a>;
}
