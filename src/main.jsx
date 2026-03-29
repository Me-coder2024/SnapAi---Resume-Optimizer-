import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import AdminPanel from './AdminPanel.jsx'
import ProfilePage from './ProfilePage.jsx'
import BotPage from './BotPage.jsx'
import InternBotPage from './InternBotPage.jsx'
import OrganizationPage from './OrganizationPage.jsx'
import TrackWebPage from './TrackWebPage.jsx'
import ResumeBuilderPage from './ResumeBuilderPage.jsx'
import './index.css'

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
