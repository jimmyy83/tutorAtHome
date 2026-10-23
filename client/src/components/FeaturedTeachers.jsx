import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import TeacherCard from './TeacherCard.jsx';
import ScrollReveal from './ScrollReveal.jsx';
import {Loading,ErrorBox} from './State.jsx';
import useTeachers from '../hooks/useTeachers.js';
import {canAutoAdvance,nextFeaturedPosition} from '../utils/featuredCarousel.js';

function FeaturedCarousel({items}){
 const viewport=useRef(null),scrollTimer=useRef(null),[index,setIndex]=useState(0),[overflows,setOverflows]=useState(false),[paused,setPaused]=useState(false),[reducedMotion,setReducedMotion]=useState(false);
 const count=items.length;
 const centerCard=useCallback((physicalIndex,behavior)=>{
  const el=viewport.current,card=el?.children[physicalIndex];if(!el||!card)return;
  const delta=card.getBoundingClientRect().left+card.clientWidth/2-(el.getBoundingClientRect().left+el.clientWidth/2);
  el.scrollTo({left:el.scrollLeft+delta,behavior:behavior||(reducedMotion?'auto':'smooth')});
 },[reducedMotion]);
 const measure=useCallback(()=>{
  const el=viewport.current;if(!el)return;
  const originals=[...el.children].slice(0,count),first=originals[0],last=originals.at(-1);
  const overflow=!!(first&&last&&last.getBoundingClientRect().right-first.getBoundingClientRect().left>el.clientWidth+1);
  setOverflows(current=>current===overflow?current:overflow);
 },[count]);
 useEffect(()=>{
  measure();
  if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);}
  const observer=new ResizeObserver(measure);if(viewport.current)observer.observe(viewport.current);return()=>observer.disconnect();
 },[measure]);
 useEffect(()=>{
  const query=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(query.matches);update();query.addEventListener?.('change',update);return()=>query.removeEventListener?.('change',update);
 },[]);
 useEffect(()=>()=>window.clearTimeout(scrollTimer.current),[]);
 const move=useCallback((physicalIndex,behavior)=>{
  const logicalIndex=((physicalIndex%count)+count)%count;
  setIndex(logicalIndex);centerCard(physicalIndex,behavior);
 },[centerCard,count]);
 const onScroll=()=>{
  const el=viewport.current;if(!el)return;
  let nearest=0,distance=Infinity;
  [...el.children].forEach((card,i)=>{const d=Math.abs(card.getBoundingClientRect().left+card.clientWidth/2-(el.getBoundingClientRect().left+el.clientWidth/2));if(d<distance){distance=d;nearest=i;}});
  setIndex(nearest%count);
  window.clearTimeout(scrollTimer.current);
  if(nearest>=count)scrollTimer.current=window.setTimeout(()=>centerCard(nearest-count,'auto'),220);
 };
 const previous=()=>move(index===0?count-1:index-1);
 const next=()=>move(nextFeaturedPosition(index,count,overflows));
 const autoAdvance=canAutoAdvance({count,overflows,reducedMotion,paused});
 useEffect(()=>{
  if(!autoAdvance)return;
  const timer=window.setInterval(()=>{
   const target=nextFeaturedPosition(index,count,overflows);
   if(target!==index)move(target);
  },3600);
  return()=>window.clearInterval(timer);
 },[autoAdvance,count,index,move,overflows]);
 const handleKeyDown=event=>{if(event.key==='ArrowRight'){event.preventDefault();next();}else if(event.key==='ArrowLeft'){event.preventDefault();previous();}};
 const slides=overflows?[...items,...items]:items;
 return <div role="region" aria-roledescription="carousel" aria-label="Featured teachers" aria-live="off" tabIndex={0} onKeyDown={handleKeyDown} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPaused(false);}} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d7192d]">
  <div ref={viewport} onScroll={onScroll} className="featured-teacher-carousel -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-[9vw] pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
   {slides.map((teacher,slideIndex)=><div key={`${teacher.id}-${slideIndex>=count?'loop-':''}${slideIndex%count}`} role="group" aria-roledescription="slide" aria-label={`${slideIndex%count+1} of ${count}`} aria-hidden={slideIndex>=count||undefined} className="w-[82vw] max-w-[30rem] shrink-0 snap-center sm:w-[calc((100%_-_1rem)/2)] sm:max-w-none md:w-[calc((100%_-_2rem)/3)] lg:w-[calc((100%_-_3rem)/4)]"><TeacherCard teacher={teacher} delay={0}/></div>)}
  </div>
  {overflows&&<div className="mt-3 flex items-center justify-center gap-3"><button type="button" aria-label="Previous featured teacher" onClick={previous} className="rounded-full border border-slate-300 p-2 text-slate-700 transition hover:border-[#d7192d] hover:text-[#d7192d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7192d]"><ChevronLeft size={18}/></button>
   <span className="min-w-14 text-center text-sm font-medium tabular-nums text-slate-600" aria-live="polite" aria-label={`Teacher ${index+1} of ${count}`}>{index+1} / {count}</span>
   <button type="button" aria-label="Next featured teacher" onClick={next} className="rounded-full border border-slate-300 p-2 text-slate-700 transition hover:border-[#d7192d] hover:text-[#d7192d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7192d]"><ChevronRight size={18}/></button></div>}
 </div>;
}

export default function FeaturedTeachers({content}){
 const {loading,error,data,retry}=useTeachers({limit:48});
 return <section className="mx-auto max-w-7xl"><ScrollReveal className="section-heading"><span className="eyebrow">Meet the educators</span><h2>{content?.title||'Guidance from dedicated teachers.'}</h2><p>{content?.description||'Browse featured tutors and find someone who fits your learner’s needs.'}</p></ScrollReveal>
  {loading?<Loading/>:error?<div className="mt-4"><ErrorBox message={error} onRetry={retry}/></div>:!data.length?<div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center sm:px-8"><h3 className="font-semibold text-slate-900">Featured teachers are coming soon</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Our team is reviewing teacher profiles. Approved teachers with a complete public profile will appear here.</p><Link to="/parent-enquiry" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#d7192d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#b81225]">Request a tutor</Link></div>:<div className="mt-8"><FeaturedCarousel items={data}/></div>}
  <div className="mt-8 text-center"><Link to="/teachers" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d7192d]/25 px-5 py-3 text-sm font-semibold text-[#a91425] transition hover:border-[#d7192d] hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7192d]">View all teachers <ChevronRight size={16}/></Link></div>
 </section>;
}
