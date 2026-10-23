import {useEffect,useRef,useState} from 'react';
import {Link,NavLink,Outlet,useLocation} from 'react-router-dom';
import {ArrowUpRight,Menu,X} from 'lucide-react';
import {siteInfo} from '../data/siteInfo.js';
import {ThemeToggle} from '../context/ThemeContext.jsx';
import AnnouncementPopup from './AnnouncementPopup.jsx';
import usePublicSite from '../hooks/usePublicSite.js';

const navItems=[['/teachers','Find a tutor'],['/#how-it-works','How it works'],['/#about','About'],['/contact','Contact']];
function Navbar({brandName,logoUrl}){
 const [open,setOpen]=useState(false);const [scrolled,setScrolled]=useState(()=>typeof window!=='undefined'&&window.scrollY>24);const location=useLocation();const toggleRef=useRef(null);
 useEffect(()=>{setOpen(false);},[location.pathname,location.hash]);
 useEffect(()=>{let scheduled=false;let compact=window.scrollY>24;const update=()=>{if(scheduled)return;scheduled=true;window.requestAnimationFrame(()=>{const y=window.scrollY;const next=y>24?true:y<8?false:compact;if(next!==compact){compact=next;setScrolled(next);}scheduled=false;});};window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update);},[]);
 useEffect(()=>{if(!open)return;document.getElementById('mobile-navigation')?.querySelector('nav a')?.focus();const onKey=e=>{if(e.key==='Escape'){setOpen(false);toggleRef.current?.focus();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[open]);
 const activeAnchor=location.pathname==='/'?location.hash:'';
 const closeMenu=()=>{setOpen(false);toggleRef.current?.focus();};
 return <><a href="#main-content" className="skip-link">Skip to content</a><header className={`site-header sticky top-3 z-40 mx-3 mb-2 rounded-2xl border border-white/60 bg-white/75 backdrop-blur-xl sm:mx-5 lg:mx-8 ${scrolled?'is-scrolled':''}`}>
  <div className="site-nav-inner mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
   <Link to="/" className="brand-mark flex items-center gap-2.5" aria-label={`${brandName||siteInfo.brandName} home`}><img src={logoUrl||siteInfo.logoUrl} alt="TutorAtHome logo" width="44" height="44" className="h-10 w-10 rounded-xl bg-[#211f20] object-contain"/><span className="leading-tight"><span className="block text-[15px] font-bold tracking-tight text-[#0d203b]">{brandName||siteInfo.brandName}</span><span className="block text-[9px] font-semibold uppercase tracking-[.11em] text-slate-500">{siteInfo.tagline}</span></span></Link>
   <nav aria-label="Main navigation" className="hidden items-center gap-7 lg:flex">{navItems.map(([to,label])=>to.startsWith('/')&&to.includes('#')?<a key={label} href={to} aria-current={activeAnchor===to.slice(1)?'location':undefined} className={`nav-link ${activeAnchor===to.slice(1)?'is-active':''}`}>{label}</a>:<NavLink key={label} to={to} className={({isActive})=>`nav-link ${isActive?'is-active':''}`}>{label}</NavLink>)}</nav>
   <div className="nav-actions hidden items-center gap-2.5 lg:flex"><ThemeToggle/><Link to="/teacher-registration" className="nav-secondary">Teach with us</Link><Link to="/parent-enquiry" className="nav-primary">Find a tutor <ArrowUpRight size={15}/></Link></div>
   <div className="flex items-center gap-1 lg:hidden"><ThemeToggle/><button ref={toggleRef} type="button" className="menu-button" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpen(v=>!v)}>{open?<X size={20}/>:<Menu size={20}/>}</button></div>
  </div>
  <div id="mobile-navigation" className={`mobile-menu-overlay lg:hidden ${open?'mobile-menu-open':''}`} aria-hidden={!open} inert={!open?"":undefined}>
   <div className="mobile-menu-top"><Link to="/" onClick={closeMenu} className="mobile-menu-brand"><img src={logoUrl||siteInfo.logoUrl} alt="" width="40" height="40" className="h-10 w-10 rounded-xl bg-[#211f20] object-contain"/><span>{brandName||siteInfo.brandName}</span></Link><button type="button" className="mobile-menu-close" aria-label="Close navigation" onClick={closeMenu}><X size={22}/></button></div>
   <nav aria-label="Mobile navigation" onClick={closeMenu} className="mobile-menu-links">{navItems.map(([to,label])=>to.includes('#')?<a key={label} href={to} aria-current={activeAnchor===to.slice(1)?'location':undefined} className={`mobile-menu-link ${activeAnchor===to.slice(1)?'is-active':''}`}>{label}</a>:<NavLink key={label} to={to} className={({isActive})=>`mobile-menu-link ${isActive?'is-active':''}`}>{label}</NavLink>)}<Link to="/teacher-registration" className="mobile-menu-link">Teach with us</Link><Link to="/parent-enquiry" className="mobile-menu-cta">Find a tutor <ArrowUpRight size={17}/></Link></nav>
  </div>
 </header></>;
}
export default function Layout(){const publicSite=usePublicSite();return <><Navbar brandName={publicSite.settings?.brandName} logoUrl={publicSite.settings?.logoUrl}/><main id="main-content"><Outlet context={publicSite}/></main><AnnouncementPopup/></>;}
