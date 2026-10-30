import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveHomeHeroCopy,retainInitialHomeHeroCopy} from './homeHeroContent.js';

test('homepage uses the first published CMS hero copy instead of briefly rendering a different fallback',()=>{
  const published={title:'Find the Right Tutor for Your Child',description:'Personalised learning and expert subject guidance.',primaryCta:{label:'Find a Tutor'},secondaryCta:{label:'Register as a Teacher'}};
  const rendered=resolveHomeHeroCopy(published);
  assert.equal(rendered.title,published.title);
  assert.equal(rendered.description,published.description);
  assert.equal(rendered.primaryCta.label,'Find a Tutor');
});

test('hero copy remains stable after initial resolution and across later CMS responses',()=>{
  const initial=resolveHomeHeroCopy({title:'Find the Right Tutor for Your Child',description:'Published description'});
  const later=resolveHomeHeroCopy({title:'A different admin headline',description:'A later response'});
  assert.equal(retainInitialHomeHeroCopy(null,initial),initial);
  assert.equal(retainInitialHomeHeroCopy(initial,later),initial);
  assert.equal(retainInitialHomeHeroCopy(null,resolveHomeHeroCopy(null)).title,'The right tutor. A brighter future.');
});
