import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../services/supabase'
import './OrganizationPage.css'

// Currently integrated tools on the website
const INTEGRATED_TOOLS = [
    { value: 'InternBot', label: '🤖 InternBot' },
]

// All AI tools available for request
const ALL_AI_TOOLS = [
    { value: 'ResumeBot', label: '📄 AI Resume Builder', desc: 'Auto-generate professional resumes' },
    { value: 'LogoBot', label: '🎨 AI Logo Maker', desc: 'Create brand logos instantly' },
    { value: 'EmailBot', label: '✉️ AI Email Writer', desc: 'Write perfect business emails' },
    { value: 'InterviewBot', label: '🎯 AI Interview Coach', desc: 'Practice interviews with AI' },
    { value: 'ContentBot', label: '📝 AI Content Planner', desc: 'Plan and generate content' },
]

// Skills database (reused from InternBot)
const SKILL_OPTIONS = [
    'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'TypeScript', 'Python', 'Java', 'Kotlin',
    'Swift', 'MongoDB', 'SQL', 'PostgreSQL', 'Docker', 'AWS', 'Git', 'Figma', 'Photoshop',
    'Machine Learning', 'Data Science', 'TensorFlow', 'SEO', 'Marketing', 'Communication',
    'Excel', 'Research', 'Teamwork', 'Problem Solving', 'Leadership', 'Angular', 'Vue.js',
    'Go', 'Rust', 'PHP', 'Django', 'Flask', 'Spring Boot', 'Firebase', 'GraphQL', 'REST APIs',
]

