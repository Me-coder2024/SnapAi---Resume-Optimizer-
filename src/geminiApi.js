// Shared Gemini AI API logic
// Used by both the floating Chatbot and the /bot page

import { trackTrainingData } from './tracking';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export const SYSTEM_INSTRUCTION = `You are SnapAI Assistant, the professional and empathetic Customer Service Representative for SnapAI Labs — an AI tools company that builds on-demand AI tools every 15 days.

Current tools:
- AI Resume Builder (LIVE) — Builds professional resumes in 10 minutes via WhatsApp/Telegram chat
- Internbot (LIVE) — An AI-powered internship finder
- AI Logo Maker (Coming Soon — 15 days)
- AI Email Writer (Coming Soon — 30 days)

Key facts about SnapAI Labs:
- We build AI tools based on user requests
- New tool every 15 days  
- 50+ requests fulfilled
- 4.9★ rating
- Users can request custom AI tools

Your primary role is to provide excellent customer support. Always be highly polite, accommodating, empathetic, and professional. 

IMPORTANT DIRECTIVE:
If the user asks to "find an internship", "looking for an internship", or anything related to Internships, you must reply EXACTLY with this secret phrase:
[LAUNCH_INTERNBOT]
Do not add any other text when replying with this phrase. For all other queries, answer normally and concisely (2-3 sentences max).`;

export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function callGemini(userMessage, history = [], retries = 3) {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_INSTRUCTION,
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

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const chat = model.startChat({
                history: chatHistory,
                generationConfig: {
                    temperature: 0.7
                }
            });

            const result = await chat.sendMessage(userMessage);
            const aiText = result.response.text();
            
            // Log the full conversation interaction for fine-tuning
            const finalMessages = [
                { role: "system", content: SYSTEM_INSTRUCTION },
                ...history.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })),
                { role: "user", content: userMessage },
                { role: 'assistant', content: aiText }
            ];
            // Fire-and-forget logging
            trackTrainingData('SnapAI', finalMessages).catch(e => console.error("Track dataset error", e));

            return aiText;
        } catch (err) {
            console.warn(`Attempt ${attempt + 1} failed:`, err.message || err);
            if (err.message?.includes("429") || err.message?.includes("rate") || err.message?.includes("quota") || err.message?.includes("Resource has been exhausted")) {
                if (attempt < retries - 1) {
                    const waitTime = (attempt + 1) * 3000;
                    console.log(`Rate limited — retrying in ${waitTime / 1000}s...`);
                    await delay(waitTime);
                    continue;
                }
            }
            throw err;
        }
    }
    throw new Error("Max retries exceeded");
}
