import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase as _sb } from './supabase'
import { auth } from './firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
// ═══════════════════════════════════════
//  WALLET HELPERS (Supabase-backed)
// ═══════════════════════════════════════
const DEFAULT_FREE_CREDITS = 10

async function loadWallet(uid) {
    if (!uid) return { credits: 0, transactions: [] }
    try {
        let { data: wallet } = await _sb.from('user_wallets').select('*').eq('uid', uid).single()
        if (!wallet) {
            const { data: newWallet } = await _sb.from('user_wallets').insert([{ uid, credits: DEFAULT_FREE_CREDITS }]).select().single()
            wallet = newWallet || { uid, credits: DEFAULT_FREE_CREDITS }
            await _sb.from('wallet_transactions').insert([{
                uid, type: 'purchase', amount: DEFAULT_FREE_CREDITS, tool_name: 'System', description: 'Welcome bonus credits'
            }])
        }
        const { data: txns } = await _sb.from('wallet_transactions').select('*').eq('uid', uid).order('created_at', { ascending: false }).limit(50)
        return { credits: wallet.credits || 0, transactions: txns || [] }
    } catch (err) {
        console.warn('Wallet load error (localStorage fallback):', err)
        try {
            const raw = localStorage.getItem(`snapai_wallet_${uid}`)
            if (raw) return JSON.parse(raw)
        } catch (e) { /* ignore */ }
        const fallback = { credits: DEFAULT_FREE_CREDITS, transactions: [{ type: 'purchase', amount: DEFAULT_FREE_CREDITS, tool_name: 'System', description: 'Welcome bonus credits', created_at: new Date().toISOString() }] }
        localStorage.setItem(`snapai_wallet_${uid}`, JSON.stringify(fallback))
        return fallback
    }
}

