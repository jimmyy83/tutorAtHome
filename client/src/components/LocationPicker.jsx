import {useEffect,useMemo,useRef,useState} from 'react';
import {Crosshair,MapPin,Minus,Plus} from 'lucide-react';

const TILE=256,START={lat:20.5937,lng:78.9629};
const toWorld=({lat,lng},zoom)=>{const scale=TILE*2**zoom,clamped=Math.max(-85.0511,Math.min(85.0511,lat)),sin=Math.sin(clamped*Math.PI/180);return{x:(lng+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};};
const fromWorld=({x,y},zoom)=>{const scale=TILE*2**zoom,n=Math.PI-2*Math.PI*y/scale;return{lat:180/Math.PI*Math.atan(Math.sinh(n)),lng:x/scale*360-180};};
const wrap=(x,n)=>((x%n)+n)%n;

/** Lightweight, responsive OpenStreetMap picker with a fixed pin and drag-to-pan. */
export default function LocationPicker({onSelect}){
 const mapRef=useRef(null),drag=useRef(null),[size,setSize]=useState({width:640,height:300}),[center,setCenter]=useState(START),[zoom,setZoom]=useState(5),[selected,setSelected]=useState(false),[locating,setLocating]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const el=mapRef.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setSize({width:Math.round(entry.contentRect.width),height:Math.round(entry.contentRect.height)}));observer.observe(el);return()=>observer.disconnect();},[]);
 const centerWorld=useMemo(()=>toWorld(center,zoom),[center,zoom]);
 const tiles=useMemo(()=>{const left=centerWorld.x-size.width/2,top=centerWorld.y-size.height/2,n=2**zoom,firstX=Math.floor(left/TILE)-1,lastX=Math.floor((left+size.width)/TILE)+1,firstY=Math.floor(top/TILE)-1,lastY=Math.floor((top+size.height)/TILE)+1,result=[];for(let y=firstY;y<=lastY;y++){if(y<0||y>=n)continue;for(let x=firstX;x<=lastX;x++)result.push({key:`${zoom}-${x}-${y}`,src:`https://tile.openstreetmap.org/${zoom}/${wrap(x,n)}/${y}.png`,left:x*TILE-left,top:y*TILE-top});}return result;},[centerWorld,size,zoom]);
 const update=(world)=>{const point=fromWorld(world,zoom);point.lng=((point.lng+540)%360)-180;setCenter(point);setSelected(true);setError('');onSelect(point);};
 const pointerDown=e=>{if(e.button!==0)return;const rect=mapRef.current.getBoundingClientRect();drag.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,center:centerWorld,rect,moved:false};mapRef.current.setPointerCapture(e.pointerId);};
 const pointerMove=e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.startX,dy=e.clientY-d.startY;if(Math.abs(dx)+Math.abs(dy)>4)d.moved=true;if(d.moved)update({x:d.center.x-dx,y:d.center.y-dy});};
 const pointerUp=e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;if(!d.moved){const pointWorld={x:centerWorld.x+(e.clientX-d.rect.left-d.rect.width/2),y:centerWorld.y+(e.clientY-d.rect.top-d.rect.height/2)};update(pointWorld);}drag.current=null;};
 const locate=()=>{if(!navigator.geolocation){setError('Location access is not available in this browser.');return;}setLocating(true);setError('');navigator.geolocation.getCurrentPosition(({coords})=>{const point={lat:coords.latitude,lng:coords.longitude};setCenter(point);setSelected(true);onSelect(point);setLocating(false);},()=>{setError('Could not access your location. You can still move the map and choose a point.');setLocating(false);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});};
 return <section className="location-picker sm:col-span-2" aria-label="Choose tuition location on map">
  <div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-800">Set location on map <span className="font-normal text-slate-500">(optional)</span></h3><p className="mt-1 text-xs leading-5 text-slate-500">Click or drag the map to place an approximate pin. The map does not verify your address or service coverage.</p></div><button type="button" onClick={locate} disabled={locating} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-[#4777a4] hover:bg-slate-50 disabled:opacity-60"><Crosshair size={15}/>{locating?'Locating…':'Use my location'}</button></div>
  <div ref={mapRef} className="location-map" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{drag.current=null;}} role="application" aria-label="Interactive map. Click or drag to choose a location." tabIndex={0} onKeyDown={e=>{const step=TILE*.35;if(e.key==='ArrowLeft')update({x:centerWorld.x-step,y:centerWorld.y});else if(e.key==='ArrowRight')update({x:centerWorld.x+step,y:centerWorld.y});else if(e.key==='ArrowUp')update({x:centerWorld.x,y:centerWorld.y-step});else if(e.key==='ArrowDown')update({x:centerWorld.x,y:centerWorld.y+step});else if(e.key==='+'||e.key==='=')setZoom(v=>Math.min(18,v+1));else if(e.key==='-')setZoom(v=>Math.max(3,v-1));else return;e.preventDefault();}}>
   {tiles.map(tile=><img key={tile.key} className="location-map-tile" src={tile.src} alt="" draggable="false" style={{left:tile.left,top:tile.top}} loading="lazy"/>)}
   <div className="location-map-pin" aria-hidden="true"><MapPin size={36} fill="#f4bd62" stroke="#0c284b" strokeWidth={1.8}/></div>
   <div className="location-map-zoom" onPointerDown={e=>e.stopPropagation()}><button type="button" aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(18,v+1))}><Plus size={18}/></button><button type="button" aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(3,v-1))}><Minus size={18}/></button></div>
   <div className="location-map-hint">{selected?'Pin location selected':'Move map to place pin'}</div>
   <div className="location-map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={e=>e.stopPropagation()}>OpenStreetMap contributors</a></div>
  </div>
  <div className="mt-2 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">{selected?<span>Pin: {center.lat.toFixed(5)}, {center.lng.toFixed(5)}</span>:<span>No map pin selected yet.</span>}{error&&<span role="status" className="text-amber-700">{error}</span>}</div>
 </section>;
}
