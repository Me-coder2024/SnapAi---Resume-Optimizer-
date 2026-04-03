import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase as _sb } from './supabase'
import { auth, googleProvider } from './firebase'
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'
import WaitingList from './WaitingList'
import HeroScene3D from './HeroScene3D'
import { callGemini } from './geminiApi'
import { GlowingEffectDemo } from './components/ui/demo'
import { GlowCard } from './components/ui/spotlight-card'
import AuthModal from './components/ui/AuthModal'
import ProfileDropdown from './components/ui/ProfileDropdown'
import { trackVisit, trackBotInteraction, trackPing } from './tracking'

// ═══════════════════════════════════════
//  WALLET HELPERS (Supabase-backed)
// ═══════════════════════════════════════
const DEFAULT_FREE_CREDITS = 10

export async function loadWallet(uid) {
    if (!uid) return { credits: 0, transactions: [] }
    try {
        // Load or create wallet
        let { data: wallet } = await _sb.from('user_wallets').select('*').eq('uid', uid).single()
        if (!wallet) {
            // First-time user — give free credits
            const { data: newWallet } = await _sb.from('user_wallets').insert([{ uid, credits: DEFAULT_FREE_CREDITS }]).select().single()
            wallet = newWallet || { uid, credits: DEFAULT_FREE_CREDITS }
            // Log the welcome bonus
            await _sb.from('wallet_transactions').insert([{
                uid, type: 'purchase', amount: DEFAULT_FREE_CREDITS, tool_name: 'System', description: 'Welcome bonus credits'
            }])
        }
        // Load transactions
        const { data: txns } = await _sb.from('wallet_transactions').select('*').eq('uid', uid).order('created_at', { ascending: false }).limit(50)
        return { credits: wallet.credits || 0, transactions: txns || [] }
    } catch (err) {
        console.warn('Wallet load error (using localStorage fallback):', err)
        // Fallback to localStorage
        try {
            const raw = localStorage.getItem(`snapai_wallet_${uid}`)
            if (raw) return JSON.parse(raw)
        } catch (e) { /* ignore */ }
        const fallback = { credits: DEFAULT_FREE_CREDITS, transactions: [{ type: 'purchase', amount: DEFAULT_FREE_CREDITS, tool_name: 'System', description: 'Welcome bonus credits', created_at: new Date().toISOString() }] }
        localStorage.setItem(`snapai_wallet_${uid}`, JSON.stringify(fallback))
        return fallback
    }
}

export async function addCredits(uid, amount, packName) {
    if (!uid) return null
    try {
        // Get current balance
        const { data: wallet } = await _sb.from('user_wallets').select('credits').eq('uid', uid).single()
        const newBalance = (wallet?.credits || 0) + amount
        await _sb.from('user_wallets').upsert({ uid, credits: newBalance, updated_at: new Date().toISOString() })
        await _sb.from('wallet_transactions').insert([{
            uid, type: 'purchase', amount, tool_name: 'Wallet', description: packName
        }])
        return newBalance
    } catch (err) {
        console.warn('addCredits error (localStorage fallback):', err)
        try {
            const raw = localStorage.getItem(`snapai_wallet_${uid}`)
            const w = raw ? JSON.parse(raw) : { credits: 0, transactions: [] }
            w.credits += amount
            w.transactions.unshift({ type: 'purchase', amount, tool_name: 'Wallet', description: packName, created_at: new Date().toISOString() })
            localStorage.setItem(`snapai_wallet_${uid}`, JSON.stringify(w))
            return w.credits
        } catch (e) { return null }
    }
}

