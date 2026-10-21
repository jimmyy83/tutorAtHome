import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {getBreadcrumbSchema,getOrganizationSchema,getSeoMetadata} from '../seo.js';

function setMeta(selector,attributes,content){
 let node=document.head.querySelector(selector);
 if(!node){node=document.createElement('meta');document.head.appendChild(node);}
 Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,value));
 node.setAttribute('content',content);
}

export default function SeoHead({page,city='',settings=null,noIndex=false,breadcrumbs=[]}){
 const location=useLocation();
 const metadata=getSeoMetadata({page,city,settings,noIndex,search:location.search});
 useEffect(()=>{
  document.title=metadata.title;
  document.documentElement.lang='en';
  setMeta('meta[name="description"]',{name:'description'},metadata.description);
  setMeta('meta[name="robots"]',{name:'robots'},metadata.robots);
  setMeta('meta[property="og:title"]',{property:'og:title'},metadata.title);
  setMeta('meta[property="og:description"]',{property:'og:description'},metadata.description);
  setMeta('meta[property="og:url"]',{property:'og:url'},metadata.canonical);
  setMeta('meta[property="og:type"]',{property:'og:type'},'website');
  setMeta('meta[property="og:site_name"]',{property:'og:site_name'},'TutorAtHome');
  setMeta('meta[property="og:locale"]',{property:'og:locale'},'en_IN');
  setMeta('meta[property="og:image"]',{property:'og:image'},metadata.image);
  setMeta('meta[name="twitter:card"]',{name:'twitter:card'},'summary_large_image');
  setMeta('meta[name="twitter:title"]',{name:'twitter:title'},metadata.title);
  setMeta('meta[name="twitter:description"]',{name:'twitter:description'},metadata.description);
  setMeta('meta[name="twitter:image"]',{name:'twitter:image'},metadata.image);
  let canonical=document.head.querySelector('link[rel="canonical"]');
  if(metadata.canonical){if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=metadata.canonical;}else canonical?.remove();
  const graph=[getOrganizationSchema(settings),...breadcrumbs.map(items=>{const {['@context']:context,...schema}=getBreadcrumbSchema(items);return schema;})];
  let structured=document.getElementById('tutorathome-structured-data');
  if(!structured){structured=document.createElement('script');structured.id='tutorathome-structured-data';structured.type='application/ld+json';document.head.appendChild(structured);}
  structured.textContent=JSON.stringify(graph.length===1?graph[0]:{'@context':'https://schema.org','@graph':graph});
 },[metadata.title,metadata.description,metadata.canonical,metadata.robots,metadata.image,settings,breadcrumbs]);
 return null;
}