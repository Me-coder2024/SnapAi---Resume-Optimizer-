import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { supabase as _sb } from './supabase'

/* ═══════════════════════════════════════
   SKILL DATABASE (same as chatbot InternBot)
   ═══════════════════════════════════════ */
const SKILL_SUGGESTIONS = {
    'web development': ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'TypeScript', 'MongoDB', 'SQL', 'Git', 'REST APIs', 'Tailwind CSS', 'Next.js'],
    'data science': ['Python', 'Pandas', 'NumPy', 'Machine Learning', 'SQL', 'Tableau', 'R', 'TensorFlow', 'Statistics', 'Data Visualization', 'Jupyter', 'Scikit-learn'],
    'machine learning': ['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Deep Learning', 'NLP', 'Computer Vision', 'Statistics', 'Linear Algebra', 'Pandas', 'Keras', 'MLOps'],
    'android': ['Java', 'Kotlin', 'Android SDK', 'Firebase', 'XML', 'REST APIs', 'MVVM', 'Retrofit', 'Room Database', 'Git', 'Material Design', 'Jetpack Compose'],
    'ios': ['Swift', 'SwiftUI', 'Xcode', 'UIKit', 'CoreData', 'REST APIs', 'CocoaPods', 'Git', 'Firebase', 'Auto Layout', 'MVVM', 'Combine'],
    'graphic design': ['Photoshop', 'Illustrator', 'Figma', 'InDesign', 'Canva', 'Typography', 'Color Theory', 'UI Design', 'Branding', 'Print Design', 'After Effects', 'Sketch'],
    'ui/ux design': ['Figma', 'Sketch', 'Adobe XD', 'User Research', 'Wireframing', 'Prototyping', 'Usability Testing', 'Design Systems', 'Information Architecture', 'Interaction Design', 'HTML/CSS', 'Accessibility'],
    'marketing': ['SEO', 'Google Ads', 'Social Media', 'Content Marketing', 'Email Marketing', 'Analytics', 'Copywriting', 'CRM', 'Market Research', 'Brand Strategy', 'Facebook Ads', 'HubSpot'],
    'digital marketing': ['SEO', 'SEM', 'Google Analytics', 'Social Media Marketing', 'Content Strategy', 'Email Campaigns', 'PPC', 'Facebook Ads', 'Copywriting', 'Marketing Automation', 'A/B Testing', 'Influencer Marketing'],
    'content writing': ['SEO Writing', 'Copywriting', 'Blogging', 'Editing', 'Research', 'WordPress', 'Social Media', 'Technical Writing', 'Proofreading', 'Grammar', 'Storytelling', 'CMS Tools'],
    'cybersecurity': ['Network Security', 'Ethical Hacking', 'Linux', 'Python', 'Firewalls', 'SIEM', 'Penetration Testing', 'Cryptography', 'Wireshark', 'Risk Assessment', 'SOC', 'Vulnerability Assessment'],
    'cloud computing': ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Linux', 'Terraform', 'CI/CD', 'Networking', 'Serverless', 'Python', 'DevOps'],
    'devops': ['Docker', 'Kubernetes', 'Jenkins', 'CI/CD', 'AWS', 'Linux', 'Terraform', 'Ansible', 'Git', 'Monitoring', 'Python', 'Shell Scripting'],
    'backend development': ['Node.js', 'Python', 'Java', 'SQL', 'MongoDB', 'REST APIs', 'Docker', 'Git', 'Redis', 'PostgreSQL', 'GraphQL', 'Microservices'],
    'frontend development': ['HTML', 'CSS', 'JavaScript', 'React', 'Vue.js', 'TypeScript', 'Responsive Design', 'Git', 'Webpack', 'Sass', 'Redux', 'Testing'],
    'full stack': ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'MongoDB', 'SQL', 'Git', 'REST APIs', 'Docker', 'TypeScript', 'AWS'],
    'finance': ['Excel', 'Financial Modeling', 'Accounting', 'Tally', 'Data Analysis', 'SAP', 'Valuation', 'Financial Reporting', 'PowerPoint', 'Bloomberg', 'SQL', 'Python'],
    'human resources': ['Recruitment', 'MS Office', 'Communication', 'HRIS', 'Employee Relations', 'Payroll', 'LinkedIn Recruiting', 'Onboarding', 'Performance Management', 'Labor Laws', 'Training', 'Data Analysis'],
    'video editing': ['Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Final Cut Pro', 'Motion Graphics', 'Color Grading', 'Sound Editing', 'Photoshop', 'Storytelling', 'YouTube', 'Transitions', 'Animation'],
}

