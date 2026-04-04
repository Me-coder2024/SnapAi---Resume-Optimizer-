import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
    enhanceExperience,
    enhanceProject,
    categorizeSkills,
    parseResumeText,
    generateSummary,
    chatResumeAssistant,
    fetchGitHubProjects,
    fetchLinkedInProfile,
    generateProjectBullets,
    generateExperienceBullets,
    atsOptimizeResume,
    calculateATSScore,
    saveResumeData,
    loadResumeData
} from './resumeApi'
import { analyzeProfile, scrapeLinkedIn, compareProfiles, improveText } from './profileOptimizer'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import AuthModal from './components/ui/AuthModal'
import ProfileDropdown from './components/ui/ProfileDropdown'
import { loadWallet, deductCredits } from './App'
import './ResumeBuilderPage.css'

// ═══════════════════════════════════════
//  EMPTY STATE TEMPLATES
// ═══════════════════════════════════════
const emptyPersonal = { name: '', email: '', phone: '', location: '', linkedin: '', github: '', targetRole: '' }
const emptyEducation = { institution: '', degree: '', date: '', gpa: '' }
const emptyExperience = { company: '', title: '', date: '', location: '', description: '', bullets: [] }
const emptyProject = { name: '', description: '', technologies: '', link: '', liveLink: '', bullets: [] }
const emptyCertification = { name: '', issuer: '', date: '', link: '', credentialId: '' }

// ═══════════════════════════════════════
//  STEP DEFINITIONS
// ═══════════════════════════════════════
const STEPS = [
    { id: 'personal', label: '👤 Personal Info', icon: '👤' },
    { id: 'education', label: '🎓 Education', icon: '🎓' },
    { id: 'experience', label: '💼 Experience', icon: '💼' },
    { id: 'projects', label: '💻 Projects', icon: '💻' },
    { id: 'skills', label: '🛠️ Skills', icon: '🛠️' },
    { id: 'certifications', label: '📜 Certifications', icon: '📜' },
    { id: 'summary', label: '📝 Summary', icon: '📝' },
    { id: 'ats_score', label: '📊 ATS Score', icon: '📊' },
]

