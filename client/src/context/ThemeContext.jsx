import {createContext,useContext,useEffect,useState} from 'react';import {Moon,Sun} from 'lucide-react';
const Ctx=createContext();
const saved=()=>{try{return localStorage.getItem('theme')==='dark'?'dark':'light';}catch{return 'light';}}; // light by default
export function ThemeProvider({children}){const [theme,setTheme]=useState(saved);
 useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');const color=document.querySelector('meta[name="theme-color"]');if(color)color.content=theme==='dark'?'#08090d':'#fbfaf7';try{localStorage.setItem('theme',theme);}catch{}},[theme]);
 return <Ctx.Provider value={{theme,toggle:()=>setTheme(t=>t==='dark'?'light':'dark')}}>{children}</Ctx.Provider>;}
export const useTheme=()=>useContext(Ctx);
export function ThemeToggle({className=''}){const {theme,toggle}=useTheme();
 return <button onClick={toggle} aria-label={theme==='dark'?'Switch to light theme':'Switch to dark theme'} className={`rounded-full p-2 hover:bg-slate-100 ${className}`}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>;}
