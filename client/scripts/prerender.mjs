import {createServer} from 'vite';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const origin='https://www.tutorathome.co.in';
const routes=['/','/home-tutors-prayagraj','/home-tutors-lucknow','/teachers','/contact','/parent-enquiry','/teacher-registration'];
const vite=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try{
 const [{default:App},{ThemeProvider},{getSeoMetadata,getOrganizationSchema}]=await Promise.all([
  vite.ssrLoadModule('/src/App.jsx'),vite.ssrLoadModule('/src/context/ThemeContext.jsx'),vite.ssrLoadModule('/src/seo.js')
 ]);
 const template=await fs.readFile(path.join(dist,'index.html'),'utf8');
 const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 for(const route of routes){
  const page=route==='/home-tutors-prayagraj'||route==='/home-tutors-lucknow'?'city':route==='/'?'home':route==='/teachers'?'teachers':route==='/contact'?'contact':route==='/parent-enquiry'?'parentEnquiry':'teacherRegistration';
  const city=route.endsWith('prayagraj')?'Prayagraj':route.endsWith('lucknow')?'Lucknow':'';
  const meta=getSeoMetadata({page,city});
  const markup=renderToString(React.createElement(ThemeProvider,null,React.createElement(StaticRouter,{location:route},React.createElement(App))));
  const schema=JSON.stringify(getOrganizationSchema()).replaceAll('<','\\u003c');
  const head=`<meta name="description" content="${escape(meta.description)}"><meta name="robots" content="${meta.robots}"><link rel="canonical" href="${meta.canonical}"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${meta.canonical}"><meta property="og:image" content="${meta.image}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(meta.title)}"><meta name="twitter:description" content="${escape(meta.description)}"><script type="application/ld+json">${schema}</script>`;
  const html=template.replace(/<title>.*?<\/title>/s,`<title>${escape(meta.title)}</title>`).replace('</head>',`${head}</head>`).replace('<div id="root"></div>',`<div id="root">${markup}</div>`);
  const target=route==='/'?dist:path.join(dist,route.slice(1));
  await fs.mkdir(target,{recursive:true});
  await fs.writeFile(path.join(target,'index.html'),html);
 }
 const notFoundMeta=getSeoMetadata({page:'notFound',noIndex:true});
const notFound=template.replace(/<title>.*?<\/title>/s,`<title>${escape(notFoundMeta.title)}</title>`).replace('<meta name="robots" content="index,follow" />','').replace('<link rel="canonical" href="https://www.tutorathome.co.in/" />','').replace('</head>',`<meta name="robots" content="noindex,follow"></head>`).replace('<div id="root"></div>','<div id="root"><main><h1>Page not found</h1><p>The requested TutorAtHome page could not be found.</p><a href="/">Back to home</a></main></div>');
 await fs.writeFile(path.join(dist,'404.html'),notFound);
 const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route=>`<url><loc>${origin}${route==='/'?'/':route}</loc></url>`).join('')}</urlset>\n`;
 await fs.writeFile(path.join(dist,'sitemap.xml'),sitemap);
}finally{await vite.close();}