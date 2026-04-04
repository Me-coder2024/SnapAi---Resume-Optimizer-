// Resume Builder AI API — Gemini-powered resume enhancement
// Ported from aksh-1h/resume_builder_aksh analyzer.py

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function callGeminiResume(prompt, modelName = 'gemini-2.5-flash', temperature = 0.4, maxTokens = 1024, isJSON = false) {
    const model = genAI.getGenerativeModel({
        model: modelName, 
    });

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(isJSON && { responseMimeType: "application/json" })
        }
    });
    
    return result.response.text().trim();
}

function cleanJSON(text) {
    if (text.includes('```json')) text = text.split('```json').pop().split('```')[0]
    else if (text.includes('```')) text = text.split('```')[1].split('```')[0]
    return text.trim()
}

/**
 * Convert raw experience text into professional action-oriented bullet points
 */
export async function enhanceExperience(experienceText, targetRole = '') {
    const roleContext = targetRole ? `\nThe resume is targeting a ${targetRole} role. Weave in 2-3 keywords relevant to this role naturally.` : '';
    const prompt = `You are a resume writer who writes like a real human, not AI. Rewrite this experience into EXACTLY 3 to 4 bullet points. NOT MORE, NOT LESS.

CRITICAL RULES:
1. One bullet = one impact. Never combine two achievements in one bullet.
2. Lead with a strong verb, end with a realistic number. 
3. NEVER USE BRACKETS OR VARIABLES. Do NOT write "[Number]", "X", "Y", or "[Metric]". You MUST invent hypothetical but realistic numbers (e.g. 5+, 20%, 3 months) to make the description perfect.
4. Name the actual technology inside the bullet — don't say "built a backend", say "built a Node.js/Express backend".
5. Max 1-2 lines per bullet. If it's longer, cut it. Be CRISPY.
6. Every bullet MUST have exactly ONE number (e.g. processed 1,000+ daily orders, reduced setup time by 65%, serving 100+ users).
7. Do NOT use bold, asterisks, or any markdown formatting. Plain text only.
8. Each bullet must be a COMPLETE sentence.
9. Do NOT reformat technical skills sections. Only process experience descriptions.
${roleContext}

Experience:
${experienceText}

Output ONLY the bullet points, one per line. No numbering, no dashes, no prefixes.`

    try {
        const text = await callGeminiResume(prompt)
        return text.split('\n').filter(b => b.trim()).map(b => b.trim().replace(/^[-*•\d.)]\s*/, '').replace(/\*\*/g, ''))
    } catch (err) {
        console.error('enhanceExperience error:', err)
        return [experienceText]
    }
}

/**
 * Convert project description into professional bullet points
 */
export async function enhanceProject(name, description, targetRole = '') {
    const roleContext = targetRole ? `\nThe resume is targeting a ${targetRole} role. Weave in 2-3 keywords relevant to this role naturally.` : '';
    const prompt = `You are a resume writer who writes like a real human, not AI. Rewrite this project into exactly 2 bullet points.

PROJECT BULLET FORMULA:
- Bullet 1: Built [what] using [specific tech stack] — [scale/metric], [key feature or problem solved]
- Bullet 2: A specific technical decision, problem you solved, or measurable improvement (use X to Y format)

RULES:
1. Start each bullet with a different strong verb: Built, Developed, Engineered, Designed, Implemented, Integrated, Automated, Reduced. NEVER repeat the same verb.
2. Name the EXACT technologies used inside the bullet — "using React.js, Node.js, and PostgreSQL" not just "using modern frameworks".
3. Every bullet MUST have exactly ONE number:
   - Volume: processing 1,000+ daily orders
   - Speed/time saved: reduced from 20 minutes to under 2 minutes
   - Scale: supporting 100+ restaurants
   - Percentage change: cutting support queries by ~40%
4. Max 2 lines per bullet. If it's longer, cut it.
5. Do NOT use bold, asterisks, or markdown. Plain text only.
6. Each bullet must be a COMPLETE sentence — never truncate.
7. HUMAN CHECK: read the bullet out loud. If it sounds like a LinkedIn AI summary, rewrite it. If it could describe anyone's project, make it more specific.
8. NEVER use these phrases: "leveraging", "robust", "scalable architecture", "cutting-edge", "state-of-the-art", "utilized". Just describe what you actually built.
${roleContext}

Project Name: ${name}
Description: ${description}

Output ONLY the 2 bullet points, one per line. No numbering, no dashes, no prefixes.`

    try {
        const text = await callGeminiResume(prompt)
        return text.split('\n').filter(b => b.trim()).map(b => b.trim().replace(/^[-*•\d.)]\s*/, '').replace(/\*\*/g, ''))
    } catch (err) {
        console.error('enhanceProject error:', err)
        return [description]
    }
}

/**
 * Categorize skills into Language / Framework / Developer Tools / Libraries
 */
// Skills that should be filtered out — not real technologies
const SKILL_BLOCKLIST = ['config', 'github-config', '.env', 'readme', 'license', 'docs', 'documentation', 'settings', 'preferences'];

export async function categorizeSkills(skillsList, targetRole = '') {
    // Pre-filter blocklisted items
    const filtered = skillsList.filter(s => !SKILL_BLOCKLIST.includes(s.toLowerCase().trim()));
    if (!filtered.length) return {}

    const prompt = `Categorize the following skills into these categories:
- Languages
- Frameworks
- Databases
- Developer Tools
- Libraries
- Cloud/DevOps

RULES:
1. ONLY use the skills provided below. Do NOT add, suggest, or invent any new skills. Only categorize what is given.
2. Filter out any items that are NOT real technologies, tools, or skills (e.g., "config", "github-config", ".env", "readme" are NOT valid skills)
3. Ensure all skills are properly capitalized (e.g., "javascript" → "JavaScript", "react" → "React")
4. If a category has zero skills from the list, omit that category entirely.

Return the result strictly as a valid JSON object where the keys are the categories above, and the values are lists of strings.
Do not wrap the JSON in markdown code blocks or add any other text.

Skills to categorize:
${filtered.join(', ')}`

    try {
        const text = await callGeminiResume(prompt)
        return JSON.parse(cleanJSON(text))
    } catch (err) {
        console.error('categorizeSkills error:', err)
        return { Skills: filtered }
    }
}

