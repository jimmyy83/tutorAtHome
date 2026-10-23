export function canAutoAdvance({count,overflows,reducedMotion,paused}){
 return count>1&&overflows&&!reducedMotion&&!paused;
}

export function nextFeaturedPosition(index,count,overflows){
 if(count<2)return index;
 if(index>=count-1)return overflows?count:count-1;
 return index+1;
}
