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
export async function enhanceExperience(experienceText) {
    const prompt = `You are an expert resume writer.
Analyze the following experience description and convert it into 2-3 highly professional, action-oriented bullet points.
Do not include any introductory or concluding text, just the bullet points themselves separated by newlines.
Each bullet point MUST start with an action verb.

Experience:
${experienceText}`

    try {
        const text = await callGeminiResume(prompt)
        return text.split('\n').filter(b => b.trim()).map(b => b.trim().replace(/^[-*•]\s*/, ''))
    } catch (err) {
        console.error('enhanceExperience error:', err)
        return [experienceText]
    }
}

/**
 * Convert project description into professional bullet points
 */
export async function enhanceProject(name, description) {
    const prompt = `You are an expert resume writer.
Analyze the following software project description and convert it into 2-3 highly professional, action-oriented bullet points.
IMPORTANT: Your bullet points MUST highlight the impact of the project.
Do not include any introductory or concluding text, just the bullet points themselves separated by newlines.
Each bullet point MUST start with an action verb.

Project Name: ${name}
Description: ${description}`

    try {
        const text = await callGeminiResume(prompt)
        return text.split('\n').filter(b => b.trim()).map(b => b.trim().replace(/^[-*•]\s*/, ''))
    } catch (err) {
        console.error('enhanceProject error:', err)
        return [description]
    }
}

/**
 * Categorize skills into Language / Framework / Developer Tools / Libraries
 */
export async function categorizeSkills(skillsList) {
    if (!skillsList.length) return {}

    const prompt = `You are an expert technical recruiter analyzing a candidate's skills.
Categorize the following skills into ONLY these specific categories:
- Languages
- Frameworks
- Developer Tools
- Libraries

Filter out any skills that are irrelevant to a software engineering resume.
Return the result strictly as a valid JSON object where the keys are the categories above, and the values are lists of strings representing the skills.
Do not wrap the JSON in markdown code blocks or add any other text.

Skills to categorize:
${skillsList.join(', ')}`

    try {
        const text = await callGeminiResume(prompt)
        return JSON.parse(cleanJSON(text))
    } catch (err) {
        console.error('categorizeSkills error:', err)
        return { Skills: skillsList }
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
    const prompt = `You are an expert resume writer. Write a compelling 2-3 sentence professional summary for a resume based on the following information:

Name: ${data.name || 'N/A'}
Experience: ${(data.experience || []).map(e => `${e.title} at ${e.company}`).join(', ') || 'N/A'}
Skills: ${(data.skills || []).join(', ') || 'N/A'}
Education: ${(data.education || []).map(e => `${e.degree} from ${e.institution}`).join(', ') || 'N/A'}

Write ONLY the summary paragraph. No introductions or explanations. Make it powerful and professional.`

    try {
        return await callGeminiResume(prompt, 'gemini-2.5-flash', 0.7, 256)
    } catch (err) {
        console.error('generateSummary error:', err)
        return ''
    }
}

/**
 * AI Chat for conversational resume building
 */
export async function chatResumeAssistant(userMessage, history = []) {
    const systemPrompt = `You are an AI Resume Building Assistant. Your job is to help users build a professional resume through conversation.

You will guide the user step-by-step through the resume building process:
1. First ask for their full name and contact info (email, phone, LinkedIn, GitHub)
2. Then ask about their education (institution, degree, dates, GPA)
3. Then work experience (company, role, dates, responsibilities)
4. Then projects (name, description, technologies used)
5. Then skills (technical skills, tools, languages)
6. Finally, ask if they want you to generate a professional summary

After each step, summarize what you've collected and ask if they want to continue to the next section or edit anything.

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

Be conversational, friendly, and professional. Keep responses concise.`;

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
