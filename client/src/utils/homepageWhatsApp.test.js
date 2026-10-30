import test from 'node:test';
import assert from 'node:assert/strict';
import {HOMEPAGE_WHATSAPP_MESSAGE,homepageWhatsAppUrl,shouldShowHomepageWhatsApp} from './homepageWhatsApp.js';

test('floating WhatsApp is visible only at the top of the homepage',()=>{
  assert.equal(shouldShowHomepageWhatsApp('/',0),true);
  assert.equal(shouldShowHomepageWhatsApp('/',2),true);
  assert.equal(shouldShowHomepageWhatsApp('/',3),false);
  for(const path of ['/parent-enquiry','/teacher-registration','/teachers','/contact','/admin','/how-it-works']){
    assert.equal(shouldShowHomepageWhatsApp(path,0),false,path);
  }
});

test('floating WhatsApp link uses the configured recipient and encodes the prefilled message',()=>{
  const url=homepageWhatsAppUrl('+91 95327 61193');
  assert.match(url,/^https:\/\/wa\.me\/919532761193\?text=/);
  assert.equal(new URL(url).searchParams.get('text'),HOMEPAGE_WHATSAPP_MESSAGE);
  assert.equal(homepageWhatsAppUrl('invalid-number'),'');
  assert.equal(homepageWhatsAppUrl(''),'');
});
