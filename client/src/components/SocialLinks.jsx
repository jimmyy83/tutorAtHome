import {Facebook,Globe,Instagram,Link2,Linkedin,MessageCircle,Twitter,Youtube} from 'lucide-react';
import ScrollReveal from './ScrollReveal.jsx';
import {buildWhatsAppUrl} from '../utils/whatsapp.js';

const iconById={instagram:Instagram,facebook:Facebook,youtube:Youtube,linkedin:Linkedin,x:Twitter,whatsapp:MessageCircle,globe:Globe,link:Link2};
export const socialIconOptions=[['instagram','Instagram'],['facebook','Facebook'],['youtube','YouTube'],['linkedin','LinkedIn'],['x','X'],['whatsapp','WhatsApp'],['globe','Globe'],['link','Link']];

export function SocialLinkItem({link,preview=false,variant='dark',whatsappRecipient=''}){
 const isWhatsApp=link?.icon==='whatsapp'||String(link?.platform||'').toLowerCase()==='whatsapp';
 let safeUrl=isWhatsApp?buildWhatsAppUrl(whatsappRecipient):'';
 if(!isWhatsApp){try{const url=new URL(link.url);if(url.protocol==='https:')safeUrl=url.href;}catch{}}
 if(!safeUrl)return null;
 const Icon=iconById[link.icon]||Globe;
 const colors=variant==='light'?'border-slate-200 bg-white text-slate-700 hover:border-[#b3262d]/35 hover:bg-rose-50 hover:text-slate-950 focus-visible:outline-[#245b96]':'border-white/15 bg-white/[.06] text-slate-200 hover:border-[#f4bd62]/50 hover:bg-white/10 hover:text-white focus-visible:outline-[#f4bd62]';
 return <a href={safeUrl} target="_blank" rel="noopener noreferrer" aria-label={`${link.label} on ${link.platform}${preview?' (preview)':''}`} className={`group inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${colors}`}>
  <Icon aria-hidden="true" size={16} className="shrink-0 text-[#b3262d] transition-transform duration-200 group-hover:scale-110"/><span>{link.label}</span>
 </a>;
}

export default function SocialLinks({links=[],placement='footer',preview=false,variant='dark',whatsappRecipient=''}){
 const visible=(Array.isArray(links)?links:[]).filter(link=>link?.active!==false&&(preview||link.placement==='both'||link.placement===placement)).sort((a,b)=>(a.order||0)-(b.order||0));
 if(!visible.length)return null;
 return <ScrollReveal as="section" aria-label="Social media links" className="social-links"><h2 className={`text-sm font-semibold ${variant==='light'?'text-slate-800':'text-white'}`}>Follow us</h2><div className="mt-3 flex flex-wrap gap-2">{visible.map(link=><SocialLinkItem key={link.id||`${link.platform}-${link.label}`} link={link} preview={preview} variant={variant} whatsappRecipient={whatsappRecipient}/>)}</div>{visible.some(link=>link?.icon==="whatsapp"||String(link?.platform||"").toLowerCase()==="whatsapp")&&<p className={`mt-2 text-xs ${variant==="light"?"text-slate-500":"text-slate-400"}`}>WhatsApp opens with a prefilled message. Review it and press Send in WhatsApp.</p>}</ScrollReveal>;
}