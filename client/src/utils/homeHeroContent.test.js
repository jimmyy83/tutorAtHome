import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {resolveHomeHeroCopy,retainInitialHomeHeroCopy} from './homeHeroContent.js';

test('homepage uses the first published CMS hero copy instead of briefly rendering a different fallback',()=>{
  const published={title:'Find the Right Tutor for Your Child',description:'Personalised learning and expert subject guidance.',primaryCta:{label:'Find a Tutor'},secondaryCta:{label:'Register as a Teacher'}};
  const rendered=resolveHomeHeroCopy(published);
  assert.equal(rendered.title,published.title);
  assert.equal(rendered.description,published.description);
  assert.equal(rendered.primaryCta.label,'Find a Tutor');
});

test('meaningful approved fallback copy is available on the initial render',()=>{
  const fallback=resolveHomeHeroCopy(null);
  assert.equal(fallback.title,'Find the Right Tutor for Your Child');
  assert.equal(fallback.description,'Personalised learning and expert subject guidance for students from Nursery to Class 12.');
});

test('CMS hero copy replaces the fallback only after it is available and unchanged copy preserves identity',()=>{
  const initial=resolveHomeHeroCopy(null);
  const published=resolveHomeHeroCopy({title:'Admin approved heading',description:'Admin approved description'});
  assert.equal(retainInitialHomeHeroCopy(initial,published),published);
  assert.equal(retainInitialHomeHeroCopy(published,resolveHomeHeroCopy({title:'Admin approved heading',description:'Admin approved description'})),published);
});

test('homepage renders hero fallback synchronously and does not use blank skeleton blocks',()=>{
  const source=fs.readFileSync(fileURLToPath(new URL('../pages/Home.jsx',import.meta.url)),'utf8');
  assert.match(source,/useState\(\(\)=>resolveHomeHeroCopy\(hero\)\)/);
  assert.match(source,/<h1[^>]*>\{heroCopy\.title\}<\/h1>\s*<p[^>]*>\{heroCopy\.description\}<\/p>/);
  assert.doesNotMatch(source,/heroCopy\s*\?\s*<>/);
  assert.doesNotMatch(source,/aria-hidden="true" className="min-h-64 animate-pulse/);
});
