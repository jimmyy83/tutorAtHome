import {useCallback,useEffect,useState} from 'react';
import {env} from '../config/env.js';
import {api} from '../services/apiClient.js';
import {ENDPOINTS} from '../config/endpoints.js';

export default function usePublicSite(){
 const [state,setState]=useState({loading:!env.mockData,error:null,settings:null,content:null,banners:[]});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(env.mockData){setState({loading:false,error:null,settings:null,content:null,banners:[]});return;}
  const controller=new AbortController();setState(s=>({...s,loading:true,error:null}));
  api.get(ENDPOINTS.site,{signal:controller.signal}).then(result=>setState({loading:false,error:null,settings:result?.settings||{},content:result?.content||null,banners:result?.banners||[]})).catch(error=>{if(!controller.signal.aborted)setState(s=>({...s,loading:false,error:error.message}));});
  return()=>controller.abort();
 },[attempt]);
 useEffect(()=>{const refresh=()=>setAttempt(value=>value+1);window.addEventListener('tutorathome:public-site-updated',refresh);return()=>window.removeEventListener('tutorathome:public-site-updated',refresh);},[]);
 return{...state,retry:useCallback(()=>setAttempt(v=>v+1),[])};
}
