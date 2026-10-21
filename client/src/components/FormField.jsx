export default function FormField({label,error,required,hint,id,children}){
return(<div><label htmlFor={id} className="mb-1 block text-sm font-medium">{label}{required?<span className="text-red-600" aria-hidden> *</span>:<span className="font-normal text-slate-500"> (optional)</span>}</label>
{children}{hint&&!error&&<p className="mt-1 text-xs text-slate-500">{hint}</p>}
{error&&<p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}</div>);}
export const inputCls="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-600";
