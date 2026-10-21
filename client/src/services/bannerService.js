import {env} from '../config/env.js';
import {api} from './apiClient.js';
import {ENDPOINTS} from '../config/endpoints.js';

// Mock mode intentionally has no fabricated promotional campaign.
export const bannerService={async listActive(signal){
 if(env.mockData)return[];
 const result=await api.get(ENDPOINTS.activeBanners,{signal});
 return(result?.items||[]).map(b=>({...b,image:b.imageUrl||'',start:b.startsAt,end:b.endsAt}));
}};