// ═══════════════════════════════════════
//  LIVE RESUME PREVIEW
// ═══════════════════════════════════════
const ResumePreview = ({ data }) => {
    const { personal, education, experience, projects, skills, categorizedSkills, summary, certifications } = data

    // Helper to strip bold from text
    const clean = (text) => (text || '').replace(/\*\*/g, '').replace(/\*/g, '')

    // Helper to extract display URL from a full URL
    const displayUrl = (url) => {
        if (!url) return ''
        return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    }

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
                {personal.location && <span>{personal.location}</span>}
                {personal.phone && <span>{personal.phone}</span>}
                {personal.email && <span><a href={`mailto:${personal.email}`}>{personal.email}</a></span>}
                {personal.linkedin && <span><a href={personal.linkedin.startsWith('http') ? personal.linkedin : `https://${personal.linkedin}`} target="_blank" rel="noreferrer">{displayUrl(personal.linkedin)}</a></span>}
                {personal.github && <span><a href={personal.github.startsWith('http') ? personal.github : `https://${personal.github}`} target="_blank" rel="noreferrer">{displayUrl(personal.github)}</a></span>}
            </div>

            {/* Summary */}
            {summary && (
                <>
                    <h2>Professional Summary</h2>
                    <p className="rb-resume-summary">{clean(summary)}</p>
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
                                {edu.gpa && <span>GPA: {edu.gpa.includes('/') ? edu.gpa : `${edu.gpa}/10`}</span>}
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
                                <ul>{exp.bullets.map((b, j) => <li key={j}>{clean(b)}</li>)}</ul>
                            ) : exp.description ? (
                                <ul><li>{clean(exp.description)}</li></ul>
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
                                    {proj.name}
                                    {proj.technologies && <span style={{ fontWeight: 400 }}> | {proj.technologies}</span>}
                                    {proj.link && <span style={{ fontWeight: 400, fontSize: '9pt' }}> | <a href={proj.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{displayUrl(proj.link)}</a></span>}
                                    {proj.liveLink && <span style={{ fontWeight: 400, fontSize: '9pt' }}> | <a href={proj.liveLink} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Live Demo</a></span>}
                                </span>
                            </div>
                            {proj.bullets && proj.bullets.length > 0 ? (
                                <ul>{proj.bullets.map((b, j) => <li key={j}>{clean(b)}</li>)}</ul>
                            ) : proj.description ? (
                                <ul><li>{clean(proj.description)}</li></ul>
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

            {/* Certifications */}
            {certifications && certifications.length > 0 && certifications.some(c => c.name) && (
                <>
                    <h2>Certifications</h2>
                    {certifications.filter(c => c.name).map((cert, i) => (
                        <div key={i} className="rb-resume-item">
                            <div className="rb-resume-item-header">
                                <span className="rb-resume-item-name">
                                    {cert.name}
                                    {cert.credentialId && <span style={{ fontWeight: 400, fontSize: '9pt' }}> — ID: {cert.credentialId}</span>}
                                    {cert.link && <span style={{ fontWeight: 400, fontSize: '9pt' }}> — <a href={cert.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Verify</a></span>}
                                </span>
                                <span className="rb-resume-item-date">{cert.date}</span>
                            </div>
                            {cert.issuer && (
                                <div className="rb-resume-item-sub">
                                    <span>{cert.issuer}</span>
                                </div>
                            )}
                        </div>
                    ))}
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

    // Certifications handlers
    const updateCertification = (idx, field, value) => {
        setData(prev => {
            const certs = [...(prev.certifications || [])]
            certs[idx] = { ...certs[idx], [field]: value }
            return { ...prev, certifications: certs }
        })
    }
    const addCertification = () => setData(prev => ({ ...prev, certifications: [...(prev.certifications || []), { ...emptyCertification }] }))
    const removeCertification = (idx) => setData(prev => ({ ...prev, certifications: (prev.certifications || []).filter((_, i) => i !== idx) }))

    const handleAIEnhanceExp = async (idx) => {
        const exp = data.experience[idx]
        if (!exp.description) return
        setAiLoading(prev => ({ ...prev, [`exp_${idx}`]: true }))
        try {
            const bullets = await enhanceExperience(`${exp.title} at ${exp.company}: ${exp.description}`, data.personal?.targetRole || '')
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
            const bullets = await enhanceProject(proj.name, proj.description, data.personal?.targetRole || '')
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
            const categorized = await categorizeSkills(data.skills, data.personal?.targetRole || '')
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

    const handleImportGitHub = async () => {
        const githubUrl = data.personal.github
        if (!githubUrl) return
        setAiLoading(prev => ({ ...prev, github_import: true }))
        try {
            const result = await fetchGitHubProjects(githubUrl)
            setData(prev => {
                const existingProjects = prev.projects.filter(p => p.name)
                const newSkills = [...new Set([...prev.skills, ...result.skills])]
                return {
                    ...prev,
                    projects: existingProjects.length > 0
                        ? [...existingProjects, ...result.projects]
                        : result.projects,
                    skills: newSkills
                }
            })
        } catch (err) {
            console.error(err)
            alert(err.message || 'Failed to import GitHub projects')
        }
        setAiLoading(prev => ({ ...prev, github_import: false }))
    }

    const handleImportLinkedIn = async () => {
        const linkedinUrl = data.personal.linkedin
        if (!linkedinUrl) return
        setAiLoading(prev => ({ ...prev, linkedin_import: true }))
        try {
            const result = await fetchLinkedInProfile(linkedinUrl)
            setData(prev => {
                // Merge education
                const existingEdu = prev.education.filter(e => e.institution)
                const newEducation = existingEdu.length > 0
                    ? [...existingEdu, ...result.education]
                    : result.education.length > 0 ? result.education : prev.education

                // Merge experience
                const existingExp = prev.experience.filter(e => e.company || e.title)
                const newExperience = existingExp.length > 0
                    ? [...existingExp, ...result.experience]
                    : result.experience.length > 0 ? result.experience : prev.experience

                // Merge skills
                const newSkills = [...new Set([...prev.skills, ...result.skills])]

                return {
                    ...prev,
                    education: newEducation,
                    experience: newExperience,
                    skills: newSkills
                }
            })
            const imported = []
            if (result.education.length > 0) imported.push(`${result.education.length} education entries`)
            if (result.experience.length > 0) imported.push(`${result.experience.length} experiences`)
            if (result.skills.length > 0) imported.push(`${result.skills.length} skills`)
            alert(`✅ Successfully imported from LinkedIn: ${imported.join(', ')}`)
        } catch (err) {
            console.error(err)
            alert(err.message || 'Failed to import LinkedIn data')
        }
        setAiLoading(prev => ({ ...prev, linkedin_import: false }))
    }

    // Validation helpers
    const getLinkedInWarning = () => {
        const li = data.personal.linkedin?.trim();
        if (li && (li.toLowerCase() === 'linkedin' || (!li.includes('/') && !li.includes('.')))) {
            return '⚠️ Enter your full LinkedIn URL (e.g., linkedin.com/in/yourname), not just "LinkedIn"';
        }
        return null;
    }

    const getGitHubWarning = () => {
        const gh = data.personal.github?.trim();
        if (gh && gh.toLowerCase() === 'github') {
            return '⚠️ Enter your GitHub profile URL or username, not just "GitHub"';
        }
        return null;
    }

    const getEducationDateWarning = (dateString) => {
        if (!dateString) return null;
        const years = dateString.match(/\d{4}/g);
        if (years && years.length >= 2) {
            const span = parseInt(years[years.length - 1]) - parseInt(years[0]);
            if (span > 5) {
                return `⚠️ ${span}-year span detected. If this is an integrated program, clarify (e.g., "B.Tech + M.Tech Integrated")`;
            }
        }
        return null;
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
                        <div className="rb-field">
                            <label>🎯 Target Role <span style={{ color: '#63636E', fontWeight: 400 }}>(boosts ATS keyword matching)</span></label>
                            <input placeholder="e.g., Software Engineer, Full-Stack Developer, Data Scientist" value={data.personal.targetRole || ''} onChange={e => updatePersonal('targetRole', e.target.value)} />
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
                        <div className="rb-field">
                            <label>📍 Location <span style={{ color: '#63636E', fontWeight: 400 }}>(ATS filters by city/region)</span></label>
                            <input placeholder="e.g., Vadodara, Gujarat, India" value={data.personal.location || ''} onChange={e => updatePersonal('location', e.target.value)} />
                        </div>
                        <div className="rb-field-row">
                            <div className="rb-field">
                                <label>LinkedIn URL</label>
                                <input placeholder="linkedin.com/in/johndoe" value={data.personal.linkedin} onChange={e => updatePersonal('linkedin', e.target.value)} />
                                {getLinkedInWarning() && <div className="rb-field-warning">{getLinkedInWarning()}</div>}
                            </div>
                            <div className="rb-field">
                                <label>GitHub URL</label>
                                <input placeholder="github.com/johndoe" value={data.personal.github} onChange={e => updatePersonal('github', e.target.value)} />
                                {getGitHubWarning() && <div className="rb-field-warning">{getGitHubWarning()}</div>}
                            </div>
                        </div>
                    </div>
                )

            case 1: // Education
                return (
                    <div className="rb-form-section">
                        <h3>🎓 Education</h3>

                        {/* LinkedIn Import — Primary Action */}
                        <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'linear-gradient(135deg, rgba(10,102,194,0.15), rgba(26,30,36,0.8))', borderRadius: '0.625rem', border: '1px solid #0a66c2' }}>
                            {data.personal.linkedin ? (
                                <>
                                    <button
                                        className={`rb-ai-btn ${aiLoading.linkedin_import ? 'loading' : ''}`}
                                        onClick={handleImportLinkedIn}
                                        disabled={aiLoading.linkedin_import}
                                        style={{ width: '100%', justifyContent: 'center', padding: '0.75rem 1rem', fontSize: '0.875rem', background: 'linear-gradient(135deg, #0a66c2, #004182)', border: 'none', color: '#fff', fontWeight: 600 }}
                                    >
                                        {aiLoading.linkedin_import
                                            ? <><span className="rb-spinner"></span> Importing from LinkedIn — this may take 30-60 seconds...</>
                                            : '🔗 Import from LinkedIn'
                                        }
                                    </button>
                                    <p style={{ fontSize: '0.6875rem', color: '#8b949e', marginTop: '0.5rem', textAlign: 'center', lineHeight: 1.4 }}>
                                        Fetches your education, experience & skills from <strong style={{ color: '#c9d1d9' }}>{data.personal.linkedin}</strong> automatically
                                    </p>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                                    <p style={{ fontSize: '0.8125rem', color: '#8b949e', marginBottom: '0.375rem' }}>
                                        💡 <strong style={{ color: '#c9d1d9' }}>Tip:</strong> Add your LinkedIn URL in the <strong style={{ color: '#c9d1d9' }}>Personal Info</strong> step to import education, experience & skills automatically!
                                    </p>
                                    <button className="rb-btn rb-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.6875rem' }} onClick={() => setStep(0)}>
                                        ← Go to Personal Info
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: 'center', color: '#63636E', fontSize: '0.75rem', margin: '0.5rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ flex: 1, height: '1px', background: '#27272F' }}></span>
                            <span>or add manually</span>
                            <span style={{ flex: 1, height: '1px', background: '#27272F' }}></span>
                        </div>

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
                                        {getEducationDateWarning(edu.date) && <div className="rb-field-warning">{getEducationDateWarning(edu.date)}</div>}
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

                        {/* GitHub Import — Primary Action */}
                        <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'linear-gradient(135deg, rgba(45,51,59,0.6), rgba(26,30,36,0.8))', borderRadius: '0.625rem', border: '1px solid #30363d' }}>
                            {data.personal.github ? (
                                <>
                                    <button
                                        className={`rb-ai-btn ${aiLoading.github_import ? 'loading' : ''}`}
                                        onClick={handleImportGitHub}
                                        disabled={aiLoading.github_import}
                                        style={{ width: '100%', justifyContent: 'center', padding: '0.75rem 1rem', fontSize: '0.875rem', background: 'linear-gradient(135deg, #238636, #2ea043)', border: 'none', color: '#fff', fontWeight: 600 }}
                                    >
                                        {aiLoading.github_import
                                            ? <><span className="rb-spinner"></span> Importing from GitHub — this may take a minute...</>
                                            : '🔗 Import Projects from GitHub'
                                        }
                                    </button>
                                    <p style={{ fontSize: '0.6875rem', color: '#8b949e', marginTop: '0.5rem', textAlign: 'center', lineHeight: 1.4 }}>
                                        Fetches your top repos from <strong style={{ color: '#c9d1d9' }}>{data.personal.github}</strong> and auto-generates professional bullet points using AI
                                    </p>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                                    <p style={{ fontSize: '0.8125rem', color: '#8b949e', marginBottom: '0.375rem' }}>
                                        💡 <strong style={{ color: '#c9d1d9' }}>Tip:</strong> Add your GitHub URL in the <strong style={{ color: '#c9d1d9' }}>Personal Info</strong> step to import projects automatically!
                                    </p>
                                    <button className="rb-btn rb-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.6875rem' }} onClick={() => setStep(0)}>
                                        ← Go to Personal Info
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: 'center', color: '#63636E', fontSize: '0.75rem', margin: '0.5rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ flex: 1, height: '1px', background: '#27272F' }}></span>
                            <span>or add manually</span>
                            <span style={{ flex: 1, height: '1px', background: '#27272F' }}></span>
                        </div>

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
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>GitHub / Repo Link</label>
                                        <input placeholder="https://github.com/..." value={proj.link} onChange={e => updateProject(i, 'link', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>Live Demo URL <span style={{ color: '#63636E', fontWeight: 400 }}>(boosts ATS)</span></label>
                                        <input placeholder="https://myapp.vercel.app" value={proj.liveLink || ''} onChange={e => updateProject(i, 'liveLink', e.target.value)} />
                                    </div>
                                </div>
                                <div className="rb-field">
                                    <label>Description <span style={{ color: '#63636E', fontWeight: 400 }}>(leave blank to auto-generate)</span></label>
                                    <textarea placeholder="Describe the project — or leave this empty and AI will generate it for you at download time..." value={proj.description} onChange={e => updateProject(i, 'description', e.target.value)} />
                                </div>
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

            case 5: // Certifications
                return (
                    <div className="rb-form-section">
                        <h3>📜 Certifications <span style={{ color: '#63636E', fontWeight: 400, fontSize: '0.75rem' }}>(optional — boosts ATS by ~5 points)</span></h3>
                        <p style={{ fontSize: '0.8125rem', color: '#63636E', marginBottom: '1rem', lineHeight: 1.5 }}>
                            Add any relevant certifications (e.g., AWS Solutions Architect, Google Cloud Professional, Coursera Deep Learning, HackerRank certificates).
                        </p>
                        {(data.certifications || []).map((cert, i) => (
                            <div key={i} className="rb-entry">
                                {(data.certifications || []).length > 1 && (
                                    <button className="rb-entry-remove" onClick={() => removeCertification(i)}>✕</button>
                                )}
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>Certification Name</label>
                                        <input placeholder="AWS Solutions Architect" value={cert.name} onChange={e => updateCertification(i, 'name', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>Issuing Organization</label>
                                        <input placeholder="Amazon Web Services" value={cert.issuer} onChange={e => updateCertification(i, 'issuer', e.target.value)} />
                                    </div>
                                </div>
                                <div className="rb-field-row">
                                    <div className="rb-field">
                                        <label>Date</label>
                                        <input placeholder="Jan 2024" value={cert.date} onChange={e => updateCertification(i, 'date', e.target.value)} />
                                    </div>
                                    <div className="rb-field">
                                        <label>Credential ID <span style={{ color: '#63636E', fontWeight: 400 }}>(if available)</span></label>
                                        <input placeholder="ABC-123-XYZ" value={cert.credentialId || ''} onChange={e => updateCertification(i, 'credentialId', e.target.value)} />
                                    </div>
                                </div>
                                <div className="rb-field">
                                    <label>Verification Link (optional)</label>
                                    <input placeholder="https://..." value={cert.link} onChange={e => updateCertification(i, 'link', e.target.value)} />
                                </div>
                            </div>
                        ))}
                        <button className="rb-add-btn" onClick={addCertification}>+ Add Certification</button>
                        {(!data.certifications || data.certifications.length === 0) && (
                            <div className="rb-field-hint" style={{ marginTop: '0.75rem' }}>
                                💡 No certifications yet? You can skip this step — but adding even one can boost your ATS score.
                            </div>
                        )}
                    </div>
                )

            case 6: // Summary
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
                            {data.summary && !data.summary.match(/[.!?]$/) && (
                                <div className="rb-field-warning">⚠️ Your summary appears truncated — make sure it ends with a complete sentence.</div>
                            )}
                        </div>
                        <button className={`rb-ai-btn ${aiLoading.summary ? 'loading' : ''}`} onClick={handleGenerateSummary} disabled={aiLoading.summary}>
                            {aiLoading.summary ? <><span className="rb-spinner"></span> Generating...</> : '✨ AI Generate ATS-Optimized Summary'}
                        </button>
                    </div>
                )

            case 7: { // ATS Score
                const atsResult = calculateATSScore(data)
                const atsScore = atsResult.score
                const atsColor = atsScore >= 80 ? '#22C55E' : atsScore >= 50 ? '#F59E0B' : '#EF4444'
                const atsGrade = atsScore >= 90 ? 'A+' : atsScore >= 80 ? 'A' : atsScore >= 70 ? 'B+' : atsScore >= 60 ? 'B' : atsScore >= 50 ? 'C' : atsScore >= 40 ? 'D' : 'F'
                const atsMessage = atsScore >= 80 ? 'Excellent! Your resume is ATS-ready.' : atsScore >= 60 ? 'Good progress — a few tweaks will make it stand out.' : atsScore >= 40 ? 'Needs work. Follow the tips below to improve.' : 'Your resume needs significant improvements.'

                const breakdownItems = [
                    { label: 'Contact Info', key: 'contact', max: 15, icon: '📇' },
                    { label: 'Summary', key: 'summary', max: 15, icon: '📝' },
                    { label: 'Experience', key: 'experience', max: 20, icon: '💼' },
                    { label: 'Projects', key: 'projects', max: 15, icon: '💻' },
                    { label: 'Skills', key: 'skills', max: 15, icon: '🛠️' },
                    { label: 'Education', key: 'education', max: 10, icon: '🎓' },
                    { label: 'Certifications', key: 'certifications', max: 5, icon: '📜' },
                    { label: 'Target Role', key: 'targetRole', max: 5, icon: '🎯' },
                ]

                return (
                    <div className="rb-form-section">
                        <h3>📊 ATS Score Analysis</h3>

                        {/* Big Score Circle */}
                        <div className="rb-ats-final">
                            <div className="rb-ats-final-circle" style={{ '--ats-color': atsColor, '--ats-progress': `${atsScore * 3.6}deg` }}>
                                <div className="rb-ats-final-inner">
                                    <span className="rb-ats-final-score" style={{ color: atsColor }}>{atsScore}</span>
                                    <span className="rb-ats-final-grade" style={{ color: atsColor }}>{atsGrade}</span>
                                </div>
                            </div>
                            <p className="rb-ats-final-message" style={{ color: atsColor }}>{atsMessage}</p>
                        </div>

                        {/* Breakdown Bars */}
                        <div className="rb-ats-breakdown">
                            <h4>Score Breakdown</h4>
                            {breakdownItems.map(item => {
                                const val = atsResult.breakdown[item.key] || 0
                                const pct = Math.round((val / item.max) * 100)
                                const barColor = pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444'
                                return (
                                    <div key={item.key} className="rb-ats-bar-row">
                                        <div className="rb-ats-bar-label">
                                            <span>{item.icon} {item.label}</span>
                                            <span style={{ color: barColor, fontWeight: 600 }}>{val}/{item.max}</span>
                                        </div>
                                        <div className="rb-ats-bar-track">
                                            <div className="rb-ats-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Tips */}
                        {atsResult.tips.length > 0 && (
                            <div className="rb-ats-tips-section">
                                <h4>💡 Improvement Tips</h4>
                                {atsResult.tips.map((tip, i) => (
                                    <div key={i} className="rb-ats-tip-card">
                                        <span className="rb-ats-tip-num">{i + 1}</span>
                                        <span>{tip}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {atsScore >= 80 && (
                            <div className="rb-ats-congrats">
                                <span style={{ fontSize: '1.5rem' }}>🎉</span>
                                <div>
                                    <strong style={{ color: '#22C55E' }}>Great job!</strong>
                                    <p>Your resume is well-optimized for ATS systems. Download it now!</p>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

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
                            {step === 6 ? '📊 View ATS Score →' : 'Next →'}
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
//  OPTIMIZER SIDE PANEL
// ═══════════════════════════════════════
const OptimizerPanel = ({ resumeText, resumeData, setData, setMode, onClose }) => {
    const [targetRole, setTargetRole] = useState(resumeData?.personal?.targetRole || '')
    const [linkedinUrl, setLinkedinUrl] = useState(resumeData?.personal?.linkedin || '')
    const [analysisResult, setAnalysisResult] = useState(null)
    const [compareResult, setCompareResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [stage, setStage] = useState('') // current loading stage
    const [selectedItems, setSelectedItems] = useState({})
    const [error, setError] = useState(null)

    const toggleItem = (key) => {
        setSelectedItems(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const handleAnalyze = async () => {
        if (!targetRole.trim()) return
        setLoading(true)
        setError(null)
        setAnalysisResult(null)
        setCompareResult(null)

        try {
            // Step 1: Analyze resume
            setStage('Analyzing your resume...')
            const analysis = await analyzeProfile(resumeText, targetRole)
            setAnalysisResult(analysis)

            // Auto-select all critical and important suggestions
            const autoSelected = {}
            ;(analysis.suggestions || []).forEach((s, i) => {
                if (s.severity === 'critical' || s.severity === 'important') {
                    autoSelected[`sug-${i}`] = true
                }
            })
            ;(analysis.bullet_point_transformers || []).forEach((_, i) => {
                autoSelected[`bpt-${i}`] = true
            })
            ;(analysis.keyword_suggestions || []).forEach((_, i) => {
                autoSelected[`kw-${i}`] = true
            })
            setSelectedItems(autoSelected)

            // Step 2: LinkedIn comparison (if URL provided)
            if (linkedinUrl && linkedinUrl.includes('linkedin.com/in/')) {
                setStage('Scraping LinkedIn profile...')
                try {
                    const { text: liText } = await scrapeLinkedIn(linkedinUrl)
                    if (liText) {
                        setStage('Comparing profiles...')
                        const comparison = await compareProfiles(resumeText, liText, targetRole)
                        setCompareResult(comparison)
                        // Auto-select LinkedIn additions
                        ;(comparison.add_to_resume || []).forEach((_, i) => {
                            autoSelected[`li-${i}`] = true
                        })
                        setSelectedItems({ ...autoSelected })
                    }
                } catch (liErr) {
                    console.error('LinkedIn scrape error:', liErr)
                    // Non-fatal — continue with resume-only analysis
                }
            }

            setStage('')
        } catch (err) {
            console.error('Analysis error:', err)
            setError(err.message || 'Analysis failed. Please try again.')
        }
        setLoading(false)
    }

    const handleApply = () => {
        setData(prev => {
            const updated = { ...prev }

            // Apply bullet point rewrites
            ;(analysisResult?.bullet_point_transformers || []).forEach((bpt, i) => {
                if (!selectedItems[`bpt-${i}`]) return
                // Search and replace in experience bullets
                updated.experience = (updated.experience || []).map(exp => ({
                    ...exp,
                    bullets: (exp.bullets || []).map(b =>
                        b.trim().toLowerCase() === bpt.weak_text?.trim().toLowerCase()
                            ? bpt.suggested_replacement
                            : b
                    )
                }))
                // Search and replace in project bullets
                updated.projects = (updated.projects || []).map(proj => ({
                    ...proj,
                    bullets: (proj.bullets || []).map(b =>
                        b.trim().toLowerCase() === bpt.weak_text?.trim().toLowerCase()
                            ? bpt.suggested_replacement
                            : b
                    )
                }))
            })

            // Apply suggestion rewrites
            ;(analysisResult?.suggestions || []).forEach((sug, i) => {
                if (!selectedItems[`sug-${i}`] || !sug.suggested_replacement) return
                // Try to find and replace original_text in bullets
                if (sug.original_text) {
                    const origLower = sug.original_text.trim().toLowerCase()
                    updated.experience = (updated.experience || []).map(exp => ({
                        ...exp,
                        bullets: (exp.bullets || []).map(b =>
                            b.trim().toLowerCase() === origLower ? sug.suggested_replacement : b
                        )
                    }))
                    updated.projects = (updated.projects || []).map(proj => ({
                        ...proj,
                        bullets: (proj.bullets || []).map(b =>
                            b.trim().toLowerCase() === origLower ? sug.suggested_replacement : b
                        )
                    }))
                    // Check summary
                    if (updated.summary?.trim().toLowerCase() === origLower) {
                        updated.summary = sug.suggested_replacement
                    }
                }
            })

            // Apply missing keywords to skills
            ;(analysisResult?.keyword_suggestions || []).forEach((kw, i) => {
                if (!selectedItems[`kw-${i}`]) return
                if (!(updated.skills || []).some(s => s.toLowerCase() === kw.toLowerCase())) {
                    updated.skills = [...(updated.skills || []), kw]
                }
            })

            // Apply LinkedIn additions
            if (compareResult) {
                ;(compareResult.add_to_resume || []).forEach((item, i) => {
                    if (!selectedItems[`li-${i}`] || !item.suggested_text) return
                    const section = (item.section || '').toLowerCase()
                    if (section.includes('skill')) {
                        updated.skills = [...(updated.skills || []), item.suggested_text]
                    } else if (section.includes('experience') || section.includes('project')) {
                        // Create a NEW experience entry instead of dumping it into the first one's bullets
                        const newExp = {
                            company: item.item || 'LinkedIn Entry',
                            title: '',
                            date: '',
                            location: '',
                            description: '',
                            bullets: item.suggested_text ? item.suggested_text.split('\n').map(b => b.trim().replace(/^- /, '')).filter(Boolean) : []
                        };
                        updated.experience = [...(updated.experience || []), newExp]
                    }
                })
            }

            // Set target role
            if (targetRole) {
                updated.personal = { ...(updated.personal || {}), targetRole }
            }

            return updated
        })

        // Switch to manual editor
        setMode('manual')
    }

    const selectedCount = Object.values(selectedItems).filter(Boolean).length

    const getScoreColor = (score) => {
        if (score >= 80) return '#22C55E'
        if (score >= 60) return '#F59E0B'
        return '#EF4444'
    }

    const getSeverityStyle = (severity) => {
        if (severity === 'critical') return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', color: '#EF4444' }
        if (severity === 'important') return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', color: '#F59E0B' }
        return { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.25)', color: '#3B82F6' }
    }

    return (
        <>
            <div className="rb-optimizer-overlay" onClick={onClose} />
            <div className="rb-optimizer-panel">
                <div className="rb-optimizer-header">
                    <h3>✨ Professional Optimizer</h3>
                    <button className="rb-optimizer-close" onClick={onClose}>✕</button>
                </div>

                <div className="rb-optimizer-body">
                    {/* Input Section */}
                    {!analysisResult && (
                        <div className="rb-optimizer-input-section">
                            <div className="rb-field" style={{ marginBottom: '0.75rem' }}>
                                <label>🎯 Target Job Role <span style={{ color: '#EF4444' }}>*</span></label>
                                <input
                                    value={targetRole}
                                    onChange={e => setTargetRole(e.target.value)}
                                    placeholder="e.g. Full Stack Developer, Data Scientist..."
                                />
                            </div>
                            <div className="rb-field" style={{ marginBottom: '1rem' }}>
                                <label>🔗 LinkedIn URL <span style={{ color: '#63636E', fontWeight: 400 }}>(optional)</span></label>
                                <input
                                    value={linkedinUrl}
                                    onChange={e => setLinkedinUrl(e.target.value)}
                                    placeholder="https://linkedin.com/in/your-profile"
                                />
                            </div>
                            <button
                                className="rb-btn rb-btn-accent"
                                style={{ width: '100%' }}
                                onClick={handleAnalyze}
                                disabled={loading || !targetRole.trim()}
                            >
                                {loading ? (
                                    <><span className="rb-spinner"></span> {stage}</>
                                ) : (
                                    '🔍 Analyze Resume'
                                )}
                            </button>
                            {error && <div className="rb-status error" style={{ marginTop: '0.75rem' }}>{error}</div>}
                        </div>
                    )}

                    {/* Results Section */}
                    {analysisResult && (
                        <div className="rb-optimizer-results">
                            {/* Overall Score */}
                            <div className="rb-opt-score-card">
                                <div className="rb-opt-score-circle" style={{
                                    '--opt-color': getScoreColor(analysisResult.overall_score),
                                    '--opt-progress': `${(analysisResult.overall_score / 100) * 360}deg`
                                }}>
                                    <div className="rb-opt-score-inner">
                                        <span className="rb-opt-score-num" style={{ color: getScoreColor(analysisResult.overall_score) }}>
                                            {analysisResult.overall_score}
                                        </span>
                                        <span className="rb-opt-score-label">SCORE</span>
                                    </div>
                                </div>
                                <p style={{ fontSize: '0.8125rem', color: '#A1A1A9', textAlign: 'center', lineHeight: 1.4 }}>
                                    {analysisResult.summary}
                                </p>
                            </div>

                            {/* Category Scores */}
                            <div className="rb-opt-section">
                                <h4>📊 Category Scores</h4>
                                {(analysisResult.categories || []).map((cat, i) => (
                                    <div key={i} className="rb-opt-cat-row">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#EDEDEF' }}>{cat.name}</span>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: getScoreColor(cat.score) }}>{cat.score}</span>
                                        </div>
                                        <div style={{ height: 4, background: '#1C1C22', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 2, width: `${cat.score}%`,
                                                background: getScoreColor(cat.score), transition: 'width 0.8s ease'
                                            }} />
                                        </div>
                                        {cat.needs_improvement && (
                                            <p style={{ fontSize: '0.6875rem', color: '#63636E', marginTop: '0.25rem', lineHeight: 1.4 }}>{cat.feedback}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Bullet Point Rewrites */}
                            {(analysisResult.bullet_point_transformers || []).length > 0 && (
                                <div className="rb-opt-section">
                                    <h4>🔄 Bullet Point Rewrites</h4>
                                    {analysisResult.bullet_point_transformers.map((bpt, i) => (
                                        <label key={i} className="rb-opt-checkbox-card">
                                            <input
                                                type="checkbox"
                                                checked={!!selectedItems[`bpt-${i}`]}
                                                onChange={() => toggleItem(`bpt-${i}`)}
                                            />
                                            <div className="rb-opt-checkbox-content">
                                                <div style={{ fontSize: '0.75rem', color: '#EF4444', textDecoration: 'line-through', marginBottom: '0.375rem', lineHeight: 1.4 }}>
                                                    {bpt.weak_text}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#22C55E', lineHeight: 1.4 }}>
                                                    → {bpt.suggested_replacement}
                                                </div>
                                                <div style={{ fontSize: '0.625rem', color: '#63636E', marginTop: '0.25rem' }}>{bpt.reason}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Suggestions */}
                            {(analysisResult.suggestions || []).length > 0 && (
                                <div className="rb-opt-section">
                                    <h4>💡 Suggestions</h4>
                                    {analysisResult.suggestions.map((sug, i) => {
                                        const sev = getSeverityStyle(sug.severity)
                                        return (
                                            <label key={i} className="rb-opt-checkbox-card">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedItems[`sug-${i}`]}
                                                    onChange={() => toggleItem(`sug-${i}`)}
                                                />
                                                <div className="rb-opt-checkbox-content">
                                                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                        <span style={{
                                                            fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase',
                                                            padding: '0.125rem 0.375rem', borderRadius: '0.25rem',
                                                            background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color
                                                        }}>
                                                            {sug.severity}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: '#EDEDEF', fontWeight: 600 }}>{sug.title}</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.6875rem', color: '#A1A1A9', lineHeight: 1.4 }}>{sug.description}</p>
                                                    {sug.suggested_replacement && (
                                                        <div style={{
                                                            fontSize: '0.6875rem', color: '#22C55E', marginTop: '0.375rem',
                                                            padding: '0.375rem 0.5rem', background: 'rgba(34,197,94,0.06)',
                                                            borderRadius: '0.375rem', border: '1px solid rgba(34,197,94,0.15)', lineHeight: 1.4
                                                        }}>
                                                            ✏️ {sug.suggested_replacement}
                                                        </div>
                                                    )}
                                                </div>
                                            </label>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Missing Keywords */}
                            {(analysisResult.keyword_suggestions || []).length > 0 && (
                                <div className="rb-opt-section">
                                    <h4>🔑 Missing Keywords</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                                        {(analysisResult.keyword_suggestions || []).map((kw, i) => (
                                            <label key={i} className="rb-opt-keyword-chip" style={{
                                                background: selectedItems[`kw-${i}`] ? 'rgba(59,130,246,0.15)' : '#111113',
                                                borderColor: selectedItems[`kw-${i}`] ? 'rgba(59,130,246,0.4)' : '#27272F'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedItems[`kw-${i}`]}
                                                    onChange={() => toggleItem(`kw-${i}`)}
                                                    style={{ display: 'none' }}
                                                />
                                                {selectedItems[`kw-${i}`] ? '✓ ' : '+ '}{kw}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* LinkedIn Comparison */}
                            {compareResult && (
                                <div className="rb-opt-section">
                                    <h4>🔗 LinkedIn Insights</h4>
                                    <div style={{
                                        display: 'flex', gap: '0.75rem', marginBottom: '0.75rem',
                                        padding: '0.625rem', background: '#0D0D0F', borderRadius: '0.5rem', border: '1px solid #1C1C22'
                                    }}>
                                        <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: getScoreColor(compareResult.match_score) }}>
                                                {compareResult.match_score}%
                                            </div>
                                            <div style={{ fontSize: '0.5625rem', color: '#63636E', textTransform: 'uppercase' }}>Match</div>
                                        </div>
                                        <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: getScoreColor(compareResult.role_alignment) }}>
                                                {compareResult.role_alignment}%
                                            </div>
                                            <div style={{ fontSize: '0.5625rem', color: '#63636E', textTransform: 'uppercase' }}>Role Fit</div>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.6875rem', color: '#A1A1A9', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                                        {compareResult.summary}
                                    </p>
                                    {(compareResult.add_to_resume || []).map((item, i) => (
                                        <label key={i} className="rb-opt-checkbox-card">
                                            <input
                                                type="checkbox"
                                                checked={!!selectedItems[`li-${i}`]}
                                                onChange={() => toggleItem(`li-${i}`)}
                                            />
                                            <div className="rb-opt-checkbox-content">
                                                <span style={{ fontSize: '0.75rem', color: '#EDEDEF', fontWeight: 600 }}>{item.item}</span>
                                                <p style={{ fontSize: '0.6875rem', color: '#63636E', marginTop: '0.125rem' }}>
                                                    Section: {item.section} — {item.why}
                                                </p>
                                                {item.suggested_text && (
                                                    <div style={{
                                                        fontSize: '0.6875rem', color: '#3B82F6', marginTop: '0.25rem',
                                                        padding: '0.25rem 0.5rem', background: 'rgba(59,130,246,0.06)',
                                                        borderRadius: '0.25rem', lineHeight: 1.4
                                                    }}>
                                                        {item.suggested_text}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Expert Verdict */}
                            {analysisResult.expert_verdict?.is_needed && (
                                <div className="rb-opt-section">
                                    <div style={{
                                        padding: '0.875rem', background: 'rgba(245,158,11,0.06)',
                                        border: '1px solid rgba(245,158,11,0.2)', borderRadius: '0.5rem'
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B', marginBottom: '0.375rem' }}>
                                            🏆 {analysisResult.expert_verdict.title}
                                        </div>
                                        <p style={{ fontSize: '0.75rem', color: '#A1A1A9', lineHeight: 1.5 }}>
                                            {analysisResult.expert_verdict.message}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Strengths */}
                            {(analysisResult.strengths || []).length > 0 && (
                                <div className="rb-opt-section">
                                    <h4>💪 Strengths</h4>
                                    {analysisResult.strengths.map((s, i) => (
                                        <div key={i} style={{
                                            fontSize: '0.6875rem', color: '#22C55E', padding: '0.375rem 0.5rem',
                                            background: 'rgba(34,197,94,0.06)', borderRadius: '0.375rem',
                                            marginBottom: '0.375rem', lineHeight: 1.4
                                        }}>
                                            ✓ {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Apply Button */}
                {analysisResult && (
                    <div className="rb-optimizer-footer">
                        <button
                            className="rb-btn rb-btn-accent"
                            style={{ width: '100%', fontWeight: 600 }}
                            onClick={handleApply}
                            disabled={selectedCount === 0}
                        >
                            ✅ Apply Selected ({selectedCount}) & Continue to Editor
                        </button>
                    </div>
                )}
            </div>
        </>
    )
}


// ═══════════════════════════════════════
//  UPLOAD / PASTE MODE
// ═══════════════════════════════════════
const UploadMode = ({ setData, setMode }) => {
    const [rawText, setRawText] = useState('')
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState(null)
    const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'paste'
    const [dragActive, setDragActive] = useState(false)
    const [fileName, setFileName] = useState('')
    const fileInputRef = useRef(null)
    const [parsedData, setParsedData] = useState(null) // holds parsed resume data after AI parse
    const [showChoice, setShowChoice] = useState(false) // show General/Professional choice
    const [showOptimizer, setShowOptimizer] = useState(false) // show side panel

    const extractTextFromFile = async (file) => {
        const ext = file.name.split('.').pop().toLowerCase()

        // Plain text files — read directly
        if (ext === 'txt') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = (e) => resolve(e.target.result)
                reader.onerror = () => reject(new Error('Failed to read file'))
                reader.readAsText(file)
            })
        }

        // PDF and DOCX — send to Gemini AI for text extraction
        if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = (e) => {
                    const base64String = e.target.result.split(',')[1]
                    resolve(base64String)
                }
                reader.onerror = () => reject(new Error('Failed to read file'))
                reader.readAsDataURL(file)
            })

            const mimeType = ext === 'pdf' ? 'application/pdf'
                : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : 'application/msword'

            // Use Gemini to extract text from the file
            const { GoogleGenerativeAI } = await import('@google/generative-ai')
            const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType,
                        data: base64
                    }
                },
                { text: 'Extract ALL the text content from this resume document. Return ONLY the raw text content exactly as it appears, with no commentary, no formatting changes, and no summarization. Preserve line breaks and structure.' }
            ])

            return result.response.text().trim()
        }

        throw new Error(`Unsupported file type: .${ext}`)
    }

    const handleFileSelect = async (file) => {
        if (!file) return

        const ext = file.name.split('.').pop().toLowerCase()
        const allowed = ['pdf', 'docx', 'doc', 'txt']
        if (!allowed.includes(ext)) {
            setStatus({ type: 'error', text: `Unsupported file type (.${ext}). Please upload PDF, DOCX, or TXT.` })
            return
        }

        // 10MB limit
        if (file.size > 10 * 1024 * 1024) {
            setStatus({ type: 'error', text: 'File too large. Maximum size is 10MB.' })
            return
        }

        setFileName(file.name)
        setLoading(true)
        setStatus({ type: 'info', text: `📎 Reading ${file.name}...` })

        try {
            const text = await extractTextFromFile(file)
            if (!text || text.trim().length < 20) {
                throw new Error('Could not extract text from this file. Try pasting the text manually.')
            }
            setRawText(text)
            setStatus({ type: 'success', text: `✅ Extracted text from ${file.name}. Click "Parse with AI" to continue.` })
        } catch (err) {
            console.error('File extraction error:', err)
            setStatus({ type: 'error', text: err.message || 'Failed to read file. Try pasting the text manually.' })
        }
        setLoading(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer?.files?.[0]
        if (file) handleFileSelect(file)
    }

    const handleParse = async () => {
        if (!rawText.trim()) return
        setLoading(true)
        setStatus({ type: 'info', text: 'AI is analyzing your resume...' })
        try {
            const parsed = await parseResumeText(rawText)
            if (!parsed) throw new Error('Failed to parse resume')

            const newData = {
                personal: {
                    name: parsed.name || '',
                    email: parsed.email || '',
                    phone: parsed.phone || '',
                    linkedin: parsed.linkedin || '',
                    github: parsed.github || '',
                    targetRole: ''
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
                summary: parsed.summary || '',
                certifications: parsed.certifications || []
            }

            // Store parsed data and show choice screen
            setData(prev => ({ ...prev, ...newData }))
            setParsedData(newData)
            setStatus({ type: 'success', text: '✅ Resume parsed successfully!' })
            setShowChoice(true)
        } catch (err) {
            console.error(err)
            setStatus({ type: 'error', text: 'Failed to parse. Please try again or use the manual form.' })
        }
        setLoading(false)
    }

    const handleGeneralPath = () => {
        setMode('manual')
    }

    const handleProfessionalPath = () => {
        setShowOptimizer(true)
    }

    // If choice screen is showing
    if (showChoice && !showOptimizer) {
        return (
            <div className="rb-form-panel">
                <div className="rb-form-header">
                    <h2>✅ Resume Parsed Successfully</h2>
                </div>
                <div className="rb-upload-area" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
                    <h3 style={{ color: '#EDEDEF', fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        How would you like to proceed?
                    </h3>
                    <p style={{ color: '#63636E', fontSize: '0.8125rem', marginBottom: '2rem', lineHeight: 1.5 }}>
                        Your resume has been parsed. Choose your optimization level below.
                    </p>

                    <div className="rb-choice-cards">
                        <div className="rb-choice-card" onClick={handleGeneralPath}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📝</div>
                            <h4>General Optimization</h4>
                            <p>Go straight to the editor. Edit sections manually, use AI to enhance individual bullets.</p>
                            <span className="rb-choice-tag">Quick</span>
                        </div>

                        <div className="rb-choice-card rb-choice-card-pro" onClick={handleProfessionalPath}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✨</div>
                            <h4>Optimize Professionally</h4>
                            <p>AI analyzes your resume for ATS, keywords, weak bullets, and provides targeted rewrites.</p>
                            <span className="rb-choice-tag pro">AI-Powered</span>
                        </div>
                    </div>

                    <button className="rb-btn rb-btn-secondary" onClick={() => { setShowChoice(false); setParsedData(null) }} style={{ marginTop: '1.5rem' }}>
                        ← Re-upload
                    </button>
                </div>
            </div>
        )
    }

    // If optimizer panel is open
    if (showOptimizer && parsedData) {
        return (
            <>
                <div className="rb-form-panel">
                    <div className="rb-form-header">
                        <h2>✨ Professional Optimization</h2>
                    </div>
                    <div className="rb-upload-area" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔬</div>
                        <p style={{ color: '#A1A1A9', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                            The optimizer panel is open on the right. Fill in your target role and click Analyze to get AI-powered suggestions.
                        </p>
                        <button className="rb-btn rb-btn-secondary" onClick={() => setShowOptimizer(false)} style={{ marginTop: '1rem' }}>
                            ← Back to choices
                        </button>
                    </div>
                </div>
                <OptimizerPanel
                    resumeText={rawText}
                    resumeData={parsedData}
                    setData={setData}
                    setMode={setMode}
                    onClose={() => setShowOptimizer(false)}
                />
            </>
        )
    }

    // Default: Upload/Paste UI
    return (
        <div className="rb-form-panel">
            <div className="rb-form-header">
                <h2>📄 Upload / Paste Resume</h2>
            </div>
            <div className="rb-upload-area">
                {/* Tab Toggle */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', background: '#111113', borderRadius: '0.5rem', padding: '0.25rem', border: '1px solid #1C1C22' }}>
                    <button
                        onClick={() => setActiveTab('upload')}
                        style={{
                            flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
                            fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s',
                            background: activeTab === 'upload' ? '#1A1A1F' : 'transparent',
                            color: activeTab === 'upload' ? '#EDEDEF' : '#63636E'
                        }}
                    >
                        📎 Upload File
                    </button>
                    <button
                        onClick={() => setActiveTab('paste')}
                        style={{
                            flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
                            fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s',
                            background: activeTab === 'paste' ? '#1A1A1F' : 'transparent',
                            color: activeTab === 'paste' ? '#EDEDEF' : '#63636E'
                        }}
                    >
                        📋 Paste Text
                    </button>
                </div>

                {activeTab === 'upload' ? (
                    <>
                        {/* Drag & Drop Zone */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragActive ? '#3B82F6' : '#27272F'}`,
                                borderRadius: '0.75rem',
                                padding: '2rem 1.5rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: dragActive ? 'rgba(59, 130, 246, 0.05)' : '#0D0D0F',
                                marginBottom: '1rem'
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.docx,.doc,.txt"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                            />
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                                {fileName ? '✅' : '📄'}
                            </div>
                            <p style={{ fontSize: '0.875rem', color: '#EDEDEF', fontWeight: 600, marginBottom: '0.25rem' }}>
                                {fileName || 'Drop your resume here or click to browse'}
                            </p>
                            <p style={{ fontSize: '0.75rem', color: '#63636E' }}>
                                Supports PDF, DOCX, TXT — Max 10MB
                            </p>
                        </div>

                        {/* Show extracted text preview */}
                        {rawText && (
                            <div style={{ marginBottom: '1rem' }}>
                                <p style={{ fontSize: '0.75rem', color: '#A1A1A9', marginBottom: '0.5rem' }}>Extracted text preview:</p>
                                <textarea
                                    className="rb-paste-box"
                                    value={rawText}
                                    onChange={e => setRawText(e.target.value)}
                                    style={{ maxHeight: '200px' }}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <p style={{ fontSize: '0.8125rem', color: '#A1A1A9', marginBottom: '1rem' }}>
                            Paste the text of your existing resume below. Our AI will extract and structure the data automatically.
                        </p>
                        <textarea
                            className="rb-paste-box"
                            placeholder={"Paste your resume text here...\n\nExample:\nJohn Doe\njohn@email.com | (555) 123-4567\nSoftware Engineer at Google\n..."}
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                        />
                    </>
                )}

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
const ChatMode = ({ data, setData, setMode, onDownload, downloading }) => {
    const [messages, setMessages] = useState([
        { role: 'ai', content: "👋 **Welcome to the AI Resume Builder!**\n\nI'll guide you step-by-step to create a polished, professional resume. Let's get started!\n\n**Step 1 — Personal Information**\n\nPlease share the following details:\n1. **Full Name**\n2. **Email Address**\n3. **Phone Number**\n4. **LinkedIn Profile URL** (if you have one)\n5. **GitHub Profile URL** (if applicable)\n\nYou can share all of them at once, or one at a time — whatever's comfortable!" }
    ])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [resumeComplete, setResumeComplete] = useState(false)
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

            // Check for [RESUME_COMPLETE] signal
            if (response.includes('[RESUME_COMPLETE]')) {
                setResumeComplete(true)
            }

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
                    } else if (parsed.section === 'github_import' && parsed.data?.action === 'import') {
                        // Trigger GitHub import from chat
                        const githubUrl = data?.personal?.github;
                        if (githubUrl) {
                            setMessages(prev => [...prev, { role: 'ai', content: '🔄 **Fetching your GitHub repositories...**\n\nImporting your top projects and generating professional bullet points for each one. This usually takes 5-10 seconds...' }]);
                            try {
                                const result = await fetchGitHubProjects(githubUrl);
                                setData(prev => {
                                    const existingProjects = prev.projects.filter(p => p.name);
                                    const newSkills = [...new Set([...prev.skills, ...result.skills])];
                                    return {
                                        ...prev,
                                        projects: existingProjects.length > 0 ? [...existingProjects, ...result.projects] : result.projects,
                                        skills: newSkills
                                    };
                                });
                                const projNames = result.projects.map(p => `• **${p.name}**${p.technologies ? ` (${p.technologies})` : ''}`).join('\n');
                                setMessages(prev => [...prev, {
                                    role: 'ai',
                                    content: `✅ **Successfully imported ${result.projects.length} projects from GitHub!**\n\n${projNames}\n\nI also found these **skills** from your repos: ${result.skills.join(', ')}\n\nWould you like to add any more projects manually, or shall we move on to **Skills**?`
                                }]);
                            } catch (err) {
                                setMessages(prev => [...prev, { role: 'ai', content: `❌ **Couldn't import GitHub projects:** ${err.message}\n\nPlease share your projects manually instead.` }]);
                            }
                        } else {
                            setMessages(prev => [...prev, { role: 'ai', content: "❌ I don't have your GitHub URL yet. Could you share your **GitHub profile link** first?" }]);
                        }
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
                    {resumeComplete && (
                        <button className="rb-btn rb-btn-accent" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={onDownload} disabled={downloading}>
                            {downloading ? '⏳ Optimizing...' : '📥 Download PDF (-20c)'}
                        </button>
                    )}
                    <button className="rb-btn rb-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setMode('manual')}>
                        Switch to Form →
                    </button>
                </div>
            </div>
            <div className="rb-chat-area">
                {messages.map((msg, i) => {
                    // Strip resume_data blocks and [RESUME_COMPLETE] from display
                    let displayContent = msg.content.replace(/```resume_data[\s\S]*?```/g, '').replace(/\[RESUME_COMPLETE\]/g, '').trim();
                    // Convert markdown-style formatting to HTML for AI messages
                    const formatMessage = (text) => {
                        if (msg.role !== 'ai') return text;
                        return text
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\n/g, '<br/>')
                            .replace(/^(\d+)\.\s/gm, '<br/><strong>$1.</strong> ')
                            .replace(/^[-•]\s/gm, '<br/>• ')
                    };
                    if (!displayContent) return null;

                    // Check if this message has the resume complete signal — render download button inline
                    const isCompleteMsg = msg.role === 'ai' && msg.content.includes('[RESUME_COMPLETE]');

                    return (
                        <React.Fragment key={i}>
                            <div className={`rb-chat-msg ${msg.role === 'ai' ? 'ai' : 'user'}`}>
                                {msg.role === 'ai'
                                    ? <span dangerouslySetInnerHTML={{ __html: formatMessage(displayContent) }} />
                                    : displayContent
                                }
                            </div>
                            {isCompleteMsg && (
                                <div style={{
                                    alignSelf: 'flex-start',
                                    marginTop: '0.5rem',
                                    animation: 'rbFadeIn 0.5s ease'
                                }}>
                                    <button
                                        className="rb-btn rb-btn-accent"
                                        onClick={onDownload}
                                        disabled={downloading}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            fontSize: '0.9375rem',
                                            borderRadius: '0.75rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
                                            width: '100%',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {downloading ? (
                                            <><span className="rb-spinner" /> Optimizing & Generating PDF...</>
                                        ) : (
                                            <>📥 Download Resume PDF <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>(-20 credits)</span></>
                                        )}
                                    </button>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
                {isTyping && (
                    <div className="rb-chat-msg ai" style={{ fontStyle: 'italic', color: '#63636E' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="rb-spinner" /> Thinking...
                        </span>
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
    const [searchParams] = useSearchParams()
    const isEmbed = searchParams.get('embed') === 'true'
    const initialMode = searchParams.get('mode') || null
    const [mode, setMode] = useState(initialMode) // null | 'manual' | 'upload' | 'chat'
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
        summary: '',
        certifications: []
    })
    const isInitialLoad = useRef(true)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            setUser(u)
            
            // Load resume data
            const savedData = await loadResumeData(u?.uid)
            if (savedData) {
                setResumeData(savedData)
            }
            isInitialLoad.current = false

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

    // Auto-save resume data
    useEffect(() => {
        if (isInitialLoad.current) return;
        
        const timer = setTimeout(() => {
            saveResumeData(user?.uid, resumeData)
        }, 1500)
        
        return () => clearTimeout(timer)
    }, [resumeData, user])

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

        // ATS Optimization Pass — fixes all ATS issues before PDF generation
        try {
            const optimizedData = await atsOptimizeResume(resumeData)
            setResumeData(optimizedData)
            // Brief delay to let state update render
            await new Promise(resolve => setTimeout(resolve, 500))
        } catch (err) {
            console.error('ATS optimization error:', err)
            // Fallback: still try the old enhance approach
            try {
                const projectsWithContent = resumeData.projects.filter(p => p.name)
                const experienceWithContent = resumeData.experience.filter(e => e.company || e.title)
                const needsProjEnhance = projectsWithContent.some(p => !p.bullets || p.bullets.length === 0)
                const needsExpEnhance = experienceWithContent.some(e => !e.bullets || e.bullets.length === 0)
                if (needsProjEnhance || needsExpEnhance) {
                    const [enhancedProjects, enhancedExperience] = await Promise.all([
                        needsProjEnhance ? generateProjectBullets(resumeData.projects) : Promise.resolve(resumeData.projects),
                        needsExpEnhance ? generateExperienceBullets(resumeData.experience) : Promise.resolve(resumeData.experience)
                    ])
                    setResumeData(prev => ({ ...prev, projects: enhancedProjects, experience: enhancedExperience }))
                    await new Promise(resolve => setTimeout(resolve, 300))
                }
            } catch (fallbackErr) {
                console.error('Fallback enhance error:', fallbackErr)
            }
        }

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
        <div className={`rb-page ${isEmbed ? 'rb-embed-mode' : ''}`}>
            {/* Navbar — hidden in embed mode */}
            {!isEmbed && (
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
            )}

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
                    <div className={`rb-main ${isEmbed ? 'rb-main-embed' : ''}`}>
                        {/* Left: Form / Chat / Upload */}
                        {mode === 'manual' && <ManualForm data={resumeData} setData={setResumeData} onDownload={handleDownloadPdf} downloading={isDownloading} />}
                        {mode === 'upload' && <UploadMode setData={setResumeData} setMode={setMode} />}
                        {mode === 'chat' && <ChatMode data={resumeData} setData={setResumeData} setMode={setMode} onDownload={handleDownloadPdf} downloading={isDownloading} />}

                        {/* Right: Live Preview — visually hidden in embed mode, but kept in DOM for printing */}
                        <div className={`rb-preview-panel ${isEmbed ? 'rb-preview-print-only' : ''}`}>
                            <div className="rb-preview-wrapper">
                                {!isEmbed && (
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
                                                {isDownloading ? '⏳ Optimizing...' : '📥 PDF (-20c)'}
                                            </button>
                                        </div>
                                    </div>
                                )}

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
