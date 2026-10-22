import {useEffect,useRef} from 'react';

const randomBetween=(min,max)=>min+Math.random()*(max-min);

/** Decorative, low-cost 3D particle field for the landing hero. */
export default function HeroParticles(){
 const canvasRef=useRef(null);
 useEffect(()=>{
  const canvas=canvasRef.current,context=canvas?.getContext('2d');
  if(!canvas||!context)return;
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width=0,height=0,frame=0,inViewport=false,startedAt=performance.now();
  let pointerX=0,pointerY=0,targetX=0,targetY=0,particles=[];
  const resize=()=>{cancelAnimationFrame(frame);frame=0;
   const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
   const ratio=Math.min(window.devicePixelRatio||1,1.5);
   canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
   context.setTransform(ratio,0,0,ratio,0,0);
   const count=width<640?38:width<1024?68:108;
   particles=Array.from({length:count},()=>({x:randomBetween(-1,1),y:randomBetween(-1,1),z:randomBetween(-1,1),radius:randomBetween(.7,2.1),tone:Math.random()<.2?'white':Math.random()<.42?'blue':'red',phase:randomBetween(0,Math.PI*2)}));
   draw(performance.now());
  };
  const draw=now=>{
   if(!width||!height)return;
   context.clearRect(0,0,width,height);
   const elapsed=(now-startedAt)/1000;
   const motion=reduceMotion?0:elapsed;
   pointerX+=(targetX-pointerX)*.035;pointerY+=(targetY-pointerY)*.035;
   const rotateY=motion*.045+(reduceMotion?0:pointerX*.08),rotateX=Math.sin(motion*.18)*.025+(reduceMotion?0:pointerY*.035);
   const projected=particles.map(p=>{
    const drift=reduceMotion?0:Math.sin(motion*.4+p.phase)*.018;
    const x=p.x+drift,y=p.y+Math.cos(motion*.33+p.phase)*drift*.7,z=p.z;
    const rx=x*Math.cos(rotateY)-z*Math.sin(rotateY),rz=x*Math.sin(rotateY)+z*Math.cos(rotateY);
    const ry=y*Math.cos(rotateX)-rz*Math.sin(rotateX),depth=y*Math.sin(rotateX)+rz*Math.cos(rotateX);
    const perspective=1/(1.24+depth*.28);
    return{x:width/2+rx*width*.47*perspective,y:height/2+ry*height*.48*perspective,depth,radius:p.radius*perspective,alpha:.18+(1-depth)*.13,tone:p.tone};
   });
   const maxLink=width<640?62:92;
   for(let i=0;i<projected.length;i++)for(let j=i+1;j<projected.length;j++){
    const a=projected[i],b=projected[j],dx=a.x-b.x,dy=a.y-b.y,distance=Math.hypot(dx,dy);
    if(distance<maxLink){context.strokeStyle=`rgba(151,196,235,${(1-distance/maxLink)*.105})`;context.lineWidth=.7;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}
   }
   projected.forEach(point=>{context.beginPath();context.arc(point.x,point.y,point.radius,0,Math.PI*2);context.fillStyle=point.tone==='white'?`rgba(255,255,255,${point.alpha*.55})`:point.tone==='blue'?`rgba(133,163,205,${point.alpha*.6})`:`rgba(255,105,122,${point.alpha})`;context.fill();});
   if(!reduceMotion&&inViewport&&!document.hidden)frame=requestAnimationFrame(draw);
  };
  const onPointerMove=e=>{if(!inViewport)return;targetX=(e.clientX/Math.max(window.innerWidth,1)-.5)*2;targetY=(e.clientY/Math.max(window.innerHeight,1)-.5)*2;};
  const onVisibility=()=>{if(!document.hidden&&inViewport&&!reduceMotion){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}else{cancelAnimationFrame(frame);frame=0;}};
  const viewportObserver=new IntersectionObserver(([entry])=>{inViewport=entry.isIntersecting;if(inViewport)draw(performance.now());else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:"100px"});viewportObserver.observe(canvas);
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  window.addEventListener('pointermove',onPointerMove,{passive:true});document.addEventListener('visibilitychange',onVisibility);
  return()=>{observer.disconnect();viewportObserver.disconnect();window.removeEventListener('pointermove',onPointerMove);document.removeEventListener('visibilitychange',onVisibility);cancelAnimationFrame(frame);};
 },[]);
 return <canvas ref={canvasRef} aria-hidden="true" className="hero-particles"/>;
}