/**
 * Parse raw pasted resume text into structured JSON
 */
export async function parseResumeText(rawText) {
    const prompt = `You are an expert resume data extractor. Extract the following information from the provided raw text of a resume and output it strictly as a JSON object.

The required JSON structure is:
{
    "name": "Full Name",
    "phone": "Phone number",
    "email": "Email address",
    "linkedin": "LinkedIn profile URL if any",
    "github": "GitHub profile URL if any",
    "summary": "Professional summary if present",
    "education": [{"institution": "University Name", "degree": "Degree Title", "date": "Date Range", "gpa": "GPA if mentioned"}],
    "experience": [{"company": "Company Name", "title": "Job Title", "date": "Date Range", "location": "Location", "bullets": ["bullet 1", "bullet 2", "bullet 3"]}],
    "projects": [{"name": "Project Name", "description": "Project Description", "technologies": "Tech used", "link": "Project Link if any", "bullets": ["bullet 1", "bullet 2"]}],
    "skills": ["Skill 1", "Skill 2"],
    "certifications": ["Certification 1"]
}

IMPORTANT RULES:
- If a field is not found in the resume, use an empty string "" or empty array [].
- Extract ALL education entries, ALL experience entries, ALL projects, and ALL skills.
- For skills, split comma-separated lists into individual items.
- Each experience entry should have EXACTLY 2-3 bullet points (max 4 only if truly needed). Keep bullets SHORT and punchy — max 1-2 lines each.
- Each project should have EXACTLY 2 bullet points. Concise and impactful.
- Output ONLY the JSON object. No markdown, no backticks, no explanation.

Raw Resume Text:
${rawText}`

    // Attempt parsing with retries
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const text = await callGeminiResume(prompt, 'gemini-2.5-flash', 0.1, 8192, true)
            
            // Try multiple JSON extraction strategies
            let jsonStr = text.trim()
            
            // Strategy 1: Remove markdown wrappers
            if (jsonStr.includes('```json')) {
                jsonStr = jsonStr.split('```json').pop().split('```')[0].trim()
            } else if (jsonStr.includes('```')) {
                jsonStr = jsonStr.split('```')[1]?.split('```')[0]?.trim() || jsonStr
            }
            
            // Strategy 2: Find first { and last }
            const firstBrace = jsonStr.indexOf('{')
            const lastBrace = jsonStr.lastIndexOf('}')
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
            }

            const parsed = JSON.parse(jsonStr)
            return parsed
        } catch (err) {
            console.error(`parseResumeText attempt ${attempt + 1} error:`, err)
            if (attempt === 1) return null // Give up after 2nd attempt
        }
    }
    return null
}

/**
 * Generate a professional summary from structured resume data
 */
export async function generateSummary(data) {
    const targetRole = data.personal?.targetRole || data.targetRole || '';
    const expEntries = (data.experience || []).filter(e => e.company || e.title);
    const projEntries = (data.projects || []).filter(p => p.name);
    const eduEntries = (data.education || []).filter(e => e.institution);
    const skillsList = (data.skills || []).join(', ');

    const prompt = `Write a professional summary for a resume. It must sound like a real human — like someone introducing themselves confidently in an interview.

HARD LENGTH REQUIREMENT:
- You MUST write 4-5 sentences. NEVER less than 4 sentences.
- The total output MUST be at least 250 characters long.
- Each sentence must be complete and end with a period.
- If your output is shorter than 4 sentences or under 250 characters, you have FAILED. Try again.

THE 5-SENTENCE STRUCTURE:
- Sentence 1: Job title + years/months of experience + 2-3 specific technologies you work with
- Sentence 2: Your biggest achievement or what you built — must include a real number (clients, users, projects, revenue, etc.)
- Sentence 3: Technical depth — mention specific tools, frameworks, or areas you specialise in (APIs, databases, cloud, ML, etc.)
- Sentence 4: A leadership or impact statement — team size, projects delivered, or scale of work
- Sentence 5: What you're currently doing + what kind of role you're looking for

You can merge sentences 3-4 into one if it flows naturally, but NEVER go below 4 sentences total.

EXAMPLE OF CORRECT OUTPUT (this is the MINIMUM acceptable length):
"Full-Stack Developer and Founder with 1+ year of experience building production web applications using React.js, Node.js, and PostgreSQL. Founded Grovia Techworks, a web development agency, delivering 6+ projects for 8+ clients with a 100% on-time delivery rate. Experienced in building REST APIs, integrating payment gateways, and deploying applications with real-time features serving 1,000+ users. Comfortable working across the full stack from database design to frontend UI, with hands-on experience in Python, TensorFlow, and NLP for AI-driven tools. Currently pursuing B.Tech in CSE at Parul University while actively seeking full-stack developer or product engineering roles."

FORMULA:
[Job title] with [X years/months] of experience building [what] using [tech]. [Achievement with number]. [Technical depth — APIs, databases, deployment, AI]. [Scale/leadership]. Currently [situation] and looking for [role type].

ATS KEYWORD RULE:
Weave in 4-5 keywords matching the target role naturally — don't list them. For example: "full-stack development", "REST APIs", "database design", "cloud deployment", "agile".

BANNED PHRASES (sound like AI — never use):
- "Dynamic professional", "Strong foundation", "Seeking to leverage", "Results-driven", "Proven track record", "Seasoned professional", "Dedicated to", "Committed to delivering", "Passionate about", "Experienced in delivering high-quality"
- Any adjective without a number to back it up

HUMAN TEST: Read it out loud. Does it sound like what you'd actually say in an interview when asked "Tell me about yourself"? If not, rewrite it.

Candidate info:
- Target Role: ${targetRole || 'Software Engineer'}
- Experience: ${expEntries.map(e => `${e.title || 'Role'} at ${e.company || 'Company'} (${e.date || ''})`).join('; ') || 'N/A'}
- Skills: ${skillsList || 'N/A'}
- Education: ${eduEntries.map(e => `${e.degree} from ${e.institution}`).join('; ') || 'N/A'}
- Projects built: ${projEntries.map(p => `${p.name}${p.technologies ? ' (' + p.technologies + ')' : ''}`).join(', ') || 'N/A'}
- Total projects: ${projEntries.length}

Write ONLY the summary paragraph (4-5 sentences, 250+ characters). No labels, no headings, no explanations. Plain text only, no bold or markdown.`

    try {
        let summary = await callGeminiResume(prompt, 'gemini-2.5-flash', 0.7, 512)
        summary = summary.replace(/\*\*/g, '').replace(/\*/g, '')
        if (summary && !summary.endsWith('.') && !summary.endsWith('!') && !summary.endsWith('?')) {
            summary += '.'
        }

        // Retry if too short (under 200 chars or fewer than 3 sentences)
        const sentenceCount = (summary.match(/[.!?]\s/g) || []).length + 1
        if (summary.length < 200 || sentenceCount < 3) {
            console.warn('Summary too short (' + summary.length + ' chars, ' + sentenceCount + ' sentences), retrying...')
            let retry = await callGeminiResume(
                prompt + '\n\nCRITICAL: Your previous output was WAY too short. Write AT LEAST 4-5 full sentences, minimum 250 characters. Look at the example — match that length.',
                'gemini-2.5-flash', 0.8, 512
            )
            retry = retry.replace(/\*\*/g, '').replace(/\*/g, '')
            if (retry && !retry.endsWith('.') && !retry.endsWith('!') && !retry.endsWith('?')) {
                retry += '.'
            }
            if (retry.length > summary.length) {
                summary = retry
            }
        }

        return summary
    } catch (err) {
        console.error('generateSummary error:', err)
        return ''
    }
}

