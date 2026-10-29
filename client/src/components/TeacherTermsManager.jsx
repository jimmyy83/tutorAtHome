import { useCallback, useEffect, useState } from 'react';
import { Eye, FileText, History, Save, Send } from 'lucide-react';
import { api } from '../services/apiClient.js';
import { inputCls } from './FormField.jsx';
import { validateTeacherTermsDraft } from '../utils/teacherTermsDraft.js';

const dateLabel = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Not recorded';
const versionLabel = item => `v${item.versionNumber} · ${item.id}`;

export default function TeacherTermsManager({ token }) {
  const [data, setData] = useState(null), [text, setText] = useState(''), [summary, setSummary] = useState('');
  const [selectedVersion, setSelectedVersion] = useState(null), [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldErrors, setFieldErrors] = useState({}), [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    const result = await api.get('/admin/terms', { authToken: token });
    setData(result); setText((result.draft?.content || result.current.content).join('\n')); setSummary(result.draft?.changeSummary || ''); setSelectedVersion(null);
    return result;
  }, [token]);
  useEffect(() => { let alive = true; setLoading(true); api.get('/admin/terms', { authToken: token }).then(result => { if (alive) { setData(result); setText((result.draft?.content || result.current.content).join('\n')); setSummary(result.draft?.changeSummary || ''); } }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [token]);
  const validation = validateTeacherTermsDraft(text, summary), terms = validation.content;
  const savedText = (data?.draft?.content || data?.current?.content || []).join('\n');
  const dirty = text !== savedText || summary !== (data?.draft?.changeSummary || '');
  const canPublish = !!data?.draft && !dirty;
  const saveDraft = async () => {
    if (!data) return;
    if (!validation.valid) { setFieldErrors(validation.fields); setError('Correct the highlighted fields before saving.'); return; }
    setBusy(true); setError(''); setFieldErrors({}); setNotice('');
    try {
      await api.put('/admin/terms/draft', { content: terms, changeSummary: summary, expectedRevision: data.revision, expectedCurrentVersionId: data.current.id }, { authToken: token });
      await reload(); setNotice('Draft saved. Published terms are unchanged.');
    } catch (e) { setError(e.message); setFieldErrors(e.fields||{}); if (e.code === 'TERMS_EDIT_CONFLICT') { try { await reload(); setNotice('The latest terms were reloaded. Review the current draft before continuing.'); } catch {} } }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!canPublish) { setError('Save the latest draft before publishing.'); return; }
    setBusy(true); setError(''); setFieldErrors({}); setNotice('');
    try {
      await api.post('/admin/terms/publish', { expectedRevision: data.revision, expectedCurrentVersionId: data.current.id, expectedDraftVersionId: data.draft.id }, { authToken: token });
      await reload(); setNotice('A new immutable terms version is now published.');
    } catch (e) { setError(e.message); setFieldErrors(e.fields||{}); if (e.code === 'TERMS_EDIT_CONFLICT') { try { await reload(); } catch {} } }
    finally { setBusy(false); }
  };
  const inspectVersion = async id => {
    setError('');
    try { setSelectedVersion(await api.get(`/admin/terms/versions/${encodeURIComponent(id)}`, { authToken: token })); }
    catch (e) { setError(e.message); }
  };
  if (loading) return <section className="max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading terms versions…</section>;
  if (!data) return <section className="max-w-5xl rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Manage Terms &amp; Conditions</h2><p role="alert" className="mt-3 text-sm text-red-700">{error || 'Published terms could not be loaded.'}</p><button type="button" onClick={() => { setLoading(true); reload().catch(e => setError(e.message)).finally(() => setLoading(false)); }} className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Retry</button></section>;
  const inspected = selectedVersion || data.current;
  const previewTerms = preview ? terms : [];
  return <section className="max-w-5xl rounded-[1.4rem] border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="eyebrow">Published policy history</span><h2 className="mt-1 text-xl font-semibold">Manage Terms &amp; Conditions</h2><p className="mt-1 text-sm text-slate-500">Published versions are immutable. Save a draft to edit, then explicitly publish it.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">Current · v{data.current.versionNumber}</span></div>
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold">Current publication</p><p className="mt-1 text-sm text-slate-600">{versionLabel(data.current)} · Published {dateLabel(data.current.publishedAt)} · Last updated {dateLabel(data.current.updatedAt||data.current.publishedAt)}</p>{data.current.publishedBy?.name&&<p className="mt-1 text-xs text-slate-500">Published by {data.current.publishedBy.name}</p>}</div>
    <label className="mt-5 grid gap-1.5 text-sm font-medium">Terms content <span className="text-xs font-normal text-slate-500">One condition per line; 1–500 conditions, up to 3,000 characters each. Numbered subclauses remain separate. Saving creates or updates an unpublished draft; publication requires a separate action.</span><textarea className={`${inputCls} min-h-64 leading-6 ${fieldErrors.content?'border-red-500':''}`} value={text} onChange={event=>{setText(event.target.value);setFieldErrors(value=>({...value,content:''}));}} spellCheck="true" aria-label="Terms and Conditions draft content" aria-invalid={!!fieldErrors.content}/>{fieldErrors.content&&<span className="text-xs font-normal text-red-700">{fieldErrors.content}</span>}</label>
    <label className="mt-4 grid gap-1.5 text-sm font-medium">Change summary (optional)<span className="text-xs font-normal text-slate-500">Maximum 300 characters.</span><input className={`${inputCls} ${fieldErrors.changeSummary?'border-red-500':''}`} maxLength={300} value={summary} onChange={event=>{setSummary(event.target.value);setFieldErrors(value=>({...value,changeSummary:''}));}} aria-invalid={!!fieldErrors.changeSummary}/>{fieldErrors.changeSummary&&<span className="text-xs font-normal text-red-700">{fieldErrors.changeSummary}</span>}</label>
    {data.draft&&<p className="mt-3 text-xs text-amber-800">Unpublished draft v{data.draft.versionNumber} · Updated {dateLabel(data.draft.updatedAt||data.draft.createdAt)}{data.draft.updatedBy?.name?` by ${data.draft.updatedBy.name}`:''}</p>}
    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={saveDraft} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"><Save size={15}/>Save draft</button><button type="button" onClick={()=>setPreview(value=>!value)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold"><Eye size={15}/>{preview?'Hide preview':'Preview draft'}</button><button type="button" disabled={busy||!canPublish} onClick={publish} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0c284b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send size={15}/>Publish new version</button></div>{!canPublish&&!busy&&<p className="mt-2 text-xs text-slate-600">{dirty?'Save your current changes as a draft before publishing.':!data.draft?'Save a draft first; the published version will remain unchanged until you publish it.':''}</p>}
    {preview&&<div className="mt-5 rounded-xl border border-rose-200 bg-rose-50/50 p-4"><h3 className="font-semibold">Draft preview</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">{previewTerms.map((line,index)=><li key={`${index}-${line}`}>{line}</li>)}</ol></div>}
    <div className="mt-7 grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><section><h3 className="inline-flex items-center gap-2 font-semibold"><History size={17}/>Version history</h3><ul className="mt-3 grid gap-2">{data.versions.map(version=><li key={version.id}><button type="button" onClick={()=>inspectVersion(version.id)} className={`w-full rounded-xl border p-3 text-left transition ${inspected.id===version.id?'border-[#d7192d] bg-rose-50':'border-slate-200 hover:bg-slate-50'}`}><span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{versionLabel(version)}</span><span className="text-xs font-normal capitalize text-slate-500">{version.isCurrent?'Current':version.status}</span></span><span className="mt-1 block text-xs text-slate-500">{version.status==='published'?`Published ${dateLabel(version.publishedAt)}`:`Draft created ${dateLabel(version.createdAt)}`}</span>{version.publishedBy?.name&&<span className="mt-1 block text-xs text-slate-500">By {version.publishedBy.name}</span>}</button></li>)}</ul></section><section className="rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-2"><FileText size={17}/><h3 className="font-semibold">{versionLabel(inspected)}</h3></div><p className="mt-1 text-xs text-slate-500">{inspected.status==='published'?`Published ${dateLabel(inspected.publishedAt)}`:`Created ${dateLabel(inspected.createdAt)}`}</p>{inspected.changeSummary&&<p className="mt-2 text-sm text-slate-600">{inspected.changeSummary}</p>}<ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">{(inspected.content||[]).map((line,index)=><li key={`${index}-${line}`}>{line}</li>)}</ol></section></div>
  </section>;
}
