import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
    enhanceExperience,
    enhanceProject,
    categorizeSkills,
    parseResumeText,
    generateSummary,
    chatResumeAssistant
} from './resumeApi'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import AuthModal from './components/ui/AuthModal'
import ProfileDropdown from './components/ui/ProfileDropdown'
import { loadWallet, deductCredits } from './App'
import './ResumeBuilderPage.css'

// ═══════════════════════════════════════
//  EMPTY STATE TEMPLATES
// ═══════════════════════════════════════
const emptyPersonal = { name: '', email: '', phone: '', linkedin: '', github: '' }
const emptyEducation = { institution: '', degree: '', date: '', gpa: '' }
const emptyExperience = { company: '', title: '', date: '', location: '', description: '', bullets: [] }
const emptyProject = { name: '', description: '', technologies: '', link: '', bullets: [] }

// ═══════════════════════════════════════
//  STEP DEFINITIONS
// ═══════════════════════════════════════
const STEPS = [
    { id: 'personal', label: '👤 Personal Info', icon: '👤' },
    { id: 'education', label: '🎓 Education', icon: '🎓' },
    { id: 'experience', label: '💼 Experience', icon: '💼' },
    { id: 'projects', label: '💻 Projects', icon: '💻' },
    { id: 'skills', label: '🛠️ Skills', icon: '🛠️' },
    { id: 'summary', label: '📝 Summary', icon: '📝' },
]