/**
 * Fetch LinkedIn profile data using Apify scraper (curious_coder actor)
 * Requires LinkedIn li_at cookie stored in VITE_LINKEDIN_COOKIE
 * Returns { education, experience, skills } in resume-ready format
 */
export async function fetchLinkedInProfile(linkedinUrl) {
    if (!linkedinUrl) throw new Error('LinkedIn URL is required');

    // Normalize the URL
    let profileUrl = linkedinUrl.trim();
    if (!profileUrl.startsWith('http')) profileUrl = `https://${profileUrl}`;
    if (!profileUrl.includes('linkedin.com/in/')) {
        throw new Error('Please enter a valid LinkedIn profile URL (e.g., linkedin.com/in/yourname)');
    }

    const APIFY_TOKEN = import.meta.env.VITE_APIFY_API_KEY;
    if (!APIFY_TOKEN) throw new Error('Apify API key is not configured');

    const LINKEDIN_COOKIE = import.meta.env.VITE_LINKEDIN_COOKIE;
    if (!LINKEDIN_COOKIE || LINKEDIN_COOKIE === 'PASTE_YOUR_LI_AT_COOKIE_HERE') {
        throw new Error('LinkedIn cookie is not configured. Please add your li_at cookie to the .env file.');
    }

    // Use the curious_coder actor which reliably returns correct profile data
    const ACTOR_ID = 'curious_coder~linkedin-profile-scraper';
    const apiUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cookie: [{ name: 'li_at', value: LINKEDIN_COOKIE, domain: '.linkedin.com' }],
            urls: [profileUrl],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            proxy: {
                useApifyProxy: true,
                apifyProxyGroups: ['RESIDENTIAL'],
                apifyProxyCountry: 'US'
            },
            minDelay: 2,
            maxDelay: 5
        })
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error('Apify error response:', errText);
        throw new Error(`LinkedIn scraper failed (${response.status}). Check your Apify quota and cookie.`);
    }

    const results = await response.json();
    console.log('LinkedIn API raw response:', JSON.stringify(results).substring(0, 500));

    if (!results || results.length === 0) {
        throw new Error('No data returned from LinkedIn. The profile may be private or your cookie may have expired.');
    }

    const profile = results[0];
    console.log('LinkedIn profile keys:', Object.keys(profile));

    // Map education data — curious_coder uses: educations array with schoolName, degree, fieldOfStudy, dateRange
    const rawEducation = profile.educations || profile.education || [];
    const education = rawEducation.map(edu => {
        const degreeParts = [];
        if (edu.degreeName || edu.degree_name || edu.degree) degreeParts.push(edu.degreeName || edu.degree_name || edu.degree);
        if (edu.fieldOfStudy || edu.field_of_study) degreeParts.push(edu.fieldOfStudy || edu.field_of_study);
        const degreeStr = degreeParts.length > 0 ? degreeParts.join(' in ') : '';

        return {
            institution: edu.schoolName || edu.school || edu.institutionName || '',
            degree: degreeStr,
            date: edu.dateRange || edu.duration || edu.timePeriod || '',
            gpa: edu.grade || ''
        };
    }).filter(e => e.institution);

    // Map experience data — curious_coder uses: positions or experience array
    const rawExperience = profile.positions || profile.experience || [];
    const experience = rawExperience.map(exp => {
        let dateStr = exp.dateRange || exp.duration || '';
        if (!dateStr && exp.startDate) {
            dateStr = `${exp.startDate} — ${exp.endDate || 'Present'}`;
        }

        return {
            company: exp.companyName || exp.company || '',
            title: exp.title || exp.position || '',
            date: dateStr,
            location: exp.location || '',
            description: exp.description || '',
            bullets: []
        };
    }).filter(e => e.company || e.title);

    // Extract skills
    const rawSkills = (profile.skills || []).map(s =>
        typeof s === 'string' ? s : (s.name || s.skill || s.title || '')
    ).filter(Boolean);

    // Also try top skills from profile summary
    const topSkills = profile.topSkills || [];

    const allSkills = [...new Set([...rawSkills, ...topSkills])];

    return { education, experience, skills: allSkills };
}

