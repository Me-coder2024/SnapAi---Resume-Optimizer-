// Resume Builder AI API — Gemini-powered resume enhancement
// Ported from aksh-1h/resume_builder_aksh analyzer.py

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function callGeminiResume(prompt, modelName = 'gemini-2.5-flash', temperature = 0.4, maxTokens = 1024) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", 
    });

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
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
    const roleContext = targetRole ? `\nThe resume is targeting a ${targetRole} role. Include relevant keywords for this role.` : '';
    const prompt = `You are an expert ATS-optimized resume writer.
Analyze the following experience description and convert it into 2-4 highly professional, action-oriented bullet points.

CRITICAL ATS RULES:
1. Each bullet point MUST start with a strong action verb (e.g., Developed, Implemented, Architected, Optimized, Spearheaded, Engineered)
2. Do NOT use any bold formatting, asterisks (**), or markdown — plain text only
3. Each bullet MUST include at least ONE quantified metric (e.g., "reduced load time by 40%", "served 10K+ users", "managed team of 5", "processed 1M+ records daily", "increased revenue by 25%")
4. If exact numbers are unknown, use reasonable estimates with "~" or "+" (e.g., "~500 users", "50+ endpoints")
5. Each bullet must be a COMPLETE sentence — never truncate mid-thought
6. Include relevant technical keywords naturally (e.g., REST APIs, microservices, CI/CD, cloud deployment)
7. Focus on IMPACT and RESULTS, not just responsibilities
${roleContext}

Experience:
${experienceText}

Output ONLY the bullet points, one per line. No numbering, no dashes, no bold, no markdown.`

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
    const roleContext = targetRole ? `\nThe resume is targeting a ${targetRole} role. Include relevant keywords for this role.` : '';
    const prompt = `You are an expert ATS-optimized resume writer.
Analyze the following software project and convert it into 2-3 highly professional, action-oriented bullet points.

CRITICAL ATS RULES:
1. Each bullet point MUST start with a strong action verb (e.g., Built, Engineered, Designed, Implemented, Deployed)
2. Do NOT use any bold formatting, asterisks (**), or markdown — plain text only
3. Each bullet MUST include at least ONE quantified metric or technical detail (e.g., "handling 1K+ concurrent users", "processing 10K+ records", "achieving 95% accuracy")
4. If exact numbers are unknown, use reasonable estimates with "~" or "+"
5. Each bullet must be a COMPLETE sentence — never truncate or leave sentences unfinished
6. Highlight technologies used, architecture decisions, and measurable impact
7. Include relevant ATS keywords naturally (e.g., full-stack, REST API, database design, machine learning, cloud deployment)
${roleContext}

Project Name: ${name}
Description: ${description}

Output ONLY the bullet points, one per line. No numbering, no dashes, no bold, no markdown.`

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

    const roleContext = targetRole ? `\nThe candidate is targeting a ${targetRole} role. Prioritize and suggest additional skills relevant to this role.` : '';
    const prompt = `You are an expert technical recruiter analyzing a candidate's skills for ATS optimization.
Categorize the following skills into ONLY these specific categories:
- Languages
- Frameworks
- Developer Tools
- Libraries

CRITICAL RULES:
1. Filter out any items that are NOT real technologies, tools, or skills (e.g., "config", "github-config", ".env", "readme" are NOT valid skills)
2. Ensure all skills are properly capitalized (e.g., "javascript" → "JavaScript", "react" → "React")
3. If the candidate has fewer than 3 skills in any category, suggest 1-2 additional commonly paired skills that complement their existing stack
4. Mark suggested skills by adding "(suggested)" after them so the user can review
${roleContext}

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
    "experience": [{"company": "Company Name", "title": "Job Title", "date": "Date Range", "location": "Location", "bullets": ["bullet point 1", "bullet point 2"]}],
    "projects": [{"name": "Project Name", "description": "Project Description", "technologies": "Tech used", "link": "Project Link if any", "bullets": ["bullet 1", "bullet 2"]}],
    "skills": ["Skill 1", "Skill 2"]
}

Raw Resume Text:
${rawText}

Output ONLY valid JSON. Do not include any markdown wrappers or explanatory text.`

    try {
        const text = await callGeminiResume(prompt, 'gemini-2.5-flash', 0.1, 2048)
        return JSON.parse(cleanJSON(text))
    } catch (err) {
        console.error('parseResumeText error:', err)
        return null
    }
}

