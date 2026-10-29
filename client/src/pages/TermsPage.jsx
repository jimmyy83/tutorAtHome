import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../services/apiClient.js';
import ScrollReveal from '../components/ScrollReveal.jsx';
import SeoHead from '../components/SeoHead.jsx';

const dateLabel = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Date unavailable';
export default function TermsPage() {
  const [terms, setTerms] = useState(null), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); api.get('/public/terms', { signal: controller.signal }).then(setTerms).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  return <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 md:py-16"><SeoHead page="terms"/><Link to="/teacher-registration" className="inline-flex items-center gap-2 text-sm font-semibold text-[#a91425] hover:underline"><ArrowLeft size={16}/>Back to teacher registration</Link><ScrollReveal className="mt-8"><span className="eyebrow">TutorAtHome policies</span><h1 className="mt-2 font-serif text-4xl text-slate-900 sm:text-5xl">Terms &amp; Conditions</h1>{terms&&<p className="mt-3 text-sm text-slate-500">Version {terms.versionNumber} · Last updated: {dateLabel(terms.lastUpdatedAt)}</p>}</ScrollReveal>{error?<div role="alert" className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">The current terms could not be loaded. Please try again later. ({error})</div>:!terms?<p role="status" className="mt-8 text-sm text-slate-500">Loading the current published terms…</p>:<section className="mt-7 rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><ol className="list-decimal space-y-4 pl-5 text-base leading-7 text-slate-700">{terms.content.map((condition,index)=><li key={`${index}-${condition}`}>{condition}</li>)}</ol></section>}</main>;
}
