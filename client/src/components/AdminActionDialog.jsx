import { useEffect, useRef, useState } from 'react';

export default function AdminActionDialog({ open, title, description, recordType, recordLabel, recordId, variant = 'danger', busy = false, requiresReason = false, confirmLabel = 'Confirm', onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    confirmRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel?.(); }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled])') || [])];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus.current?.focus?.(); };
  }, [open, busy]);

  useEffect(() => { if (open) setReason(''); }, [open]);
  if (!open) return null;
  const destructive = variant === 'danger';
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onCancel?.(); }}>
    <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="admin-action-title" aria-describedby="admin-action-description" className="my-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
      <div className={`mb-4 h-1.5 w-14 rounded-full ${destructive ? 'bg-red-600' : 'bg-amber-500'}`} />
      <h2 id="admin-action-title" className="text-lg font-semibold text-slate-900">{title}</h2>
      <p id="admin-action-description" className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {(recordType || recordLabel || recordId !== undefined) && <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm"><dt className="text-slate-500">Type</dt><dd className="font-medium text-slate-800">{recordType || 'Record'}</dd>{recordLabel&&<><dt className="text-slate-500">Record</dt><dd className="break-words font-medium text-slate-800">{recordLabel}</dd></>}{recordId!==undefined&&<><dt className="text-slate-500">ID</dt><dd className="font-medium text-slate-800">{recordId}</dd></>}</dl>}
      {requiresReason&&<label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-800">Internal reason<textarea autoFocus rows={3} maxLength={500} required value={reason} onChange={event=>setReason(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 focus:border-[#d7192d] focus:outline-none focus:ring-2 focus:ring-red-100" placeholder="Enter a short reason for the audit record"/><span className="text-xs font-normal text-slate-500">Required · up to 500 characters</span></label>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button><button ref={confirmRef} type="button" disabled={busy || (requiresReason && !reason.trim())} onClick={() => onConfirm?.(reason.trim())} className={`min-h-11 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${destructive ? 'bg-red-800 hover:bg-red-900' : 'bg-amber-700 hover:bg-amber-800'}`}>{busy ? 'Working…' : confirmLabel}</button></div>
    </section>
  </div>;
}
