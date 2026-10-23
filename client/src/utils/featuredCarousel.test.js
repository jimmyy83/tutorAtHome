import test from 'node:test';
import assert from 'node:assert/strict';
import {canAutoAdvance,nextFeaturedPosition} from './featuredCarousel.js';

test('featured carousel stays still when cards fit or reduced motion is preferred',()=>{
 assert.equal(canAutoAdvance({count:1,overflows:true,reducedMotion:false,paused:false}),false);
 assert.equal(canAutoAdvance({count:4,overflows:false,reducedMotion:false,paused:false}),false);
 assert.equal(canAutoAdvance({count:4,overflows:true,reducedMotion:true,paused:false}),false);
 assert.equal(canAutoAdvance({count:4,overflows:true,reducedMotion:false,paused:true}),false);
});

test('featured carousel advances and wraps only when there is overflow',()=>{
 assert.equal(canAutoAdvance({count:4,overflows:true,reducedMotion:false,paused:false}),true);
 assert.equal(nextFeaturedPosition(1,4,true),2);
 assert.equal(nextFeaturedPosition(3,4,true),4);
 assert.equal(nextFeaturedPosition(3,4,false),3);
 assert.equal(nextFeaturedPosition(0,1,true),0);
});
