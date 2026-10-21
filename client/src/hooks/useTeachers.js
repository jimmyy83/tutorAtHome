import {useCallback,useEffect,useState} from 'react';import {teacherService} from '../services/teacherService.js';
export default function useTeachers({limit=4,featuredOnly=true,page=1,search='',subject='',stateId='',districtId='',localityId=''}={}){const [s,set]=useState({loading:true,error:null,data:[],total:0,totalPages:1});const [n,setN]=useState(0);
 useEffect(()=>{const c=new AbortController();set(x=>({...x,loading:true,error:null}));
  const request=featuredOnly?teacherService.listFeatured(c.signal,limit):teacherService.listPublic(c.signal,{page,limit,search,subject,stateId,districtId,localityId});
  request.then(d=>set({loading:false,error:null,data:d?.items||[],total:d?.total||0,totalPages:d?.totalPages||1})).catch(e=>{if(!c.signal.aborted)set({loading:false,error:e.message,data:[],total:0,totalPages:1});});return()=>c.abort();},[n,limit,featuredOnly,page,search,subject,stateId,districtId,localityId]);
 return {...s,retry:useCallback(()=>setN(v=>v+1),[])};}
