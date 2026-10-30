import { useEffect, useState } from 'react';
import { updateAdminSearch } from '../utils/adminSearch.js';

const input = 'min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800';

export default function AdminLocationGroupFilter({ type, groups = [], selectedGroup = '', onGroupChange, locality = '', onLocalityChange, status = '', onStatusChange, blocked = '', onBlockedChange, archived = 'false', onArchivedChange, search = '', onSearchChange, page = 1, totalPages = 1, onPageChange }) {
  const group = groups.find(item => item.key === selectedGroup);
  const statuses = type === 'teachers' ? ['pending', 'approved', 'rejected'] : ['new', 'contacted', 'in_progress', 'matched', 'closed'];
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);
  useEffect(() => {
    if (searchDraft === search) return undefined;
    const timer = setTimeout(() => updateAdminSearch(searchDraft, onSearchChange, () => onPageChange(1)), 250);
    return () => clearTimeout(timer);
  }, [searchDraft, search, onSearchChange, onPageChange]);
  return <section aria-label={`${type === 'teachers' ? 'Teacher' : 'Parent lead'} location filters`} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-sm font-semibold text-slate-900">Organize by district</h2>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" aria-pressed={!selectedGroup} onClick={() => onGroupChange('')} className={`rounded-full border px-3 py-2 text-xs font-semibold ${!selectedGroup ? 'border-[#0c284b] bg-[#0c284b] text-white' : 'border-slate-300 text-slate-700'}`}>All {type === 'teachers' ? 'Teachers' : 'Leads'}</button>
      {groups.map(item => <button type="button" key={item.key} aria-pressed={selectedGroup === item.key} onClick={() => onGroupChange(item.key)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${selectedGroup === item.key ? 'border-[#0c284b] bg-[#0c284b] text-white' : item.key === 'unspecified' ? 'border-amber-300 text-amber-900' : 'border-slate-300 text-slate-700'}`}>
        {item.key === 'unspecified' ? 'Location Not Specified' : `${item.state ? `${item.state} · ` : ''}${item.district}`} <span className="opacity-75">({item.count})</span>
      </button>)}
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <label className="grid gap-1 text-xs font-medium text-slate-600">Search<input type="search" autoComplete="off" className={input} value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Name, phone or reference"/></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Status<select className={input} value={status} onChange={event => onStatusChange(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Block state<select className={input} value={blocked} onChange={event => onBlockedChange(event.target.value)}><option value="">All</option><option value="false">Not blocked</option><option value="true">Blocked</option></select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Record state<select className={input} value={archived} onChange={event => onArchivedChange(event.target.value)}><option value="false">Active records</option><option value="true">Archived records</option><option value="all">Active and archived</option></select></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">Locality within district<select className={input} value={locality} disabled={!group || group.key === 'unspecified' || !group.localities?.length} onChange={event => onLocalityChange(event.target.value)}><option value="">All localities</option>{(group?.localities || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500"><span>Page {page} of {Math.max(1, totalPages)}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-full border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="rounded-full border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
  </section>;
}
