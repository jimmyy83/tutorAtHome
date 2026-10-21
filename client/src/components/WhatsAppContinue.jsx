import {ArrowUpRight,MessageCircle} from 'lucide-react';
import {Link} from 'react-router-dom';
import {buildWhatsAppUrl} from '../utils/whatsapp.js';

export default function WhatsAppContinue({recipient,message}) {
 const href=buildWhatsAppUrl(recipient,message);
 return <div className="mt-7">
  {href?<>
   <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
    <MessageCircle size={18}/> Continue in WhatsApp <ArrowUpRight size={16}/>
   </a>
   <p className="mt-3 text-sm leading-6 text-slate-600">WhatsApp will open with a prefilled message. Review it and press Send in WhatsApp.</p>
  </>:<>
   <p role="status" className="text-sm leading-6 text-slate-600">WhatsApp contact is not configured. Your submission is saved; please contact our team directly.</p>
   <Link to="/contact" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">Contact us</Link>
  </>}
 </div>;
}
