const OUTPUT_SIZE=512;

export async function cropProfilePhoto(source,crop,canvasFactory=()=>document.createElement('canvas')){
 if(!source||!crop||![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||Math.abs(crop.width-crop.height)>2)throw new Error('Select a valid square crop before continuing.');
 const image=await new Promise((resolve,reject)=>{
  const loaded=new Image();loaded.onload=()=>resolve(loaded);loaded.onerror=()=>reject(new Error('The selected image could not be decoded. Please choose another JPG or PNG.'));loaded.src=source;
 });
 if(crop.x+crop.width>image.naturalWidth+1||crop.y+crop.height>image.naturalHeight+1)throw new Error('The selected crop is outside the image. Please adjust the crop and try again.');
 const canvas=canvasFactory();canvas.width=OUTPUT_SIZE;canvas.height=OUTPUT_SIZE;
 const context=canvas.getContext('2d');if(!context)throw new Error('Image editing is not available in this browser.');
 context.fillStyle='#fff';context.fillRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);
 context.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,OUTPUT_SIZE,OUTPUT_SIZE);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('The cropped photo could not be prepared. Please try again.')),'image/jpeg',0.92));
 return new File([blob],'teacher-profile.jpg',{type:'image/jpeg',lastModified:Date.now()});
}
