// ═══════════════════════════════════════
//  Profile Optimizer — Client-Side AI Analysis
//  Ported from aksh-1h/profile_optimizer backend
// ═══════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const APIFY_API_KEY = import.meta.env.VITE_APIFY_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ── Prompts (from app.py) ──

const ANALYSIS_PROMPT = `You are a world-class career strategist who has reviewed 10,000+ profiles and resumes. You have deep expertise in personal branding, ATS systems, recruiter psychology, and industry best practices.

{role_context}

CRITICAL RULES:
- DO NOT force changes on everything. If a bullet point or section is already decent, LEAVE IT ALONE.
- ONLY flag things that are genuinely weak, non-ATS friendly, or missing critical keywords that directly affect ATS parsing and scoring.
- CRISPY & CONCISE: Ensure all bullet point rewrites and suggestions are short, punchy statements (max 1-2 lines). Avoid long, verbose, or flowery descriptions.
- If something is already good, acknowledge it and move on — don't suggest improvements for already-strong sections.
- NEVER USE PLACEHOLDERS like 'X', 'Y', 'Z', '[Number]', or '%'. When rewriting bullet points to be quantified, you MUST use realistic estimated numbers (e.g., 'saved $10,000', 'increased by 25%', 'led team of 5') rather than generic variables.
- Be SPECIFIC: reference actual text, bullet points, or sections from the profile. Never say generic things like "add more metrics" without explaining exactly what to change.
- If the profile is reasonably strong for the target role, give it a high score. Do not nitpick or manufacture weaknesses.
- Evaluate everything through the strict lens of the target job role and ATS impact.

Think like a hiring manager for this specific role. Before generating your response, reason through:

1. ROLE FIT: Does this profile demonstrate clear qualification for the target role?
2. FIRST IMPRESSION: What story does the headline/summary tell in 5 seconds?
3. IMPACT EVIDENCE: Are achievements quantified with real numbers?
4. KEYWORD GAPS: What specific keywords for this role are missing?
5. HIDDEN WEAKNESSES: What subtle red flags would a recruiter catch?
6. WHAT'S ACTUALLY GOOD: What sections are already strong and need no changes?

Return your analysis as JSON with EXACTLY this structure (no markdown, just raw JSON):
{
  "overall_score": <number 0-100>,
  "score_phrase": "<score> <one-phrase assessment, e.g. '84 Strong but improvable'>",
  "summary": "<2-3 sentence honest assessment referencing the target role>",
  "categories": [
    {
      "name": "Content & Impact",
      "score": <number 0-100>,
      "icon": "impact",
      "feedback": "<specific feedback referencing actual content from the profile>",
      "needs_improvement": <true/false>
    },
    {
      "name": "Keywords & ATS",
      "score": <number 0-100>,
      "icon": "keywords",
      "feedback": "<specific missing keywords for the TARGET ROLE>",
      "needs_improvement": <true/false>
    },
    {
      "name": "Experience & Achievements",
      "score": <number 0-100>,
      "icon": "experience",
      "feedback": "<cite specific bullet points that need quantification, or praise ones that are already strong>",
      "needs_improvement": <true/false>
    },
    {
      "name": "Skills & Tools",
      "score": <number 0-100>,
      "icon": "skills",
      "feedback": "<name specific skills missing for the role, or confirm alignment>",
      "needs_improvement": <true/false>
    },
    {
      "name": "Education & Certs",
      "score": <number 0-100>,
      "icon": "education",
      "feedback": "<specific feedback — only suggest certifications relevant to the target role>",
      "needs_improvement": <true/false>
    },
    {
      "name": "Formatting & Clarity",
      "score": <number 0-100>,
      "icon": "formatting",
      "feedback": "<specific feedback>",
      "needs_improvement": <true/false>
    }
  ],
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "weaknesses": ["<only genuine weaknesses — cite specific text or sections>"],
  "suggestions": [
    {
      "severity": "critical|important|nice-to-have",
      "title": "<short title>",
      "description": "<what exactly is wrong and why it matters for the target role>",
      "original_text": "<MANDATORY: copy the EXACT text from the profile that needs to be rewritten or improved>",
      "suggested_replacement": "<improved rewrite of the original_text>"
    }
  ],
  "missing_sections": ["<only sections that are actually expected for this role>"],
  "keyword_suggestions": ["<keywords specifically relevant to the target role>"],
  "bullet_point_transformers": [
    {
      "weak_text": "<exact passive or generic bullet point>",
      "reason": "<why it's weak>",
      "suggested_replacement": "<strong, quantified, ATS-friendly rewrite>"
    }
  ],
  "rejection_predictors": [
    {
      "reason": "<critical deal-breaking reason this profile would be rejected>",
      "fix": "<how to fix it immediately>"
    }
  ],
  "expert_verdict": {
    "title": "Recruiter Verdict",
    "message": "<punchy, specific guidance from a hiring manager for this role>",
    "is_needed": <true/false>
  }
}

IMPORTANT:
- You MUST populate 'original_text' AND 'suggested_replacement' for all suggestions.
- The 'original_text' and 'weak_text' MUST be copied EXACTLY character-for-character from the resume. Do NOT paraphrase, shorten, or reword the original text.
- 'suggested_replacement' must be concise: 1-2 lines MAX. No long paragraphs.
- Set needs_improvement to false for categories that are already strong (score >= 75).
- Only include suggestions for things that are genuinely weak or harmful to ATS parsing. DO NOT invent suggestions just to fill the array.
- For bullet_point_transformers, find ONLY extremely weak, generic, or passive bullet points. IF ALL BULLET POINTS ARE DECENT, LEAVE THE ARRAY COMPLETELY EMPTY. Do not force rewrites on good content. Max 2-3 transformers.
- Suggested replacement bullets should each be 2-3 concise bullet points per experience/project — NOT more.
- For rejection_predictors, only predict deal-breakers. If the profile is good, leave it EMPTY.

Here is the resume content to analyze:

{content}`;


