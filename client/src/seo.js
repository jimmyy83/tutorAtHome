import {educationCatalogDefaults} from './data/educationCatalog.js';
import {serviceCities} from './data/serviceAreas.js';
import {siteInfo} from './data/siteInfo.js';

export const SITE_ORIGIN='https://www.tutorathome.co.in';
export const OG_IMAGE=SITE_ORIGIN+'/assets/tutorathome-banner-services.jpeg';
const cityPaths={Prayagraj:'/home-tutors-prayagraj',Lucknow:'/home-tutors-lucknow'};
export const cityPath=city=>cityPaths[city]||'/';

const pageCopy={
 home:{path:'/',title:'Home Tutors in Prayagraj & Lucknow | TutorAtHome',description:'Find one-to-one home and online tuition in Prayagraj and Lucknow for Nursery to Class 12. Explore school subjects and senior secondary streams; tutor availability is confirmed by our team.'},
 teachers:{path:'/teachers',title:'Find a Tutor in Prayagraj & Lucknow | TutorAtHome',description:'Browse publicly approved TutorAtHome teachers by subject. Enquire for home or online tuition in Prayagraj and Lucknow; our team confirms current availability.'},
 contact:{path:'/contact',title:'Contact TutorAtHome | Prayagraj & Lucknow',description:'Contact TutorAtHome about home tuition, online learning, teacher registration, and service enquiries in Prayagraj or Lucknow.'},
 parentEnquiry:{path:'/parent-enquiry',title:'Find a Home Tutor | Parent Enquiry | TutorAtHome',description:'Tell TutorAtHome your learner’s class, subjects, preferred schedule, and city. Enquire about home or online tuition in Prayagraj and Lucknow.'},
 teacherRegistration:{path:'/teacher-registration',title:'Register as a Tutor | TutorAtHome',description:'Register your interest in teaching with TutorAtHome. Submit your teaching profile for review and our team will follow up about suitable opportunities.'},
 notFound:{path:'/',title:'Page not found | TutorAtHome',description:'The requested TutorAtHome page could not be found.'},
 admin:{path:'/admin',title:'Admin sign in | TutorAtHome',description:'TutorAtHome administration.'},
};
const activeCatalog=settings=>settings?.educationCatalog||educationCatalogDefaults;
const activeExams=settings=>(activeCatalog(settings).competitiveExams||[]).filter(item=>item.active!==false).map(item=>item.label).filter(Boolean);

export function getSeoMetadata({page='notFound',city='',settings=null,noIndex=false,search=''}={}) {
 if(page==='city'&&!serviceCities.includes(city))page='notFound';
 const base=pageCopy[page]||pageCopy.notFound;
 let title=base.title,description=base.description,pathname=base.path;
 if(page==='city'){
  title='Home Tutors in '+city+' | TutorAtHome';
  description='Looking for a home tutor in '+city+'? Explore one-to-one home and online tuition from Nursery to Class 12. Share your area and learning needs; TutorAtHome will confirm tutor availability.';
  pathname=cityPath(city);
  if(siteInfo.offices.some(office=>office.city===city))description+=' Office information is available on our Contact page.';
 }
 if(page==='home'){
  const exams=activeExams(settings);
  if(exams.length)description+=' Current preparation options include '+exams.join(', ')+', subject to availability confirmation.';
 }
 const params=new URLSearchParams(search);
 const hasTeacherFilters=page==='teachers'&&[...params.keys()].some(key=>['search','subject','location'].includes(key));
 const requestedPage=page==='teachers'?Math.max(1,Number(params.get('page'))||1):1;
 if(page==='teachers'&&requestedPage>1&&!hasTeacherFilters){title+=' — Page '+requestedPage;pathname+='?page='+requestedPage;}
 const canonical=page==='notFound'?'':SITE_ORIGIN+pathname;
 const isNoIndex=noIndex||page==='admin'||page==='notFound'||hasTeacherFilters;
 return{title,description,canonical,robots:isNoIndex?'noindex,follow':'index,follow',image:OG_IMAGE};
}

export function getOrganizationSchema(settings=null) {
 const links=(settings?.socialLinks||[]).filter(link=>link?.active===true&&typeof link.url==='string'&&link.url.startsWith('https://')).map(link=>link.url);
 const offices=settings?.offices?.length?settings.offices:siteInfo.offices;
 const schema={'@context':'https://schema.org','@type':'EducationalOrganization','@id':SITE_ORIGIN+'/#organization',name:settings?.brandName||siteInfo.brandName,url:SITE_ORIGIN,description:siteInfo.tagline+' — one-to-one home and online tuition in '+serviceCities.join(' and ')+'.',logo:SITE_ORIGIN+siteInfo.logoUrl,email:settings?.email||siteInfo.email,areaServed:serviceCities.map(name=>({'@type':'City',name})),location:offices.map((office,index)=>({'@type':'Place',name:(settings?.brandName||siteInfo.brandName)+' '+office.city+' office '+(index+1),address:{'@type':'PostalAddress',streetAddress:office.address,addressLocality:office.city,addressRegion:'Uttar Pradesh',addressCountry:'IN'}}))};
 if(settings?.phone)schema.telephone=settings.phone;
 if(links.length)schema.sameAs=[...new Set(links)];
 return schema;
}

export function getBreadcrumbSchema(items) {
 return{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((item,index)=>({'@type':'ListItem',position:index+1,name:item.name,item:SITE_ORIGIN+item.path}))};
}