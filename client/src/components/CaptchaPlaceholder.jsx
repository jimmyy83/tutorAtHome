import {useEffect,useRef,useState} from 'react';
import {env} from '../config/env.js';

const urls={turnstile:'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',recaptcha:'https://www.google.com/recaptcha/api.js?render=explicit'};
const scripts={};
function loadProvider(provider){
 const api=provider==='turnstile'?window.turnstile:window.grecaptcha;
 if(api)return Promise.resolve(api);
 if(!scripts[provider])scripts[provider]=new Promise((resolve,reject)=>{
  const src=urls[provider];let script=document.querySelector(`script[src="${src}"]`);
  if(!script){script=document.createElement('script');script.src=src;script.async=true;script.defer=true;document.head.appendChild(script);}
  script.addEventListener('load',()=>resolve(provider==='turnstile'?window.turnstile:window.grecaptcha),{once:true});
  script.addEventListener('error',()=>{scripts[provider]=null;reject(new Error('CAPTCHA could not load.'));},{once:true});
 });
 return scripts[provider];
}

export default function CaptchaPlaceholder({onToken=()=>{}}){
 const ref=useRef(null);const tokenHandler=useRef(onToken);tokenHandler.current=onToken;const [message,setMessage]=useState('');
 useEffect(()=>{
  const provider=env.captchaProvider;const siteKey=env.captchaSiteKey;
  if(!['turnstile','recaptcha'].includes(provider)||!siteKey)return;
  let widgetId;let disposed=false;
  loadProvider(provider).then(api=>{
   if(disposed||!ref.current||!api)return;
   const callbacks={callback:token=>{tokenHandler.current(token);setMessage('');},'expired-callback':()=>tokenHandler.current(''),'error-callback':()=>{tokenHandler.current('');setMessage('Verification failed. Please try again.');}};
   widgetId=provider==='turnstile'?api.render(ref.current,{sitekey:siteKey,...callbacks}):api.render(ref.current,{sitekey:siteKey,...callbacks});
  }).catch(()=>{if(!disposed)setMessage('Verification could not load. Check your connection and try again.');});
  return()=>{disposed=true;tokenHandler.current('');if(widgetId){if(provider==='turnstile')window.turnstile?.remove(widgetId);else window.grecaptcha?.reset(widgetId);}};
 },[]);
 if(!['turnstile','recaptcha'].includes(env.captchaProvider)||!env.captchaSiteKey)return <p className="text-xs leading-5 text-slate-500">Bot verification is handled by the server when configured.</p>;
 return <div className="captcha-box"><div ref={ref} aria-label="Security verification"/>{message&&<p role="alert" className="mt-2 text-xs text-red-700">{message}</p>}</div>;
}
