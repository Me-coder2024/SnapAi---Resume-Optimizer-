import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { callGroq } from './groqApi'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { supabase as _sb } from './supabase'
import ProfileDropdown from './components/ui/ProfileDropdown'
import AuthModal from './components/ui/AuthModal'

const BotPage = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768)
    const [showAuthModal, setShowAuthModal] = useState(false)

    // Handle window resize for sidebar
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setSidebarOpen(true)
            } else {
                setSidebarOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])
    const [user, setUser] = useState(null)
    const [history, setHistory] = useState([])
    const [showInternBot, setShowInternBot] = useState(false)
    const [walletCredits, setWalletCredits] = useState(0)
    const chatEndRef = useRef(null)
    const inputRef = useRef(null)
    const initialSent = useRef(false)

    // Build InternBot iframe URL
    const rapidApiKey = import.meta.env.VITE_RAPIDAPI_KEY || ''
    const internBotUrl = user
        ? `/internbot/index.html?uid=${encodeURIComponent(user.uid)}&name=${encodeURIComponent(user.displayName || user.email.split('@')[0])}&email=${encodeURIComponent(user.email)}&rkey=${encodeURIComponent(rapidApiKey)}`
        : `/internbot/index.html?rkey=${encodeURIComponent(rapidApiKey)}`

    // Auth listener + wallet load
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            setUser(u)
            if (u) {
                try {
                    let { data: wallet } = await _sb.from('user_wallets').select('credits').eq('uid', u.uid).single()
                    setWalletCredits(wallet?.credits || 0)
                } catch (err) {
                    console.warn('Wallet load error:', err)
                    try {
                        const raw = localStorage.getItem(`snapai_wallet_${u.uid}`)
                        if (raw) setWalletCredits(JSON.parse(raw).credits || 0)
                    } catch (e) { /* ignore */ }
                }
            }
        })
        return unsub
    }, [])

    // Listen for InternBot credit messages via postMessage
    useEffect(() => {
        const handleMessage = async (e) => {
            if (!e.data || !e.data.type) return
            if (e.data.type === 'CHECK_CREDITS') {
                // Load fresh credits from Supabase
                let credits = walletCredits
                if (user?.uid) {
                    try {
                        const { data: w } = await _sb.from('user_wallets').select('credits').eq('uid', user.uid).single()
                        credits = w?.credits || 0
                        setWalletCredits(credits)
                    } catch (err) {
                        console.warn('Credit check error:', err)
                    }
                }
                e.source?.postMessage({ type: 'CREDITS_STATUS', credits }, '*')
            } else if (e.data.type === 'DEDUCT_CREDITS') {
                const amount = e.data.amount || 2
                const tool = e.data.tool || 'InternBot'
                if (!user?.uid) { e.source?.postMessage({ type: 'DEDUCT_FAILED', credits: 0 }, '*'); return }
                try {
                    const { data: wallet } = await _sb.from('user_wallets').select('credits').eq('uid', user.uid).single()
                    if (!wallet || wallet.credits < amount) {
                        e.source?.postMessage({ type: 'DEDUCT_FAILED', credits: 0 }, '*')
                        return
                    }
                    const newBal = wallet.credits - amount
                    await _sb.from('user_wallets').update({ credits: newBal, updated_at: new Date().toISOString() }).eq('uid', user.uid)
                    await _sb.from('wallet_transactions').insert([{ uid: user.uid, type: 'debit', amount, tool_name: tool, description: `Used ${amount} credits for ${tool}` }])
                    setWalletCredits(newBal)
                    e.source?.postMessage({ type: 'DEDUCT_SUCCESS', credits: newBal }, '*')
                } catch (err) {
                    console.warn('Deduct error:', err)
                    e.source?.postMessage({ type: 'DEDUCT_FAILED', credits: 0 }, '*')
                }
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [user, walletCredits])

    // Load conversation history from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('snapai_chat_history')
            if (saved) setHistory(JSON.parse(saved))
        } catch (e) { /* ignore */ }
    }, [])

    // Save current conversation to history when messages change
    useEffect(() => {
        if (messages.length > 0) {
            const preview = messages.find(m => m.role === 'user')?.content || 'New chat'
            const convo = {
                id: Date.now().toString(),
                preview: preview.slice(0, 40) + (preview.length > 40 ? '...' : ''),
                time: new Date().toLocaleDateString(),
                messages
            }
            // Update or add
            setHistory(prev => {
                const updated = [convo, ...prev.filter(h => h.preview !== convo.preview)].slice(0, 20)
                localStorage.setItem('snapai_chat_history', JSON.stringify(updated))
                return updated
            })
        }
    }, [messages])

    // Auto-scroll to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isTyping])

    // Handle query param on mount
    useEffect(() => {
        const q = searchParams.get('q')
        if (q && !initialSent.current) {
            initialSent.current = true
            handleSend(q)
        }
    }, [searchParams])

    const handleSend = async (text = input) => {
        if (!text.trim()) return
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const userMsg = { role: 'user', content: text.trim(), time: timeStr }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setIsTyping(true)

        try {
            const aiText = await callGroq(text.trim(), messages)
            const aiTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

            if (aiText.includes('[LAUNCH_INTERNBOT]')) {
                setMessages(prev => [...prev, {
                    role: 'ai',
                    content: 'I\'d be happy to help! Launching InternBot for you now...',
                    time: aiTime
                }])
                setTimeout(() => setShowInternBot(true), 800)
            } else {
                setMessages(prev => [...prev, { role: 'ai', content: aiText, time: aiTime }])
            }
        } catch (err) {
            const errTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            const errorMsg = err.message?.includes('429') || err.message?.includes('quota')
                ? 'API quota exceeded. Please try again in a moment.'
                : `Connection error: ${err.message || 'Unknown error'}`
            setMessages(prev => [...prev, { role: 'ai', content: errorMsg, time: errTime }])
        } finally {
            setIsTyping(false)
            inputRef.current?.focus()
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const startNewChat = () => {
        setMessages([])
        initialSent.current = false
        inputRef.current?.focus()
    }

    const greeting = user?.displayName || user?.email?.split('@')[0] || 'there'

    return (
        <div className="flex h-screen bg-[#09090B] text-[#A1A1A9] overflow-hidden">
            {/* ═══ SIDEBAR ═══ */}
            {/* Mobile backdrop */}
            {sidebarOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}
            <aside className={`${sidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72 md:w-0 md:translate-x-0'} fixed md:static inset-y-0 left-0 z-50 transition-all duration-300 border-r border-[#1C1C22] bg-[#111113] flex flex-col overflow-hidden shrink-0`}>
                {/* Logo */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C1C22]">
                    <button onClick={() => navigate('/')} className="font-semibold text-[#EDEDEF] text-lg font-mono hover:opacity-80 transition-opacity">SnapAI</button>
                    <button onClick={() => setSidebarOpen(false)} className="w-7 h-7 rounded-md flex items-center justify-center text-[#63636E] hover:text-[#EDEDEF] hover:bg-[#1A1A1F] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* Nav */}
                <nav className="px-3 py-4 space-y-1">
                    <button onClick={startNewChat} className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md bg-[#1A1A1F] text-[#EDEDEF] border border-[#27272F] hover:border-[#33333D] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        New Chat
                    </button>
                    <button onClick={() => navigate('/')} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#A1A1A9] rounded-md hover:bg-[#1A1A1F] hover:text-[#EDEDEF] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                        Home
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#3B82F6] rounded-md bg-[#3B82F6]/10 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        Chat
                    </button>
                </nav>

                {/* History */}
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {history.length > 0 && (
                        <>
                            <p className="text-[10px] uppercase tracking-wider text-[#3A3A44] font-mono px-3 mb-2 mt-2">Recent</p>
                            <div className="space-y-0.5">
                                {history.map((h, i) => (
                                    <button key={i} className="w-full text-left px-3 py-2 text-xs text-[#63636E] rounded-md hover:bg-[#1A1A1F] hover:text-[#A1A1A9] transition-colors truncate">
                                        {h.preview}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* User */}
                {user && (
                    <div className="px-4 py-3 border-t border-[#1C1C22] flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A1A1F] border border-[#27272F] flex items-center justify-center text-xs font-medium text-[#EDEDEF]">
                            {(user.displayName || user.email)?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#EDEDEF] truncate">{user.displayName || user.email?.split('@')[0]}</p>
                            <p className="text-[10px] text-[#3A3A44] truncate">{user.email}</p>
                        </div>
                    </div>
                )}
            </aside>

            {/* ═══ MAIN CHAT AREA ═══ */}
            <main className="flex-1 flex flex-col min-w-0 relative">
                {/* Header */}
                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-[#1C1C22] bg-[#09090B] shrink-0">
                    {/* Hamburger button visible on mobile ALWAYS if sidebar is closed, or on desktop if sidebar is closed */}
                    <button onClick={() => setSidebarOpen(true)} className={`${sidebarOpen ? 'md:hidden' : ''} w-8 h-8 rounded-md flex items-center justify-center text-[#63636E] hover:text-[#EDEDEF] hover:bg-[#111113] transition-colors shrink-0`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>

                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-[#EDEDEF] font-mono truncate">SnapAI</span>
                        <span className="text-[10px] font-mono text-[#3A3A44] bg-[#111113] border border-[#1C1C22] px-2 py-0.5 rounded hidden sm:inline-block">v1.0</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs font-mono text-[#A1A1A9] bg-[#111113] border border-[#1C1C22] px-2 sm:px-3 py-1.5 rounded-md">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            <span className="text-[#EDEDEF] font-semibold">{walletCredits}</span> <span className="hidden sm:inline">credits</span>
                        </div>
                        <button onClick={startNewChat} className="text-xs font-mono text-[#A1A1A9] bg-[#111113] border border-[#27272F] px-2 sm:px-3 py-1.5 rounded-md hover:text-[#EDEDEF] hover:border-[#33333D] transition-colors flex items-center gap-1.5 hidden sm:flex">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            <span className="hidden sm:inline">New Chat</span>
                        </button>
                        {user ? (
                            <ProfileDropdown user={user} walletCredits={walletCredits} onOpenProfile={() => navigate('/profile')} />
                        ) : (
                            <button className="bg-[#EDEDEF] text-[#09090B] font-medium text-xs px-3 py-1.5 rounded-md hover:bg-[#D4D4D8] transition-colors" onClick={() => setShowAuthModal(true)}>Login</button>
                        )}
                    </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto">
                    {messages.length === 0 ? (
                        /* ═══ EMPTY STATE / GREETING ═══ */
                        <div className="flex flex-col items-center justify-center h-full px-6">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1A1A1F] to-[#222228] border border-[#27272F] flex items-center justify-center mb-6">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-semibold text-[#EDEDEF] text-center">
                                Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, {greeting}
                            </h2>
                            <p className="text-lg text-[#A1A1A9] mt-2 text-center">
                                How Can I <span className="text-[#3B82F6]">Assist You Today?</span>
                            </p>

                            {/* Suggestion chips */}
                            <div className="flex flex-wrap gap-2 mt-8 max-w-md justify-center">
                                {[
                                    'What tools do you have?',
                                    'Find me an internship',
                                    'How does SnapAI work?',
                                    'Request a custom tool'
                                ].map((q, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(q)}
                                        className="text-xs text-[#A1A1A9] bg-[#111113] border border-[#1C1C22] px-3 py-2 rounded-lg hover:border-[#27272F] hover:text-[#EDEDEF] transition-colors"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* ═══ MESSAGES ═══ */
                        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex gap-2 sm:gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                    {msg.role === 'ai' && (
                                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#111113] border border-[#1C1C22] flex items-center justify-center shrink-0 mt-0.5">
                                            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                        </div>
                                    )}
                                    <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? '' : ''}`}>
                                        <div className={`px-4 py-3 rounded-lg text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-[#EDEDEF] text-[#09090B]'
                                            : 'bg-[#111113] border border-[#1C1C22] text-[#EDEDEF]'
                                            }`}>
                                            {msg.content}
                                        </div>
                                        <span className="text-[10px] text-[#3A3A44] mt-1 px-1 block">
                                            {msg.role === 'ai' ? 'SnapAI' : 'You'} · {msg.time}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {isTyping && (
                                <div className="flex gap-3">
                                    <div className="w-7 h-7 rounded-md bg-[#111113] border border-[#1C1C22] flex items-center justify-center shrink-0 mt-0.5">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    </div>
                                    <div className="bg-[#111113] border border-[#1C1C22] px-4 py-3 rounded-lg">
                                        <div className="flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse"></span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    )}
                </div>

                {/* InternBot iframe overlay */}
                {showInternBot && (
                    <div className="absolute inset-0 z-30 bg-[#09090B] flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C1C22]">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[#EDEDEF] font-mono">InternBot</span>
                                <span className="text-[10px] font-mono text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded">LIVE</span>
                            </div>
                            <button onClick={() => setShowInternBot(false)} className="text-xs font-mono text-[#A1A1A9] bg-[#111113] border border-[#27272F] px-3 py-1.5 rounded-md hover:text-[#EDEDEF] hover:border-[#33333D] transition-colors flex items-center gap-1.5">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Back to Chat
                            </button>
                        </div>
                        <iframe src={internBotUrl} title="InternBot" className="flex-1 w-full border-0" />
                    </div>
                )}

                {/* Input Bar */}
                <div className="border-t border-[#1C1C22] bg-[#09090B] px-3 sm:px-4 py-3 sm:py-4 shrink-0">
                    <div className="max-w-3xl mx-auto">
                        <form onSubmit={(e) => { e.preventDefault(); handleSend() }} className="flex items-center gap-2 bg-[#111113] border border-[#1C1C22] rounded-lg px-3 sm:px-4 py-2 sm:py-3 focus-within:border-[#3B82F6] transition-colors">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#3A3A44] shrink-0 hidden sm:block"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Message SnapAI..."
                                className="flex-1 bg-transparent text-sm text-[#EDEDEF] placeholder-[#3A3A44] outline-none min-w-0"
                                autoComplete="off"
                                autoFocus
                            />
                            <button type="submit" disabled={!input.trim() || isTyping} className="w-8 h-8 sm:w-8 sm:h-8 rounded-md flex items-center justify-center bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </form>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 px-1">
                            {[
                                { icon: '✦', label: 'Reasoning' },
                                { icon: '◈', label: 'Explore Tools' },
                                { icon: '⬡', label: 'Deep Research' },
                            ].map((chip, i) => (
                                <button key={i} className="text-[10px] sm:text-[11px] text-[#3A3A44] hover:text-[#A1A1A9] transition-colors flex items-center gap-1 font-mono">
                                    <span>{chip.icon}</span> {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </div>
    )
}

export default BotPage