function OrganizationPage() {
    const [mode, setMode] = useState('login') // 'login' | 'signup'
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [signupSuccess, setSignupSuccess] = useState(false)

    // Login state
    const [loginUsername, setLoginUsername] = useState('')
    const [loginPassword, setLoginPassword] = useState('')
    const [showLoginPw, setShowLoginPw] = useState(false)

    // Signup state
    const [companyName, setCompanyName] = useState('')
    const [aiTool, setAiTool] = useState('')
    const [signupUsername, setSignupUsername] = useState('')
    const [signupPassword, setSignupPassword] = useState('')
    const [showSignupPw, setShowSignupPw] = useState(false)

    // Session state
    const [orgSession, setOrgSession] = useState(null)

    // Dashboard state
    const [dashTab, setDashTab] = useState('overview') // 'overview' | 'internbot' | 'request'
    const [internships, setInternships] = useState([])
    const [internLoading, setInternLoading] = useState(false)
    const [showInternForm, setShowInternForm] = useState(false)
    const [editingIntern, setEditingIntern] = useState(null)
    const [internForm, setInternForm] = useState({
        title: '', description: '', type: 'stipend', work_mode: 'Remote',
        location: '', skills: '', positions: 1, status: 'active',
    })
    const [formMsg, setFormMsg] = useState('')

    // Request tool state
    const [reqTool, setReqTool] = useState('')
    const [reqReason, setReqReason] = useState('')
    const [reqSent, setReqSent] = useState(false)

    // Restore session on mount
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem('snapai_org_session')
            if (saved) setOrgSession(JSON.parse(saved))
        } catch { /* ignore */ }
    }, [])

    // Load internships when org session is available
    const loadInternships = useCallback(async () => {
        if (!orgSession?.id) return
        setInternLoading(true)
        try {
            const { data, error: err } = await supabase
                .from('org_internships')
                .select('*')
                .eq('org_id', orgSession.id)
                .order('created_at', { ascending: false })
            if (!err && data) setInternships(data)
        } catch { /* ignore */ }
        setInternLoading(false)
    }, [orgSession?.id])

    useEffect(() => {
        if (orgSession) loadInternships()
    }, [orgSession, loadInternships])

    // ── Login handler ──
    const handleLogin = async (e) => {
        e.preventDefault()
        if (!loginUsername.trim() || !loginPassword.trim()) {
            setError('Please enter username and password')
            return
        }
        setLoading(true)
        setError('')

        try {
            const { data, error: dbErr } = await supabase
                .from('organizations')
                .select('*')
                .eq('username', loginUsername.trim())
                .eq('password', loginPassword)
                .single()

            if (dbErr || !data) {
                setError('Invalid username or password')
                setLoading(false)
                return
            }

            if (data.status === 'pending') {
                setError('Your account is pending admin approval. Please wait.')
                setLoading(false)
                return
            }

            if (data.status === 'rejected') {
                setError('Your application was not approved. Contact support.')
                setLoading(false)
                return
            }

            // Approved — create session
            const session = {
                id: data.id,
                companyName: data.company_name,
                aiTools: data.ai_tools,
                username: data.username,
                status: data.status,
                createdAt: data.created_at,
            }
            sessionStorage.setItem('snapai_org_session', JSON.stringify(session))
            setOrgSession(session)
        } catch (err) {
            setError('Connection error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    // ── Signup handler ──
    const handleSignup = async (e) => {
        e.preventDefault()
        if (!companyName.trim() || !aiTool || !signupUsername.trim() || !signupPassword.trim()) {
            setError('Please fill all fields')
            return
        }
        if (signupPassword.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }
        setLoading(true)
        setError('')

        try {
            // Check if username already exists
            const { data: existing } = await supabase
                .from('organizations')
                .select('id')
                .eq('username', signupUsername.trim())
                .single()

            if (existing) {
                setError('Username already taken. Choose another.')
                setLoading(false)
                return
            }

            // Insert new organization
            const { error: insertErr } = await supabase
                .from('organizations')
                .insert([{
                    company_name: companyName.trim(),
                    ai_tools: aiTool,
                    username: signupUsername.trim(),
                    password: signupPassword,
                    status: 'pending',
                }])

            if (insertErr) {
                if (insertErr.code === '23505') {
                    setError('Username already taken. Choose another.')
                } else {
                    setError('Failed to submit. Please try again.')
                }
                setLoading(false)
                return
            }

            setSignupSuccess(true)
            setCompanyName('')
            setAiTool('')
            setSignupUsername('')
            setSignupPassword('')
        } catch (err) {
            setError('Connection error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    // ── Logout ──
    const handleLogout = () => {
        sessionStorage.removeItem('snapai_org_session')
        setOrgSession(null)
        setLoginUsername('')
        setLoginPassword('')
        setDashTab('overview')
    }

    // ── Internship CRUD ──
    const resetInternForm = () => {
        setInternForm({
            title: '', description: '', type: 'stipend', work_mode: 'Remote',
            location: '', skills: '', positions: 1, status: 'active',
        })
        setEditingIntern(null)
        setShowInternForm(false)
        setFormMsg('')
    }

    const handleInternSubmit = async (e) => {
        e.preventDefault()
        if (!internForm.title.trim()) { setFormMsg('Title is required'); return }
        setLoading(true)
        setFormMsg('')

        const payload = {
            org_id: orgSession.id,
            title: internForm.title.trim(),
            description: internForm.description.trim(),
            type: internForm.type,
            work_mode: internForm.work_mode,
            location: internForm.work_mode === 'Remote' ? '' : internForm.location.trim(),
            skills: internForm.skills,
            positions: parseInt(internForm.positions) || 1,
            status: internForm.status,
        }

        try {
            if (editingIntern) {
                const { error: err } = await supabase
                    .from('org_internships')
                    .update(payload)
                    .eq('id', editingIntern.id)
                if (err) throw err
            } else {
                const { error: err } = await supabase
                    .from('org_internships')
                    .insert([payload])
                if (err) throw err
            }
            resetInternForm()
            await loadInternships()
        } catch (err) {
            setFormMsg('Failed to save. Please try again.')
        }
        setLoading(false)
    }

    const handleEditIntern = (intern) => {
        setInternForm({
            title: intern.title,
            description: intern.description || '',
            type: intern.type || 'stipend',
            work_mode: intern.work_mode || 'Remote',
            location: intern.location || '',
            skills: intern.skills || '',
            positions: intern.positions || 1,
            status: intern.status || 'active',
        })
        setEditingIntern(intern)
        setShowInternForm(true)
    }

    const handleToggleInternStatus = async (intern) => {
        const newStatus = intern.status === 'active' ? 'closed' : 'active'
        await supabase.from('org_internships').update({ status: newStatus }).eq('id', intern.id)
        await loadInternships()
    }

    const handleDeleteIntern = async (id) => {
        if (!confirm('Delete this internship listing?')) return
        await supabase.from('org_internships').delete().eq('id', id)
        await loadInternships()
    }

    // ── Request AI Tool ──
    const handleRequestTool = async () => {
        if (!reqTool || !reqReason.trim()) return
        setLoading(true)
        try {
            await supabase.from('requests').insert([{
                tool_name: reqTool,
                description: reqReason.trim(),
                category: 'Organization',
                email: `${orgSession.username}@org (${orgSession.companyName})`,
                submitted_at: new Date().toISOString(),
            }])
            setReqSent(true)
            setReqTool('')
            setReqReason('')
            setTimeout(() => setReqSent(false), 4000)
        } catch { /* ignore */ }
        setLoading(false)
    }

    // ── Stats ──
    const activeListings = internships.filter(i => i.status === 'active').length
    const closedListings = internships.filter(i => i.status === 'closed').length
    const totalPositions = internships.reduce((s, i) => s + (i.positions || 0), 0)
    const hasInternBot = orgSession?.aiTools?.includes('InternBot')

    // ── Skill toggling for the form ──
    const toggleFormSkill = (skill) => {
        const current = internForm.skills ? internForm.skills.split(',').map(s => s.trim()).filter(Boolean) : []
        const updated = current.includes(skill)
            ? current.filter(s => s !== skill)
            : [...current, skill]
        setInternForm({ ...internForm, skills: updated.join(', ') })
    }
    const selectedSkills = internForm.skills ? internForm.skills.split(',').map(s => s.trim()).filter(Boolean) : []

    return (
        <div className={`org-page ${orgSession ? 'org-page--dashboard' : ''}`}>
            {/* Navigation */}
            <nav className="org-nav">
                <div className="org-nav-inner">
                    <a href="/" className="org-nav-logo">SnapAI</a>
                    <div className="org-nav-right">
                        {orgSession && (
                            <span className="org-nav-company">🏢 {orgSession.companyName}</span>
                        )}
                        <a href="/" className="org-nav-back">← Back to Site</a>
                    </div>
                </div>
            </nav>

            <div className={orgSession ? 'org-container org-container--wide' : 'org-container'}>
                <div className={orgSession ? 'org-card org-card--dashboard' : 'org-card'}>

                    {/* ═══ DASHBOARD (logged in) ═══ */}
                    {orgSession ? (
                        <div className="org-dashboard">
                            {/* Dashboard Header */}
                            <div className="org-dash-header">
                                <div className="org-dash-header-left">
                                    <div className="org-dash-avatar">🏢</div>
                                    <div>
                                        <h2 className="org-dash-title">{orgSession.companyName}</h2>
                                        <span className="org-dash-sub">@{orgSession.username} · <span className={`org-status-dot ${orgSession.status}`}></span> {orgSession.status}</span>
                                    </div>
                                </div>
                                <button className="org-logout-btn" onClick={handleLogout}>Logout</button>
                            </div>

                            {/* Dashboard Tabs */}
                            <div className="org-dash-tabs">
                                <button
                                    className={`org-dash-tab ${dashTab === 'overview' ? 'active' : ''}`}
                                    onClick={() => setDashTab('overview')}
                                >
                                    📊 Overview
                                </button>
                                {hasInternBot && (
                                    <button
                                        className={`org-dash-tab ${dashTab === 'internbot' ? 'active' : ''}`}
                                        onClick={() => setDashTab('internbot')}
                                    >
                                        🤖 InternBot
                                    </button>
                                )}
                                <button
                                    className={`org-dash-tab ${dashTab === 'request' ? 'active' : ''}`}
                                    onClick={() => setDashTab('request')}
                                >
                                    ✨ Request Tool
                                </button>
                            </div>

                            {/* ─── Overview Tab ─── */}
                            {dashTab === 'overview' && (
                                <div className="org-tab-content fade-in">
                                    <div className="org-stats-grid">
                                        <div className="org-stat-card">
                                            <span className="org-stat-icon">📋</span>
                                            <div className="org-stat-value">{internships.length}</div>
                                            <div className="org-stat-label">Total Listings</div>
                                        </div>
                                        <div className="org-stat-card">
                                            <span className="org-stat-icon active-icon">🟢</span>
                                            <div className="org-stat-value">{activeListings}</div>
                                            <div className="org-stat-label">Active</div>
                                        </div>
                                        <div className="org-stat-card">
                                            <span className="org-stat-icon">🔴</span>
                                            <div className="org-stat-value">{closedListings}</div>
                                            <div className="org-stat-label">Closed</div>
                                        </div>
                                        <div className="org-stat-card">
                                            <span className="org-stat-icon">👥</span>
                                            <div className="org-stat-value">{totalPositions}</div>
                                            <div className="org-stat-label">Total Positions</div>
                                        </div>
                                    </div>

                                    <div className="org-info-section">
                                        <h3 className="org-section-title">Organization Details</h3>
                                        <div className="org-info-grid">
                                            <div className="org-info-row">
                                                <span className="org-info-label">Company</span>
                                                <span className="org-info-value">{orgSession.companyName}</span>
                                            </div>
                                            <div className="org-info-row">
                                                <span className="org-info-label">Username</span>
                                                <span className="org-info-value">@{orgSession.username}</span>
                                            </div>
                                            <div className="org-info-row">
                                                <span className="org-info-label">Status</span>
                                                <span className={`org-status-badge ${orgSession.status}`}>
                                                    {orgSession.status === 'approved' && '✓ '}
                                                    {orgSession.status}
                                                </span>
                                            </div>
                                            <div className="org-info-row">
                                                <span className="org-info-label">Joined</span>
                                                <span className="org-info-value">{new Date(orgSession.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="org-collab-tools">
                                        <h4>Collaborating Tools</h4>
                                        {orgSession.aiTools?.split(',').map((tool, i) => (
                                            <span key={i} className="org-tool-chip">🤖 {tool.trim()}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ─── InternBot Dashboard Tab ─── */}
                            {dashTab === 'internbot' && hasInternBot && (
                                <div className="org-tab-content fade-in">
                                    <div className="org-section-header">
                                        <div>
                                            <h3 className="org-section-title">Internship Listings</h3>
                                            <p className="org-section-desc">Post internships that appear in InternBot search results for matching users.</p>
                                        </div>
                                        <button
                                            className="org-add-btn"
                                            onClick={() => { resetInternForm(); setShowInternForm(true) }}
                                        >
                                            + Add Internship
                                        </button>
                                    </div>

                                    {/* Add/Edit Modal */}
                                    {showInternForm && (
                                        <div className="org-modal-overlay" onClick={(e) => e.target === e.currentTarget && resetInternForm()}>
                                            <form className="org-modal" onSubmit={handleInternSubmit}>
                                                <div className="org-modal-header">
                                                    <h3>{editingIntern ? '✏️ Edit Internship' : '➕ Add Internship'}</h3>
                                                    <button type="button" className="org-modal-close" onClick={resetInternForm}>✕</button>
                                                </div>

                                                <div className="org-modal-body">
                                                    <div className="org-field">
                                                        <label className="org-label">Title *</label>
                                                        <input
                                                            type="text"
                                                            className="org-input"
                                                            placeholder="e.g. Frontend Developer Intern"
                                                            value={internForm.title}
                                                            onChange={(e) => setInternForm({ ...internForm, title: e.target.value })}
                                                            required
                                                        />
                                                    </div>

                                                    <div className="org-field">
                                                        <label className="org-label">Description</label>
                                                        <textarea
                                                            className="org-input org-textarea"
                                                            placeholder="Describe the role, responsibilities, and requirements..."
                                                            rows="3"
                                                            value={internForm.description}
                                                            onChange={(e) => setInternForm({ ...internForm, description: e.target.value })}
                                                        />
                                                    </div>

                                                    <div className="org-form-row-2">
                                                        <div className="org-field">
                                                            <label className="org-label">Type</label>
                                                            <select
                                                                className="org-select"
                                                                value={internForm.type}
                                                                onChange={(e) => setInternForm({ ...internForm, type: e.target.value })}
                                                            >
                                                                <option value="stipend">💰 Stipend</option>
                                                                <option value="non-stipend">🤝 Non-Stipend</option>
                                                                <option value="research">🔬 Research</option>
                                                            </select>
                                                        </div>
                                                        <div className="org-field">
                                                            <label className="org-label">Work Mode</label>
                                                            <select
                                                                className="org-select"
                                                                value={internForm.work_mode}
                                                                onChange={(e) => setInternForm({ ...internForm, work_mode: e.target.value })}
                                                            >
                                                                <option value="Remote">🏠 Remote</option>
                                                                <option value="In-Office">🏢 In-Office</option>
                                                                <option value="Hybrid">🔀 Hybrid</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {internForm.work_mode !== 'Remote' && (
                                                        <div className="org-field">
                                                            <label className="org-label">Location</label>
                                                            <input
                                                                type="text"
                                                                className="org-input"
                                                                placeholder="e.g. Bangalore, Mumbai"
                                                                value={internForm.location}
                                                                onChange={(e) => setInternForm({ ...internForm, location: e.target.value })}
                                                            />
                                                        </div>
                                                    )}

                                                    <div className="org-field">
                                                        <label className="org-label">Required Skills</label>
                                                        <div className="org-skills-picker">
                                                            {SKILL_OPTIONS.map(skill => (
                                                                <button
                                                                    key={skill}
                                                                    type="button"
                                                                    className={`org-skill-chip ${selectedSkills.includes(skill) ? 'selected' : ''}`}
                                                                    onClick={() => toggleFormSkill(skill)}
                                                                >
                                                                    {selectedSkills.includes(skill) ? '✓ ' : ''}{skill}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="org-form-row-2">
                                                        <div className="org-field">
                                                            <label className="org-label">Positions Available</label>
                                                            <input
                                                                type="number"
                                                                className="org-input"
                                                                min="1"
                                                                max="100"
                                                                value={internForm.positions}
                                                                onChange={(e) => setInternForm({ ...internForm, positions: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="org-field">
                                                            <label className="org-label">Status</label>
                                                            <select
                                                                className="org-select"
                                                                value={internForm.status}
                                                                onChange={(e) => setInternForm({ ...internForm, status: e.target.value })}
                                                            >
                                                                <option value="active">🟢 Active</option>
                                                                <option value="closed">🔴 Closed</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {formMsg && <div className="org-error">⚠️ {formMsg}</div>}
                                                </div>

                                                <div className="org-modal-footer">
                                                    <button type="button" className="org-btn-outline" onClick={resetInternForm}>Cancel</button>
                                                    <button type="submit" className="org-submit org-submit--sm" disabled={loading}>
                                                        {loading ? 'Saving...' : (editingIntern ? 'Update' : 'Add Listing')}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    )}

                                    {/* Listings */}
                                    {internLoading ? (
                                        <div className="org-loading">
                                            <div className="org-spinner"></div>
                                            <p>Loading listings...</p>
                                        </div>
                                    ) : internships.length === 0 ? (
                                        <div className="org-empty">
                                            <span className="org-empty-icon">📋</span>
                                            <h4>No internship listings yet</h4>
                                            <p>Post your first internship and it will appear in InternBot search results.</p>
                                        </div>
                                    ) : (
                                        <div className="org-intern-grid">
                                            {internships.map(intern => (
                                                <div key={intern.id} className={`org-intern-card ${intern.status === 'active' ? 'active' : 'closed'}`}>
                                                    <div className="org-intern-card-header">
                                                        <h4 className="org-intern-title">{intern.title}</h4>
                                                        <span className={`org-intern-status ${intern.status}`}>
                                                            {intern.status === 'active' ? '🟢' : '🔴'} {intern.status}
                                                        </span>
                                                    </div>
                                                    {intern.description && (
                                                        <p className="org-intern-desc">{intern.description}</p>
                                                    )}
                                                    <div className="org-intern-meta">
                                                        <span>💼 {intern.type}</span>
                                                        <span>{intern.work_mode === 'Remote' ? '🏠' : intern.work_mode === 'Hybrid' ? '🔀' : '🏢'} {intern.work_mode}</span>
                                                        {intern.location && <span>📍 {intern.location}</span>}
                                                        <span>👥 {intern.positions} position{intern.positions !== 1 ? 's' : ''}</span>
                                                    </div>
                                                    {intern.skills && (
                                                        <div className="org-intern-skills">
                                                            {intern.skills.split(',').map((skill, i) => (
                                                                <span key={i} className="org-skill-tag">{skill.trim()}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="org-intern-actions">
                                                        <button className="org-act-btn edit" onClick={() => handleEditIntern(intern)}>✏️ Edit</button>
                                                        <button
                                                            className={`org-act-btn ${intern.status === 'active' ? 'close' : 'open'}`}
                                                            onClick={() => handleToggleInternStatus(intern)}
                                                        >
                                                            {intern.status === 'active' ? '⏸ Close' : '▶ Reopen'}
                                                        </button>
                                                        <button className="org-act-btn delete" onClick={() => handleDeleteIntern(intern.id)}>🗑️</button>
                                                    </div>
                                                    <div className="org-intern-date">
                                                        Posted {new Date(intern.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ─── Request AI Tool Tab ─── */}
                            {dashTab === 'request' && (
                                <div className="org-tab-content fade-in">
                                    <div className="org-section-header">
                                        <div>
                                            <h3 className="org-section-title">Request AI Tool Access</h3>
                                            <p className="org-section-desc">Want to collaborate with another AI tool? Submit a request and our team will review it.</p>
                                        </div>
                                    </div>

                                    {reqSent ? (
                                        <div className="org-req-success">
                                            <span>✅</span>
                                            <p>Request submitted! Our team will review it and get back to you.</p>
                                        </div>
                                    ) : (
                                        <div className="org-req-form">
                                            <div className="org-tool-grid">
                                                {ALL_AI_TOOLS.map(tool => (
                                                    <button
                                                        key={tool.value}
                                                        className={`org-tool-option ${reqTool === tool.value ? 'selected' : ''}`}
                                                        onClick={() => setReqTool(tool.value)}
                                                    >
                                                        <span className="org-tool-option-label">{tool.label}</span>
                                                        <span className="org-tool-option-desc">{tool.desc}</span>
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="org-field" style={{ marginTop: 20 }}>
                                                <label className="org-label">Why do you need this tool?</label>
                                                <textarea
                                                    className="org-input org-textarea"
                                                    placeholder="Tell us how you plan to use this tool..."
                                                    rows="3"
                                                    value={reqReason}
                                                    onChange={(e) => setReqReason(e.target.value)}
                                                />
                                            </div>

                                            <button
                                                className="org-submit"
                                                style={{ marginTop: 16 }}
                                                disabled={!reqTool || !reqReason.trim() || loading}
                                                onClick={handleRequestTool}
                                            >
                                                {loading ? 'Sending...' : 'Submit Request →'}
                                            </button>
                                        </div>
                                    )}

                                    <div className="org-collab-tools" style={{ marginTop: 24 }}>
                                        <h4>Your Current Tools</h4>
                                        {orgSession.aiTools?.split(',').map((tool, i) => (
                                            <span key={i} className="org-tool-chip">🤖 {tool.trim()}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                    /* ═══ SIGNUP SUCCESS ═══ */
                    ) : signupSuccess ? (
                        <div className="org-success-screen">
                            <div className="org-success-icon">📨</div>
                            <h3>Application Sent!</h3>
                            <p>
                                Your collaboration request has been sent to our admin team for review.
                                You'll be able to log in once approved.
                            </p>
                            <button
                                className="org-btn-outline"
                                onClick={() => { setSignupSuccess(false); setMode('login') }}
                            >
                                ← Go to Login
                            </button>
                        </div>

                    /* ═══ AUTH FORMS ═══ */
                    ) : (
                        <>
                            <div className="org-header">
                                <div className="org-icon">🏢</div>
                                <h2 className="org-title">
                                    {mode === 'login' ? 'Organization Login' : 'Join as Organization'}
                                </h2>
                                <p className="org-subtitle">
                                    {mode === 'login'
                                        ? 'Sign in with your credentials'
                                        : 'Apply to collaborate with SnapAI'}
                                </p>
                            </div>

                            {/* Tab Switcher */}
                            <div className="org-tabs">
                                <button
                                    className={`org-tab ${mode === 'login' ? 'active' : ''}`}
                                    onClick={() => { setMode('login'); setError('') }}
                                >
                                    Login
                                </button>
                                <button
                                    className={`org-tab ${mode === 'signup' ? 'active' : ''}`}
                                    onClick={() => { setMode('signup'); setError('') }}
                                >
                                    Sign Up
                                </button>
                            </div>

                            {error && <div className="org-error">⚠️ {error}</div>}

                            {/* ── LOGIN FORM ── */}
                            {mode === 'login' && (
                                <form className="org-form" onSubmit={handleLogin}>
                                    <div className="org-field">
                                        <label className="org-label">Username</label>
                                        <input
                                            type="text"
                                            className="org-input"
                                            placeholder="Enter your username"
                                            value={loginUsername}
                                            onChange={(e) => setLoginUsername(e.target.value)}
                                            autoFocus
                                            required
                                        />
                                    </div>
                                    <div className="org-field">
                                        <label className="org-label">Password</label>
                                        <div className="org-password-wrap">
                                            <input
                                                type={showLoginPw ? 'text' : 'password'}
                                                className="org-input"
                                                placeholder="Enter your password"
                                                value={loginPassword}
                                                onChange={(e) => setLoginPassword(e.target.value)}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="org-pw-toggle"
                                                onClick={() => setShowLoginPw(!showLoginPw)}
                                            >
                                                {showLoginPw ? '🙈' : '👁️'}
                                            </button>
                                        </div>
                                    </div>
                                    <button type="submit" className="org-submit" disabled={loading}>
                                        {loading ? 'Signing in...' : 'Login →'}
                                    </button>
                                </form>
                            )}

                            {/* ── SIGNUP FORM ── */}
                            {mode === 'signup' && (
                                <form className="org-form" onSubmit={handleSignup}>
                                    <div className="org-field">
                                        <label className="org-label">Company Name</label>
                                        <input
                                            type="text"
                                            className="org-input"
                                            placeholder="Your organization name"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            autoFocus
                                            required
                                        />
                                    </div>
                                    <div className="org-field">
                                        <label className="org-label">AI Tool to Collaborate</label>
                                        <select
                                            className="org-select"
                                            value={aiTool}
                                            onChange={(e) => setAiTool(e.target.value)}
                                            required
                                        >
                                            <option value="">Select a tool...</option>
                                            {INTEGRATED_TOOLS.map((t) => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="org-field">
                                        <label className="org-label">Username</label>
                                        <input
                                            type="text"
                                            className="org-input"
                                            placeholder="Choose a username"
                                            value={signupUsername}
                                            onChange={(e) => setSignupUsername(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="org-field">
                                        <label className="org-label">Password</label>
                                        <div className="org-password-wrap">
                                            <input
                                                type={showSignupPw ? 'text' : 'password'}
                                                className="org-input"
                                                placeholder="Min. 6 characters"
                                                value={signupPassword}
                                                onChange={(e) => setSignupPassword(e.target.value)}
                                                minLength={6}
                                                required
                                            />
                                            <button
                                                type="button"
                                                className="org-pw-toggle"
                                                onClick={() => setShowSignupPw(!showSignupPw)}
                                            >
                                                {showSignupPw ? '🙈' : '👁️'}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        className={`org-submit ${loading ? 'sending' : ''}`}
                                        disabled={loading}
                                    >
                                        {loading ? 'Sending...' : 'Send for Approval →'}
                                    </button>
                                </form>
                            )}

                            <div style={{ textAlign: 'center', marginTop: 20 }}>
                                <span style={{ fontSize: '0.82rem', color: '#63636E' }}>
                                    {mode === 'login' ? "New organization? " : "Already registered? "}
                                </span>
                                <button
                                    style={{
                                        background: 'none', border: 'none', color: '#3B82F6',
                                        fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                        fontFamily: 'inherit'
                                    }}
                                    onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
                                >
                                    {mode === 'login' ? 'Sign up →' : 'Log in →'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default OrganizationPage