async function addCredits(uid, amount, packName) {
    if (!uid) return null
    try {
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

// ═══════════════════════════════════════
//  CREDIT PACKS
// ═══════════════════════════════════════
const CREDIT_PACKS = [
    { id: 1, credits: 10, price: 20, label: '10 Credits', badge: '' },
    { id: 2, credits: 30, price: 50, label: '30 Credits', badge: 'POPULAR', save: '17%' },
    { id: 3, credits: 50, price: 80, label: '50 Credits', badge: 'BEST VALUE', save: '20%' },
]

// ═══════════════════════════════════════
//  PROFILE PAGE (Full Page at /profile)
// ═══════════════════════════════════════
export default function ProfilePage() {
    const navigate = useNavigate()
    const [user, setUser] = useState(null)
    const [wallet, setWallet] = useState({ credits: 0, transactions: [] })
    const [buying, setBuying] = useState(null)
    const [loading, setLoading] = useState(true)

    const refreshWallet = useCallback(async (uid) => {
        if (!uid) { setWallet({ credits: 0, transactions: [] }); return }
        const w = await loadWallet(uid)
        setWallet(w)
    }, [])

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser)
            setLoading(false)
            if (currentUser) refreshWallet(currentUser.uid)
            else navigate('/')  // redirect to home if not logged in
        })
        return () => unsubscribe()
    }, [refreshWallet, navigate])

    if (loading) {
        return <div className="profile-full-page"><div className="profile-loading">Loading...</div></div>
    }

    if (!user) return null

    const initial = (user.displayName || user.email || 'U')[0].toUpperCase()
    const totalPurchased = wallet.transactions.filter(t => t.type === 'purchase').reduce((s, t) => s + t.amount, 0)
    const totalUsed = wallet.transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0)

    const handleBuyPack = async (pack) => {
        setBuying(pack.id)
        await addCredits(user.uid, pack.credits, `${pack.label} — ₹${pack.price}`)
        await refreshWallet(user.uid)
        setBuying(null)
    }

    return (
        <div className="bg-[#09090B] text-[#A1A1A9] min-h-screen font-sans">
            {/* Top Nav Bar */}
            <nav className="sticky top-0 z-50 bg-[#09090B]/80 backdrop-blur-sm border-b border-[#1C1C22] h-16">
                <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
                    <div className="font-semibold text-[#EDEDEF] text-lg font-mono cursor-pointer" onClick={() => navigate('/')}>SnapAI</div>
                    <div className="flex items-center gap-4">
                        <button className="text-sm font-medium text-[#A1A1A9] hover:text-[#EDEDEF] transition-colors flex items-center gap-2" onClick={() => navigate('/')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                            Back to Home
                        </button>
                        <button className="bg-transparent border border-[#27272F] text-[#A1A1A9] text-sm font-medium px-4 py-1.5 rounded-md hover:border-[#33333D] hover:text-[#EDEDEF] hover:bg-[#111113] transition-all flex items-center gap-2" onClick={() => { signOut(auth); navigate('/') }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                            Log Out
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-4xl mx-auto px-6 py-12 md:py-20">

                {/* User Header */}
                <div className="flex items-center gap-6 mb-12">
                    <div className="w-20 h-20 rounded-full bg-[#1A1A1F] border border-[#27272F] text-[#EDEDEF] flex items-center justify-center text-3xl font-medium">
                        {initial}
                    </div>
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-[#EDEDEF] mb-1">{user.displayName || user.email.split('@')[0]}</h1>
                        <p className="text-sm text-[#63636E] font-mono">{user.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    {/* Wallet Balance */}
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-lg p-6 flex flex-col justify-between col-span-1 md:col-span-2 hover:border-[#27272F] transition-colors">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[#63636E] font-mono mb-4">Wallet Balance</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-mono font-semibold text-[#EDEDEF] tracking-tight">{wallet.credits}</span>
                                <span className="text-sm text-[#A1A1A9]">credits</span>
                            </div>
                        </div>
                        <p className="text-xs text-[#63636E] mt-6 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]"></span>
                            Each InternBot search uses 2 credits
                        </p>
                    </div>

                    {/* Usage Summary */}
                    <div className="bg-[#111113] border border-[#1C1C22] rounded-lg p-6 flex flex-col justify-between hover:border-[#27272F] transition-colors">
                        <p className="text-xs uppercase tracking-wider text-[#63636E] font-mono mb-4">Usage Stats</p>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[#A1A1A9]">Purchased</span>
                                <span className="font-mono text-[#22C55E] text-sm">+{totalPurchased}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[#A1A1A9]">Used</span>
                                <span className="font-mono text-[#EF4444] text-sm">−{totalUsed}</span>
                            </div>
                            <div className="pt-4 border-t border-[#1C1C22] flex items-center justify-between">
                                <span className="text-sm font-medium text-[#EDEDEF]">Remaining</span>
                                <span className="font-mono font-medium text-[#3B82F6] text-sm">{wallet.credits}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Buy Credits */}
                <div className="mb-16">
                    <h2 className="text-lg font-medium text-[#EDEDEF] mb-6 flex items-center gap-2">Recharge Credits</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {CREDIT_PACKS.map(pack => (
                            <button key={pack.id} className={`bg-[#111113] border ${pack.badge ? 'border-[#3B82F6]/30' : 'border-[#1C1C22]'} rounded-lg p-6 text-left hover:border-[#27272F] ${pack.badge ? 'hover:border-[#3B82F6]/50' : ''} transition-colors relative flex flex-col`} onClick={() => handleBuyPack(pack)} disabled={buying === pack.id}>
                                {pack.badge && (
                                    <span className="absolute -top-2.5 right-4 bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-xs font-mono text-[#3B82F6] px-2 py-0.5 rounded">
                                        {pack.badge}
                                    </span>
                                )}
                                <div className="mb-8">
                                    <span className="text-3xl font-mono font-semibold text-[#EDEDEF] tracking-tight">{pack.credits}</span>
                                    <span className="text-sm text-[#A1A1A9] ml-1">credits</span>
                                </div>
                                <div className="mt-auto">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-lg font-medium text-[#EDEDEF]">₹{pack.price}</span>
                                        {pack.save && <span className="text-xs text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded">Save {pack.save}</span>}
                                    </div>
                                    <div className={`w-full py-2 rounded-md text-sm font-medium text-center transition-colors ${pack.badge ? 'bg-[#EDEDEF] text-[#09090B] hover:bg-[#D4D4D8]' : 'bg-[#1A1A1F] border border-[#27272F] text-[#EDEDEF] hover:bg-[#222228]'}`}>
                                        {buying === pack.id ? 'Adding...' : 'Buy Now'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-[#63636E] mt-4 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                        Payment gateway coming soon — credits added instantly for testing
                    </p>
                </div>

                {/* Transaction History */}
                <div>
                    <h2 className="text-lg font-medium text-[#EDEDEF] mb-6">Transaction History</h2>
                    {wallet.transactions.length === 0 ? (
                        <div className="bg-[#111113] border border-[#1C1C22] rounded-lg p-12 text-center">
                            <svg className="w-8 h-8 mx-auto text-[#3A3A44] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            <p className="text-sm text-[#A1A1A9]">No transactions yet</p>
                        </div>
                    ) : (
                        <div className="bg-[#111113] border border-[#1C1C22] rounded-lg overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[#27272F] bg-[#1A1A1F]">
                                        <th className="py-3 px-4 text-xs font-mono uppercase tracking-wider text-[#63636E]">Transaction</th>
                                        <th className="py-3 px-4 text-xs font-mono uppercase tracking-wider text-[#63636E]">Date</th>
                                        <th className="py-3 px-4 text-xs font-mono uppercase tracking-wider text-[#63636E] text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wallet.transactions.slice(0, 20).map((txn, i) => (
                                        <tr key={i} className="border-b border-[#1C1C22] last:border-0 hover:bg-[#1A1A1F] transition-colors">
                                            <td className="py-3 px-4 flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center ${txn.type === 'purchase' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#EF4444]/10 text-[#EF4444]'}`}>
                                                    {txn.type === 'purchase' ? '+' : '−'}
                                                </div>
                                                <span className="text-sm text-[#EDEDEF] font-medium">{txn.description || txn.tool_name}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm text-[#A1A1A9]">{new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    <span className="text-xs text-[#63636E] font-mono">{new Date(txn.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={`text-sm font-mono font-medium ${txn.type === 'purchase' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                                                    {txn.type === 'purchase' ? '+' : '−'}{txn.amount}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
