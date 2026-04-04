import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import AdminPanel from './pages/AdminPanel/AdminPanel.jsx'
import ProfilePage from './pages/ProfilePage/ProfilePage.jsx'
import BotPage from './pages/BotPage/BotPage.jsx'
import InternBotPage from './pages/InternBotPage/InternBotPage.jsx'
import OrganizationPage from './pages/OrganizationPage/OrganizationPage.jsx'
import TrackWebPage from './pages/TrackWebPage/TrackWebPage.jsx'
import ResumeBuilderPage from './pages/ResumeBuilderPage/ResumeBuilderPage.jsx'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/bot" element={<BotPage />} />
                <Route path="/intern-bot" element={<InternBotPage />} />
                <Route path="/organization" element={<OrganizationPage />} />
                <Route path="/track-web" element={<TrackWebPage />} />
                <Route path="/resume-builder" element={<ResumeBuilderPage />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
)
