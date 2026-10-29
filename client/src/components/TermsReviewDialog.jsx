import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { hasReachedTermsEnd } from '../utils/termsConsent.js';

const dateLabel = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Date unavailable';

export default function TermsReviewDialog({ terms, onClose, onReachedBottom, hasReachedBottom }) {
  const scrollRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = event => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!terms) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="terms-review-title" className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111c2a]" style={{ height: 'min(84vh, 860px)' }}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-6 dark:border-slate-700">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a91425]">Published version {terms.versionNumber}</p><h2 id="terms-review-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Terms &amp; Conditions</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Last updated: {dateLabel(terms.lastUpdatedAt)}</p></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close terms viewer" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a91425] dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><X size={18}/></button>
      </header>
      <div ref={scrollRef} tabIndex={0} aria-label="Published Terms & Conditions content" onScroll={event => { if (hasReachedTermsEnd(event.currentTarget)) onReachedBottom(terms.versionId); }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7" style={{ maxHeight: 'min(62vh, 560px)' }}>
        <div style={{ minHeight: 'calc(100% + 4px)' }}><ol className="list-decimal space-y-4 pl-5 text-sm leading-7 text-slate-700 dark:text-slate-200">{terms.content.map((condition, index) => <li key={`${index}-${condition}`}>{condition}</li>)}</ol>
        <p className="mt-6 border-t border-slate-200 pt-4 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300">End of the published terms.</p></div>
      </div>
      <footer className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-700">
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{hasReachedBottom ? 'You reached the end. Close this window and explicitly check the consent box to continue.' : 'Scroll through the complete terms to the bottom to enable consent.'}</p>
        <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-[#0c284b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#163e69]">Close</button>
      </footer>
    </section>
  </div>;
}