// ═══════════════════════════════════════
//  LIVE RESUME PREVIEW
// ═══════════════════════════════════════
const ResumePreview = ({ data }) => {
    const { personal, education, experience, projects, skills, categorizedSkills, summary } = data

    const hasContent = personal.name || personal.email || personal.phone ||
        education.some(e => e.institution) || experience.some(e => e.company || e.title) ||
        projects.some(p => p.name) || skills.length > 0 || summary

    if (!hasContent) {
        return (
            <div style={{
                background: '#1A1A1F',
                border: '2px dashed #27272F',
                borderRadius: '0.5rem',
                padding: '3rem 2rem',
                textAlign: 'center',
                minHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem'
            }}>
                <span style={{ fontSize: '2.5rem' }}>📄</span>
                <p style={{ fontSize: '0.9375rem', color: '#EDEDEF', fontWeight: 500 }}>Your Resume Preview</p>
                <p style={{ fontSize: '0.8125rem', color: '#63636E', maxWidth: '280px', lineHeight: 1.5 }}>
                    Start filling in the form on the left — your resume will appear here in real-time.
                </p>
            </div>
        )
    }

    return (
        <div className="rb-resume" id="resume-print-area">
            {/* Watermark Overlay (Hidden during PDF download) */}
            <div className="rb-watermark-overlay">
                {Array(12).fill('SNAPAI').map((text, i) => (
                    <div key={i} className="rb-watermark-text">{text}</div>
                ))}
            </div>

            {/* Header */}
            {personal.name && <h1 className="rb-resume-name">{personal.name}</h1>}
            <div className="rb-resume-contact">
                {personal.phone && <span>{personal.phone}</span>}
                {personal.email && <span><a href={`mailto:${personal.email}`}>{personal.email}</a></span>}
                {personal.linkedin && <span><a href={personal.linkedin} target="_blank" rel="noreferrer">{personal.linkedin.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '')}</a></span>}
                {personal.github && <span><a href={personal.github} target="_blank" rel="noreferrer">{personal.github.replace(/https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '')}</a></span>}
            </div>

            {/* Summary */}
            {summary && (
                <>
                    <h2>Professional Summary</h2>
                    <p className="rb-resume-summary">{summary}</p>
                </>
            )}

            {/* Education */}
            {education.length > 0 && education.some(e => e.institution) && (
                <>
                    <h2>Education</h2>
                    {education.filter(e => e.institution).map((edu, i) => (
                        <div key={i} className="rb-resume-item">
                            <div className="rb-resume-item-header">
                                <span className="rb-resume-item-name">{edu.institution}</span>
                                <span className="rb-resume-item-date">{edu.date}</span>
                            </div>
                            <div className="rb-resume-item-sub">
                                <span>{edu.degree}</span>
                                {edu.gpa && <span>GPA: {edu.gpa}</span>}
                            </div>
                        </div>
                    ))}
                </>
            )}

            {/* Experience */}
            {experience.length > 0 && experience.some(e => e.company || e.title) && (
                <>
                    <h2>Experience</h2>
                    {experience.filter(e => e.company || e.title).map((exp, i) => (
                        <div key={i} className="rb-resume-item">
                            <div className="rb-resume-item-header">
                                <span className="rb-resume-item-name">{exp.title}</span>
                                <span className="rb-resume-item-date">{exp.date}</span>
                            </div>
                            <div className="rb-resume-item-sub">
                                <span>{exp.company}</span>
                                <span>{exp.location}</span>
                            </div>
                            {exp.bullets && exp.bullets.length > 0 ? (
                                <ul>{exp.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                            ) : exp.description ? (
                                <ul><li>{exp.description}</li></ul>
                            ) : null}
                        </div>
                    ))}
                </>
            )}

            {/* Projects */}
            {projects.length > 0 && projects.some(p => p.name) && (
                <>
                    <h2>Projects</h2>
                    {projects.filter(p => p.name).map((proj, i) => (
                        <div key={i} className="rb-resume-item">
                            <div className="rb-resume-item-header">
                                <span className="rb-resume-item-name">
                                    {proj.link ? <a href={proj.link} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{proj.name}</a> : proj.name}
                                    {proj.technologies && <span style={{ fontWeight: 400 }}> | {proj.technologies}</span>}
                                </span>
                            </div>
                            {proj.bullets && proj.bullets.length > 0 ? (
                                <ul>{proj.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                            ) : proj.description ? (
                                <ul><li>{proj.description}</li></ul>
                            ) : null}
                        </div>
                    ))}
                </>
            )}

            {/* Skills */}
            {(Object.keys(categorizedSkills).length > 0 || skills.length > 0) && (
                <>
                    <h2>Technical Skills</h2>
                    <div className="rb-resume-skills">
                        {Object.keys(categorizedSkills).length > 0
                            ? Object.entries(categorizedSkills).map(([cat, list]) => (
                                list && list.length > 0 && (
                                    <p key={cat}><strong>{cat}:</strong> {list.join(', ')}</p>
                                )
                            ))
                            : <p>{skills.join(', ')}</p>
                        }
                    </div>
                </>
            )}
        </div>
    )
}

// ═══════════════════════════════════════
//  MANUAL FORM COMPONENT
// ═══════════════════════════════════════
const ManualForm = ({ data, setData, onDownload, downloading }) => {
    const [step, setStep] = useState(0)
    const [aiLoading, setAiLoading] = useState({})

    const updatePersonal = (field, value) => {
        setData(prev => ({ ...prev, personal: { ...prev.personal, [field]: value } }))
    }

    const updateEducation = (idx, field, value) => {
        setData(prev => {
            const edu = [...prev.education]
            edu[idx] = { ...edu[idx], [field]: value }
            return { ...prev, education: edu }
        })
    }

    const addEducation = () => setData(prev => ({ ...prev, education: [...prev.education, { ...emptyEducation }] }))
    const removeEducation = (idx) => setData(prev => ({ ...prev, education: prev.education.filter((_, i) => i !== idx) }))

    const updateExperience = (idx, field, value) => {
        setData(prev => {
            const exp = [...prev.experience]
            exp[idx] = { ...exp[idx], [field]: value }
            return { ...prev, experience: exp }
        })
    }

    const addExperience = () => setData(prev => ({ ...prev, experience: [...prev.experience, { ...emptyExperience }] }))
    const removeExperience = (idx) => setData(prev => ({ ...prev, experience: prev.experience.filter((_, i) => i !== idx) }))

    const updateProject = (idx, field, value) => {
        setData(prev => {
            const proj = [...prev.projects]
            proj[idx] = { ...proj[idx], [field]: value }
            return { ...prev, projects: proj }
        })
    }

    const addProject = () => setData(prev => ({ ...prev, projects: [...prev.projects, { ...emptyProject }] }))
    const removeProject = (idx) => setData(prev => ({ ...prev, projects: prev.projects.filter((_, i) => i !== idx) }))

    const handleAIEnhanceExp = async (idx) => {
        const exp = data.experience[idx]
        if (!exp.description) return
        setAiLoading(prev => ({ ...prev, [`exp_${idx}`]: true }))
        try {
            const bullets = await enhanceExperience(`${exp.title} at ${exp.company}: ${exp.description}`)
            setData(prev => {
                const newExp = [...prev.experience]
                newExp[idx] = { ...newExp[idx], bullets }
                return { ...prev, experience: newExp }
            })
        } catch (err) {
            console.error(err)
        }
        setAiLoading(prev => ({ ...prev, [`exp_${idx}`]: false }))
    }

    const handleAIEnhanceProj = async (idx) => {
        const proj = data.projects[idx]
        if (!proj.description) return
        setAiLoading(prev => ({ ...prev, [`proj_${idx}`]: true }))
        try {
            const bullets = await enhanceProject(proj.name, proj.description)
            setData(prev => {
                const newProj = [...prev.projects]
                newProj[idx] = { ...newProj[idx], bullets }
                return { ...prev, projects: newProj }
            })
        } catch (err) {
            console.error(err)
        }
        setAiLoading(prev => ({ ...prev, [`proj_${idx}`]: false }))
    }

    const handleCategorizeSkills = async () => {
        if (!data.skills.length) return
        setAiLoading(prev => ({ ...prev, skills: true }))
        try {
            const categorized = await categorizeSkills(data.skills)
            setData(prev => ({ ...prev, categorizedSkills: categorized }))
        } catch (err) {
            console.error(err)
        }
        setAiLoading(prev => ({ ...prev, skills: false }))
    }

    const handleGenerateSummary = async () => {
        setAiLoading(prev => ({ ...prev, summary: true }))
        try {
            const text = await generateSummary(data)
            setData(prev => ({ ...prev, summary: text }))
        } catch (err) {
            console.error(err)
        }
        setAiLoading(prev => ({ ...prev, summary: false }))
    }

    const renderStep = () => {
        switch (step) {
            case 0: // Personal Info
                return (
                    <div className="rb-form-section">
                        <h3>👤 Personal Information</h3>
                        <div className="rb-field">
                            <label>Full Name</label>
                            <input placeholder="John Doe" value={data.personal.name} onChange={e => updatePersonal('name', e.target.value)} />
                        </div>
                        <div className="rb-field-row">
                            <div className="rb-field">
                                <label>Email</label>
                                <input type="email" placeholder="john@example.com" value={data.personal.email} onChange={e => updatePersonal('email', e.target.value)} />
                            </div>
                            <div className="rb-field">
                                <label>Phone</label>
                                <input placeholder="+1 234 567 890" value={data.personal.phone} onChange={e => updatePersonal('phone', e.target.value)} />
                            </div>
                        </div>
                        <div className="rb-field-row">
                            <div className="rb-field">
                                <label>LinkedIn URL</label>
                                <input placeholder="linkedin.com/in/johndoe" value={data.personal.linkedin} onChange={e => updatePersonal('linkedin', e.target.value)} />
                            </div>
                            <div className="rb-field">
                                <label>GitHub URL</label>
                                <input placeholder="github.com/johndoe" value={data.personal.github} onChange={e => updatePersonal('github', e.target.value)} />
                            </div>
                        </div>
                    </div>
                )

            case 1: // Education
                return (
                    <div className="rb-form-section">
                        <h3>🎓 Education</h3>
                        {data.education.map((edu, i) => (
                            <div key={i} className="rb-entry">
                                {data.education.length > 1 && (
                                    <button className="rb-entry-remove" onClick={() => removeEducation(i)}>✕</button>
                                )}
                                <div className="rb-field">
                                    <label>Institution</label>
                                    <input placeholder="University of Technology" value={edu.institution} onChange={e => updateEducation(i, 'institution', e.target.value)} />
                                </div>
                                <div className="rb-field">
                                    <label>Degree</label>
                                    <input placeholder="Bachelor of Science in Computer Science" value={edu.degree} onChange={e => updateEducation(i, 'degree', e.target.value)} />
                                </div>
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>Date</label>
                                        <input placeholder="Aug 2020 — May 2024" value={edu.date} onChange={e => updateEducation(i, 'date', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>GPA (optional)</label>
                                        <input placeholder="3.8/4.0" value={edu.gpa} onChange={e => updateEducation(i, 'gpa', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button className="rb-add-btn" onClick={addEducation}>+ Add Education</button>
                    </div>
                )

            case 2: // Experience
                return (
                    <div className="rb-form-section">
                        <h3>💼 Experience</h3>
                        {data.experience.map((exp, i) => (
                            <div key={i} className="rb-entry">
                                {data.experience.length > 1 && (
                                    <button className="rb-entry-remove" onClick={() => removeExperience(i)}>✕</button>
                                )}
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>Job Title</label>
                                        <input placeholder="Software Engineer" value={exp.title} onChange={e => updateExperience(i, 'title', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>Company</label>
                                        <input placeholder="Google" value={exp.company} onChange={e => updateExperience(i, 'company', e.target.value)} />
                                    </div>
                                </div>
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>Date</label>
                                        <input placeholder="Jun 2023 — Present" value={exp.date} onChange={e => updateExperience(i, 'date', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>Location</label>
                                        <input placeholder="San Francisco, CA" value={exp.location} onChange={e => updateExperience(i, 'location', e.target.value)} />
                                    </div>
                                </div>
                                <div className="rb-field">
                                    <label>Description</label>
                                    <textarea placeholder="Describe your responsibilities and achievements..." value={exp.description} onChange={e => updateExperience(i, 'description', e.target.value)} />
                                </div>
                                <button className={`rb-ai-btn ${aiLoading[`exp_${i}`] ? 'loading' : ''}`} onClick={() => handleAIEnhanceExp(i)} disabled={aiLoading[`exp_${i}`] || !exp.description}>
                                    {aiLoading[`exp_${i}`] ? <><span className="rb-spinner"></span> Enhancing...</> : '✨ AI Enhance'}
                                </button>
                                {exp.bullets && exp.bullets.length > 0 && (
                                    <div className="rb-status success" style={{ marginTop: '0.5rem' }}>
                                        ✓ {exp.bullets.length} bullet points generated
                                    </div>
                                )}
                            </div>
                        ))}
                        <button className="rb-add-btn" onClick={addExperience}>+ Add Experience</button>
                    </div>
                )

            case 3: // Projects
                return (
                    <div className="rb-form-section">
                        <h3>💻 Projects</h3>
                        {data.projects.map((proj, i) => (
                            <div key={i} className="rb-entry">
                                {data.projects.length > 1 && (
                                    <button className="rb-entry-remove" onClick={() => removeProject(i)}>✕</button>
                                )}
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>Project Name</label>
                                        <input placeholder="AI Resume Builder" value={proj.name} onChange={e => updateProject(i, 'name', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>Technologies</label>
                                        <input placeholder="React, Node.js, Python" value={proj.technologies} onChange={e => updateProject(i, 'technologies', e.target.value)} />
                                    </div>
                                </div>
                                <div className="rb-field">
                                    <label>Link (optional)</label>
                                    <input placeholder="https://github.com/..." value={proj.link} onChange={e => updateProject(i, 'link', e.target.value)} />
                                </div>
                                <div className="rb-field">
                                    <label>Description</label>
                                    <textarea placeholder="Describe the project, its purpose, and your contributions..." value={proj.description} onChange={e => updateProject(i, 'description', e.target.value)} />
                                </div>
                                <button className={`rb-ai-btn ${aiLoading[`proj_${i}`] ? 'loading' : ''}`} onClick={() => handleAIEnhanceProj(i)} disabled={aiLoading[`proj_${i}`] || !proj.description}>
                                    {aiLoading[`proj_${i}`] ? <><span className="rb-spinner"></span> Enhancing...</> : '✨ AI Enhance'}
                                </button>
                                {proj.bullets && proj.bullets.length > 0 && (
                                    <div className="rb-status success" style={{ marginTop: '0.5rem' }}>
                                        ✓ {proj.bullets.length} bullet points generated
                                    </div>
                                )}
                            </div>
                        ))}
                        <button className="rb-add-btn" onClick={addProject}>+ Add Project</button>
                    </div>
                )

            case 4: // Skills
                return (
                    <div className="rb-form-section">
                        <h3>🛠️ Skills</h3>
                        <div className="rb-field">
                            <label>Enter your skills separated by commas</label>
                            <textarea
                                placeholder="Python, JavaScript, React, Node.js, Docker, PostgreSQL, Git, AWS..."
                                value={data.skills.join(', ')}
                                onChange={e => setData(prev => ({
                                    ...prev,
                                    skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                }))}
                                style={{ minHeight: '100px' }}
                            />
                        </div>
                        <button className={`rb-ai-btn ${aiLoading.skills ? 'loading' : ''}`} onClick={handleCategorizeSkills} disabled={aiLoading.skills || !data.skills.length}>
                            {aiLoading.skills ? <><span className="rb-spinner"></span> Categorizing...</> : '✨ AI Categorize Skills'}
                        </button>
                        {Object.keys(data.categorizedSkills).length > 0 && (
                            <div className="rb-status success" style={{ marginTop: '0.5rem' }}>
                                ✓ Skills categorized into {Object.keys(data.categorizedSkills).length} categories
                            </div>
                        )}
                    </div>
                )

            case 5: // Summary
                return (
                    <div className="rb-form-section">
                        <h3>📝 Professional Summary</h3>
                        <div className="rb-field">
                            <label>Write or generate a 2-4 sentence professional summary</label>
                            <textarea
                                placeholder="A results-driven software engineer with 3+ years of experience..."
                                value={data.summary}
                                onChange={e => setData(prev => ({ ...prev, summary: e.target.value }))}
                                style={{ minHeight: '120px' }}
                            />
                        </div>
                        <button className={`rb-ai-btn ${aiLoading.summary ? 'loading' : ''}`} onClick={handleGenerateSummary} disabled={aiLoading.summary}>
                            {aiLoading.summary ? <><span className="rb-spinner"></span> Generating...</> : '✨ AI Generate Summary'}
                        </button>
                    </div>
                )

            default:
                return null
        }
    }

    return (
        <div className="rb-form-panel">
            <div className="rb-form-header">
                <h2>{STEPS[step].label}</h2>
                <div className="rb-step-indicator">
                    {STEPS.map((s, i) => (
                        <button
                            key={s.id}
                            className={`rb-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
                            onClick={() => setStep(i)}
                            title={s.label}
                            style={{ cursor: 'pointer', border: 'none' }}
                        />
                    ))}
                </div>
            </div>
            <div className="rb-form-body">
                {renderStep()}
                <div className="rb-btn-group">
                    {step > 0 && (
                        <button className="rb-btn rb-btn-secondary" onClick={() => setStep(step - 1)}>
                            ← Back
                        </button>
                    )}
                    {step < STEPS.length - 1 ? (
                        <button className="rb-btn rb-btn-primary" onClick={() => setStep(step + 1)}>
                            Next →
                        </button>
                    ) : (
                        <button className="rb-btn rb-btn-accent" onClick={onDownload} disabled={downloading}>
                            {downloading ? 'Processing...' : '📥 Download PDF (20 Credits)'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════
//  UPLOAD / PASTE MODE
// ═══════════════════════════════════════
const UploadMode = ({ setData, setMode }) => {
    const [rawText, setRawText] = useState('')
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState(null)

    const handleParse = async () => {
        if (!rawText.trim()) return
        setLoading(true)
        setStatus({ type: 'info', text: 'AI is analyzing your resume...' })
        try {
            const parsed = await parseResumeText(rawText)
            if (!parsed) throw new Error('Failed to parse resume')

            setData(prev => ({
                ...prev,
                personal: {
                    name: parsed.name || '',
                    email: parsed.email || '',
                    phone: parsed.phone || '',
                    linkedin: parsed.linkedin || '',
                    github: parsed.github || ''
                },
                education: (parsed.education || []).length > 0
                    ? parsed.education.map(e => ({
                        institution: e.institution || '',
                        degree: e.degree || '',
                        date: e.date || '',
                        gpa: e.gpa || ''
                    }))
                    : [{ ...emptyEducation }],
                experience: (parsed.experience || []).length > 0
                    ? parsed.experience.map(e => ({
                        company: e.company || '',
                        title: e.title || '',
                        date: e.date || '',
                        location: e.location || '',
                        description: '',
                        bullets: e.bullets || []
                    }))
                    : [{ ...emptyExperience }],
                projects: (parsed.projects || []).length > 0
                    ? parsed.projects.map(p => ({
                        name: p.name || '',
                        description: p.description || '',
                        technologies: p.technologies || '',
                        link: p.link || '',
                        bullets: p.bullets || []
                    }))
                    : [{ ...emptyProject }],
                skills: parsed.skills || [],
                summary: parsed.summary || ''
            }))

            setStatus({ type: 'success', text: 'Resume parsed! Switching to editor...' })
            setTimeout(() => setMode('manual'), 1000)
        } catch (err) {
            console.error(err)
            setStatus({ type: 'error', text: 'Failed to parse. Please try again or use the manual form.' })
        }
        setLoading(false)
    }

    return (
        <div className="rb-form-panel">
            <div className="rb-form-header">
                <h2>📄 Upload / Paste Resume</h2>
            </div>
            <div className="rb-upload-area">
                <p style={{ fontSize: '0.8125rem', color: '#A1A1A9', marginBottom: '1rem' }}>
                    Paste the text of your existing resume below. Our AI will extract and structure the data automatically.
                </p>
                <textarea
                    className="rb-paste-box"
                    placeholder="Paste your resume text here...&#10;&#10;Example:&#10;John Doe&#10;john@email.com | (555) 123-4567&#10;Software Engineer at Google&#10;..."
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                />
                <div className="rb-btn-group">
                    <button className="rb-btn rb-btn-accent" onClick={handleParse} disabled={loading || !rawText.trim()}>
                        {loading ? <><span className="rb-spinner"></span> Analyzing...</> : '✨ Parse with AI'}
                    </button>
                    <button className="rb-btn rb-btn-secondary" onClick={() => setMode(null)}>
                        ← Back
                    </button>
                </div>
                {status && <div className={`rb-status ${status.type}`}>{status.text}</div>}
            </div>
        </div>
    )
}

// ═══════════════════════════════════════
//  AI CHAT MODE
// ═══════════════════════════════════════
const ChatMode = ({ setData, setMode, onDownload, downloading }) => {
    const [messages, setMessages] = useState([
        { role: 'ai', content: "Hi! I'm the AI Resume Assistant. I'll help you build a professional resume through conversation. Let's start — what's your full name?" }
    ])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const chatEndRef = useRef(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || isTyping) return
        const userMsg = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setIsTyping(true)

        try {
            const response = await chatResumeAssistant(userMsg, messages)
            setMessages(prev => [...prev, { role: 'ai', content: response }])

            // Check for resume_data blocks
            const match = response.match(/```resume_data\n([\s\S]*?)\n```/)
            if (match) {
                try {
                    const parsed = JSON.parse(match[1])
                    if (parsed.section === 'personal' && parsed.data) {
                        setData(prev => ({ ...prev, personal: { ...prev.personal, ...parsed.data } }))
                    } else if (parsed.section === 'education' && parsed.data) {
                        setData(prev => {
                            const entries = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
                            const filtered = prev.education.filter(e => e.institution);
                            return { ...prev, education: [...filtered, ...entries] }
                        });
                    } else if (parsed.section === 'experience' && parsed.data) {
                        setData(prev => {
                            const entries = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
                            const filtered = prev.experience.filter(e => e.company || e.title);
                            return { ...prev, experience: [...filtered, ...entries] }
                        });
                    } else if (parsed.section === 'projects' && parsed.data) {
                        setData(prev => {
                            const entries = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
                            const filtered = prev.projects.filter(e => e.name);
                            return { ...prev, projects: [...filtered, ...entries] }
                        });
                    } else if (parsed.section === 'skills' && parsed.data) {
                        setData(prev => {
                            const entries = Array.isArray(parsed.data) ? parsed.data : [];
                            return { ...prev, skills: [...new Set([...prev.skills, ...entries])] }
                        });
                    } else if (parsed.section === 'summary' && parsed.data) {
                        const text = typeof parsed.data === 'string' ? parsed.data : parsed.data.summary || parsed.data.text || '';
                        setData(prev => ({ ...prev, summary: text }));
                    }
                } catch (e) { /* ignore parse errors */ }
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'ai', content: `❌ Error: ${err.message}. Please try again.` }])
        }
        setIsTyping(false)
    }

    return (
        <div className="rb-form-panel">
            <div className="rb-form-header">
                <h2>🤖 AI Chat Assistant</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="rb-btn rb-btn-accent" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={onDownload} disabled={downloading}>
                        {downloading ? '...' : '📥 Download PDF (20c)'}
                    </button>
                    <button className="rb-btn rb-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setMode('manual')}>
                        Switch to Form →
                    </button>
                </div>
            </div>
            <div className="rb-chat-area">
                {messages.map((msg, i) => (
                    <div key={i} className={`rb-chat-msg ${msg.role === 'ai' ? 'ai' : 'user'}`}>
                        {msg.content}
                    </div>
                ))}
                {isTyping && (
                    <div className="rb-chat-msg ai" style={{ fontStyle: 'italic', color: '#63636E' }}>
                        Thinking...
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>
            <div className="rb-chat-input">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Type your message..."
                />
                <button onClick={handleSend} disabled={isTyping || !input.trim()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════
export default function ResumeBuilderPage() {
    const [mode, setMode] = useState(null) // null | 'manual' | 'upload' | 'chat'
    const [user, setUser] = useState(null)
    const [walletCredits, setWalletCredits] = useState(0)
    const [isDownloading, setIsDownloading] = useState(false)
    const [showAuthModal, setShowAuthModal] = useState(false)
    const [resumeData, setResumeData] = useState({
        personal: { ...emptyPersonal },
        education: [{ ...emptyEducation }],
        experience: [{ ...emptyExperience }],
        projects: [{ ...emptyProject }],
        skills: [],
        categorizedSkills: {},
        summary: ''
    })

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            setUser(u)
            if (u) {
                const w = await loadWallet(u.uid)
                setWalletCredits(w.credits)
            } else {
                setWalletCredits(0)
            }
        })

        // Screenshot & Copy Prevention logic
        const preventCopy = (e) => {
            e.preventDefault()
            // Optional: alert('Action not allowed')
        }
        
        const preventScreenshot = (e) => {
            if (e.key === 'PrintScreen') {
                navigator.clipboard.writeText('')
                alert('Screenshots are not allowed on this page.')
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'p' || e.key === 's')) {
                // Prevent Ctrl+C, Ctrl+P (printing handled by our button, but browser print captures UI), Ctrl+S
                // Actually they need Ctrl+P when they click 'Download PDF' because that uses window.print()
                // If we block Ctrl+P here, they can't use shortcut. We only block Ctrl+C and Ctrl+S:
                if (e.key === 'c' || e.key === 's') {
                   e.preventDefault()
                }
            }
        }

        document.addEventListener('contextmenu', preventCopy)
        document.addEventListener('copy', preventCopy)
        document.addEventListener('cut', preventCopy)
        window.addEventListener('keyup', preventScreenshot)
        window.addEventListener('keydown', preventScreenshot)

        return () => {
            unsub()
            document.removeEventListener('contextmenu', preventCopy)
            document.removeEventListener('copy', preventCopy)
            document.removeEventListener('cut', preventCopy)
            window.removeEventListener('keyup', preventScreenshot)
            window.removeEventListener('keydown', preventScreenshot)
        }
    }, [])

    const handleModeSelect = (selectedMode) => {
        if (!user) {
            setShowAuthModal(true)
            return
        }
        setMode(selectedMode)
    }

    const handleDownloadPdf = async () => {
        if (!user) {
            setShowAuthModal(true)
            return
        }
        if (walletCredits < 20) {
            alert('Not enough credits! You need 20 credits to download the PDF. Please add credits from your profile.')
            return
        }
        setIsDownloading(true)
        const newBalance = await deductCredits(user.uid, 20, 'Resume Builder (PDF)')
        if (newBalance !== null) {
            setWalletCredits(newBalance)
            window.print()
        } else {
            alert('Failed to deduct credits. Please try again.')
        }
        setIsDownloading(false)
    }

    return (
        <div className="rb-page">
            {/* Navbar */}
            <nav className="rb-nav">
                <div className="rb-nav-inner">
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                        <Link to="/" className="rb-logo">SnapAI</Link>
                    </div>
                    <div className="rb-nav-title" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                        <span>📄</span> AI Resume Builder
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {user ? (
                            <ProfileDropdown user={user} walletCredits={walletCredits} onOpenProfile={() => window.location.href='/profile'} />
                        ) : (
                            <button className="rb-btn rb-btn-primary" onClick={() => setShowAuthModal(true)} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>Login</button>
                        )}
                        {mode && (
                            <button
                                onClick={() => setMode(null)}
                                className="rb-btn rb-btn-secondary"
                                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                            >
                                ← Back
                            </button>
                        )}
                        <Link
                            to="/"
                            className="rb-btn rb-btn-secondary"
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                            Home
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Mode Selector */}
            {!mode && (
                <div className="rb-container">
                    <div className="rb-hero">
                        <div className="rb-hero-badge">✨ Powered by AI</div>
                        <h1>Build Your Resume</h1>
                        <p>Choose how you want to create your professional resume</p>

                        <div className="rb-modes">
                            <div className="rb-mode-card" onClick={() => handleModeSelect('manual')}>
                                <div className="rb-mode-icon">📝</div>
                                <h3>Manual Form</h3>
                                <p>Fill in your details step-by-step with AI-powered enhancement</p>
                                <span className="rb-mode-tag live">Ready</span>
                            </div>
                            <div className="rb-mode-card" onClick={() => handleModeSelect('upload')}>
                                <div className="rb-mode-icon">📄</div>
                                <h3>Paste Existing Resume</h3>
                                <p>Paste your resume text and let AI extract & optimize it</p>
                                <span className="rb-mode-tag live">Ready</span>
                            </div>
                            <div className="rb-mode-card" onClick={() => handleModeSelect('chat')}>
                                <div className="rb-mode-icon">🤖</div>
                                <h3>AI Chat Assistant</h3>
                                <p>Build your resume interactively by chatting with our AI</p>
                                <span className="rb-mode-tag live">Ready</span>
                            </div>
                            <div className="rb-mode-card" style={{ opacity: 0.5, cursor: 'default' }}>
                                <div className="rb-mode-icon">🔗</div>
                                <h3>LinkedIn Auto-Scrape</h3>
                                <p>Auto-fetch your LinkedIn profile data via Apify integration</p>
                                <span className="rb-mode-tag soon">Coming Soon</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Active Modes */}
            {mode && (
                <div className="rb-container">
                    <div className="rb-main">
                        {/* Left: Form / Chat / Upload */}
                        {mode === 'manual' && <ManualForm data={resumeData} setData={setResumeData} onDownload={handleDownloadPdf} downloading={isDownloading} />}
                        {mode === 'upload' && <UploadMode setData={setResumeData} setMode={setMode} />}
                        {mode === 'chat' && <ChatMode setData={setResumeData} setMode={setMode} onDownload={handleDownloadPdf} downloading={isDownloading} />}

                        {/* Right: Live Preview */}
                        <div className="rb-preview-panel">
                            <div className="rb-preview-wrapper">
                                <div className="rb-preview-header">
                                    <h2>Live Preview</h2>
                                    <div className="rb-preview-actions">
                                        {mode !== 'manual' && mode !== null && (
                                            <button className="rb-btn rb-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setMode('manual')}>
                                                Edit ✏️
                                            </button>
                                        )}
                                        <button className="rb-btn rb-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setMode(null)}>
                                            ← Modes
                                        </button>
                                        <button className="rb-btn rb-btn-accent" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={handleDownloadPdf} disabled={isDownloading}>
                                            {isDownloading ? '...' : '📥 PDF (-20c)'}
                                        </button>
                                    </div>
                                </div>
                                <ResumePreview data={resumeData} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </div>
    )
}
