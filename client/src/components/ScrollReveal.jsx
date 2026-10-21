import {useEffect,useRef} from 'react';

/** Bidirectional viewport reveal. Content stays visible if observation is unavailable. */
export default function ScrollReveal({as:Tag='div',className='',delay=0,direction='up',children,...props}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current;
  if(!el||window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver'in window))return;
  el.classList.add('reveal-pending');
  const observer=new IntersectionObserver(([entry])=>{
   el.classList.toggle('is-visible',entry.isIntersecting);
  },{threshold:0.15,rootMargin:'0px 0px -3% 0px'});
  observer.observe(el);
  return()=>observer.disconnect();
 },[]);
 return <Tag ref={ref} data-reveal data-reveal-direction={direction} style={{'--reveal-delay':`${delay}ms`}} className={className} {...props}>{children}</Tag>;
}
