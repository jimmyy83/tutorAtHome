import {useCallback,useEffect,useState} from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import {cropProfilePhoto} from '../utils/cropProfilePhoto.js';

export default function ImageCropper({file,onCancel,onComplete}){
 const [imageUrl,setImageUrl]=useState(''),[loading,setLoading]=useState(true),[crop,setCrop]=useState({x:0,y:0}),[zoom,setZoom]=useState(1),[croppedArea,setCroppedArea]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{
  if(!file)return undefined;
  let active=true;const url=URL.createObjectURL(file),image=new Image();setLoading(true);setError('');setCrop({x:0,y:0});setZoom(1);setCroppedArea(null);
  image.onload=()=>{if(active){setImageUrl(url);setLoading(false);}};
  image.onerror=()=>{if(active){setError('This image could not be opened. Choose another JPG or PNG.');setLoading(false);}};
  image.src=url;
  return()=>{active=false;URL.revokeObjectURL(url);};
 },[file]);
 const onCropComplete=useCallback((_area,pixels)=>setCroppedArea(pixels),[]);
 const saveCrop=async()=>{
  if(!imageUrl||!croppedArea||saving)return;
  setSaving(true);setError('');
  try{onComplete(await cropProfilePhoto(imageUrl,croppedArea));}
  catch(cropError){setError(cropError.message||'The image could not be cropped. Please try again.');setSaving(false);}
 };
 return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/70 p-4" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)onCancel();}}>
  <section role="dialog" aria-modal="true" aria-labelledby="profile-crop-title" className="my-auto w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
   <div className="flex items-start justify-between gap-4"><div><h2 id="profile-crop-title" className="text-xl font-semibold text-slate-900">Crop your profile photo</h2><p className="mt-1 text-sm text-slate-600">Drag to reposition, then adjust the zoom. The final photo is square.</p></div><button type="button" onClick={onCancel} disabled={saving} aria-label="Close photo cropper" className="rounded-full px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button></div>
   <div className="relative mx-auto mt-5 aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-300">{loading?<div role="status" className="grid h-full place-items-center text-sm text-white">Loading image…</div>:imageUrl&&<Cropper image={imageUrl} crop={crop} zoom={zoom} aspect={1} cropShape="rect" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} restrictPosition/>}</div>
   <label className="mt-5 grid gap-2 text-sm font-medium text-slate-700">Zoom <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event=>setZoom(Number(event.target.value))} aria-label="Zoom profile photo" disabled={loading||saving}/></label>
   {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-red-700">{error}</p>}
   <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button><button type="button" onClick={saveCrop} disabled={loading||!croppedArea||saving} className="min-h-11 rounded-full bg-[#0c284b] px-5 text-sm font-semibold text-white disabled:opacity-50">{saving?'Preparing photo…':'Use this photo'}</button></div>
  </section>
 </div>;
}
