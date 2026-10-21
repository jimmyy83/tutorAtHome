import React from 'react';
import {createRoot,hydrateRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.jsx';
import {ThemeProvider} from './context/ThemeContext.jsx';
import './index.css';

const root=document.getElementById('root');
const app=<ThemeProvider><BrowserRouter><App/></BrowserRouter></ThemeProvider>;
if(root.hasChildNodes())hydrateRoot(root,app);
else createRoot(root).render(app);