/**
 * Generate a professional summary from structured resume data
 */
export async function generateSummary(data) {
    const targetRole = data.personal?.targetRole || data.targetRole || '';
    const roleContext = targetRole ? `The candidate is targeting a ${targetRole} role.` : '';
    const prompt = `You are an expert ATS-optimized resume writer. Write a compelling 2-3 sentence professional summary for a resume based on the following information:

Name: ${data.name || data.personal?.name || 'N/A'}
Target Role: ${targetRole || 'Software Engineer'}
Experience: ${(data.experience || []).map(e => `${e.title} at ${e.company}`).join(', ') || 'N/A'}
Skills: ${(data.skills || []).join(', ') || 'N/A'}
Education: ${(data.education || []).map(e => `${e.degree} from ${e.institution}`).join(', ') || 'N/A'}
Projects: ${(data.projects || []).filter(p => p.name).map(p => p.name).join(', ') || 'N/A'}

CRITICAL ATS RULES:
1. The summary MUST be 2-3 COMPLETE sentences. Never truncate or leave a sentence unfinished.
2. The summary MUST end with a proper period.
3. Do NOT use bold formatting, asterisks, or markdown — plain text only.
4. Include 3-5 ATS keywords naturally (e.g., full-stack development, REST APIs, system design, cloud computing, agile methodology, CI/CD, data structures, algorithms).
5. Mention specific technologies from the skills list.
6. Focus on years of experience, key strengths, and career objectives.
${roleContext}

Write ONLY the summary paragraph. No introductions, labels, or explanations. Plain text only.`

    try {
        let summary = await callGeminiResume(prompt, 'gemini-2.5-flash', 0.7, 256)
        // Strip any accidental bold formatting
        summary = summary.replace(/\*\*/g, '').replace(/\*/g, '')
        // Ensure it ends with a period
        if (summary && !summary.endsWith('.') && !summary.endsWith('!') && !summary.endsWith('?')) {
            summary += '.'
        }
        return summary
    } catch (err) {
        console.error('generateSummary error:', err)
        return ''
    }
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

    // Now use AI to generate bullet points for each project
    const enhancedProjects = [];
    for (const proj of projects) {
        try {
            const desc = proj.description || `A ${proj.technologies} project`;
            const bullets = await enhanceProject(proj.name, desc);
            enhancedProjects.push({ ...proj, bullets });
        } catch {
            enhancedProjects.push(proj);
        }
    }

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
IMPORTANT BEHAVIOR FOR PROJECTS:
- If the user provided a GitHub URL/username in Step 1, ALWAYS offer GitHub import FIRST as the primary option.
- If the user says they don't have projects, can't think of any, says "no", "skip", "none", or anything similar — DO NOT skip this section. Instead, ask:
  "No worries! Do you have a **GitHub profile**? I can **automatically import your top projects** from GitHub and format them professionally for your resume! 🚀\\n\\nJust share your **GitHub username or URL** and say **'import from GitHub'**."
- If they already shared a GitHub URL earlier, say:
  "I see you already shared your GitHub profile! 🎉 Would you like me to **import your top projects from GitHub** automatically? Just say **'import from GitHub'** and I'll handle everything!"

When the user says "import from GitHub", "fetch from GitHub", "use my GitHub", "yes import", "yes", etc. in the context of projects, respond with:
"🔄 **Importing your projects from GitHub...** I'll fetch your top repositories and format them for your resume!"
Then output a resume_data block with:
\`\`\`resume_data
{"section": "github_import", "data": {"action": "import"}}
\`\`\`

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
    if (p.name) contactScore += 3;
    else tips.push('Add your full name');
    if (p.email) contactScore += 3;
    else tips.push('Add your email address');
    if (p.phone) contactScore += 3;
    else tips.push('Add your phone number');
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