export async function deductCredits(uid, amount, toolName) {
    if (!uid) return null
    try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deduct-credits`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ uid, amount, tool: toolName })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            console.error('Edge function deduct failed:', result.error);
            return null; // insufficient or error
        }
        
        return result.credits;
    } catch (err) {
        console.warn('deductCredits error (localStorage fallback):', err)
        try {
            const raw = localStorage.getItem(`snapai_wallet_${uid}`)
            const w = raw ? JSON.parse(raw) : { credits: 0, transactions: [] }
            if (w.credits < amount) return null
            w.credits -= amount
            w.transactions.unshift({ type: 'debit', amount, tool_name: toolName, description: `Used ${amount} credits for ${toolName}`, created_at: new Date().toISOString() })
            localStorage.setItem(`snapai_wallet_${uid}`, JSON.stringify(w))
            return w.credits
        } catch (e) { return null }
    }
}

// ═══════════════════════════════════════
//  CREDIT PACKS
// ═══════════════════════════════════════
const CREDIT_PACKS = [
    { id: 1, credits: 10, price: 20, label: '10 Credits', badge: '' },
    { id: 2, credits: 30, price: 50, label: '30 Credits', badge: 'POPULAR', save: '17%' },
    { id: 3, credits: 50, price: 80, label: '50 Credits', badge: 'BEST VALUE', save: '20%' },
]

// Groq API logic is now in groqApi.js

const TYPING_PROMPTS = [
    'Ask SnapAI anything...',
    'Find me an internship...',
    'Build my resume with AI...',
    'What tools do you offer?',
    'Request a custom AI tool...',
]

const TypingInput = ({ onSubmit }) => {
    const [value, setValue] = useState('')
    const [placeholder, setPlaceholder] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const promptIdx = useRef(0)
    const charIdx = useRef(0)
    const isDeleting = useRef(false)
    const timerRef = useRef(null)

    useEffect(() => {
        if (isFocused || value) return // stop animation when user is typing

        const tick = () => {
            const current = TYPING_PROMPTS[promptIdx.current]
            if (!isDeleting.current) {
                charIdx.current++
                setPlaceholder(current.slice(0, charIdx.current))
                if (charIdx.current === current.length) {
                    // Pause at full text, then start deleting
                    timerRef.current = setTimeout(() => { isDeleting.current = true; tick() }, 2000)
                    return
                }
                timerRef.current = setTimeout(tick, 70 + Math.random() * 40)
            } else {
                charIdx.current--
                setPlaceholder(current.slice(0, charIdx.current))
                if (charIdx.current === 0) {
                    isDeleting.current = false
                    promptIdx.current = (promptIdx.current + 1) % TYPING_PROMPTS.length
                    timerRef.current = setTimeout(tick, 500)
                    return
                }
                timerRef.current = setTimeout(tick, 35)
            }
        }
        timerRef.current = setTimeout(tick, 800)
        return () => clearTimeout(timerRef.current)
    }, [isFocused, value])

    return (
        <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }} className="flex items-center overflow-hidden rounded-full border border-[#333] bg-[#1a1a1a] px-5 py-3 pr-3 hover:border-[#444] transition-all duration-300 focus-within:border-[#555]" style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
            <div className="flex-1 relative">
                <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => { if (!value) setIsFocused(false) }}
                    className="w-full bg-transparent text-[16px] font-semibold text-[#EDEDEF] outline-none"
                    autoComplete="off"
                />
                {!value && (
                    <span className="absolute inset-0 flex items-center text-[16px] text-[#555] pointer-events-none select-none font-semibold">
                        {placeholder}<span className="inline-block w-[2px] h-5 bg-[#3B82F6] ml-[1px] animate-pulse" style={{ animationDuration: '0.8s' }} />
                    </span>
                )}
            </div>
            <button type="submit" className={`ml-3 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 shrink-0 ${value.trim() ? 'bg-white text-[#09090B] shadow-sm active:scale-90' : 'bg-[#222] text-[#555]'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
            </button>
        </form>
    )
}