const COMPARE_PROMPT = `You are a career strategist specializing in profile consistency and gap analysis.

The user's target role is: {role}

You have TWO sources of the same person's professional profile:
1. Their RESUME (what they send to employers)
2. Their LINKEDIN PROFILE (their public professional presence)

Compare them and find:
- What's on LinkedIn but MISSING from the resume (potential resume additions)
- What's on the resume but NOT on LinkedIn (consistency gaps)
- Which version describes the same experience better (use the better one)
- How well BOTH align with the target role

Return JSON with this structure:
{
  "match_score": <0-100>,
  "role_alignment": <0-100>,
  "summary": "<2-3 sentence overview>",
  "add_to_resume": [
    {
      "item": "<specific thing from LinkedIn missing in resume>",
      "section": "<which resume section>",
      "why": "<why adding this helps>",
      "suggested_text": "<ready-to-paste text>"
    }
  ],
  "better_descriptions": [
    {
      "topic": "<what experience is described differently>",
      "resume_version": "<how resume describes it>",
      "linkedin_version": "<how LinkedIn describes it>",
      "recommendation": "<which is better and why>"
    }
  ],
  "role_gaps": [
    {
      "gap": "<what's missing from BOTH profiles>",
      "suggestion": "<how to address>"
    }
  ]
}

Only include genuinely different or missing items. Don't force profiles to be identical.

RESUME CONTENT:
{resume}

LINKEDIN CONTENT:
{linkedin}`;


const IMPROVE_PROMPT = `You are an expert resume writer. Rewrite the following text to be more impactful, specific, and optimized for the target role.

Target role: {role}
Context: {context}

Original text:
{original}

Rules:
- Keep the same factual content but make it more compelling
- Add quantification where reasonable, but NEVER use placeholders like 'X', 'Y', 'Z', or '[Number]'. Use realistic estimated numbers instead.
- Use strong action verbs
- Optimize for ATS keywords relevant to the target role
- Keep roughly the same length

Return exactly this JSON format:
{
  "improved_text": "the rewritten, improved version",
  "changes_made": ["what you changed and why"]
}`;


// ── Helper: Call Gemini and parse JSON ──

async function callGeminiJSON(prompt, temperature = 0.4) {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature, maxOutputTokens: 8192 }
    });

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();

            // Extract JSON
            if (text.includes('```json')) {
                text = text.split('```json').pop().split('```')[0].trim();
            } else if (text.includes('```')) {
                text = text.split('```')[1]?.split('```')[0]?.trim() || text;
            }

            const first = text.indexOf('{');
            const last = text.lastIndexOf('}');
            if (first !== -1 && last > first) {
                text = text.slice(first, last + 1);
            }

            return JSON.parse(text);
        } catch (err) {
            console.error(`Gemini JSON attempt ${attempt + 1} failed:`, err);
            if (attempt === 1) throw err;
        }
    }
}


// ── Public API ──

/**
 * Analyze resume text with AI and return scored results
 */
export async function analyzeProfile(resumeText, jobRole = '') {
    const roleContext = jobRole
        ? `The user's TARGET JOB ROLE is: **${jobRole}**. Evaluate EVERYTHING through the lens of this role.`
        : `The user didn't specify a target role. Infer the likely role from the content and evaluate accordingly.`;

    const prompt = ANALYSIS_PROMPT
        .replace('{role_context}', roleContext)
        .replace('{content}', resumeText);

    const result = await callGeminiJSON(prompt, 0.4);
    result.analysis_type = 'resume';
    result.job_role = jobRole;
    return result;
}