const ROLE_OPTIONS = Object.keys(SKILL_SUGGESTIONS).map(k => k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))

const JSEARCH_HOST = 'jsearch.p.rapidapi.com'
const CREDITS_PER_SEARCH = 2

/* ═══════════════════════════════════════
   STEP INDICATOR
   ═══════════════════════════════════════ */
const StepIndicator = ({ current, total, labels }) => (
    <div className="w-full max-w-2xl mx-auto mb-6 sm:mb-10 overflow-x-auto pb-4 sm:pb-0 hide-scrollbar">
        <div className="flex items-center gap-0 min-w-max px-2 sm:px-0">
            {labels.map((label, i) => (
                <React.Fragment key={i}>
                    <div className="flex flex-col items-center gap-1.5 min-w-0">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-mono font-semibold transition-all duration-300 shrink-0 ${i < current ? 'bg-[#3B82F6] text-white' : i === current ? 'bg-[#3B82F6]/20 border-2 border-[#3B82F6] text-[#3B82F6]' : 'bg-[#111113] border border-[#27272F] text-[#3A3A44]'}`}>
                            {i < current ? '✓' : i + 1}
                        </div>
                        <span className={`text-[9px] sm:text-[10px] font-mono truncate max-w-[64px] sm:max-w-[72px] text-center ${i <= current ? 'text-[#A1A1A9]' : 'text-[#3A3A44]'}`}>{label}</span>
                    </div>
                    {i < labels.length - 1 && (
                        <div className={`w-8 sm:w-auto sm:flex-1 h-px mx-1 sm:mx-2 mt-[-14px] transition-colors ${i < current ? 'bg-[#3B82F6]' : 'bg-[#27272F]'}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    </div>
)

/* ═══════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════ */
const InternBotPage = () => {
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [walletCredits, setWalletCredits] = useState(0)
    const [step, setStep] = useState(0)
    const [role, setRole] = useState('')
    const [roleSearch, setRoleSearch] = useState('')
    const [type, setType] = useState(null)
    const [skills, setSkills] = useState([])
    const [workMode, setWorkMode] = useState(null)
    const [location, setLocation] = useState('')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY || ''

    // Auth + wallet
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            setUser(u)
            if (u) {
                try {
                    const { data } = await _sb.from('user_wallets').select('credits').eq('uid', u.uid).single()
                    setWalletCredits(data?.credits || 0)
                } catch (e) { /* ignore */ }
            }
        })
        return unsub
    }, [])

    // Get suggested skills for the selected role
    const suggestedSkills = (() => {
        const r = role.toLowerCase()
        for (const [key, skills] of Object.entries(SKILL_SUGGESTIONS)) {
            if (r.includes(key) || key.includes(r)) return skills
        }
        return ['Communication', 'MS Office', 'Problem Solving', 'Teamwork', 'Excel', 'Research']
    })()

    const toggleSkill = (s) => {
        setSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    }

    const stepLabels = workMode === 'Remote'
        ? ['Role', 'Type', 'Skills', 'Work Mode', 'Results']
        : ['Role', 'Type', 'Skills', 'Work Mode', 'Location', 'Results']

    const totalSteps = stepLabels.length

    // Search API
    const doSearch = useCallback(async () => {
        setLoading(true)
        setError('')
        setResults([])

        // Credit check
        if (user?.uid) {
            try {
                const { data: wallet } = await _sb.from('user_wallets').select('credits').eq('uid', user.uid).single()
                if (!wallet || wallet.credits < CREDITS_PER_SEARCH) {
                    setError(`Not enough credits. You need ${CREDITS_PER_SEARCH} but have ${wallet?.credits || 0}.`)
                    setLoading(false)
                    return
                }
                // Deduct
                const newBal = wallet.credits - CREDITS_PER_SEARCH
                await _sb.from('user_wallets').update({ credits: newBal, updated_at: new Date().toISOString() }).eq('uid', user.uid)
                await _sb.from('wallet_transactions').insert([{ uid: user.uid, type: 'debit', amount: CREDITS_PER_SEARCH, tool_name: 'InternBot', description: `Used ${CREDITS_PER_SEARCH} credits for InternBot search` }])
                setWalletCredits(newBal)
            } catch (e) {
                console.warn('Credit error:', e)
            }
        }

        // JSearch API call
        const query = `${role} internship` + (location ? ` in ${location}` : ' in India')
        const params = new URLSearchParams({
            query, page: '1', num_pages: '3', date_posted: 'month', employment_types: 'INTERN'
        })
        if (workMode === 'Remote') params.set('remote_jobs_only', 'true')

        try {
            const resp = await fetch(`https://${JSEARCH_HOST}/search?${params}`, {
                headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': JSEARCH_HOST },
                signal: AbortSignal.timeout(30000),
            })
            if (!resp.ok) throw new Error('API error')
            const data = await resp.json()
            const jobs = (data.data || []).slice(0, 5).map(job => ({
                title: job.job_title || 'Internship',
                company: job.employer_name || 'Company',
                location: job.job_city ? `${job.job_city}, ${job.job_country}` : (job.job_country || 'India'),
                remote: job.job_is_remote,
                url: job.job_apply_link || job.job_google_link || '#',
                logo: job.employer_logo,
                posted: job.job_posted_at_datetime_utc,
                platform: (job.job_google_link || '').includes('linkedin') ? 'LinkedIn' : (job.job_google_link || '').includes('indeed') ? 'Indeed' : 'JSearch',
            }))
            setResults(jobs)
            if (jobs.length === 0) setError('No internships found. Try a different role or location.')
        } catch (e) {
            // Fallback to Internshala
            setResults([{
                title: `${role} Internship`,
                company: 'Various Companies',
                location: location || 'India',
                remote: workMode === 'Remote',
                url: `https://internshala.com/internships/${encodeURIComponent(role.toLowerCase().replace(/\s+/g, '-'))}-internship`,
                logo: null,
                posted: null,
                platform: 'Internshala',
            }])
        } finally {
            setLoading(false)
        }
    }, [role, type, skills, workMode, location, user, rapidApiKey])

    const handleNext = () => {
        if (step === 0 && !role) return
        if (step === 1 && !type) return
        if (step === 3 && !workMode) return

        // If work mode is Remote, skip location step — go straight to search
        if (step === 3 && workMode === 'Remote') {
            setStep(4)
            doSearch()
            return
        }
        if (step === 4 && workMode !== 'Remote') {
            // This is the location step for non-remote, next is results
            setStep(5)
            doSearch()
            return
        }
        setStep(s => s + 1)
    }

    const handleBack = () => {
        if (step === 4 && workMode === 'Remote') {
            setStep(3)
            return
        }
        setStep(s => Math.max(0, s - 1))
    }

    const handleReset = () => {
        setStep(0); setRole(''); setRoleSearch(''); setType(null); setSkills([]); setWorkMode(null); setLocation(''); setResults([]); setError('')
    }

    // Filter role options based on search
    const filteredRoles = roleSearch
        ? ROLE_OPTIONS.filter(r => r.toLowerCase().includes(roleSearch.toLowerCase()))
        : ROLE_OPTIONS

    const isResultsStep = (workMode === 'Remote' && step === 4) || (workMode !== 'Remote' && step === 5)

    return (
        <div className="min-h-screen bg-[#09090B] text-[#A1A1A9] font-sans">
            {/* Nav */}
            <nav className="sticky top-0 z-50 bg-[#09090B]/80 backdrop-blur-sm border-b border-[#1C1C22] h-14">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <button onClick={() => navigate('/')} className="text-xs sm:text-sm text-[#63636E] hover:text-[#EDEDEF] transition-colors shrink-0">← Home</button>
                        <span className="text-[#27272F] hidden sm:inline">|</span>
                        <span className="font-semibold text-[#EDEDEF] text-xs sm:text-sm font-mono truncate">InternBot</span>
                        <span className="text-[9px] sm:text-[10px] font-mono text-[#3A3A44] bg-[#111113] border border-[#1C1C22] px-1.5 sm:px-2 py-0.5 rounded shrink-0">v2</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono text-[#A1A1A9] shrink-0">
                        <div className="flex items-center gap-1.5 bg-[#111113] border border-[#1C1C22] px-2 sm:px-3 py-1.5 rounded-md">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            <span className="text-[#EDEDEF] font-semibold">{walletCredits}</span> <span className="hidden sm:inline">credits</span>
                        </div>
                        {user && <span className="text-[#3A3A44] hidden sm:inline">{user.email}</span>}
                    </div>
                </div>
            </nav>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                {!isResultsStep && (
                    <StepIndicator current={step} total={totalSteps} labels={stepLabels} />
                )}

                {/* ── Step 0: Select Role ── */}
                {step === 0 && (
                    <div className="fade-in-up">
                        <h2 className="text-lg sm:text-xl font-semibold text-[#EDEDEF] mb-1 sm:mb-2">What role are you looking for?</h2>
                        <p className="text-xs sm:text-sm text-[#63636E] mb-4 sm:mb-6">Choose from popular roles or type your own.</p>

                        <input
                            value={roleSearch}
                            onChange={e => { setRoleSearch(e.target.value); setRole(e.target.value) }}
                            placeholder="e.g. Web Development, Data Science..."
                            className="w-full bg-[#111113] border border-[#27272F] rounded-lg px-4 py-3 text-sm text-[#EDEDEF] placeholder-[#3A3A44] outline-none focus:border-[#3B82F6] transition-colors mb-6"
                        />

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {filteredRoles.map(r => (
                                <button
                                    key={r}
                                    onClick={() => { setRole(r); setRoleSearch(r) }}
                                    className={`text-left text-sm px-4 py-3 rounded-lg border transition-all ${role === r ? 'bg-[#3B82F6]/10 border-[#3B82F6]/40 text-[#3B82F6]' : 'bg-[#111113] border-[#1C1C22] text-[#A1A1A9] hover:border-[#27272F] hover:text-[#EDEDEF]'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Step 1: Internship Type ── */}
                {step === 1 && (
                    <div className="fade-in-up">
                        <h2 className="text-lg sm:text-xl font-semibold text-[#EDEDEF] mb-1 sm:mb-2">Internship type</h2>
                        <p className="text-xs sm:text-sm text-[#63636E] mb-4 sm:mb-6">What kind of internship are you looking for?</p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                                { id: 'stipend', icon: '💰', label: 'Stipend', desc: 'Paid internship with monthly stipend' },
                                { id: 'non-stipend', icon: '🤝', label: 'Non-Stipend', desc: 'Unpaid/learning-focused experience' },
                                { id: 'research', icon: '🔬', label: 'Research', desc: 'Academic or lab-based research' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setType(t.id)}
                                    className={`text-left p-5 rounded-xl border transition-all ${type === t.id ? 'bg-[#3B82F6]/10 border-[#3B82F6]/40' : 'bg-[#111113] border-[#1C1C22] hover:border-[#27272F]'}`}
                                >
                                    <div className="text-2xl mb-3">{t.icon}</div>
                                    <h3 className={`text-sm font-semibold mb-1 ${type === t.id ? 'text-[#3B82F6]' : 'text-[#EDEDEF]'}`}>{t.label}</h3>
                                    <p className="text-xs text-[#63636E] leading-relaxed">{t.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Step 2: Skills ── */}
                {step === 2 && (
                    <div className="fade-in-up">
                        <h2 className="text-lg sm:text-xl font-semibold text-[#EDEDEF] mb-1 sm:mb-2">Select your skills</h2>
                        <p className="text-xs sm:text-sm text-[#63636E] mb-4 sm:mb-6">Pick skills relevant to <strong className="text-[#EDEDEF]">{role}</strong>. Selected: {skills.length}</p>

                        <div className="flex flex-wrap gap-2">
                            {suggestedSkills.map(s => (
                                <button
                                    key={s}
                                    onClick={() => toggleSkill(s)}
                                    className={`text-xs font-mono px-3 py-2 rounded-lg border transition-all ${skills.includes(s) ? 'bg-[#3B82F6]/15 border-[#3B82F6]/40 text-[#3B82F6]' : 'bg-[#111113] border-[#1C1C22] text-[#A1A1A9] hover:border-[#27272F] hover:text-[#EDEDEF]'}`}
                                >
                                    {skills.includes(s) ? '✓ ' : ''}{s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Step 3: Work Mode ── */}
                {step === 3 && (
                    <div className="fade-in-up">
                        <h2 className="text-lg sm:text-xl font-semibold text-[#EDEDEF] mb-1 sm:mb-2">Work preference</h2>
                        <p className="text-xs sm:text-sm text-[#63636E] mb-4 sm:mb-6">Where do you want to work?</p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                                { id: 'Remote', icon: '🏠', label: 'Remote', desc: 'Work from anywhere' },
                                { id: 'In-Office', icon: '🏢', label: 'In-Office', desc: 'On-site at company' },
                                { id: 'Hybrid', icon: '🔀', label: 'Hybrid', desc: 'Mix of remote & office' },
                            ].map(w => (
                                <button
                                    key={w.id}
                                    onClick={() => setWorkMode(w.id)}
                                    className={`text-left p-5 rounded-xl border transition-all ${workMode === w.id ? 'bg-[#3B82F6]/10 border-[#3B82F6]/40' : 'bg-[#111113] border-[#1C1C22] hover:border-[#27272F]'}`}
                                >
                                    <div className="text-2xl mb-3">{w.icon}</div>
                                    <h3 className={`text-sm font-semibold mb-1 ${workMode === w.id ? 'text-[#3B82F6]' : 'text-[#EDEDEF]'}`}>{w.label}</h3>
                                    <p className="text-xs text-[#63636E]">{w.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Step 4 (non-remote): Location ── */}
                {step === 4 && workMode !== 'Remote' && (
                    <div className="fade-in-up">
                        <h2 className="text-lg sm:text-xl font-semibold text-[#EDEDEF] mb-1 sm:mb-2">Preferred city</h2>
                        <p className="text-xs sm:text-sm text-[#63636E] mb-4 sm:mb-6">Where would you like the internship?</p>

                        <input
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder="e.g. Bangalore, Mumbai, Delhi NCR..."
                            className="w-full bg-[#111113] border border-[#27272F] rounded-lg px-4 py-3 text-sm text-[#EDEDEF] placeholder-[#3A3A44] outline-none focus:border-[#3B82F6] transition-colors mb-4"
                        />

                        <div className="flex flex-wrap gap-2">
                            {['Bangalore', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Chennai'].map(city => (
                                <button
                                    key={city}
                                    onClick={() => setLocation(city)}
                                    className={`text-xs font-mono px-3 py-2 rounded-lg border transition-all ${location === city ? 'bg-[#3B82F6]/15 border-[#3B82F6]/40 text-[#3B82F6]' : 'bg-[#111113] border-[#1C1C22] text-[#A1A1A9] hover:border-[#27272F]'}`}
                                >
                                    {city}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Results ── */}
                {isResultsStep && (
                    <div className="fade-in-up">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-semibold text-[#EDEDEF] mb-1">
                                    {loading ? 'Searching...' : `${results.length} internship${results.length !== 1 ? 's' : ''} found`}
                                </h2>
                                <p className="text-sm text-[#63636E]">{role} · {type} · {workMode}{location ? ` · ${location}` : ''}</p>
                            </div>
                            <button onClick={handleReset} className="text-xs font-mono text-[#A1A1A9] bg-[#111113] border border-[#27272F] px-3 py-1.5 rounded-md hover:text-[#EDEDEF] hover:border-[#33333D] transition-colors">
                                New Search
                            </button>
                        </div>

                        {loading && (
                            <div className="flex flex-col items-center py-16 gap-3">
                                <div className="w-8 h-8 border-2 border-[#27272F] border-t-[#3B82F6] rounded-full animate-spin" />
                                <p className="text-sm text-[#63636E]">Scanning internship platforms...</p>
                            </div>
                        )}

                        {error && (
                            <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm px-5 py-4 rounded-lg mb-6">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3">
                            {results.map((r, i) => (
                                <a
                                    key={i}
                                    href={r.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block bg-[#111113] border border-[#1C1C22] rounded-lg p-5 hover:border-[#27272F] transition-all card-hover group"
                                >
                                    <div className="flex items-start gap-4">
                                        {r.logo ? (
                                            <img src={r.logo} alt="" className="w-10 h-10 rounded-lg object-contain bg-white" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg bg-[#1C1C22] flex items-center justify-center text-lg">🏢</div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-[#EDEDEF] group-hover:text-[#3B82F6] transition-colors truncate">{r.title}</h3>
                                            <p className="text-xs text-[#A1A1A9] mt-0.5">{r.company}</p>
                                            <div className="flex flex-wrap items-center gap-1 sm:gap-3 mt-2 text-[9px] sm:text-[10px] font-mono text-[#3A3A44]">
                                                <span>📍 {r.location}</span>
                                                {r.remote && <span className="text-[#3B82F6]">🏠 Remote</span>}
                                                {r.platform && <span className="bg-[#1C1C22] px-1.5 py-0.5 rounded">{r.platform}</span>}
                                            </div>
                                        </div>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#3A3A44] shrink-0 mt-1 group-hover:text-[#3B82F6] transition-colors hidden sm:block">
                                            <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                                        </svg>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Navigation Buttons ── */}
                {!isResultsStep && (
                    <div className="flex items-center justify-between mt-10 pt-6 border-t border-[#1C1C22]">
                        <button
                            onClick={step === 0 ? () => navigate('/') : handleBack}
                            className="text-sm text-[#63636E] hover:text-[#EDEDEF] transition-colors flex items-center gap-1.5"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                            {step === 0 ? 'Home' : 'Back'}
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={(step === 0 && !role) || (step === 1 && !type) || (step === 3 && !workMode)}
                            className="text-sm font-medium bg-[#EDEDEF] text-[#09090B] px-6 py-2.5 rounded-md hover:bg-[#D4D4D8] disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                        >
                            {(step === 3 && workMode === 'Remote') || (step === 4 && workMode !== 'Remote') ? 'Search Internships' : 'Continue'}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default InternBotPage
