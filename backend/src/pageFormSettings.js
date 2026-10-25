import { col, now, withDbTransaction } from './db.js';
import { HttpError } from './middleware.js';
export const PAGE_FORM_FIELDS = {
 findTutor:{label:'Find a Tutor',fields:[
 ['parentName','Parent / guardian name','parentName',true,true],['phone','Mobile / WhatsApp number','phone',true,true],['studentName','Student name','studentName',true,true],['studentClass','Education level / class','studentClass',true,true],['board','Education board','board',true,true],['streamId','Class 11–12 stream','streamId',true,true],['subjects','Subjects needed','subjects',true,true],['examPreparations','Competitive exam preparation','examPreparations',false,false],['city','City','city',true,true],['locality','Village / colony / locality','locality',true,false],['mode','Tuition mode','mode',true,true],['homeAddress','Complete home address','homeAddress',true,false],['colony','Colony / society','colony',false,false],['landmark','Nearby landmark','landmark',false,false],['pincode','PIN code','pincode',true,false],['mapLocation','Map location pin',null,false,false],['preferredTiming','Preferred days and time','preferredTiming',true,false],['budget','Expected monthly budget','budget',true,false],['notes','Additional notes','notes',false,false]
 ]},
 becomeTeacher:{label:'Become a Teacher',fields:[
 ['personal.fullName','Full name','personal.fullName',true,true],['personal.gender','Gender','personal.gender',true,true],['personal.dob','Date of birth','personal.dob',true,true],['personal.phone','Mobile number','personal.phone',true,true],['personal.email','Email address','personal.email',true,true],['location.stateId','State','location.stateId',true,true],['location.districtId','District','location.districtId',true,true],['location.localityId','Village / colony / locality','location.localityId',true,true],['personal.address','Full address','personal.address',true,true],['personal.pincode','PIN code','personal.pincode',true,true],['personal.landmark','Nearby landmark','personal.landmark',false,false],['personal.ownVehicle','Own vehicle','personal.ownVehicle',false,false],['academics.class10','Class 10 details','academics.class10',true,true],['academics.class12','Class 12 details','academics.class12',true,true],['academics.graduation','Graduation details','academics.graduation',true,true],['academics.postgraduation','Postgraduation details','academics.postgraduation',false,false],['academics.certifications','Certifications','academics.certifications',false,false],['teaching.classes','Classes you can teach','teaching.classes',true,true],['teaching.subjects','Subjects you teach','teaching.subjects',true,true],['teaching.medium','Teaching medium','teaching.medium',true,true],['teaching.experienceYears','Years of experience','teaching.experienceYears',true,true],['teaching.previousInstitutions','Previous institutions','teaching.previousInstitutions',false,false],['teaching.preferredAreas','Preferred teaching areas','teaching.preferredAreas',false,false],['teaching.commute','Commute method','teaching.commute',true,true],['teaching.homeTuition','Available for home tuition','teaching.homeTuition',false,false],['availability.days','Available days','availability.days',true,true],['availability.timeSlots','Preferred time slots','availability.timeSlots',true,true],['availability.teachingStyle','Teaching style','availability.teachingStyle',false,false],['availability.references','Professional references','availability.references',false,false],['availability.freeDemo','Free demo lesson','availability.freeDemo',false,false],['fees.minMonthly','Minimum monthly fee','fees.minMonthly',true,true],['fees.maxMonthly','Maximum monthly fee','fees.maxMonthly',true,true],['fees.paymentModes','Accepted payment methods','fees.paymentModes',true,true],['documents.profilePhoto','Professional profile photo',null,true,true],['documents.qualificationProof','Education proof',null,true,true],['documents.aadhaarDocument','Aadhaar identity document',null,true,true],['termsAccepted','Terms & Conditions consent',null,true,true]
 ]}
};
const defaults=p=>({fields:Object.fromEntries(PAGE_FORM_FIELDS[p].fields.map(([id,, ,required])=>[id,{visible:true,required}]))});
export const DEFAULT_PAGE_FORM_SETTINGS={findTutor:defaults('findTutor'),becomeTeacher:defaults('becomeTeacher')};
const copy=x=>structuredClone(x);
export async function ensurePageFormSettings(){await col('page_form_settings').updateOne({id:1},{$setOnInsert:{id:1,revision:0,draftRevision:0,draft:copy(DEFAULT_PAGE_FORM_SETTINGS),published:copy(DEFAULT_PAGE_FORM_SETTINGS),updatedAt:now()}},{upsert:true});}
export async function getPageFormSettings(){const r=await col('page_form_settings').findOne({id:1});return{revision:r?.revision||0,draftRevision:r?.draftRevision||0,draft:r?.draft||copy(DEFAULT_PAGE_FORM_SETTINGS),published:r?.published||copy(DEFAULT_PAGE_FORM_SETTINGS),updatedAt:r?.updatedAt||null};}
export async function getPublishedPageFormSettings(){const r=await col('page_form_settings').findOne({id:1},{projection:{published:1,revision:1}});return{revision:r?.revision||0,pages:r?.published||copy(DEFAULT_PAGE_FORM_SETTINGS)};}
export function validatePageFormDraft(pages){
 if(!pages||typeof pages!=='object'||Object.keys(pages).sort().join(',')!=='becomeTeacher,findTutor')throw new HttpError(422,'Both page configurations are required.');
 for(const [page,def] of Object.entries(PAGE_FORM_FIELDS)){const submitted=pages[page]?.fields,ids=Object.keys(submitted||{}).sort(),allowed=def.fields.map(f=>f[0]).sort();if(ids.join(',')!==allowed.join(','))throw new HttpError(422,'Field list for '+def.label+' does not match the application allowlist.');for(const[id,, ,required,locked]of def.fields){const v=submitted[id];if(!v||typeof v.visible!=='boolean'||typeof v.required!=='boolean')throw new HttpError(422,'Invalid settings for '+id+'.');if(locked&&(!v.visible||v.required!==required))throw new HttpError(422,id+' is required by the application and cannot be changed.');if(['mapLocation','personal.ownVehicle','teaching.homeTuition','availability.freeDemo','academics.postgraduation'].includes(id)&&v.required!==required)throw new HttpError(422,id+' does not support a required setting.');}}
 return pages;
}
export async function savePageFormDraft({expectedRevision,expectedDraftRevision,pages}) {
 validatePageFormDraft(pages);
 const t=now(), result=await col('page_form_settings').updateOne({id:1,revision:expectedRevision,draftRevision:expectedDraftRevision},{$set:{draft:pages,draftRevision:expectedDraftRevision+1,updatedAt:t}});
 if(!result.matchedCount) throw new HttpError(409,'These settings changed in another session. Reload before saving.',undefined,'REVISION_CONFLICT');
 return getPageFormSettings();
}
export async function publishPageFormDraft({expectedRevision,expectedDraftRevision},admin){await withDbTransaction(async session=>{const state=await col('page_form_settings').findOne({id:1},{session});if(!state||state.revision!==expectedRevision||state.draftRevision!==expectedDraftRevision)throw new HttpError(409,'These settings changed in another session. Reload before publishing.',undefined,'REVISION_CONFLICT');validatePageFormDraft(state.draft);const publishedAt=now(),revision=state.revision+1,publishedBy={id:admin.sub,email:admin.email,name:admin.name};const result=await col('page_form_settings').updateOne({id:1,revision:expectedRevision,draftRevision:expectedDraftRevision},{$set:{revision,published:state.draft,publishedAt,publishedBy}},{session});if(!result.matchedCount)throw new HttpError(409,'These settings changed in another session. Reload before publishing.',undefined,'REVISION_CONFLICT');await col('page_form_settings_history').insertOne({revision,pages:state.draft,publishedAt,publishedBy},{session});});return getPageFormSettings();}
export function applyConfiguredSubmission(page,data,pages) {
 const settings=pages[page]||DEFAULT_PAGE_FORM_SETTINGS[page],out=copy(data),errors={};
 const get=p=>p.split('.').reduce((v,k)=>v?.[k],out);
 const remove=p=>{const a=p.split('.');let t=out;for(const k of a.slice(0,-1))t=t?.[k];if(t)delete t[a.at(-1)];};
 const empty=v=>v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length)||(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length);
 for(const[id,label,path,,locked]of PAGE_FORM_FIELDS[page].fields){
  const field=settings.fields[id]||DEFAULT_PAGE_FORM_SETTINGS[page].fields[id];
  if(!path){if(page==='findTutor'&&id==='mapLocation'){if(!field.visible){delete out.latitude;delete out.longitude;}if(field.required)errors[id]='Map location cannot be required.';}continue;}
  const applicable=!(page==='findTutor'&&['homeAddress','locality','pincode','colony','landmark','mapLocation'].includes(id)&&out.mode!=='home')&&!(page==='findTutor'&&id==='streamId'&&!['11','12'].includes(String(out.studentClass)));
  if(!field.visible||!applicable||(!locked&&!field.required&&empty(get(path))))remove(path);
  else if((locked||field.required)&&empty(get(path)))errors[path]=label+' is required.';
 }
 if(page==='findTutor'&&out.mode==='home')for(const id of ['homeAddress','locality','pincode']){
  const[,label,path]=PAGE_FORM_FIELDS.findTutor.fields.find(x=>x[0]===id),field=settings.fields[id];
  if(field.visible&&field.required&&empty(get(path)))errors[path]=label+' is required for home tuition.';
 }
 if(Object.keys(errors).length)throw new HttpError(422,'Please check the highlighted fields.',errors);
 return out;
}
export async function configuredSubmission(page,data){const{pages}=await getPublishedPageFormSettings();return applyConfiguredSubmission(page,data,pages);}