/**
 * Scrape LinkedIn profile via Apify REST API (no backend needed)
 */
export async function scrapeLinkedIn(url) {
    if (!url || !url.includes('linkedin.com/in/')) {
        throw new Error('Please provide a valid LinkedIn URL (e.g. https://linkedin.com/in/username)');
    }

    if (!APIFY_API_KEY) {
        throw new Error('Apify API key not configured');
    }

    // Start the Apify actor run
    const startRes = await fetch(
        `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/runs?token=${APIFY_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [url] })
        }
    );

    if (!startRes.ok) throw new Error('Failed to start LinkedIn scraper');
    const runData = await startRes.json();
    const runId = runData.data?.id;
    if (!runId) throw new Error('No run ID returned from Apify');

    // Poll for completion (max 60s)
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const statusRes = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_KEY}`
        );
        const statusData = await statusRes.json();
        const status = statusData.data?.status;

        if (status === 'SUCCEEDED') {
            // Get results
            const datasetId = statusData.data?.defaultDatasetId;
            const itemsRes = await fetch(
                `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_KEY}`
            );
            const items = await itemsRes.json();

            if (!items || items.length === 0) throw new Error('No profile data returned');

            const profile = items[0];
            return formatLinkedInProfile(profile);
        }

        if (status === 'FAILED' || status === 'ABORTED') {
            throw new Error('LinkedIn scraping failed. Profile may be private.');
        }
    }

    throw new Error('LinkedIn scraping timed out (60s). Try again.');
}


/**
 * Format raw Apify LinkedIn data into text (ported from app.py)
 */
function formatLinkedInProfile(profile) {
    const parts = [];
    const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    if (name) parts.push(`Name: ${name}`);
    if (profile.headline) parts.push(`Headline: ${profile.headline}`);
    if (profile.topSkills) parts.push(`Top Skills: ${profile.topSkills}`);

    const loc = profile.location;
    if (loc && typeof loc === 'object' && loc.linkedinText) {
        parts.push(`Location: ${loc.linkedinText}`);
    }

    if (profile.about) parts.push(`\nAbout:\n${profile.about}`);

    const experience = profile.experience || [];
    if (experience.length) {
        parts.push('\nExperience:');
        for (const exp of experience) {
            if (typeof exp !== 'object') continue;
            const title = exp.position || '';
            const company = exp.companyName || '';
            const duration = exp.duration || '';
            const start = exp.startDate?.text || '';
            const end = exp.endDate?.text || 'Present';
            const desc = exp.description || '';
            parts.push(`  - ${title} at ${company} (${start} - ${end}) [${duration}]`);
            if (exp.employmentType) parts.push(`    Type: ${exp.employmentType}`);
            if (exp.location) parts.push(`    Location: ${exp.location}`);
            if (desc) parts.push(`    ${desc}`);
        }
    }

    const education = profile.education || [];
    if (education.length) {
        parts.push('\nEducation:');
        for (const edu of education) {
            if (typeof edu !== 'object') continue;
            parts.push(`  - ${edu.schoolName || ''} — ${edu.degree || ''} in ${edu.fieldOfStudy || ''} (${edu.period || ''})`);
        }
    }

    const skills = profile.skills || [];
    if (skills.length) {
        const skillNames = skills.map(s => typeof s === 'object' ? s.name || '' : s).filter(Boolean);
        if (skillNames.length) parts.push(`\nSkills: ${skillNames.join(', ')}`);
    }

    const certs = profile.certifications || [];
    if (certs.length) {
        parts.push('\nCertifications:');
        for (const c of certs) {
            if (typeof c === 'object') parts.push(`  - ${c.title || ''} — ${c.issuedBy || ''}`);
        }
    }

    const projects = profile.projects || [];
    if (projects.length) {
        parts.push('\nProjects:');
        for (const p of projects) {
            if (typeof p === 'object') parts.push(`  - ${p.title || ''}: ${p.description || ''}`);
        }
    }

    return { text: parts.join('\n'), name };
}


/**
 * Compare resume and LinkedIn profile
 */
export async function compareProfiles(resumeText, linkedinText, jobRole) {
    const prompt = COMPARE_PROMPT
        .replace('{role}', jobRole)
        .replace('{resume}', resumeText)
        .replace('{linkedin}', linkedinText);

    return await callGeminiJSON(prompt, 0.3);
}


/**
 * AI-improve a specific piece of text
 */
export async function improveText(originalText, context = '', jobRole = '') {
    const prompt = IMPROVE_PROMPT
        .replace('{role}', jobRole || 'general professional')
        .replace('{context}', context)
        .replace('{original}', originalText);

    return await callGeminiJSON(prompt, 0.5);
}