const CountdownTimer = () => {
    const [timeLeft, setTimeLeft] = useState({ days: 14, hours: 23, minutes: 59, seconds: 59 })

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 }
                if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 }
                if (prev.hours > 0) return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 }
                if (prev.days > 0) return { ...prev, days: prev.days - 1, hours: 23, minutes: 59, seconds: 59 }
                return prev
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="inline-flex flex-col items-center">
            <p className="text-xs uppercase tracking-wider text-[#63636E] font-mono mb-4">Next Tool Launches In:</p>
            <div className="flex items-center gap-4">
                {[
                    { label: 'Days', value: timeLeft.days },
                    { label: 'Hours', value: timeLeft.hours },
                    { label: 'Mins', value: timeLeft.minutes },
                    { label: 'Secs', value: timeLeft.seconds }
                ].map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1">
                        <div className="bg-[#111113] border border-[#1C1C22] rounded-md w-14 h-14 flex items-center justify-center">
                            <span className="text-xl font-mono font-semibold text-[#EDEDEF]">{item.value.toString().padStart(2, '0')}</span>
                        </div>
                        <span className="text-[10px] text-[#63636E] uppercase tracking-wider">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

const Chatbot = ({ user, onLoginRequired }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Hi, I am SnapAI Assistant, Your customer support bot. How may I help you today?', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [showInternModal, setShowInternModal] = useState(false)
    const chatInputRef = useRef(null)
    const chatScrollRef = useRef(null)

    // Build InternBot iframe URL with user params + API key
    const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY || ''
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    const internBotUrl = user
        ? `/internbot/index.html?uid=${encodeURIComponent(user.uid)}&name=${encodeURIComponent(user.displayName || user.email.split('@')[0])}&email=${encodeURIComponent(user.email)}&rkey=${encodeURIComponent(rapidApiKey)}&surl=${encodeURIComponent(supabaseUrl)}&skey=${encodeURIComponent(supabaseKey)}`
        : `/internbot/index.html?rkey=${encodeURIComponent(rapidApiKey)}&surl=${encodeURIComponent(supabaseUrl)}&skey=${encodeURIComponent(supabaseKey)}`

    const openInternBot = () => {
        if (!user) {
            onLoginRequired()
            return
        }
        setShowInternModal(true)
    }

    // Auto-scroll chat
    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
        }
    }, [messages, isTyping])

    const handleSend = async (text = input) => {
        if (!text.trim()) return

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMessage = { role: 'user', content: text, time: timeStr }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsTyping(true)

        // Track interaction with SnapAI bot
        trackBotInteraction('SnapAI', text);

        try {
            const aiText = await callGemini(text)
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (aiText.includes("[LAUNCH_INTERNBOT]")) {
                setMessages(prev => [...prev, { role: 'ai', content: "I would be happy to help with that! Launching Internbot for you now...", time: timeStr }])
                setTimeout(() => openInternBot(), 800)
            } else {
                setMessages(prev => [...prev, { role: 'ai', content: aiText, time: timeStr }])
            }
        } catch (error) {
            console.error("Groq Error:", error)
            const errorMsg = error.message?.includes("API_KEY") || error.message?.includes("invalid_api_key")
                ? "⚠️ API key issue. Please check your Groq API key."
                : error.message?.includes("quota") || error.message?.includes("429")
                    ? "⚠️ API quota exceeded. Please try again later."
                    : error.message?.includes("blocked")
                        ? "⚠️ Response was blocked by safety filters. Try rephrasing."
                        : `❌ Connection error: ${error.message || "Unknown error"}.Check browser console for details.`
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages(prev => [...prev, { role: 'ai', content: errorMsg, time: timeStr }])
        } finally {
            setIsTyping(false)
            chatInputRef.current?.focus()
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {isOpen && (
                <div className="absolute bottom-16 right-0 w-[380px] h-[520px] bg-[#0A0A0C] border border-[#1C1C22] rounded-2xl overflow-hidden flex flex-col animate-slide-up shadow-elevated">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C1C22] bg-[#111113]">
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-[#63636E] hover:text-[#EDEDEF] hover:bg-[#1A1A1F] transition-colors" onClick={() => setIsOpen(false)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div className="text-center">
                            <h4 className="text-sm font-semibold text-[#EDEDEF]">SnapAI Assistant</h4>
                            <span className="text-[10px] text-[#22C55E] flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse"></span>Online</span>
                        </div>
                        <div className="w-8"></div>
                    </div>

                    {/* Messages — Premium animated */}
                    <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272F #111113' }}>
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                                {msg.role === 'ai' && (
                                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 border border-[#3B82F6]/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    </div>
                                )}
                                <div className="flex flex-col" style={{ maxWidth: '80%' }}>
                                    <div className={`py-2.5 px-3.5 text-[13px] leading-relaxed ${
                                        msg.role === 'user'
                                            ? 'bg-[#EDEDEF] text-[#09090B] font-medium rounded-2xl rounded-br-sm'
                                            : 'bg-[#111113] border border-[#1C1C22] text-[#EDEDEF] rounded-2xl rounded-bl-sm'
                                    }`}>
                                        {msg.content}
                                    </div>
                                    <span className={`text-[9px] text-[#3A3A44] mt-1 px-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                                        {msg.role === 'ai' ? 'SnapAI' : 'You'} · {msg.time}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex items-start gap-2">
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 border border-[#3B82F6]/20 flex items-center justify-center shrink-0">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                </div>
                                <div className="bg-[#111113] border border-[#1C1C22] py-3 px-4 rounded-2xl rounded-bl-sm">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick tools strip */}
                    <div className="flex items-center gap-1.5 px-3 py-2 border-t border-[#1C1C22] bg-[#0A0A0C]">
                        <button onClick={openInternBot} className="text-[10px] font-mono text-[#A1A1A9] bg-[#111113] border border-[#1C1C22] px-2.5 py-1 rounded-lg hover:text-[#EDEDEF] hover:border-[#27272F] transition-colors shrink-0 flex items-center gap-1">
                            <span>🔍</span> InternBot
                        </button>
                    </div>

                    {/* Premium pill input */}
                    <div className="px-3 py-3 bg-[#0A0A0C]">
                        <div className="flex items-center overflow-hidden rounded-full border border-[#27272F] bg-[#111113] px-4 py-1.5 transition-all duration-300 focus-within:border-[#3B82F6]/50" style={{ boxShadow: isTyping ? '0 0 16px rgba(59,130,246,0.1)' : '0 4px 12px rgba(0,0,0,0.2)' }}>
                            <input
                                ref={chatInputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Message SnapAI..."
                                className="flex-1 bg-transparent text-[13px] font-semibold text-[#EDEDEF] placeholder-[#3A3A44] outline-none py-1.5 min-w-0"
                                autoComplete="off"
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isTyping}
                                className={`ml-2 flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 shrink-0 ${
                                    input.trim() && !isTyping
                                        ? 'bg-[#EDEDEF] text-[#09090B] active:scale-90 hover:bg-white'
                                        : 'bg-[#1A1A1F] text-[#3A3A44] cursor-not-allowed'
                                }`}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInternModal && (
                <div className="fixed inset-0 bg-[#000000]/60 z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-lg w-full max-w-lg h-[80vh] relative overflow-hidden flex flex-col">
                        <button className="absolute top-3 right-3 z-10 w-8 h-8 rounded-md flex items-center justify-center text-[#63636E] hover:text-[#EDEDEF] hover:bg-[#1A1A1F] transition-colors" onClick={() => setShowInternModal(false)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <iframe src={internBotUrl} title="InternBot" className="w-full flex-1 border-0" />
                    </div>
                </div>
            )}

            <button className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#111113] to-[#1A1A1F] border border-[#1C1C22] text-[#A1A1A9] hover:border-[#3B82F6]/30 hover:text-[#EDEDEF] transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                )}
            </button>
        </div>
    )
}

// Default tools for first load
const DEFAULT_TOOLS = [
    { id: 1, name: 'AI Resume Builder', description: 'Get a professional resume in 10 minutes via chat', status: 'LIVE', icon: '📄', buttons: [{ name: 'WhatsApp', link: '#' }, { name: 'Telegram', link: '#' }], createdAt: new Date().toISOString() },
    { id: 2, name: 'AI Logo Maker', description: 'Create stunning brand assets in seconds', status: 'COMING SOON', icon: '🎨', buttons: [{ name: 'Notify Me', link: '' }], launchDays: '15 Days', createdAt: new Date().toISOString() },
    { id: 3, name: 'AI Email Writer', description: 'Perfect business emails instantly', status: 'COMING SOON', icon: '✉️', buttons: [{ name: 'Notify Me', link: '' }], launchDays: '30 Days', createdAt: new Date().toISOString() }
]


// ═══════════════════════════════════════
//  PROFILE DROPDOWN (Navbar)
// ═══════════════════════════════════════



function App() {
    const navigate = useNavigate()
    const [filter, setFilter] = useState('All')

    useEffect(() => {
        trackVisit();
        
        // Active User Heartbeat — direct to Supabase
        trackPing(); // Initial ping
        const intervalId = setInterval(() => trackPing(), 15000); // Ping every 15 seconds
        return () => clearInterval(intervalId);
    }, []);

    // Waitlist toggle — now synced via Supabase settings
    const [showWaitlist, setShowWaitlist] = useState(false)
    const [loadingSettings, setLoadingSettings] = useState(true)

    // Tools — loaded from Supabase
    const [tools, setTools] = useState(DEFAULT_TOOLS)

    // Request form state
    const [reqForm, setReqForm] = useState({ toolName: '', category: 'Productivity', description: '', email: '' })
    const [reqSubmitted, setReqSubmitted] = useState(false)

    // Auth State
    const [user, setUser] = useState(null)
    const [showAuthModal, setShowAuthModal] = useState(false)

    // Profile & Wallet State
    const [wallet, setWallet] = useState({ credits: 0, transactions: [] })

    // Wallet refresh function
    const refreshWallet = useCallback(async (uid) => {
        if (!uid) { setWallet({ credits: 0, transactions: [] }); return }
        const w = await loadWallet(uid)
        setWallet(w)
    }, [])

    // Listen to Firebase Auth state + load wallet
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser)
            if (currentUser) refreshWallet(currentUser.uid)
            else setWallet({ credits: 0, transactions: [] })
        })
        return () => unsubscribe()
    }, [refreshWallet])

    // Listen for InternBot credit messages via postMessage
    useEffect(() => {
        const handleMessage = async (e) => {
            if (!e.data || !e.data.type) return
            if (e.data.type === 'CHECK_CREDITS') {
                const w = await loadWallet(user?.uid)
                e.source?.postMessage({ type: 'CREDITS_STATUS', credits: w.credits }, '*')
            } else if (e.data.type === 'DEDUCT_CREDITS') {
                const amount = e.data.amount || 2
                const tool = e.data.tool || 'InternBot'
                const result = await deductCredits(user?.uid, amount, tool)
                if (result !== null) {
                    setWallet(prev => ({ ...prev, credits: result }))
                    e.source?.postMessage({ type: 'DEDUCT_SUCCESS', credits: result }, '*')
                } else {
                    e.source?.postMessage({ type: 'DEDUCT_FAILED', credits: 0 }, '*')
                }
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [user])

    // Load tools and settings from Supabase + subscribe to changes
    useEffect(() => {
        const loadTools = async () => {
            try {
                const { data } = await _sb.from('tools').select('*').order('created_at')
                if (data && data.length > 0) {
                    setTools(data.map(row => ({
                        id: row.id, name: row.name, description: row.description,
                        status: row.status, icon: row.icon,
                        launch_days: row.launch_days, buttons: row.buttons || [],
                        createdAt: row.created_at
                    })))
                }
            } catch (err) {
                console.warn("Failed to load tools from Supabase:", err)
            }
        }

        const loadSettings = async () => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Supabase timeout")), 3500)
            )

            try {
                const fetchPromise = _sb.from('settings').select('value').eq('key', 'waitlist_active').single()
                const { data } = await Promise.race([fetchPromise, timeoutPromise])
                if (data) setShowWaitlist(data.value === 'true')
            } catch (err) {
                console.error("Error loading settings (using defaults):", err)
            } finally {
                setLoadingSettings(false)
            }
        }

        loadTools()
        loadSettings()

        // Subscribe to tools changes
        const toolsChannel = _sb
            .channel('app-tools')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tools' }, loadTools)
            .subscribe()

        // Subscribe to settings changes
        const settingsChannel = _sb
            .channel('app-settings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
                if (payload.new && payload.new.key === 'waitlist_active') {
                    setShowWaitlist(payload.new.value === 'true')
                }
            })
            .subscribe()

        return () => {
            _sb.removeChannel(toolsChannel)
            _sb.removeChannel(settingsChannel)
        }
    }, [])

    // Block rendering until we know if we should show the waitlist
    if (loadingSettings) {
        return <div style={{ background: '#030305', minHeight: '100vh' }} />
    }

    // If waitlist is active, show the waitlist page
    if (showWaitlist) {
        return <WaitingList onSkip={() => setShowWaitlist(false)} />
    }

    const handleRequestSubmit = async () => {
        if (!reqForm.toolName.trim() || !reqForm.email.trim()) return
        await _sb.from('requests').insert([{
            tool_name: reqForm.toolName,
            description: reqForm.description,
            category: reqForm.category,
            email: reqForm.email,
            submitted_at: new Date().toISOString()
        }])
        setReqForm({ toolName: '', category: 'Productivity', description: '', email: '' })
        setReqSubmitted(true)
        setTimeout(() => setReqSubmitted(false), 3000)
    }

    const filteredTools = filter === 'All' ? tools : tools.filter(t =>
        filter === 'Live' ? t.status === 'LIVE' : t.status === 'COMING SOON'
    )

    return (
        <div className="bg-[#09090B] text-[#A1A1A9] min-h-screen font-sans">
            <nav className="sticky top-0 z-50 bg-[#09090B]/80 backdrop-blur-sm border-b border-[#1C1C22] h-16">
                <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between relative">
                    <div className="font-semibold text-[#EDEDEF] text-lg font-mono flex-1">SnapAI</div>
                    <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
                        <a href="#tools" className="text-sm text-[#63636E] hover:text-[#EDEDEF] transition-colors">Tools</a>
                        <a href="#request" className="text-sm text-[#63636E] hover:text-[#EDEDEF] transition-colors">Request</a>
                        <a href="#about" className="text-sm text-[#63636E] hover:text-[#EDEDEF] transition-colors">About</a>
                    </div>
                    <div className="flex items-center justify-end gap-3 flex-1">
                        {!user && (
                            <a href="/organization" className="bg-transparent border border-[#27272F] text-[#A1A1A9] text-sm font-medium px-4 py-1.5 rounded-md hover:border-[#33333D] hover:text-[#EDEDEF] hover:bg-[#111113] transition-all">Organization</a>
                        )}
                        {user ? (
                            <ProfileDropdown user={user} walletCredits={wallet.credits} onOpenProfile={() => navigate('/profile')} />
                        ) : (
                            <button className="bg-[#EDEDEF] text-[#09090B] font-medium text-sm px-4 py-1.5 rounded-md hover:bg-[#D4D4D8] transition-colors" onClick={() => setShowAuthModal(true)}>Login</button>
                        )}
                    </div>
                </div>
            </nav>

            <main>
                <header className="py-24 sm:py-32 lg:py-40 relative overflow-hidden">
                    <React.Suspense fallback={null}>
                        <HeroScene3D />
                    </React.Suspense>
                    <div className="absolute inset-0 z-[1]" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 20%, #09090B 70%)' }}></div>
                    <div className="absolute inset-0 z-[1]" style={{ background: 'linear-gradient(to bottom, #09090B 0%, transparent 15%, transparent 85%, #09090B 100%)' }}></div>
                    <div className="max-w-4xl mx-auto text-center px-6 relative z-10">
                        <div className="inline-flex items-center gap-2 bg-[#111113] border border-[#27272F] rounded-full px-4 py-1.5 text-xs font-mono text-[#A1A1A9] mb-8">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]"></span> All systems operational
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-[#EDEDEF] leading-[1.1] max-w-3xl mx-auto">
                            AI Tools on Demand
                        </h1>
                        <p className="text-lg sm:text-xl text-[#A1A1A9] max-w-xl mx-auto mt-6 leading-relaxed">
                            Functional AI utilities built for real problems.
                        </p>
                        <div className="mt-10 max-w-xl mx-auto w-full">
                            <TypingInput onSubmit={(val) => navigate('/bot?q=' + encodeURIComponent(val))} />
                            <div className="flex items-center justify-center gap-6 mt-4">
                                <a href="#tools" className="text-xs text-[#63636E] hover:text-[#A1A1A9] transition-colors">Explore Tools →</a>
                                <a href="#request" className="text-xs text-[#63636E] hover:text-[#A1A1A9] transition-colors">Request a Tool →</a>
                            </div>
                        </div>

                        <div className="mt-16">
                            <CountdownTimer />
                        </div>
                    </div>
                </header>

                <section id="tools" className="py-20 sm:py-28 border-t border-[#1C1C22]">
                    <div className="max-w-6xl mx-auto px-6">
                        <div className="max-w-2xl mb-12">
                            <p className="text-[10px] uppercase tracking-wider text-[#3B82F6] font-mono mb-3">Tools</p>
                            <h2 className="text-title text-[#EDEDEF]">AI tools built for real problems</h2>
                            <p className="text-body text-[#A1A1A9] mt-4">New utility every 15 days. Community-driven.</p>
                        </div>

                        <div className="flex items-center gap-2 mb-8">
                            {['All', 'Live', 'Soon'].map(t => (
                                <button
                                    key={t}
                                    className={`inline-flex items-center text-xs font-mono px-2.5 py-1 rounded-md border transition-colors ${filter === t ? 'bg-accent-muted border-accent-border text-[#3B82F6]' : 'bg-[#111113] border-[#27272F] text-[#A1A1A9] hover:text-[#EDEDEF] hover:border-[#33333D]'}`}
                                    onClick={() => setFilter(t)}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                            {filteredTools.map(tool => {
                                const btns = tool.buttons || [{ name: tool.buttonName || 'Try Now', link: tool.buttonLink || '#' }]
                                return (
                                    <GlowCard key={tool.id} glowColor="white" customSize={true} className="card-hover">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className={`inline-flex items-center text-xs font-mono px-2 py-0.5 rounded-md border ${tool.status === 'LIVE' ? 'bg-[#22C55E]/8 border-[#22C55E]/20 text-[#22C55E]' : 'bg-[#111113] border-[#27272F] text-[#63636E]'}`}>
                                                {tool.status === 'LIVE' && <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] mr-1.5"></span>}
                                                {tool.status === 'COMING SOON' ? 'Soon' : tool.status}
                                            </span>
                                        </div>
                                        <h3 className="text-heading text-[#EDEDEF] font-medium mb-2">{tool.name}</h3>
                                        <p className="text-small text-[#A1A1A9] leading-relaxed mb-6 flex-1">{tool.description}</p>
                                        {tool.status === 'LIVE' ? (
                                            <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-[#1C1C22]/60">
                                                {btns.map((b, i) => (
                                                    <a key={i} href={b.link || '#'} className="inline-flex items-center justify-center gap-1.5 bg-transparent border border-[#27272F] text-[#A1A1A9] text-xs font-medium px-4 py-2 rounded-md hover:border-[#33333D] hover:text-[#EDEDEF] hover:bg-[#111113] transition-all relative z-10" target="_blank" rel="noopener noreferrer">{b.name || 'Try Now'} →</a>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-[#1C1C22]/60">
                                                <span className="text-xs text-[#63636E] font-mono">Launches in {tool.launchDays || tool.launch_days || '15 Days'}</span>
                                                <button className="inline-flex items-center gap-1 bg-transparent border border-[#27272F] text-[#A1A1A9] text-xs font-medium px-3 py-1.5 rounded-md hover:border-[#33333D] hover:text-[#EDEDEF] hover:bg-[#111113] transition-all relative z-10">Notify me →</button>
                                            </div>
                                        )}
                                    </GlowCard>
                                )
                            })}
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-28 border-t border-[#1C1C22]">
                    <div className="max-w-6xl mx-auto px-6">
                        <div className="mb-12 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-[#3B82F6] font-mono mb-3">Core Infrastructure</p>
                            <h2 className="text-title text-[#EDEDEF]">Built for speed and precision</h2>
                        </div>
                        <GlowingEffectDemo />
                    </div>
                </section>

                <section id="request" className="py-20 sm:py-28 border-t border-[#1C1C22]">
                    <div className="max-w-2xl mx-auto px-6">
                        <div className="mb-12">
                            <p className="text-[10px] uppercase tracking-wider text-[#3B82F6] font-mono mb-3">Request</p>
                            <h2 className="text-title text-[#EDEDEF]">Request an AI tool</h2>
                            <p className="text-body text-[#A1A1A9] mt-4">You demand, we supply. Tell us what to build next.</p>
                        </div>
                        <form className="space-y-5" onSubmit={e => e.preventDefault()}>
                            <div>
                                <label className="text-sm font-medium text-[#EDEDEF] mb-2 block">What AI tool do you need?</label>
                                <input type="text" className="w-full bg-[#111113] border border-[#27272F] rounded-md px-4 py-2.5 text-sm text-[#EDEDEF] placeholder-[#3A3A44] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 outline-none transition-all" placeholder="e.g. AI Content Planner" value={reqForm.toolName} onChange={e => setReqForm({ ...reqForm, toolName: e.target.value })} required />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[#EDEDEF] mb-2 block">Category</label>
                                <select className="w-full bg-[#111113] border border-[#27272F] rounded-md px-4 py-2.5 text-sm text-[#EDEDEF] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 outline-none transition-all" value={reqForm.category} onChange={e => setReqForm({ ...reqForm, category: e.target.value })}>
                                    <option>Productivity</option>
                                    <option>Creative</option>
                                    <option>Business</option>
                                    <option>Education</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[#EDEDEF] mb-2 block">Describe the problem</label>
                                <textarea rows="4" className="w-full bg-[#111113] border border-[#27272F] rounded-md px-4 py-2.5 text-sm text-[#EDEDEF] placeholder-[#3A3A44] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 outline-none transition-all resize-y min-h-[120px]" placeholder="Detail your requirements..." value={reqForm.description} onChange={e => setReqForm({ ...reqForm, description: e.target.value })}></textarea>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[#EDEDEF] mb-2 block">Email address</label>
                                <input type="email" className="w-full bg-[#111113] border border-[#27272F] rounded-md px-4 py-2.5 text-sm text-[#EDEDEF] placeholder-[#3A3A44] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]/20 outline-none transition-all" placeholder="you@example.com" value={reqForm.email} onChange={e => setReqForm({ ...reqForm, email: e.target.value })} required />
                            </div>
                            {reqSubmitted ? (
                                <div className="w-full bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] text-sm font-medium px-6 py-2.5 rounded-md text-center">Request submitted</div>
                            ) : (
                                <button type="button" className="w-full bg-[#EDEDEF] text-[#09090B] font-medium text-sm px-6 py-2.5 rounded-md hover:bg-[#D4D4D8] hover:-translate-y-[1px] transition-all" onClick={handleRequestSubmit}>Submit request →</button>
                            )}
                        </form>
                        <div className="mt-6 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-[#63636E]">Popular:</span>
                            {['AI Logo Maker', 'AI Email Writer', 'AI Interview Coach'].map(tag => (
                                <button key={tag} className="inline-flex items-center bg-[#111113] border border-[#27272F] text-xs font-mono text-[#A1A1A9] px-2.5 py-1 rounded-md hover:text-[#EDEDEF] hover:border-[#33333D] transition-colors">{tag}</button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-28">
                    <div className="max-w-6xl mx-auto px-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
                            <div className="order-2 lg:order-1 flex justify-center lg:justify-end">
                                <div className="w-[300px] h-[600px] border border-[#27272F] rounded-[24px] bg-[#09090B] p-2 relative shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
                                    <div className="w-full h-full bg-[#111113] border border-[#1C1C22] rounded-[16px] overflow-hidden flex flex-col">
                                        <div className="bg-[#1A1A1F] border-b border-[#27272F] px-4 py-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded bg-[#27272F] flex items-center justify-center text-xs">🤖</div>
                                                <span className="text-sm font-medium text-[#EDEDEF]">ResumeAI</span>
                                            </div>
                                            <span className="w-2 h-2 rounded-full bg-[#22C55E]"></span>
                                        </div>
                                        <div className="flex-1 p-4 flex flex-col gap-3 justify-end text-sm">
                                            <div className="bg-[#1A1A1F] border border-[#27272F] text-[#EDEDEF] self-start py-2 px-3 rounded-md max-w-[85%]">Ready to build your resume?</div>
                                            <div className="bg-[#EDEDEF] text-[#09090B] self-end py-2 px-3 rounded-md max-w-[85%] font-medium">Yes, let's start!</div>
                                            <div className="bg-[#1A1A1F] border border-[#27272F] text-[#EDEDEF] self-start py-2 px-3 rounded-md max-w-[85%]">Great! What's your name?</div>
                                        </div>
                                        <div className="p-3 border-t border-[#27272F] bg-[#1A1A1F]">
                                            <div className="h-8 rounded-md border border-[#27272F] bg-[#09090B] flex items-center px-3">
                                                <span className="text-xs text-[#63636E]">Type a message...</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute top-6 -right-6 bg-[#111113] border border-[#27272F] px-3 py-1.5 rounded-md flex items-center gap-2 shadow-sm">
                                        <span className="relative flex h-2 w-2">
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]"></span>
                                        </span>
                                        <span className="text-xs font-mono text-[#A1A1A9]">2,400+ builds</span>
                                    </div>
                                </div>
                            </div>
                            <div className="order-1 lg:order-2 max-w-xl">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-xs font-mono text-[#3B82F6] mb-4">🎯 FEATURED TOOL</span>
                                <h2 className="text-[1.875rem] leading-[1.2] font-semibold tracking-tight text-[#EDEDEF] mb-4">AI Resume Builder</h2>
                                <p className="text-base text-[#A1A1A9] leading-relaxed mb-8">Generate a professional resume via a simple chat interface.</p>

                                <div className="space-y-6 mb-10">
                                    {[
                                        { n: '01', t: 'Open Meta Chat', d: 'Start on WhatsApp or Telegram' },
                                        { n: '02', t: 'Quick Questions', d: 'Answer simple AI prompts' },
                                        { n: '03', t: 'AI Engineering', d: 'Our AI crafts the layout' },
                                        { n: '04', t: 'Instant Download', d: 'Get your PDF in minutes' }
                                    ].map((s, i) => (
                                        <div key={i} className="flex gap-4">
                                            <span className="text-xs font-mono text-[#63636E] mt-1">{s.n}</span>
                                            <div>
                                                <h4 className="text-sm font-medium text-[#EDEDEF]">{s.t}</h4>
                                                <p className="text-sm text-[#A1A1A9] mt-1">{s.d}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <button className="bg-[#EDEDEF] text-[#09090B] font-medium text-sm px-6 py-3 rounded-md hover:bg-[#D4D4D8] transition-colors w-full sm:w-auto text-center inline-flex items-center justify-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                                        WhatsApp
                                    </button>
                                    <button className="bg-transparent border border-[#27272F] text-[#A1A1A9] font-medium text-sm px-6 py-3 rounded-md hover:border-[#33333D] hover:bg-[#111113] hover:text-[#EDEDEF] transition-colors w-full sm:w-auto text-center inline-flex items-center justify-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                                        Telegram
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="about" className="py-12 sm:py-24 border-t border-[#1C1C22]">
                    <div className="max-w-6xl mx-auto px-6">
                        {/* ── Header ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-16 mb-10 sm:mb-16">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-[#3B82F6] font-mono mb-2 sm:mb-3">Who We Are</p>
                                <h2 className="text-[1.875rem] leading-[1.2] font-semibold tracking-tight text-[#EDEDEF]">
                                    We Ship AI Tools Every 15 Days.
                                </h2>
                            </div>
                            <div className="lg:pt-8 mt-2 sm:mt-0">
                                <p className="text-base text-gray-400 leading-relaxed">
                                    SnapAI Labs is a small team obsessed with speed. We build the most-requested AI utilities from our community in 15 days, and ship them &mdash; no fluff, no bloat.
                                </p>
                            </div>
                        </div>

                        {/* ── Value Props ── */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1C1C22] rounded-lg overflow-hidden mb-12 sm:mb-16 stagger-children">
                            {[
                                { num: '01', title: 'Our Mission', body: 'Make powerful AI tools accessible to everyone — not just big companies with big budgets.' },
                                { num: '02', title: 'How We Work', body: 'Community votes on what to build next. We ship it in 15 days. Repeat. Forever.' },
                                { num: '03', title: 'Our Promise', body: 'No subscriptions that lock you in. Pay once per tool. Use it forever. Cancel anytime.' },
                            ].map((c, i) => (
                                <div key={i} className="bg-[#111113] p-5 sm:p-8">
                                    <span className="text-[10px] font-mono text-[#3A3A44] tracking-wider">{c.num}</span>
                                    <h3 className="text-sm font-semibold text-[#EDEDEF] mt-3 mb-2">{c.title}</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">{c.body}</p>
                                </div>
                            ))}
                        </div>

                        {/* ── How It Works ── */}
                        <div className="mb-12 sm:mb-16">
                            <p className="text-[10px] uppercase tracking-wider text-[#3B82F6] font-mono mb-6 mx-0 sm:mb-8">How It Works</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 stagger-children">
                                {[
                                    { title: 'You Request', desc: 'Submit the AI tool you need via our request form. Tell us what problem to solve.' },
                                    { title: 'We Build', desc: 'Our team sprints to build it in 15 days — rigorously tested and polished.' },
                                    { title: 'You Get It', desc: 'Early members get notified first with exclusive early access and 20% off.' },
                                ].map((s, i) => (
                                    <div key={i} className="flex gap-3 sm:gap-4">
                                        <div className="w-8 h-8 rounded-md bg-[#111113] border border-[#1C1C22] flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="text-xs font-mono text-[#EDEDEF]">{i + 1}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-[#EDEDEF] mb-1">{s.title}</h4>
                                            <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Stats ── */}
                        <div className="border-t border-[#1C1C22] pt-10 grid grid-cols-2 md:grid-cols-4 gap-y-8 stagger-children">
                            {[
                                { v: '3+', l: 'Tools Launched' },
                                { v: '15d', l: 'Build Cycle' },
                                { v: '20%', l: 'Member Discount' },
                                { v: '4.9', l: 'Average Rating' },
                            ].map((s, i) => (
                                <div key={i}>
                                    <h4 className="text-2xl font-mono font-semibold text-[#EDEDEF]">{s.v}</h4>
                                    <p className="text-xs text-[#3A3A44] mt-1 uppercase tracking-wider">{s.l}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
            <footer className="border-t border-[#1C1C22] py-8 mt-20">
                <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t-0">
                    <p className="text-xs text-[#63636E]">
                        © 2025 SnapAI Labs. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="#tools" className="text-xs text-[#63636E] hover:text-[#EDEDEF] transition-colors">Tools</a>
                        <a href="#request" className="text-xs text-[#63636E] hover:text-[#EDEDEF] transition-colors">Request</a>
                        <a href="#about" className="text-xs text-[#63636E] hover:text-[#EDEDEF] transition-colors">About</a>
                        <a href="#" className="text-xs text-[#63636E] hover:text-[#EDEDEF] transition-colors">Twitter</a>
                    </div>
                </div>
            </footer>

            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </div >
    )
}



export default App
