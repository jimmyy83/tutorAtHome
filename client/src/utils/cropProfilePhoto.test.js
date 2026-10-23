import test from 'node:test';
import assert from 'node:assert/strict';
import {cropProfilePhoto} from './cropProfilePhoto.js';

function canvasFactory(drawCalls,{blob=true}={}){
 return {width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){drawCalls.push(args);}}),toBlob(callback,type,quality){assert.equal(type,'image/jpeg');assert.equal(quality,0.92);callback(blob?new Blob(['cropped-image'],{type}):null);}};
}

test('profile crop exports the selected square region as a 512px JPEG file',async()=>{
 const drawCalls=[];globalThis.Image=class{naturalWidth=1200;naturalHeight=800;set src(_value){this.onload();}};
 const photo=await cropProfilePhoto('blob:source',{x:100,y:40,width:500,height:500},()=>canvasFactory(drawCalls));
 assert.equal(photo.type,'image/jpeg');assert.equal(photo.name,'teacher-profile.jpg');
 assert.deepEqual(drawCalls[0].slice(1),[100,40,500,500,0,0,512,512]);
});

test('profile crop rejects an invalid region and reports canvas encoding failures',async()=>{
 globalThis.Image=class{naturalWidth=1200;naturalHeight=800;set src(_value){this.onload();}};
 await assert.rejects(cropProfilePhoto('blob:source',{x:-1,y:0,width:20,height:20}),/valid square crop/);
 await assert.rejects(cropProfilePhoto('blob:source',{x:0,y:0,width:500,height:500},()=>canvasFactory([],{blob:false})),/could not be prepared/);
});
