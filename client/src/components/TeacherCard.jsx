import {MapPin,UserRound} from 'lucide-react';
import ScrollReveal from './ScrollReveal.jsx';
// Public card: shows ONLY name, location, photo, subjects.
export default function TeacherCard({teacher:{name,location,photo,subjects},delay=0}){
return(<ScrollReveal as="article" direction={Math.floor(delay/70)%2?'right':'left'} delay={delay} className="teacher-card rounded-[1.5rem] border border-slate-200/80 bg-white p-5 text-center shadow-sm sm:p-6">
{photo?<img src={photo} alt={name} loading="lazy" width="96" height="96" className="teacher-photo mx-auto h-24 w-24 rounded-full object-cover"/>:
<div role="img" aria-label={`${name} profile photo placeholder`} className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#dce9e5] text-[#526b61]"><UserRound size={48} strokeWidth={1.8}/></div>}
<h3 className="mt-3 font-semibold">{name}</h3>
<p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-500"><MapPin size={14}/>{location}</p>
<p className="mt-3 text-sm leading-6"><span className="font-medium text-brand-700">Expert in:</span> {subjects.join(', ')}</p></ScrollReveal>);}