/**
 * Extract GitHub username from a URL or return as-is if it's just a username
 */
function extractGitHubUsername(input) {
    if (!input) return null;
    // Handle URLs like https://github.com/username or github.com/username
    const match = input.match(/(?:github\.com\/)?([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : input.trim();
}

/**
 * Fetch public repositories from GitHub and format as resume projects
 */
export async function fetchGitHubProjects(githubInput, maxRepos = 6) {
    const username = extractGitHubUsername(githubInput);
    if (!username) throw new Error('Invalid GitHub username or URL');

    const response = await fetch(
        `https://api.github.com/users/${username}/repos?sort=updated&per_page=30&type=owner`
    );
    if (!response.ok) {
        if (response.status === 404) throw new Error(`GitHub user "${username}" not found`);
        throw new Error('Failed to fetch GitHub repositories');
    }

    const repos = await response.json();
    // Filter out forks and pick top repos by stars + recency
    const ownRepos = repos
        .filter(r => !r.fork && (r.description || r.language))
        .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
        .slice(0, maxRepos);

    if (ownRepos.length === 0) throw new Error('No public repositories found');

    // Format into resume project entries
    const projects = ownRepos.map(repo => {
        const technologies = [repo.language, ...(repo.topics || [])]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i) // dedupe
            .join(', ');

        return {
            name: repo.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            description: repo.description || '',
            technologies: technologies || '',
            link: repo.html_url || '',
            bullets: []
        };
    });

    // Now use AI to generate bullet points for each project IN PARALLEL (much faster)
    const enhancedProjects = await Promise.all(
        projects.map(async (proj) => {
            try {
                const desc = proj.description || `A ${proj.technologies} project`;
                const bullets = await enhanceProject(proj.name, desc);
                return { ...proj, bullets };
            } catch {
                return proj;
            }
        })
    );

    // Also collect all languages/topics as potential skills
    const skills = [...new Set(
        repos.flatMap(r => [r.language, ...(r.topics || [])]).filter(Boolean)
    )];

    return { projects: enhancedProjects, skills };
}

/**
 * Auto-generate professional bullet points for projects that are missing descriptions
 */
export async function generateProjectBullets(projects) {
    const enhanced = [];
    for (const proj of projects) {
        if (!proj.name) { enhanced.push(proj); continue; }
        if (proj.bullets && proj.bullets.length > 0) { enhanced.push(proj); continue; }

        try {
            const desc = proj.description || `A ${proj.technologies || 'software'} project called ${proj.name}`;
            const bullets = await enhanceProject(proj.name, desc);
            const description = proj.description || await callGeminiResume(
                `Write a single concise 1-sentence description for a software project called "${proj.name}" that uses ${proj.technologies || 'various technologies'}. Output ONLY the sentence, nothing else.`,
                'gemini-2.5-flash', 0.5, 100
            );
            enhanced.push({ ...proj, bullets, description: proj.description || description });
        } catch {
            enhanced.push(proj);
        }
    }
    return enhanced;
}

/**
 * Auto-generate missing experience bullet points
 */
export async function generateExperienceBullets(experiences) {
    const enhanced = [];
    for (const exp of experiences) {
        if (!exp.company && !exp.title) { enhanced.push(exp); continue; }
        if (exp.bullets && exp.bullets.length > 0) { enhanced.push(exp); continue; }

        try {
            const desc = exp.description || `${exp.title || 'Role'} at ${exp.company || 'Company'}`;
            const bullets = await enhanceExperience(desc);
            enhanced.push({ ...exp, bullets });
        } catch {
            enhanced.push(exp);
        }
    }
    return enhanced;
}

/**
 * AI Chat for conversational resume building
 */
export async function chatResumeAssistant(userMessage, history = []) {
    const systemPrompt = `You are an AI Resume Building Assistant. Your job is to help users build a professional resume through a friendly, guided conversation.

IMPORTANT FORMATTING RULES:
- Use **bold text** (double asterisks) for emphasis, section names, and labels.
- Use numbered lists (1. 2. 3.) when asking for multiple pieces of information.
- Use bullet points (- or •) for listing examples or options.
- Keep your questions clear and specific — always tell the user exactly what you need.
- After collecting info, give a neat summary using bold labels before moving to the next section.
- Break your messages into short paragraphs with line breaks for readability.
- Provide short examples or suggestions in parentheses to help the user understand what to write.
- NEVER output raw JSON or code blocks to the user in your visible message — only include them as hidden resume_data blocks.

You will guide the user step-by-step through the resume building process:

**Step 1 — Personal Information**
Ask for: Full Name, Email, Phone, LinkedIn URL, GitHub URL.
Example question: "What's your **full name**? And could you share your **email**, **phone number**, and links to your **LinkedIn** and **GitHub** profiles?"

**Step 2 — Education**
Ask for: Institution name, Degree/Major, Graduation date range, GPA (optional).
Example: "Where did you study? Please share your **university name**, **degree** (e.g., B.Tech in Computer Science), **dates attended** (e.g., Aug 2020 — May 2024), and **GPA** if you'd like to include it."

**Step 3 — Work Experience**
Ask for: Company, Job Title, Date range, Location, Key responsibilities.
Example: "Tell me about your work experience. For each role, please share:\n1. **Company Name**\n2. **Your Job Title**\n3. **Duration** (e.g., Jun 2023 — Present)\n4. **Location** (e.g., Remote / Bangalore, India)\n5. **What you did** — a brief description of your responsibilities and achievements."

**Step 4 — Projects**
MANDATORY: When transitioning to the projects section, you MUST ALWAYS ask about GitHub import FIRST before asking for manual project details. This is non-negotiable.

BEHAVIOR WHEN REACHING PROJECTS:
1. If the user provided a GitHub URL/username in Step 1, you MUST say:
   "💻 **Now let's add your Projects!**\n\nI see you shared your GitHub profile earlier! 🎉 I can **automatically import your top projects from GitHub** and generate professional bullet points for each one.\n\n**Would you like me to import your projects from GitHub?** Just say **'yes'** or **'import from GitHub'** and I'll handle everything! 🚀\n\nOr if you prefer, you can share your projects manually instead."

2. If the user did NOT provide a GitHub URL in Step 1, you MUST say:
   "💻 **Now let's add your Projects!**\n\nDo you have a **GitHub profile**? I can **automatically import your top projects** and generate professional bullet points — it's the fastest way to fill this section! 🚀\n\nJust share your **GitHub username or profile URL** and say **'import from GitHub'**.\n\nOr if you prefer, you can share your projects manually."

3. If the user says they don't have projects, can't think of any, says "no", "skip", "none", or anything similar — DO NOT skip this section. Instead, ask:
   "No worries! Do you have a **GitHub profile**? Even class assignments or personal experiments count as projects! I can **automatically import your top repos from GitHub** and format them professionally for your resume! 🚀\n\nJust share your **GitHub username or URL** and say **'import from GitHub'**."

4. If the user says "yes", "import", "import from GitHub", "fetch from GitHub", "use my GitHub", "yes import", or anything affirming GitHub import, respond with:
   "🔄 **Importing your projects from GitHub...** I'll fetch your top repositories and generate professional bullet points for your resume!"
   Then output a resume_data block with:
   \`\`\`resume_data
   {"section": "github_import", "data": {"action": "import"}}
   \`\`\`

5. If the user provides a GitHub URL/username at this point (even without explicitly saying "import"), treat it as a GitHub import request and respond with the import message above.

If the user wants to share projects manually instead, ask for each project:
1. **Project Name**
2. **Brief Description** — what it does and why you built it
3. **Technologies Used** (e.g., React, Node.js, Python)
4. **Link** (GitHub/live demo, if available)

If the user shares a project without a description, ASK them for more details:
"I noticed you didn't share a description for **[Project Name]**. Could you briefly tell me:\\n- **What does it do?**\\n- **What problem does it solve?**\\n- **What was your role / key contributions?**\\n\\nThis will help me write impactful bullet points for your resume!"

**Step 5 — Skills**
Ask for: Technical skills, tools, languages, frameworks.
If skills were already collected from GitHub import, show them and ask if the user wants to add more.
Example: "List your **technical skills** separated by commas (e.g., Python, JavaScript, React, Docker, AWS, Git)."

**Step 6 — Professional Summary**
Offer to generate one or let them write their own.
Example: "Would you like me to **generate a professional summary** based on everything we've collected? Or would you prefer to write your own?"

**Step 7 — Completion**
After you have collected ALL sections (Personal Info, Education, Experience, Projects, Skills, and Summary), you MUST:
1. Give a congratulatory message summarizing what was built
2. Include the exact phrase [RESUME_COMPLETE] somewhere in your message (this triggers the download button on the frontend)
3. Tell the user their resume is ready to download and it costs 20 credits

Example completion message:
"🎉 **Your resume is complete!** Here's what we've built together:\\n\\n✅ Personal Information\\n✅ Education\\n✅ Work Experience\\n✅ Projects\\n✅ Skills\\n✅ Professional Summary\\n\\nYour professional resume is ready! Click the **Download PDF** button below to get your ATS-optimized resume. (Costs 20 credits)\\n\\n[RESUME_COMPLETE]"

After each step, provide a clear, formatted summary of what you collected using bold labels, then ask:
"✅ **Got it!** Here\'s what I have for [section name]:\n- **Field**: value\n- **Field**: value\n\nDoes this look correct? Say **'yes'** to continue to the next section, or let me know what to change."

When you have enough information for a section, output a JSON block wrapped in triple backticks with the tag "resume_data" containing the structured data.
Format expectations:
- "personal" data should be an object: {"name": "...", "email": "...", "phone": "...", "linkedin": "...", "github": "..."}
- "education" data should be an ARRAY of objects: [{"institution": "...", "degree": "...", "date": "...", "gpa": "..."}]
- "experience" data should be an ARRAY of objects: [{"company": "...", "title": "...", "date": "...", "location": "...", "description": "...", "bullets": ["..."]}]
- "projects" data should be an ARRAY of objects: [{"name": "...", "technologies": "...", "link": "...", "description": "...", "bullets": ["..."]}]
- "skills" data should be an ARRAY of strings: ["React", "Python", ...]
- "summary" data should be a string: "Experienced software engineer..."

Example usage:
\`\`\`resume_data
{"section": "education", "data": [{"institution": "MIT", "degree": "B.S. Computer Science", "date": "2020-2024", "gpa": "3.9"}]}
\`\`\`

Be warm, encouraging, and professional. Use emojis sparingly (✅, 📝, 🎓, 💼, 💻, 🛠️) to make the conversation feel friendly.`;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
    });

    const chatHistory = [];
    for (const msg of history) {
        let currentRole = msg.role === 'ai' ? 'model' : 'user';
        if (chatHistory.length === 0 && currentRole === 'model') {
            chatHistory.push({ role: 'user', parts: [{ text: "Hello" }] });
        }
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === currentRole) {
            chatHistory[chatHistory.length - 1].parts[0].text += "\n\n" + msg.content;
            continue;
        }
        chatHistory.push({ role: currentRole, parts: [{ text: msg.content }] });
    }

    const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
        }
    });

    const result = await chat.sendMessage(userMessage);
    return result.response.text().trim();
}

