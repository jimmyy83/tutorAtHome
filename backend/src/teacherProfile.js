import { json } from './db.js';

export function publicQualification(teacher){
 const academics=json(teacher?.data,{})?.academics||{};
 const postgraduation=typeof academics.postgraduation?.degree==='string'?academics.postgraduation.degree.trim():'';
 const graduation=typeof academics.graduation?.degree==='string'?academics.graduation.degree.trim():'';
 return postgraduation||graduation;
}
