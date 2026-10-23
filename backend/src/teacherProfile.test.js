import test from 'node:test';
import assert from 'node:assert/strict';
import {publicQualification} from './teacherProfile.js';

test('public qualification uses the actual postgraduation degree when present',()=>{
 assert.equal(publicQualification({data:JSON.stringify({academics:{graduation:{degree:'B.Sc.'},postgraduation:{degree:'M.Sc.'},documents:{qualificationProof:{publicId:'private'}}}})}),'M.Sc.');
});

test('public qualification falls back to the stored graduation degree and never invents one',()=>{
 assert.equal(publicQualification({data:JSON.stringify({academics:{graduation:{degree:'B.Tech.'},postgraduation:{}}})}),'B.Tech.');
 assert.equal(publicQualification({data:JSON.stringify({academics:{graduation:{degree:'  '}}})}),'');
 assert.equal(publicQualification({data:'{}'}),'');
});