export async function chatResumeEditor(userMessage, resumeData, history = []) {
    const systemPrompt = `You are an AI Resume Editor. The user is currently previewing their resume and wants to make specific changes.

You have access to their current resume data (provided below).
Listen to the user's request (e.g., "add a bullet point to my second project", "change my target role to Software Engineer", "rewrite my summary").

If the request is a valid resume modification, you MUST:
1. Make the necessary update.
2. Output a markdown block with the \`resume_data\` tag containing the exact JSON structure for the section you modified.

FORMAT EXPECTATIONS FOR 'resume_data' OUTPUT:
- If modifying 'personal', return: {"section": "personal", "data": {"name": "...", "targetRole": "...", "email": "...", "phone": "...", "linkedin": "...", "github": "..."}}
- If modifying 'education', return the FULL UPDATED ARRAY: {"section": "education", "data": [{"institution": "...", "degree": "...", "date": "...", "gpa": "..."}]}
- If modifying 'experience', return the FULL UPDATED ARRAY: {"section": "experience", "data": [{"company": "...", "title": "...", "date": "...", "location": "...", "description": "...", "bullets": ["..."]}]}
- If modifying 'projects', return the FULL UPDATED ARRAY: {"section": "projects", "data": [{"name": "...", "technologies": "...", "link": "...", "description": "...", "bullets": ["..."]}]}
- If modifying 'skills', return the FULL UPDATED ARRAY: {"section": "skills", "data": ["React", "Python", ...]}
- If modifying 'summary', return the string: {"section": "summary", "data": "Updated summary text..."}

CRITICAL RULES:
- When updating arrays (experience, projects, education, skills), ALWAYS return the ENTIRE updated array, not just the single item changed.
- For Experience and Projects, enforce that each description should have EXACTLY 3-4 bullet points. No bracket placeholders like [Number] or [Metric] - invent hypothetical realistic numbers if needed to make the description perfect.
- Provide a brief, friendly confirmation message to the user explaining what you updated.
- NEVER output raw JSON outside the \`resume_data\` block.
- If the user explicitly asks to download, build, or print their resume, you MUST include the exact string \`[DOWNLOAD]\` in your response message to trigger the UI download button.

CURRENT RESUME DATA:
${JSON.stringify(resumeData, null, 2)}
`;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
    });

    const chatHistory = [];
    for (const msg of history) {
        let currentRole = msg.role === 'ai' ? 'model' : 'user';
        if (chatHistory.length === 0 && currentRole === 'model') {
            chatHistory.push({ role: 'user', parts: [{ text: "Hello" }] });
        }
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === currentRole) {
            chatHistory[chatHistory.length - 1].parts[0].text += "\n\n" + msg.content;
            continue;
        }
        chatHistory.push({ role: currentRole, parts: [{ text: msg.content }] });
    }

    const chat = model.startChat({
        history: chatHistory,
        generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048
        }
    });

    const result = await chat.sendMessage(userMessage);
    return result.response.text().trim();
}

