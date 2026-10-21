import {Link,useOutletContext} from 'react-router-dom';
import {ArrowLeft,ArrowRight,MapPin,Phone} from 'lucide-react';
import ScrollReveal from '../components/ScrollReveal.jsx';
import SeoHead from '../components/SeoHead.jsx';
import {serviceCities} from '../data/serviceAreas.js';
import {educationCatalogDefaults} from '../data/educationCatalog.js';
import {siteInfo} from '../data/siteInfo.js';

export default function CityLandingPage({city}){
 const valid=serviceCities.includes(city);
 const {settings}=useOutletContext()||{};
 const catalog=settings?.educationCatalog||educationCatalogDefaults;
 const levels=(catalog.educationLevels||[]).filter(item=>item.active!==false).sort((a,b)=>a.order-b.order);
 const streams=(catalog.streams||[]).filter(item=>item.active!==false).sort((a,b)=>a.order-b.order);
 const exams=(catalog.competitiveExams||[]).filter(item=>item.active!==false).sort((a,b)=>a.order-b.order);
 const offices=siteInfo.offices.filter(office=>office.city===city);
 const subjects=settings?.subjects?.length?settings.subjects:[];
 return <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 md:py-16">
  <SeoHead page={valid?'city':'notFound'} city={city} settings={settings} noIndex={!valid} breadcrumbs={valid?[[{name:'Home',path:'/'},{name:'Home tutors in '+city,path:'/home-tutors-'+city.toLowerCase()}]]:[]}/>
  <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#a91425] hover:underline"><ArrowLeft size={16}/> Home</Link>
  {valid?<>
   <ScrollReveal className="section-heading"><span className="eyebrow">Local tuition support · Uttar Pradesh</span><h1>Home tutors in {city} for school and online learning.</h1><p>Explore one-to-one tuition for Nursery to Class 12 in {city}. Share your class, subjects and area with TutorAtHome; our team will confirm tutor availability for your requirements.</p><Link to="/parent-enquiry" className="brand-cta mt-6 inline-flex min-h-12 items-center gap-2 rounded-full px-6 py-3 font-semibold text-white">Enquire for {city} <ArrowRight size={16}/></Link></ScrollReveal>
   <section className="mt-12 grid gap-4 md:grid-cols-3" aria-label={city+' tuition options'}>
    <article className="rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-rose-50 p-5"><h2 className="text-lg font-semibold">Class-wise tuition</h2><p className="mt-2 text-sm leading-6 text-slate-600">Support options span {levels[0]?.label||'early learning'} to {levels.at(-1)?.label||'Class 12'}, subject to the learner’s board and current tutor availability.</p></article>
    <article className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-slate-50 p-5"><h2 className="text-lg font-semibold">Subjects and streams</h2><p className="mt-2 text-sm leading-6 text-slate-600">{streams.length?streams.map(item=>item.label).join(', '):subjects.join(', ')||'School subjects'} are available to discuss. Subject combinations may vary by board and school.</p></article>
    <article className="rounded-2xl border border-amber-100 bg-gradient-to-br from-white to-rose-50 p-5"><h2 className="text-lg font-semibold">Exam preparation</h2><p className="mt-2 text-sm leading-6 text-slate-600">{exams.length?exams.map(item=>item.label).join(', ')+' preparation enquiries are accepted.':'Ask our team about current preparation options.'} Our team confirms subject and tutor availability before matching.</p></article>
   </section>
   <section className="mt-12 rounded-[1.5rem] border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-semibold">How to find a tutor in {city}</h2><ol className="mt-4 grid gap-4 sm:grid-cols-3"><li><b>1. Share your needs</b><p className="mt-1 text-sm leading-6 text-slate-600">Tell us the learner’s class, subjects, preferred schedule and area.</p></li><li><b>2. We review availability</b><p className="mt-1 text-sm leading-6 text-slate-600">Our team checks your request against currently available tutor profiles.</p></li><li><b>3. We follow up</b><p className="mt-1 text-sm leading-6 text-slate-600">We contact you to discuss suitable options and next steps.</p></li></ol><Link to="/parent-enquiry" className="mt-6 inline-flex items-center gap-2 font-semibold text-[#a91425]">Start a parent enquiry <ArrowRight size={16}/></Link></section>
   {offices.length>0&&<section className="mt-12"><h2 className="text-xl font-semibold">TutorAtHome office in {city}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{offices.map((office,index)=><address key={index} className="rounded-2xl border border-slate-200 bg-white p-5 not-italic"><p className="flex items-center gap-2 font-semibold"><MapPin size={16} className="text-[#b3262d}"/>{office.city}, Uttar Pradesh</p><p className="mt-2 text-sm leading-6 text-slate-600">{office.address}</p>{office.phone&&<a href={'tel:'+(office.phoneLink||office.phone)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#245b96]"><Phone size={15}/>{office.phone}</a>}</address>)}</div></section>}
   <p className="mt-8 text-sm text-slate-500">See <Link to="/contact" className="underline">all contact details</Link> or <Link to="/teachers" className="underline">browse approved teachers</Link>.</p>
  </>:<section><h1>Service area not found</h1><p className="mt-3 text-slate-600">This TutorAtHome service area is not available.</p><Link to="/" className="mt-5 inline-flex underline">Return home</Link></section>}
 </div>;
}