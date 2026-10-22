import {useEffect,useRef} from 'react';

/** Reveal content once when it enters the viewport; keep it visible while scrolling. */
export default function ScrollReveal({as:Tag='div',className='',delay=0,direction='up',children,...props}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current;
  if(!el||window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver'in window))return;
  el.classList.add('reveal-pending');
  const observer=new IntersectionObserver(([entry])=>{
   if(!entry.isIntersecting)return;
   el.classList.add('is-visible');
   observer.unobserve(el);
  },{threshold:0.15,rootMargin:'0px 0px -3% 0px'});
  observer.observe(el);
  return()=>observer.disconnect();
 },[]);
 return <Tag ref={ref} data-reveal data-reveal-direction={direction} style={{'--reveal-delay':`${delay}ms`}} className={className} {...props}>{children}</Tag>;
}
