/* ============================================
   InternBot v2 — Enhanced Chatbot Logic
   Scoring Engine + Skill Matching + Rich Results
   ============================================ */

(function () {
    'use strict';

    // ── Supabase Tracking (passed from parent app via URL params) ──
    const SUPABASE_URL = new URLSearchParams(window.location.search).get('surl') || '';
    const SUPABASE_KEY = new URLSearchParams(window.location.search).get('skey') || '';

    // Lightweight Supabase REST insert (no SDK needed)
    async function supabaseInsert(table, row) {
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(row),
            });
        } catch (e) {
            console.warn('Tracking insert failed:', e);
        }
    }

    // Session ID for tracking
    let _trackSid = sessionStorage.getItem('snapai_sid');
    if (!_trackSid) {
        _trackSid = 'sid_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        sessionStorage.setItem('snapai_sid', _trackSid);
    }

    function trackBotInteraction(question, response, option) {
        supabaseInsert('track_bots', {
            bot: 'InternBot',
            question: question || '',
            response: response || '',
            option: option || '',
            session_id: _trackSid,
        });
    }

    // ── DOM References ──
    const chatArea = document.getElementById('chatArea');
    const quickRepliesContainer = document.getElementById('quickRepliesContainer');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const inputHint = document.getElementById('inputHint');

    // ── Conversation State ──
    const STATE = {
        GREETING: 'greeting',
        ASK_TYPE: 'ask_type',
        ASK_ROLE: 'ask_role',
        ASK_SKILLS: 'ask_skills',
        ASK_DATE: 'ask_date',
        ASK_WORKMODE: 'ask_workmode',
        ASK_LOCATION: 'ask_location',
        SEARCHING: 'searching',
        RESULTS: 'results',
    };

    let currentState = STATE.GREETING;
    let searchParams = {
        type: null,
        role: null,
        skills: [],
        datePreference: null,
        workMode: null,
        location: null,
    };

    // ── User Authentication (from URL params) ──
    const urlParams = new URLSearchParams(window.location.search);
    const currentUser = {
        uid: urlParams.get('uid'),
        name: urlParams.get('name') || 'User',
        email: urlParams.get('email') || '',
    };
    const isLoggedIn = !!currentUser.uid;

    // ── Per-user profile data (postMessage to parent for centralized wallet) ──
    const CREDITS_PER_SEARCH = 2;
    let walletCredits = 0;

    // Request credit balance from parent window
    function requestCreditCheck() {
        return new Promise((resolve) => {
            const handler = (e) => {
                if (e.data && e.data.type === 'CREDITS_STATUS') {
                    window.removeEventListener('message', handler);
                    walletCredits = e.data.credits || 0;
                    resolve(walletCredits);
                }
            };
            window.addEventListener('message', handler);
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'CHECK_CREDITS' }, '*');
            } else {
                // Standalone mode (not in iframe) — allow searches
                resolve(999);
            }
            // Timeout fallback
            setTimeout(() => { window.removeEventListener('message', handler); resolve(walletCredits); }, 3000);
        });
    }

    // Deduct credits from parent wallet
    function requestCreditDeduction() {
        return new Promise((resolve) => {
            const handler = (e) => {
                if (e.data && (e.data.type === 'DEDUCT_SUCCESS' || e.data.type === 'DEDUCT_FAILED')) {
                    window.removeEventListener('message', handler);
                    if (e.data.type === 'DEDUCT_SUCCESS') {
                        walletCredits = e.data.credits;
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            };
            window.addEventListener('message', handler);
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'DEDUCT_CREDITS', amount: CREDITS_PER_SEARCH, tool: 'InternBot' }, '*');
            } else {
                resolve(true); // standalone mode
            }
            setTimeout(() => { window.removeEventListener('message', handler); resolve(false); }, 5000);
        });
    }

    // ── Profile UI Updates ──
    function updateProfileUI() {
        // Header profile button
        const profileBtn = document.getElementById('profileBtn');
        if (profileBtn && isLoggedIn) profileBtn.style.display = 'flex';

        // Profile panel fields
        const nameEl = document.getElementById('profileUserName');
        const emailEl = document.getElementById('profileUserEmail');
        const freeEl = document.getElementById('statFreeSearch');
        const purchasedEl = document.getElementById('statPurchased');
        const usedEl = document.getElementById('statUsed');
        const remainingEl = document.getElementById('statRemaining');
        const barFill = document.getElementById('searchBarFill');
        const barInfo = document.getElementById('searchBarInfo');

        if (nameEl) nameEl.textContent = currentUser.name;
        if (emailEl) emailEl.textContent = currentUser.email;
        if (freeEl) { freeEl.textContent = `${walletCredits} credits`; freeEl.style.color = walletCredits > 0 ? '#22c55e' : '#ef4444'; }
        if (purchasedEl) purchasedEl.textContent = walletCredits;
        if (usedEl) usedEl.textContent = '—';
        if (remainingEl) { remainingEl.textContent = walletCredits; remainingEl.style.color = walletCredits > 0 ? '#22c55e' : '#ef4444'; }

        if (barFill && barInfo) {
            barFill.style.width = walletCredits > 0 ? '50%' : '100%';
            barInfo.textContent = `${walletCredits} credits remaining (· ${CREDITS_PER_SEARCH} per search)`;
        }
    }

    // ── Payment Modal — redirects to parent profile page ──
    function showPaymentModal() {
        const modal = document.getElementById('paymentModal');
        if (modal) modal.style.display = 'flex';
    }
    function closePaymentModal() {
        const modal = document.getElementById('paymentModal');
        if (modal) modal.style.display = 'none';
    }

    // ── Profile Panel ──
    function showProfilePanel() {
        requestCreditCheck().then(() => {
            updateProfileUI();
            const panel = document.getElementById('profilePanel');
            if (panel) panel.style.display = 'flex';
        });
    }
    function closeProfilePanel() {
        const panel = document.getElementById('profilePanel');
        if (panel) panel.style.display = 'none';
    }

    // ── Skill Database (role → suggested skills) ──
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
    };

    // ── Role keywords for filtering relevant results ──
    const ROLE_KEYWORDS = {
        'web development': ['web', 'frontend', 'front-end', 'front end', 'full stack', 'fullstack', 'full-stack', 'react', 'mern', 'mean', 'node', 'angular', 'vue', 'html', 'css', 'javascript', 'wordpress', 'php', 'django', 'flask', 'laravel', 'website'],
        'frontend development': ['frontend', 'front-end', 'front end', 'react', 'angular', 'vue', 'html', 'css', 'javascript', 'ui developer', 'web'],
        'backend development': ['backend', 'back-end', 'back end', 'node', 'python', 'java', 'django', 'flask', 'spring', 'express', 'php', 'laravel', 'api', 'server'],
        'full stack': ['full stack', 'fullstack', 'full-stack', 'mern', 'mean', 'web', 'frontend', 'backend'],
        'data science': ['data science', 'data scientist', 'data analyst', 'data analysis', 'analytics', 'machine learning', 'ml', 'statistics', 'pandas', 'python data'],
        'machine learning': ['machine learning', 'ml', 'deep learning', 'ai', 'artificial intelligence', 'nlp', 'computer vision', 'neural', 'tensorflow', 'pytorch'],
        'android': ['android', 'kotlin', 'mobile app', 'mobile development', 'flutter', 'react native'],
        'ios': ['ios', 'swift', 'swiftui', 'iphone', 'apple', 'mobile app'],
        'graphic design': ['graphic design', 'graphics', 'photoshop', 'illustrator', 'designer', 'visual design', 'branding'],
        'ui/ux design': ['ui', 'ux', 'user interface', 'user experience', 'figma', 'design', 'wireframe', 'prototype'],
        'marketing': ['marketing', 'digital marketing', 'seo', 'social media', 'content marketing', 'brand', 'growth'],
        'digital marketing': ['digital marketing', 'seo', 'sem', 'social media', 'google ads', 'facebook ads', 'ppc', 'content marketing'],
        'content writing': ['content writ', 'copywriting', 'blog', 'writer', 'editing', 'content creation', 'technical writing'],
        'cybersecurity': ['cyber', 'security', 'ethical hacking', 'penetration', 'network security', 'infosec', 'soc'],
        'cloud computing': ['cloud', 'aws', 'azure', 'gcp', 'devops', 'docker', 'kubernetes'],
        'devops': ['devops', 'ci/cd', 'docker', 'kubernetes', 'jenkins', 'terraform', 'aws', 'cloud', 'infrastructure'],
        'finance': ['finance', 'accounting', 'financial', 'audit', 'investment', 'banking', 'chartered'],
        'human resources': ['human resource', 'hr', 'recruitment', 'talent', 'hiring', 'people operations'],
        'video editing': ['video edit', 'video production', 'premiere', 'after effects', 'motion graphics', 'filmmaker'],
    };

    // ── Check if a title/URL is relevant to the searched role ──
    function isRelevantToRole(text, role) {
        const textLower = text.toLowerCase();
        const roleLower = role.toLowerCase();

        // Direct role name match
        if (textLower.includes(roleLower)) return true;

        // Check against role keywords
        for (const [key, keywords] of Object.entries(ROLE_KEYWORDS)) {
            if (roleLower.includes(key) || key.includes(roleLower)) {
                return keywords.some(kw => textLower.includes(kw));
            }
        }

        // Fallback: check if the role words appear in the text
        const roleWords = roleLower.split(/\s+/).filter(w => w.length > 2);
        return roleWords.some(w => textLower.includes(w));
    }

    // ── JSearch API Configuration ──
    // Key is passed from parent app via iframe URL param (stored securely in .env)
    const JSEARCH_API_KEY = new URLSearchParams(window.location.search).get('rkey') || '';
    const JSEARCH_API_HOST = 'jsearch.p.rapidapi.com';

    // ── Cache for search results (avoid wasting free API quota) ──
    const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    const CACHE_VERSION = 'v3'; // Bump this to invalidate old caches

    // ── Page tracker: rotate API pages on repeated searches ──
    const pageTracker = {};  // { cacheKey: lastPageUsed }

    function getCacheKey(role, type, workMode, location) {
        return `internbot_${CACHE_VERSION}_${role}_${type}_${workMode}_${location || 'any'}`.toLowerCase().replace(/\s+/g, '_');
    }

    function getCachedResults(key) {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
                sessionStorage.removeItem(key);
                return null;
            }
            console.log('📦 Using cached results for:', key);
            return cached.data;
        } catch (e) { return null; }
    }

    function setCachedResults(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (e) { /* storage full, ignore */ }
    }

    // ── Helper: fetch HTML via CORS proxy (fallback only) ──
    async function fetchViaProxy(url) {
        const corsProxies = [
            (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        ];
        for (const buildProxy of corsProxies) {
            try {
                const response = await fetch(buildProxy(url), { signal: AbortSignal.timeout(8000) });
                if (response.ok) {
                    const html = await response.text();
                    if (html.length > 500) return html;
                }
            } catch (e) {
                console.warn('Proxy failed for', url, e.message);
            }
        }
        return '';
    }

    // ── Extract skills from job description using known skill lists ──
    function extractSkillsFromDescription(description, role) {
        if (!description) return [];

        const roleLower = role.toLowerCase();
        let knownSkills = [];

        // Collect all relevant skill lists
        for (const [key, skills] of Object.entries(SKILL_SUGGESTIONS)) {
            if (roleLower.includes(key) || key.includes(roleLower)) {
                knownSkills = [...skills];
                break;
            }
        }

        // Add common skills across all categories
        const commonSkills = ['Python', 'Java', 'JavaScript', 'SQL', 'Git', 'Docker', 'AWS',
            'React', 'Node.js', 'HTML', 'CSS', 'Excel', 'Communication', 'Teamwork',
            'C++', 'C#', 'Ruby', 'PHP', 'TypeScript', 'MongoDB', 'PostgreSQL', 'MySQL',
            'Firebase', 'REST APIs', 'GraphQL', 'Linux', 'Figma', 'Photoshop',
            'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas',
            'NumPy', 'Tableau', 'Power BI', 'Kotlin', 'Swift', 'Flutter', 'Angular',
            'Vue.js', 'Next.js', 'Django', 'Flask', 'Spring Boot', 'Kubernetes'];

        const allSkills = [...new Set([...knownSkills, ...commonSkills])];
        const descLower = description.toLowerCase();
        const found = [];

        for (const skill of allSkills) {
            // Match whole word (with word boundaries)
            const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            if (regex.test(description)) {
                found.push(skill);
            }
        }

        return [...new Set(found)].slice(0, 8); // Cap at 8 skills
    }

    // ── Calculate days ago from a date string ──
    function calcDaysAgo(dateStr) {
        if (!dateStr) return 7;
        try {
            const posted = new Date(dateStr);
            const now = new Date();
            const diffMs = now - posted;
            return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        } catch (e) { return 7; }
    }

    // ── Format posted date for display ──
    function formatPostedDate(dateStr) {
        const days = calcDaysAgo(dateStr);
        if (days === 0) return 'Posted today';
        if (days === 1) return 'Posted yesterday';
        if (days <= 7) return `Posted ${days} days ago`;
        if (days <= 30) return `Posted ${Math.ceil(days / 7)} weeks ago`;
        return 'Posted recently';
    }

    // ══════════════════════════════════════════
    //  PRIMARY SOURCE: JSearch API (RapidAPI)
    // ══════════════════════════════════════════

    async function fetchFromJSearchAPI(role, type, workMode, location, pageNum = 1) {
        if (!JSEARCH_API_KEY) {
            console.warn('⚠️ JSearch API key not provided — skipping API search');
            return [];
        }

        const query = `${role} internship` + (location ? ` in ${location}` : ' in India');
        const params = new URLSearchParams({
            query: query,
            page: String(pageNum),
            num_pages: '3', // Search 3 pages for diverse platform results
            date_posted: 'month',
            employment_types: 'INTERN',
        });

        // Add remote filter
        if (workMode === 'Remote') {
            params.set('remote_jobs_only', 'true');
        }

        const url = `https://${JSEARCH_API_HOST}/search?${params.toString()}`;

        console.log('🔍 JSearch API query:', query);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': JSEARCH_API_KEY,
                    'x-rapidapi-host': JSEARCH_API_HOST,
                },
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                console.warn('JSearch API error:', response.status, response.statusText);
                return [];
            }

            const data = await response.json();
            const jobs = data.data || [];

            console.log(`✅ JSearch returned ${jobs.length} results`);

            // Find role skills for matching
            const roleLower = role.toLowerCase();
            let roleSkills = null;
            for (const [key, skills] of Object.entries(SKILL_SUGGESTIONS)) {
                if (roleLower.includes(key) || key.includes(roleLower)) {
                    roleSkills = skills;
                    break;
                }
            }
            if (!roleSkills) {
                roleSkills = ['Communication', 'MS Office', 'Problem Solving', 'Teamwork'];
            }

            const internships = [];

            for (const job of jobs) {
                // Very light relevance check — JSearch API already filters by role query + INTERN type
                // Accept almost everything the API returns; only skip truly unrelated jobs
                const titleLower = (job.job_title || '').toLowerCase();
                const descLower = (job.job_description || '').toLowerCase().slice(0, 500);
                const combinedText = titleLower + ' ' + descLower;
                const hasInternKeyword = titleLower.includes('intern') || titleLower.includes('trainee') || titleLower.includes('apprentice') || titleLower.includes('entry') || titleLower.includes('junior');
                const matchesRole = isRelevantToRole(combinedText, role);

                // Only skip if BOTH: no intern keyword AND completely unrelated to the role
                if (!matchesRole && !hasInternKeyword) {
                    console.log('⏭️ Skipping irrelevant:', job.job_title, 'from', job.job_publisher);
                    continue;
                }

                // Work mode filter — only filter for explicit In-Office preference
                // For Remote: the API param remote_jobs_only already handles this
                const isRemoteJob = job.job_is_remote === true;
                if (workMode === 'In-Office' && isRemoteJob) continue;

                // Extract real skills from description
                let actualSkills = [];
                if (job.job_required_skills && job.job_required_skills.length > 0) {
                    actualSkills = job.job_required_skills.slice(0, 8);
                } else {
                    actualSkills = extractSkillsFromDescription(
                        job.job_description || '',
                        role
                    );
                }

                // If no skills extracted, use role-based defaults
                if (actualSkills.length === 0) {
                    const shuffled = [...roleSkills].sort(() => Math.random() - 0.5);
                    actualSkills = shuffled.slice(0, 4);
                }

                // Build location string
                let loc = 'India';
                if (isRemoteJob) {
                    loc = 'Work from Home';
                } else if (job.job_city && job.job_state) {
                    loc = `${job.job_city}, ${job.job_state}`;
                } else if (job.job_city) {
                    loc = job.job_city;
                } else if (job.job_state) {
                    loc = job.job_state;
                } else if (job.job_country) {
                    loc = job.job_country;
                }

                // Determine source platform
                let source = 'JSearch';
                const publisher = (job.job_publisher || '').toLowerCase();
                if (publisher.includes('linkedin')) source = 'LinkedIn';
                else if (publisher.includes('indeed')) source = 'Indeed';
                else if (publisher.includes('glassdoor')) source = 'Glassdoor';
                else if (publisher.includes('ziprecruiter')) source = 'ZipRecruiter';
                else if (publisher.includes('naukri')) source = 'Naukri';
                else if (job.job_publisher) source = job.job_publisher;

                // Hiring status
                const hiringText = job.job_offer_expiration_datetime_utc
                    ? 'Actively hiring'
                    : 'Open position';

                const daysAgo = calcDaysAgo(job.job_posted_at_datetime_utc);

                internships.push({
                    title: job.job_title || `${role} Intern`,
                    company: job.employer_name || 'Company',
                    source: source,
                    location: loc,
                    workMode: isRemoteJob ? 'Remote' : (workMode || 'In-Office'),
                    duration: job.job_employment_type === 'INTERN' ? 'Internship' : 'Apply to see details',
                    stipend: type === 'non-stipend' ? 'Certificate + LOR'
                        : (job.job_min_salary ? `₹${Math.round(job.job_min_salary).toLocaleString()}/mo` : 'Apply to see stipend'),
                    hasStipend: type !== 'non-stipend',
                    posted: formatPostedDate(job.job_posted_at_datetime_utc),
                    daysAgo: daysAgo,
                    requiredSkills: actualSkills,
                    link: job.job_apply_link || job.job_google_link || '#',
                    isReal: true,
                    companyLogo: job.employer_logo || null,
                    hiringStatus: hiringText,
                });

                if (internships.length >= 10) break; // Fetch up to 10 for ranking diversity
            }

            return internships;
        } catch (e) {
            console.warn('JSearch API fetch error:', e);
            return [];
        }
    }

    // ══════════════════════════════════════════════
    //  FALLBACK SOURCE: Internshala CORS Scraping
    // ══════════════════════════════════════════════

    // ── Extract internship from a parsed Internshala link ──
    function extractFromInternshalaLink(link, role, roleSkills, workMode, type, location) {
        const href = link.getAttribute('href');
        if (!href) return null;

        const fullUrl = href.startsWith('http') ? href : `https://internshala.com${href}`;

        // Extract title
        let title = (link.textContent || '').trim();
        if (!title || title.length < 3) {
            const urlParts = href.split('/').pop().replace(/\d+$/, '');
            title = urlParts.split('-internship')[0].replace(/-/g, ' ')
                .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }

        // Relevance check
        const checkText = title + ' ' + href;
        if (!isRelevantToRole(checkText, role)) return null;

        // Work mode filter
        const isWfhListing = href.includes('work-from-home');
        if (workMode === 'In-Office' && isWfhListing) return null;
        if (workMode === 'Remote' && !isWfhListing && href.includes('-internship-in-')) return null;

        // Extract company from URL
        let company = 'Company';
        const atMatch = href.match(/-at-([a-z0-9-]+?)(\d{5,})$/);
        if (atMatch) {
            company = atMatch[1].replace(/-/g, ' ')
                .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }

        // Try DOM company name
        const parent = link.closest('.internship_meta') || link.parentElement;
        if (parent) {
            const companyEl = parent.querySelector('.company_name, .company-name, h4');
            if (companyEl) {
                const compText = companyEl.textContent.trim();
                if (compText && compText.length > 1) company = compText;
            }
        }

        // Extract location
        let internLocation = location || '';
        const locMatch = href.match(/-internship-in-([a-z-]+)-at-/);
        if (locMatch) {
            internLocation = locMatch[1]
                .replace('multiple-locations', 'Multiple Locations')
                .replace(/-/g, ' ')
                .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        if (href.includes('work-from-home')) internLocation = 'Work from Home';

        const numReq = 3 + Math.floor(Math.random() * 3);
        const shuffled = [...roleSkills].sort(() => Math.random() - 0.5);

        return {
            title, company, source: 'Internshala',
            location: internLocation || 'India',
            workMode: workMode || 'All',
            duration: 'Apply to see details',
            stipend: type === 'non-stipend' ? 'Certificate + LOR' : 'Apply to see stipend',
            hasStipend: type !== 'non-stipend',
            posted: 'Recently posted', daysAgo: 1,
            requiredSkills: shuffled.slice(0, numReq),
            link: fullUrl, isReal: true,
        };
    }

    // ── Fallback scraping from Internshala ──
    async function fetchFromInternshalaFallback(role, type, workMode, location) {
        const roleLower = role.toLowerCase();
        let roleSkills = null;
        for (const [key, skills] of Object.entries(SKILL_SUGGESTIONS)) {
            if (roleLower.includes(key) || key.includes(roleLower)) {
                roleSkills = skills;
                break;
            }
        }
        if (!roleSkills) {
            roleSkills = ['Communication', 'MS Office', 'Problem Solving', 'Teamwork', 'Time Management', 'Research'];
        }

        const slug = roleLower.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        const internships = [];
        const seen = new Set();

        try {
            let internshalaUrl = `https://internshala.com/internships/${slug}-internship`;
            if (workMode === 'Remote') {
                internshalaUrl += '/work-from-home';
            } else if (workMode === 'In-Office' && location) {
                internshalaUrl += `-in-${location.toLowerCase().replace(/\s+/g, '-')}`;
            }

            const html = await fetchViaProxy(internshalaUrl);
            if (html) {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const links = doc.querySelectorAll('a[href*="/internship/detail/"]');

                for (const link of links) {
                    if (internships.length >= 5) break;
                    const href = link.getAttribute('href');
                    if (seen.has(href)) continue;

                    const result = extractFromInternshalaLink(link, role, roleSkills, workMode, type, location);
                    if (result) {
                        seen.add(href);
                        internships.push(result);
                    }
                }
            }
        } catch (e) { console.warn('Internshala scrape error:', e); }

        return internships;
    }

    // ══════════════════════════════════════════════════════
    //  MAIN SEARCH: JSearch API + Internshala (parallel)
    // ══════════════════════════════════════════════════════

    async function fetchRealInternships(role, type, workMode, location) {
        const roleLower = role.toLowerCase();
        const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
        const slug = roleLower.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

        // ── Rotate page for repeated searches (never return same results) ──
        const cacheKey = getCacheKey(role, type, workMode, location);
        const lastPage = pageTracker[cacheKey] || 0;
        const nextPage = (lastPage % 5) + 1;  // Cycle through pages 1 → 2 → 3 → 4 → 5
        pageTracker[cacheKey] = nextPage;

        // Clear old cache so fresh results are always fetched
        sessionStorage.removeItem(cacheKey);

        let internships = [];
        const seen = new Set();

        // ── Run JSearch API and Internshala in PARALLEL for speed ──
        console.log(`🚀 Searching JSearch API (page ${nextPage}) + Internshala in parallel...`);
        const [apiResults, scrapedResults] = await Promise.all([
            fetchFromJSearchAPI(role, type, workMode, location, nextPage),
            fetchFromInternshalaFallback(role, type, workMode, location),
        ]);

        // ── Merge JSearch API results (shows LinkedIn, Indeed, Glassdoor, etc.) ──
        for (const result of apiResults) {
            const key = (result.company + '|' + result.title).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                internships.push(result);
            }
        }
        console.log(`📊 JSearch API: ${internships.length} real results from multiple platforms`);

        // ── Merge Internshala results ──
        for (const result of scrapedResults) {
            const key = (result.company + '|' + result.title).toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                internships.push(result);
            }
        }
        console.log(`📊 Total combined: ${internships.length} real internships`);

        // ── Cache results ──
        if (internships.length > 0) {
            setCachedResults(cacheKey, internships);
        }

        return internships;
    }

    // ── Scoring Engine ──
    function calculateMatchScore(internship, userSkills, userWorkMode, userLocation, userDatePref) {
        let score = 0;
        const breakdown = {};

        // 1. Skill match (45%)
        const matchedSkills = [];
        const missingSkills = [];
        const userSkillsLower = userSkills.map(s => s.toLowerCase());

        internship.requiredSkills.forEach(skill => {
            if (userSkillsLower.includes(skill.toLowerCase())) {
                matchedSkills.push(skill);
            } else {
                missingSkills.push(skill);
            }
        });

        const skillScore = internship.requiredSkills.length > 0
            ? (matchedSkills.length / internship.requiredSkills.length) * 45
            : 22;
        score += skillScore;
        breakdown.skills = Math.round(skillScore);

        // 2. Role relevance (25%) — always high since we search by role
        const roleScore = 20 + Math.random() * 5;
        score += roleScore;
        breakdown.role = Math.round(roleScore);

        // 3. Work mode match (15%)
        let workModeScore = 0;
        if (userWorkMode === internship.workMode) {
            workModeScore = 15;
        } else if (userWorkMode === 'Hybrid' || internship.workMode === 'Hybrid') {
            workModeScore = 10;
        } else if (userWorkMode === 'Remote' && internship.workMode === 'Remote') {
            workModeScore = 15;
        } else {
            workModeScore = 5;
        }

        // Location bonus for in-office
        if (userLocation && internship.location.toLowerCase().includes(userLocation.toLowerCase())) {
            workModeScore = Math.min(15, workModeScore + 3);
        }
        score += workModeScore;
        breakdown.workMode = Math.round(workModeScore);

        // 4. Date fit (15%)
        let dateScore = 0;
        if (userDatePref === 'immediate' && internship.daysAgo <= 7) {
            dateScore = 15;
        } else if (userDatePref === '1month' && internship.daysAgo <= 30) {
            dateScore = 13;
        } else if (userDatePref === '3months') {
            dateScore = 12;
        } else if (userDatePref === 'flexible') {
            dateScore = 14;
        } else {
            dateScore = 8;
        }
        score += dateScore;
        breakdown.date = Math.round(dateScore);

        return {
            total: Math.min(100, Math.round(score)),
            breakdown,
            matchedSkills,
            missingSkills,
        };
    }

    // ── Platform link builder ──
    function buildPlatformLink(source, role, company) {
        const roleEncoded = encodeURIComponent(role);
        const query = encodeURIComponent(`${role} internship ${company}`);

        const platformUrls = {
            'LinkedIn': `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role + ' intern ' + company)}&f_E=1`,
            'Internshala': `https://internshala.com/internships/${roleEncoded}-internship`,
            'Indeed': `https://www.indeed.com/jobs?q=${encodeURIComponent(role + ' intern ' + company)}&fromage=14`,
            'Glassdoor': `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${encodeURIComponent(role + ' intern ' + company)}`,
            'Naukri': `https://www.naukri.com/${role.toLowerCase().replace(/\s+/g, '-')}-internship-jobs`,
        };

        return platformUrls[source] || `https://www.linkedin.com/jobs/search/?keywords=${query}&f_E=1`;
    }

    // ── API Config ──
    const API_URL = 'http://localhost:3000/api/search';

    // ── Utility functions ──
    function getTimeString() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatArea.scrollTop = chatArea.scrollHeight;
        });
    }

    // ── Create message row ──
    function createMessageRow(sender, html) {
        const row = document.createElement('div');
        row.className = `message-row ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'bot' ? '✦' : 'U';

        const content = document.createElement('div');
        content.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = html;

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = getTimeString();

        content.appendChild(bubble);
        content.appendChild(time);

        row.appendChild(avatar);
        row.appendChild(content);

        return row;
    }

    // ── Add bot message with typing delay ──
    function addBotMessage(html, delay = 900) {
        return new Promise((resolve) => {
            const typingRow = document.createElement('div');
            typingRow.className = 'message-row bot';
            typingRow.innerHTML = `
                <div class="message-avatar">✦</div>
                <div class="message-content">
                    <div class="message-bubble">
                        <div class="typing-indicator">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            `;
            chatArea.appendChild(typingRow);
            scrollToBottom();

            setTimeout(() => {
                chatArea.removeChild(typingRow);
                const msgRow = createMessageRow('bot', html);
                chatArea.appendChild(msgRow);
                scrollToBottom();
                resolve();
            }, delay);
        });
    }

    // ── Add user message ──
    function addUserMessage(text) {
        const msgRow = createMessageRow('user', escapeHtml(text));
        chatArea.appendChild(msgRow);
        scrollToBottom();
    }

    // ── Show quick replies ──
    function showQuickReplies(options) {
        quickRepliesContainer.innerHTML = '';
        options.forEach((opt) => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.innerHTML = `<span class="qr-emoji">${opt.emoji}</span>${opt.label}`;
            btn.addEventListener('click', () => {
                quickRepliesContainer.innerHTML = '';
                handleUserAction(opt.value);
            });
            quickRepliesContainer.appendChild(btn);
        });
    }

    function clearQuickReplies() {
        quickRepliesContainer.innerHTML = '';
    }

    function setInputEnabled(enabled, placeholder) {
        userInput.disabled = !enabled;
        sendBtn.disabled = !enabled;
        if (placeholder) userInput.placeholder = placeholder;
        if (enabled) userInput.focus();
    }

    // ── Selected skills tracker for multi-select ──
    let selectedSkills = [];

    function showSkillSelector(roleName) {
        const roleLower = roleName.toLowerCase();
        let suggestions = [];
        for (const [key, skills] of Object.entries(SKILL_SUGGESTIONS)) {
            if (roleLower.includes(key) || key.includes(roleLower)) {
                suggestions = skills;
                break;
            }
        }
        if (suggestions.length === 0) {
            suggestions = ['Communication', 'MS Office', 'Problem Solving', 'Teamwork', 'Time Management', 'Research', 'Analytical Skills', 'Presentation'];
        }

        selectedSkills = [];

        // Create skill selector UI in quick replies area
        quickRepliesContainer.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'skill-selector';

        // Selected tags area
        const tagsArea = document.createElement('div');
        tagsArea.className = 'selected-tags';
        tagsArea.id = 'selectedTags';
        wrapper.appendChild(tagsArea);

        // Suggestion chips
        const chipsArea = document.createElement('div');
        chipsArea.className = 'skill-chips';

        suggestions.forEach(skill => {
            const chip = document.createElement('button');
            chip.className = 'skill-chip';
            chip.textContent = skill;
            chip.addEventListener('click', () => {
                toggleSkill(skill, chip);
            });
            chipsArea.appendChild(chip);
        });
        wrapper.appendChild(chipsArea);

        // Done button
        const doneBtn = document.createElement('button');
        doneBtn.className = 'skill-done-btn';
        doneBtn.innerHTML = '✓ Done — Proceed with selected skills';
        doneBtn.addEventListener('click', () => {
            if (selectedSkills.length === 0) {
                doneBtn.textContent = '⚠ Please select at least 1 skill';
                doneBtn.style.borderColor = '#ef4444';
                setTimeout(() => {
                    doneBtn.innerHTML = '✓ Done — Proceed with selected skills';
                    doneBtn.style.borderColor = '';
                }, 1500);
                return;
            }
            quickRepliesContainer.innerHTML = '';
            handleUserAction(selectedSkills.join(', '));
        });
        wrapper.appendChild(doneBtn);

        quickRepliesContainer.appendChild(wrapper);

        // Enable text input for custom skills
        setInputEnabled(true, 'Type a custom skill and press Enter to add...');
        inputHint.textContent = 'Click skills above or type your own, then click Done';
    }

    function toggleSkill(skill, chipEl) {
        const idx = selectedSkills.indexOf(skill);
        if (idx > -1) {
            selectedSkills.splice(idx, 1);
            chipEl.classList.remove('active');
        } else {
            selectedSkills.push(skill);
            chipEl.classList.add('active');
        }
        updateSelectedTags();
    }

    function addCustomSkill(skill) {
        if (!skill || selectedSkills.includes(skill)) return;
        selectedSkills.push(skill);
        updateSelectedTags();
    }

    function updateSelectedTags() {
        const tagsArea = document.getElementById('selectedTags');
        if (!tagsArea) return;

        tagsArea.innerHTML = '';
        if (selectedSkills.length === 0) {
            tagsArea.innerHTML = '<span class="tags-placeholder">Your selected skills will appear here...</span>';
            return;
        }

        selectedSkills.forEach(skill => {
            const tag = document.createElement('span');
            tag.className = 'selected-tag';
            tag.innerHTML = `${escapeHtml(skill)} <span class="tag-remove" data-skill="${escapeHtml(skill)}">×</span>`;
            tag.querySelector('.tag-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                const s = e.target.getAttribute('data-skill');
                selectedSkills = selectedSkills.filter(sk => sk !== s);
                // Deactivate chip if exists
                const chips = document.querySelectorAll('.skill-chip');
                chips.forEach(c => {
                    if (c.textContent === s) c.classList.remove('active');
                });
                updateSelectedTags();
            });
            tagsArea.appendChild(tag);
        });
    }

    // ═══════════════════════════════════
    //  CONVERSATION FLOW
    // ═══════════════════════════════════

    async function startConversation() {
        setInputEnabled(false, '');

        // If not logged in, show login message and block
        if (!isLoggedIn) {
            await addBotMessage(
                `Hey there! 👋 I'm <strong>InternBot</strong> — your AI-powered internship finder.<br><br>` +
                `⚠️ <strong>Please log in first</strong> to use InternBot. Close this window and click the <strong>Login</strong> button to get started.`
                , 600);
            setInputEnabled(false, 'Login required to use InternBot');
            inputHint.textContent = 'Please log in to search for internships';
            return;
        }

        // Show profile button and update UI
        updateProfileUI();

        await addBotMessage(
            `Hey there, <strong>${escapeHtml(currentUser.name)}</strong>! 👋 I'm <strong>InternBot</strong> — your AI-powered internship finder.`
            , 600);

        await addBotMessage(
            `I'll match you with the <strong>top 5 internships</strong> based on your skills and preferences. Let me ask you a few quick questions!`
            , 700);

        await askInternshipType();
    }

    // ── Step 1: Ask type ──
    async function askInternshipType() {
        currentState = STATE.ASK_TYPE;
        setInputEnabled(false, '');
        inputHint.textContent = 'Select an option above';

        await addBotMessage(
            `<strong>What type of internship are you looking for?</strong>`
            , 600);

        showQuickReplies([
            { emoji: '💰', label: 'Stipend-Based', value: 'stipend' },
            { emoji: '🤝', label: 'Non-Stipend (Voluntary)', value: 'non-stipend' },
            { emoji: '🔬', label: 'Research-Based', value: 'research' },
        ]);
    }

    // ── Step 2: Ask role ──
    async function askRole() {
        currentState = STATE.ASK_ROLE;
        clearQuickReplies();
        setInputEnabled(true, 'e.g. Web Development, Data Science, Marketing...');
        inputHint.textContent = 'Type your desired role and press Enter';

        await addBotMessage(
            `<strong>What role are you interested in?</strong><br>Type it below — for example: <em>Web Development</em>, <em>Data Science</em>, <em>Graphic Design</em>, etc.`
            , 700);
    }

    // ── Step 3: Ask skills ──
    async function askSkills() {
        currentState = STATE.ASK_SKILLS;

        await addBotMessage(
            `Great! Now let me understand your skill set 🛠️<br><br><strong>Select the skills you have:</strong><br>Click the skills you know, or type custom ones. This helps me find the best opportunities for you.`
            , 800);

        showSkillSelector(searchParams.role);
    }

    // ── Step 4: Ask date preference ──
    async function askDatePreference() {
        currentState = STATE.ASK_DATE;
        setInputEnabled(false, '');
        inputHint.textContent = 'Select your availability';

        await addBotMessage(
            `⏰ <strong>When are you looking to start?</strong>`
            , 600);

        showQuickReplies([
            { emoji: '⚡', label: 'Immediately', value: 'immediate' },
            { emoji: '📅', label: 'Within 1 month', value: '1month' },
            { emoji: '📆', label: 'Within 3 months', value: '3months' },
            { emoji: '🔄', label: 'Flexible', value: 'flexible' },
        ]);
    }

    // ── Step 5: Ask work mode ──
    async function askWorkMode() {
        currentState = STATE.ASK_WORKMODE;
        setInputEnabled(false, '');
        inputHint.textContent = 'Select your work preference';

        await addBotMessage(
            `🏢 <strong>What's your work mode preference?</strong>`
            , 600);

        showQuickReplies([
            { emoji: '🏠', label: 'Remote', value: 'Remote' },
            { emoji: '🏢', label: 'In-Office', value: 'In-Office' },
            { emoji: '🔀', label: 'Hybrid', value: 'Hybrid' },
        ]);
    }

    // ── Step 5b: Ask location (if in-office/hybrid) ──
    async function askLocation() {
        currentState = STATE.ASK_LOCATION;
        clearQuickReplies();
        setInputEnabled(true, 'e.g. Bangalore, Mumbai, Delhi NCR...');
        inputHint.textContent = 'Type your preferred city and press Enter';

        await addBotMessage(
            `📍 <strong>What's your preferred city for the internship?</strong>`
            , 600);
    }

    // ── Step 6: Perform search ──
    async function performSearch() {
        currentState = STATE.SEARCHING;
        clearQuickReplies();
        setInputEnabled(false, '');

        // Track this search interaction
        trackBotInteraction(
            `Search: ${searchParams.role} (${searchParams.type})`,
            `Skills: ${searchParams.skills.join(', ')} | Mode: ${searchParams.workMode} | Location: ${searchParams.location || 'Any'}`,
            searchParams.type
        );

        // Check credits from parent wallet
        const credits = await requestCreditCheck();
        if (credits < CREDITS_PER_SEARCH) {
            await addBotMessage(
                `⚠️ <strong>Not enough credits!</strong><br><br>` +
                `You need <strong>${CREDITS_PER_SEARCH} credits</strong> per search but have <strong>${credits}</strong> remaining.<br>` +
                `Recharge your wallet from the <strong>Profile</strong> page to continue.`
                , 600);

            showQuickReplies([
                { emoji: '💳', label: 'Recharge Wallet', value: 'buy_searches' }
            ]);
            setInputEnabled(false, '');
            inputHint.textContent = 'Recharge credits to continue searching';
            currentState = STATE.RESULTS;
            return;
        }

        inputHint.textContent = 'Analyzing internships...';

        // Deduct credits from parent wallet
        const deducted = await requestCreditDeduction();
        if (!deducted) {
            await addBotMessage(`⚠️ <strong>Credit deduction failed.</strong> Please try again.`, 600);
            showQuickReplies([{ emoji: '🔄', label: 'Try Again', value: 'restart' }]);
            setInputEnabled(false, '');
            currentState = STATE.RESULTS;
            return;
        }

        const typeLabel = {
            'stipend': '💰 Stipend',
            'non-stipend': '🤝 Non-Stipend',
            'research': '🔬 Research',
        }[searchParams.type];

        const dateLabel = {
            'immediate': '⚡ Immediately',
            '1month': '📅 Within 1 month',
            '3months': '📆 Within 3 months',
            'flexible': '🔄 Flexible',
        }[searchParams.datePreference];

        const locationText = searchParams.location ? ` in ${escapeHtml(searchParams.location)}` : '';

        await addBotMessage(
            `<strong>Your Profile Summary:</strong><br>
            🏷️ Type: ${typeLabel}<br>
            💼 Role: ${escapeHtml(searchParams.role)}<br>
            🛠️ Skills: ${searchParams.skills.map(s => `<span class="inline-skill">${escapeHtml(s)}</span>`).join(' ')}<br>
            ⏰ Start: ${dateLabel}<br>
            🏢 Mode: ${searchParams.workMode}${locationText}<br><br>
            <div class="searching-anim">
                <div class="searching-spinner"></div>
                <span class="searching-text">Deep searching LinkedIn, Indeed, Glassdoor, Internshala & more... This may take 15-25 seconds.</span>
            </div>`
            , 500);

        // Fetch REAL internships via JSearch API + Internshala fallback
        try {
            const internships = await fetchRealInternships(
                searchParams.role,
                searchParams.type,
                searchParams.workMode,
                searchParams.location
            );

            // Score each internship
            const scoredInternships = internships.map(internship => {
                const matchResult = calculateMatchScore(
                    internship,
                    searchParams.skills,
                    searchParams.workMode,
                    searchParams.location,
                    searchParams.datePreference
                );
                return { ...internship, match: matchResult };
            });

            // Sort by score descending
            scoredInternships.sort((a, b) => b.match.total - a.match.total);

            // Show top 5
            const topResults = scoredInternships.slice(0, 5);

            await displayResults(topResults);
        } catch (err) {
            console.error('Search failed:', err);
            await addBotMessage(
                `⚠️ <strong>Search encountered an issue with the job provider.</strong><br>Refunding your ${CREDITS_PER_SEARCH} credits... Please try again.`, 600
            );

            // Refund the deducted credits since API failed
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'DEDUCT_CREDITS', amount: -CREDITS_PER_SEARCH, tool: 'InternBot (Refund)' }, '*');
            }
            walletCredits += CREDITS_PER_SEARCH;

            showQuickReplies([
                { emoji: '🔄', label: 'Try Again', value: 'restart' },
            ]);
            setInputEnabled(false, '');
            inputHint.textContent = 'Select an option to continue';
            currentState = STATE.RESULTS;
        }
    }

    // ── Display rich results (always shows all results passed to it) ──
    async function displayResults(results) {
        currentState = STATE.RESULTS;

        if (!results || results.length === 0) {
            await addBotMessage(
                `<div class="no-results">
                    <div class="no-results-emoji">😔</div>
                    No internships found matching your criteria. Try broadening your search!
                </div>`
                , 800);
        } else {
            // Summary message
            const realCount = results.filter(r => r.isReal).length;
            const summaryText = realCount > 0
                ? `<strong>Found ${results.length} real internships for you! 🎉</strong><br>
                   <span style="color: var(--text-muted); font-size: 0.8rem;">Click any card to apply directly on the platform</span>`
                : `<strong>Found ${results.length} internship sources for you! 🎉</strong><br>
                   <span style="color: var(--text-muted); font-size: 0.8rem;">Click to browse real listings on each platform</span>`;
            await addBotMessage(summaryText, 800);

            // Render each card — all unlocked
            let cardsHtml = `<div class="results-grid">`;

            results.forEach((r, index) => {
                const matchedChips = r.match.matchedSkills.map(s =>
                    `<span class="chip chip-matched">✓ ${escapeHtml(s)}</span>`
                ).join('');

                const missingChips = r.match.missingSkills.map(s =>
                    `<span class="chip chip-missing">✗ ${escapeHtml(s)}</span>`
                ).join('');

                const applyLabel = r.isReal
                    ? `<span style="font-size: 0.7rem; color: var(--accent-end); font-weight: 600;">🔗 Apply on ${escapeHtml(r.source)} →</span>`
                    : `<span style="font-size: 0.7rem; color: var(--text-muted);">🔍 Browse on ${escapeHtml(r.source)} →</span>`;

                const hiringBadge = r.hiringStatus
                    ? `<span style="font-size: 0.65rem; color: #22c55e; font-weight: 600;">${escapeHtml(r.hiringStatus)}</span>`
                    : '';

                const cardContent = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 6px;">
                        <div>
                            <span style="font-weight: 500; font-size: 0.9rem; color: #f4f4f5; display: block;">${escapeHtml(r.title)}</span>
                            <span style="font-size: 0.75rem; color: #a1a1aa;">${escapeHtml(r.company)} ${hiringBadge}</span>
                        </div>
                        <div style="flex-shrink: 0; text-align: right;">
                            ${applyLabel}
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; font-size: 0.72rem; color: #a1a1aa; flex-wrap: wrap;">
                        <span>📍 ${escapeHtml(r.location)}</span>
                        <span>⏳ ${escapeHtml(r.duration)}</span>
                        <span>💰 ${escapeHtml(r.stipend)}</span>
                        <span style="padding: 1px 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; font-size: 0.65rem;">${escapeHtml(r.source)}</span>
                    </div>

                    ${(matchedChips || missingChips) ? `
                    <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; margin-top: 8px; font-size: 0.7rem; color: #a1a1aa;">
                        ${matchedChips ? `<div style="margin-bottom: 3px;">✅ Matches: ${matchedChips}</div>` : ''}
                        ${missingChips ? `<div>📚 Needs: ${missingChips}</div>` : ''}
                    </div>` : ''}
                `;

                cardsHtml += `
                    <a href="${escapeHtml(r.link)}" target="_blank" rel="noopener noreferrer" class="result-card">
                        ${cardContent}
                    </a>`;
            });

            cardsHtml += `</div>`;
            await addBotMessage(cardsHtml, 600);

            // Skill gap summary
            const allMissing = {};
            results.forEach(r => {
                r.match.missingSkills.forEach(s => {
                    allMissing[s] = (allMissing[s] || 0) + 1;
                });
            });
            const topMissing = Object.entries(allMissing)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([skill, count]) => `<strong>${escapeHtml(skill)}</strong> (needed in ${count} listings)`);

            if (topMissing.length > 0) {
                await addBotMessage(
                    `💡 <strong>Skill Gap Insight:</strong> Learning these skills would improve your chances the most:<br><br>` +
                    topMissing.map((s, i) => `${i + 1}. ${s}`).join('<br>')
                    , 800);
            }
        }

        // "Get more" message after results
        const remainingSearches = Math.floor(walletCredits / 2); // 2 credits per search
        const searchInfoMsg = remainingSearches > 0
            ? `📊 You have enough credits for <strong>${remainingSearches} more search${remainingSearches !== 1 ? 'es' : ''}</strong>. Search again to find more internships!`
            : `📊 You are out of credits! <strong>Recharge your wallet from the Profile page</strong> to discover more opportunities!`;

        await addBotMessage(searchInfoMsg, 600);

        // Offer to search again or buy
        const quickOptions = [
            { emoji: '🔄', label: 'New Search', value: 'restart' },
            { emoji: '🛠️', label: 'Update Skills', value: 'update_skills' },
            { emoji: '🔀', label: 'Change Role', value: 'change_role' }
        ];

        if (walletCredits < 2) {
            quickOptions.unshift({ emoji: '💳', label: 'Buy Credits', value: 'buy_searches' });
        }

        showQuickReplies(quickOptions);

        setInputEnabled(false, '');
        inputHint.textContent = 'Select an option to continue';
    }

    // ── Handle user action ──
    function handleUserAction(value) {
        // Track every user action in InternBot
        trackBotInteraction(value, '', currentState);

        switch (currentState) {
            case STATE.ASK_TYPE:
                addUserMessage(
                    value === 'stipend' ? '💰 Stipend-Based' :
                        value === 'non-stipend' ? '🤝 Non-Stipend' :
                            '🔬 Research-Based'
                );
                searchParams.type = value;
                askRole();
                break;

            case STATE.ASK_ROLE:
                addUserMessage(value);
                searchParams.role = value.trim();
                askSkills();
                break;

            case STATE.ASK_SKILLS:
                // value is the comma-separated skills string
                searchParams.skills = value.split(',').map(s => s.trim()).filter(Boolean);
                addUserMessage(`Skills: ${searchParams.skills.join(', ')}`);
                askDatePreference();
                break;

            case STATE.ASK_DATE:
                const dateLabels = {
                    'immediate': '⚡ Immediately',
                    '1month': '📅 Within 1 month',
                    '3months': '📆 Within 3 months',
                    'flexible': '🔄 Flexible',
                };
                addUserMessage(dateLabels[value] || value);
                searchParams.datePreference = value;
                askWorkMode();
                break;

            case STATE.ASK_WORKMODE:
                addUserMessage(`${value === 'Remote' ? '🏠' : value === 'In-Office' ? '🏢' : '🔀'} ${value}`);
                searchParams.workMode = value;
                if (value === 'In-Office' || value === 'Hybrid') {
                    askLocation();
                } else {
                    searchParams.location = null;
                    performSearch();
                }
                break;

            case STATE.ASK_LOCATION:
                addUserMessage(`📍 ${value}`);
                searchParams.location = value.trim();
                performSearch();
                break;

            case STATE.RESULTS:
                if (value === 'restart') {
                    searchParams = { type: null, role: null, skills: [], datePreference: null, workMode: null, location: null };
                    addUserMessage('🔄 New Search');
                    askInternshipType();
                } else if (value === 'update_skills') {
                    addUserMessage('🛠️ Update Skills');
                    askSkills();
                } else if (value === 'change_role') {
                    addUserMessage('🔀 Change Role');
                    searchParams.role = null;
                    searchParams.skills = [];
                    askRole();
                } else if (value === 'buy_searches') {
                    addUserMessage('💳 Recharge Wallet');
                    // Tell the user to go to the main profile
                    addBotMessage(
                        `👛 To recharge credits, open your <strong>Profile & Wallet</strong> from the main SnapAI navbar.<br><br>` +
                        `You can purchase credit packs there and come back to search!`, 600
                    );
                }
                break;
        }
    }

    // ── Text input handler ──
    function handleTextSubmit() {
        const text = userInput.value.trim();
        if (!text) return;

        userInput.value = '';

        if (currentState === STATE.ASK_ROLE) {
            handleUserAction(text);
        } else if (currentState === STATE.ASK_LOCATION) {
            handleUserAction(text);
        } else if (currentState === STATE.ASK_SKILLS) {
            // Add as custom skill
            addCustomSkill(text);
        }
    }

    // ── Event listeners ──
    sendBtn.addEventListener('click', handleTextSubmit);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleTextSubmit();
        }
    });

    // ── Payment modal listeners ──
    document.getElementById('paymentModalClose')?.addEventListener('click', closePaymentModal);
    document.getElementById('paymentCtaBtn')?.addEventListener('click', () => {
        // Placeholder: grant 5 searches for testing (no real payment yet)
        const p = getProfile();
        p.purchasedSearches += 5;
        saveProfile(p);
        updateProfileUI();
        closePaymentModal();
        addBotMessage(
            `✅ <strong>5 searches added!</strong> (Payment gateway coming soon — this is a test grant)<br>` +
            `You now have <strong>${Math.max(0, p.purchasedSearches - p.usedPurchased)} searches</strong> remaining.`
            , 500);
        // Re-show search options
        setTimeout(() => {
            showQuickReplies([
                { emoji: '🔄', label: 'New Search', value: 'restart' },
                { emoji: '🛠️', label: 'Update Skills', value: 'update_skills' },
                { emoji: '🔀', label: 'Change Role', value: 'change_role' },
            ]);
            currentState = STATE.RESULTS;
        }, 600);
    });
    document.getElementById('paymentModal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePaymentModal();
    });

    // ── Profile panel listeners ──
    document.getElementById('profileBtn')?.addEventListener('click', showProfilePanel);
    document.getElementById('profilePanelClose')?.addEventListener('click', closeProfilePanel);
    document.getElementById('profilePanel')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeProfilePanel();
    });
    document.getElementById('profileBuyBtn')?.addEventListener('click', () => {
        closeProfilePanel();
        showPaymentModal();
    });

    // ── Delegate locked card clicks to show payment modal ──
    chatArea.addEventListener('click', (e) => {
        const wrapper = e.target.closest('.blur-card-wrapper[data-locked="true"]');
        if (wrapper) {
            e.preventDefault();
            e.stopPropagation();
            showPaymentModal();
        }
    });

    // ── Start! ──
    startConversation();
})();
