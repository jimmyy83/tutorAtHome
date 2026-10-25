import {Routes,Route,Link} from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import ParentEnquiry from './pages/ParentEnquiry.jsx';
import TeachersPage from './pages/TeachersPage.jsx';
import TeacherRegistration from './pages/TeacherRegistration.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import CityLandingPage from './pages/CityLandingPage.jsx';
import SeoHead from './components/SeoHead.jsx';
import TermsPage from './pages/TermsPage.jsx';

const Soon=({title})=><><SeoHead page="notFound" noIndex/><div className="mx-auto max-w-xl px-5 py-20 text-center"><span className="eyebrow">TutorAtHome</span><h1 className="mt-3 font-serif text-3xl text-slate-900">{title}</h1><p className="mt-3 text-slate-600">This page is not available yet.</p><Link to="/" className="mt-6 inline-flex rounded-full bg-[#0c284b] px-5 py-3 font-semibold text-white">Back home</Link></div></>;
export default function App(){return <Routes><Route path="/admin/*" element={<AdminPage/>}/><Route element={<Layout/>}><Route path="/" element={<Home/>}/><Route path="/home-tutors-prayagraj" element={<CityLandingPage city="Prayagraj"/>}/><Route path="/home-tutors-lucknow" element={<CityLandingPage city="Lucknow"/>}/><Route path="/teachers" element={<TeachersPage/>}/><Route path="/contact" element={<ContactPage/>}/><Route path="/parent-enquiry" element={<ParentEnquiry/>}/><Route path="/teacher-registration" element={<TeacherRegistration/>}/><Route path="/terms" element={<TermsPage/>}/><Route path="*" element={<Soon title="Page not found"/>}/></Route></Routes>;}