/**
 * Final ATS optimization pass — fixes all common ATS issues before PDF download
 */
export async function atsOptimizeResume(resumeData) {
    const data = JSON.parse(JSON.stringify(resumeData)); // deep clone
    const targetRole = data.personal?.targetRole || '';

    // 1. Fix summary — ensure complete, no bold, ends with period
    if (data.summary) {
        data.summary = data.summary.replace(/\*\*/g, '').replace(/\*/g, '');
        if (!data.summary.endsWith('.') && !data.summary.endsWith('!') && !data.summary.endsWith('?')) {
            data.summary += '.';
        }
    } else if (data.experience?.some(e => e.company || e.title) || data.skills?.length > 0) {
        // Auto-generate summary if missing
        data.summary = await generateSummary(data);
    }

    // 2. Fix LinkedIn/GitHub — ensure they are actual URLs
    if (data.personal?.linkedin) {
        const li = data.personal.linkedin.trim();
        if (li.toLowerCase() === 'linkedin' || !li.includes('/')) {
            data.personal.linkedin = ''; // Clear non-URL values
        } else if (!li.startsWith('http')) {
            data.personal.linkedin = `https://${li}`;
        }
    }
    if (data.personal?.github) {
        const gh = data.personal.github.trim();
        if (gh.toLowerCase() === 'github' || (!gh.includes('/') && !gh.includes('.'))) {
            // Keep as username for API calls but format as URL for display
            if (gh.toLowerCase() !== 'github') {
                data.personal.github = `https://github.com/${gh}`;
            } else {
                data.personal.github = '';
            }
        } else if (!gh.startsWith('http')) {
            data.personal.github = `https://${gh}`;
        }
    }

    // 3. Strip bold from ALL bullet points
    const stripBold = (text) => text.replace(/\*\*/g, '').replace(/\*/g, '');
    data.experience = (data.experience || []).map(exp => ({
        ...exp,
        bullets: (exp.bullets || []).map(stripBold),
        description: exp.description ? stripBold(exp.description) : ''
    }));
    data.projects = (data.projects || []).map(proj => ({
        ...proj,
        bullets: (proj.bullets || []).map(stripBold),
        description: proj.description ? stripBold(proj.description) : ''
    }));

    // 4. Generate missing project bullets
    for (let i = 0; i < data.projects.length; i++) {
        const proj = data.projects[i];
        if (proj.name && (!proj.bullets || proj.bullets.length === 0)) {
            try {
                const desc = proj.description || `A ${proj.technologies || 'software'} project called ${proj.name}`;
                const bullets = await enhanceProject(proj.name, desc, targetRole);
                data.projects[i].bullets = bullets;
                if (!proj.description) {
                    data.projects[i].description = await callGeminiResume(
                        `Write a single concise 1-sentence description for a software project called "${proj.name}" that uses ${proj.technologies || 'various technologies'}. Output ONLY the sentence, nothing else. No markdown, no bold.`,
                        'gemini-2.5-flash', 0.5, 100
                    );
                }
            } catch { /* continue */ }
        }
    }

    // 5. Generate missing experience bullets
    for (let i = 0; i < data.experience.length; i++) {
        const exp = data.experience[i];
        if ((exp.company || exp.title) && (!exp.bullets || exp.bullets.length === 0)) {
            try {
                const desc = exp.description || `${exp.title || 'Role'} at ${exp.company || 'Company'}`;
                const bullets = await enhanceExperience(desc, targetRole);
                data.experience[i].bullets = bullets;
            } catch { /* continue */ }
        }
    }

    // 6. Filter non-tech skills
    data.skills = (data.skills || []).filter(s => !SKILL_BLOCKLIST.includes(s.toLowerCase().trim()));

    // 7. Detect and fix truncated bullets (ending mid-sentence without proper punctuation)
    const isTruncated = (bullet) => {
        if (!bullet || bullet.length < 20) return false;
        const trimmed = bullet.trim();
        // Truncated if ends with: comma, common prepositions, articles, or no sentence-ending punctuation
        if (/,\s*$/.test(trimmed)) return true;
        if (/\b(and|the|a|an|for|of|by|to|in|with|using|from|through|across|reducing|improving|automating|integrating|processing|achieving|enabling|supporting|leveraging|delivering|implementing|building|managing|providing|ensuring|maintaining|serving|handling|generating|creating|developing|designing|engineering|deploying|configuring|optimizing)\s*$/i.test(trimmed)) return true;
        if (!/[.!?)"]\s*$/.test(trimmed) && trimmed.length > 50) return true;
        return false;
    };

    // Fix truncated experience bullets
    for (let i = 0; i < data.experience.length; i++) {
        const exp = data.experience[i];
        if (exp.bullets && exp.bullets.some(isTruncated)) {
            try {
                const desc = exp.bullets.join('. ') + (exp.description ? '. ' + exp.description : '');
                const fixedBullets = await enhanceExperience(
                    `${exp.title || 'Role'} at ${exp.company || 'Company'}: ${desc}`,
                    targetRole
                );
                data.experience[i].bullets = fixedBullets;
            } catch { /* keep existing */ }
        }
    }

    // Fix truncated project bullets
    for (let i = 0; i < data.projects.length; i++) {
        const proj = data.projects[i];
        if (proj.bullets && proj.bullets.some(isTruncated)) {
            try {
                const desc = proj.bullets.join('. ') + (proj.description ? '. ' + proj.description : '');
                const fixedBullets = await enhanceProject(proj.name, desc, targetRole);
                data.projects[i].bullets = fixedBullets;
            } catch { /* keep existing */ }
        }
    }

    return data;
}

/**
 * Calculate real-time ATS score based on resume completeness and quality
 * Returns { score: 0-100, breakdown: {...}, tips: [...] }
 */
export function calculateATSScore(resumeData) {
    const tips = [];
    const breakdown = {};
    let totalScore = 0;

    const p = resumeData.personal || {};
    const edu = (resumeData.education || []).filter(e => e.institution);
    const exp = (resumeData.experience || []).filter(e => e.company || e.title);
    const proj = (resumeData.projects || []).filter(p => p.name);
    const skills = resumeData.skills || [];
    const summary = resumeData.summary || '';
    const certs = resumeData.certifications || [];

    // 1. Contact Information (15 points)
    let contactScore = 0;
    if (p.name) contactScore += 2;
    else tips.push('Add your full name');
    if (p.email) contactScore += 2;
    else tips.push('Add your email address');
    if (p.phone) contactScore += 2;
    else tips.push('Add your phone number');
    if (p.location) contactScore += 3;
    else tips.push('Add your location (city, state) — ATS systems filter by region');
    if (p.linkedin && p.linkedin.includes('/')) contactScore += 3;
    else if (p.linkedin && !p.linkedin.includes('/')) { contactScore += 1; tips.push('Use your full LinkedIn URL (e.g., linkedin.com/in/yourname)'); }
    else tips.push('Add your LinkedIn profile URL');
    if (p.github && (p.github.includes('/') || p.github.includes('.'))) contactScore += 3;
    else if (p.github) { contactScore += 1; tips.push('Use your full GitHub URL'); }
    else tips.push('Add your GitHub profile URL');
    breakdown.contact = Math.min(contactScore, 15);
    totalScore += breakdown.contact;

    // 2. Professional Summary (15 points)
    let summaryScore = 0;
    if (summary) {
        summaryScore += 5;
        if (summary.length > 100) summaryScore += 3;
        else tips.push('Make your professional summary at least 2-3 sentences');
        if (summary.endsWith('.') || summary.endsWith('!') || summary.endsWith('?')) summaryScore += 2;
        else tips.push('Your summary appears truncated — ensure it ends with a period');
        if (!summary.includes('**')) summaryScore += 2;
        else tips.push('Remove bold formatting from your summary');
        // Check for ATS keywords
        const atsKeywords = ['development', 'engineering', 'design', 'api', 'system', 'agile', 'cloud', 'data'];
        const hasKeywords = atsKeywords.some(k => summary.toLowerCase().includes(k));
        if (hasKeywords) summaryScore += 3;
        else tips.push('Add industry keywords to your summary (e.g., development, engineering, API, cloud)');
    } else {
        tips.push('Add a professional summary — this is critical for ATS scoring');
    }
    breakdown.summary = Math.min(summaryScore, 15);
    totalScore += breakdown.summary;

    // 3. Experience (20 points)
    let expScore = 0;
    if (exp.length > 0) {
        expScore += 5;
        const withBullets = exp.filter(e => e.bullets && e.bullets.length > 0);
        if (withBullets.length === exp.length) expScore += 5;
        else if (withBullets.length > 0) { expScore += 2; tips.push('Generate bullet points for all experience entries'); }
        else tips.push('Add bullet points to your experience — use AI Enhance');

        // Check for metrics
        const allBullets = exp.flatMap(e => e.bullets || []).join(' ');
        const hasMetrics = /\d+[%+K]|\d{2,}/.test(allBullets);
        if (hasMetrics) expScore += 5;
        else tips.push('Add quantified metrics to experience bullets (e.g., "improved by 40%", "served 10K+ users")');

        // Check for bold
        const hasBoldBullets = exp.some(e => (e.bullets || []).some(b => b.includes('**')));
        if (!hasBoldBullets) expScore += 5;
        else tips.push('Remove bold formatting (**) from bullet points — it can trip ATS parsers');
    } else {
        tips.push('Add work experience with detailed, metrics-driven bullet points');
    }
    breakdown.experience = Math.min(expScore, 20);
    totalScore += breakdown.experience;

    // 4. Projects (15 points)
    let projScore = 0;
    if (proj.length > 0) {
        projScore += 4;
        if (proj.length >= 2) projScore += 2;
        const withBullets = proj.filter(p => p.bullets && p.bullets.length > 0);
        if (withBullets.length === proj.length) projScore += 4;
        else if (withBullets.length > 0) { projScore += 2; tips.push('Add bullet points to all projects'); }
        const withTech = proj.filter(p => p.technologies);
        if (withTech.length === proj.length) projScore += 3;
        else tips.push('Specify technologies used for each project');
        const withLinks = proj.filter(p => p.link);
        if (withLinks.length > 0) projScore += 2;
        else tips.push('Add links to project repos or live demos');
    } else {
        tips.push('Add at least 2-3 projects to demonstrate your technical skills');
    }
    breakdown.projects = Math.min(projScore, 15);
    totalScore += breakdown.projects;

    // 5. Skills (15 points)
    let skillScore = 0;
    if (skills.length > 0) {
        skillScore += 5;
        if (skills.length >= 8) skillScore += 3;
        else if (skills.length >= 5) skillScore += 2;
        else tips.push('Add more skills — aim for at least 8-10 technical skills');
        // Check for non-tech skills
        const hasNonTech = skills.some(s => SKILL_BLOCKLIST.includes(s.toLowerCase().trim()));
        if (!hasNonTech) skillScore += 3;
        else tips.push('Remove non-technical items from skills (e.g., "config", "github-config")');
        // Categorized check
        if (Object.keys(resumeData.categorizedSkills || {}).length > 0) skillScore += 4;
        else tips.push('Use "AI Categorize Skills" to organize skills into categories');
    } else {
        tips.push('Add your technical skills — this section is critical for ATS keyword matching');
    }
    breakdown.skills = Math.min(skillScore, 15);
    totalScore += breakdown.skills;

    // 6. Education (10 points)
    let eduScore = 0;
    if (edu.length > 0) {
        eduScore += 5;
        const withDegree = edu.filter(e => e.degree);
        if (withDegree.length === edu.length) eduScore += 3;
        else tips.push('Specify your degree for each education entry');
        const withDate = edu.filter(e => e.date);
        if (withDate.length === edu.length) eduScore += 2;
        else tips.push('Add date ranges for your education');
        // Check for suspiciously long date ranges
        edu.forEach(e => {
            if (e.date) {
                const years = e.date.match(/\d{4}/g);
                if (years && years.length >= 2) {
                    const span = parseInt(years[years.length - 1]) - parseInt(years[0]);
                    if (span > 5) {
                        tips.push(`Education date "${e.date}" spans ${span} years — clarify if integrated program (e.g., "B.Tech + M.Tech Integrated")`);
                    }
                }
            }
        });
    } else {
        tips.push('Add your education information');
    }
    breakdown.education = Math.min(eduScore, 10);
    totalScore += breakdown.education;

    // 7. Certifications (5 points)
    let certScore = 0;
    if (certs.length > 0) {
        certScore += 5;
    } else {
        tips.push('Add relevant certifications to boost your ATS score (e.g., AWS, Google Cloud, Coursera)');
    }
    breakdown.certifications = Math.min(certScore, 5);
    totalScore += breakdown.certifications;

    // 8. Target Role (5 points)
    let roleScore = 0;
    if (p.targetRole) {
        roleScore += 5;
    } else {
        tips.push('Specify your target role for keyword optimization');
    }
    breakdown.targetRole = Math.min(roleScore, 5);
    totalScore += breakdown.targetRole;

    return {
        score: Math.min(totalScore, 100),
        breakdown,
        tips: tips.slice(0, 8) // Show top 8 tips
    };
}

/**
 * Save resume data to Supabase (with localStorage fallback)
 */
export async function saveResumeData(uid, resumeData) {
    if (!uid) {
        try { localStorage.setItem('snapai_guest_resume', JSON.stringify(resumeData)) } catch(e){}
        return;
    }
    
    try {
        const { error } = await supabase.from('user_resumes').upsert({
            uid: uid,
            resume_data: resumeData,
            updated_at: new Date().toISOString()
        }, { onConflict: 'uid', returning: 'minimal' });
        
        if (error) throw error;
    } catch (err) {
        console.warn('Failed to save resume to Supabase, falling back to localStorage:', err);
        try { localStorage.setItem(`snapai_resume_${uid}`, JSON.stringify(resumeData)) } catch(e){}
    }
}

/**
 * Load resume data from Supabase (with localStorage fallback)
 */
export async function loadResumeData(uid) {
    if (!uid) {
        try {
            const raw = localStorage.getItem('snapai_guest_resume');
            if (raw) return JSON.parse(raw);
        } catch(e){}
        return null;
    }
    
    try {
        const { data, error } = await supabase.from('user_resumes').select('resume_data').eq('uid', uid).single();
        if (data && data.resume_data) {
            return data.resume_data;
        }
    } catch (err) {
        console.warn('Failed to load resume from Supabase, trying localStorage:', err);
    }
    
    try {
        const raw = localStorage.getItem(`snapai_resume_${uid}`);
        if (raw) return JSON.parse(raw);
    } catch(e){}
    return null;
}

