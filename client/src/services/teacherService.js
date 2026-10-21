import {env} from '../config/env.js';import {api} from './apiClient.js';import {ENDPOINTS} from '../config/endpoints.js';import {featuredTeachers} from '../data/mock.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Must return only public fields: id, name, location, photo, subjects.
const mapTeacher=t=>({id:t.id,name:t.name,location:t.location||'',photo:t.photoUrl||'',subjects:Array.isArray(t.subjects)?t.subjects:[]});
export const teacherService={
 async listLocations(signal){const result=await api.get('/public/locations',{signal});return Array.isArray(result?.items)?result.items:[];},
 async listFeatured(signal,limit=4){if(env.mockData){await wait(250);return{items:featuredTeachers.slice(0,limit),page:1,total:featuredTeachers.length,totalPages:1};}const result=await api.get(`${ENDPOINTS.featuredTeachers}?limit=${limit}`,{signal});return{...result,items:(result?.items||[]).map(mapTeacher)};},
 async listPublic(signal,{page=1,limit=48,search='',subject='',stateId='',districtId='',localityId=''}={}){const params=new URLSearchParams({featured:'false',page:String(page),limit:String(limit)});if(search)params.set('search',search);if(subject)params.set('subject',subject);if(stateId)params.set('stateId',stateId);if(districtId)params.set('districtId',districtId);if(localityId)params.set('localityId',localityId);const result=await api.get(`${ENDPOINTS.featuredTeachers}?${params}`,{signal});return{...result,items:(result?.items||[]).map(mapTeacher)};}
};
