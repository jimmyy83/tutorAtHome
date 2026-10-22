import {env} from '../config/env.js';

export class ApiError extends Error{
 constructor(message,status,retryAfter,fields,code){super(message);this.status=status;this.retryAfter=retryAfter;this.fields=fields||{};this.code=code||'';}
}

async function request(method,path,{body,signal,timeout=15000,authToken}={}){
 if(!env.apiBaseUrl)throw new ApiError('The API address is not configured (VITE_API_BASE_URL).',0);
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),timeout);
 const abort=()=>ctl.abort();signal?.addEventListener('abort',abort,{once:true});
 try{
  const isFormData=typeof FormData!=='undefined'&&body instanceof FormData;
  const headers={Accept:'application/json'};if(body&&!isFormData)headers['Content-Type']='application/json';if(authToken)headers.Authorization=`Bearer ${authToken}`;
  const res=await fetch(env.apiBaseUrl+path,{method,headers,body:body&&(isFormData?body:JSON.stringify(body)),signal:ctl.signal});
  if(res.status===429){const retryAfter=res.headers.get('Retry-After');throw new ApiError(`Too many requests. Please try again${retryAfter?` in ${retryAfter} seconds`:' shortly'}.`,429,retryAfter);}
  const payload=res.status===204?null:await res.json().catch(()=>null);
  if(!res.ok){const error=payload?.error||{};throw new ApiError(error.message||(res.status>=500?'The server had a problem. Please try again later.':'The request could not be completed.'),res.status,res.headers.get('Retry-After'),error.fields,error.code);}
  return payload;
 }catch(err){if(err instanceof ApiError)throw err;if(err.name==='AbortError')throw new ApiError(signal?.aborted?'Cancelled':'The request timed out.',0);if(err instanceof TypeError)throw new ApiError(`Cannot reach the API at ${env.apiBaseUrl}. Check that the backend is running and local CORS allows this origin.`,0);throw new ApiError('The API request could not be completed.',0);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export const api={get:(p,o)=>request('GET',p,o),post:(p,body,o)=>request('POST',p,{...o,body}),put:(p,body,o)=>request('PUT',p,{...o,body}),patch:(p,body,o)=>request('PATCH',p,{...o,body}),delete:(p,o)=>request('DELETE',p,o)};
