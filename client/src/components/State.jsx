export const Loading=({label='Loading…'})=><p role="status" className="py-10 text-center text-sm text-slate-500">{label}</p>;
export const ErrorBox=({message,onRetry})=><div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}{onRetry&&<button onClick={onRetry} className="ml-3 underline">Retry</button>}</div>;
export const Empty=({text})=><p className="py-10 text-center text-sm text-slate-500">{text}</p>;
