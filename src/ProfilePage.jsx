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
    { id: 1, credits: 20, price: 15, label: '20 Credits', badge: '' },
    { id: 2, credits: 55, price: 50, label: '55 Credits', badge: 'POPULAR', save: '+5 Bonus' },
    { id: 3, credits: 90, price: 80, label: '90 Credits', badge: 'BEST VALUE', save: '+10 Bonus' },
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
    const [customAmount, setCustomAmount] = useState('')

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

        // Administrative Bypass for 50 Rupees / 55 Credits Pack
        if (pack.price === 50 && pack.credits === 55) {
            try {
                const newBalance = await addCredits(user.uid, pack.credits, 'Bypass Razorpay (Admin Pack)');
                setWallet(prev => ({
                    credits: newBalance,
                    transactions: [
                        { type: 'purchase', amount: pack.credits, tool_name: 'Wallet', description: 'Bypass Razorpay (Admin Pack)', created_at: new Date().toISOString() },
                        ...prev.transactions
                    ]
                }))
                alert(`${pack.credits} credits successfully added to your wallet directly!`);
            } catch (err) {
                console.error('Error adding bypass credits:', err);
                alert('Could not add credits directly.');
            }
            setBuying(null);
            return;
        }

        try {
            // 1. Create order
            const { data, error } = await _sb.functions.invoke('create-razorpay-order', {
                body: { 
                    amount: pack.price,
                    notes: {
                        uid: user.uid,
                        email: user.email,
                        credits: String(pack.credits),
                        label: pack.label
                    }
                }
            })
            
            if (error || !data) throw error || new Error("Failed to create order")
            
            // 2. Configure options
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                amount: pack.price * 100, // Amount is in currency subunits. Default currency is INR. Hence, 50000 refers to 50000 paise
                currency: "INR",
                name: "SnapAI",
                description: pack.label,
                order_id: data.id, // This is a sample Order ID. Pass the `id` obtained in the response of Step 1
                notes: {
                    uid: user.uid,
                    email: user.email,
                    credits: String(pack.credits),
                    label: pack.label
                },
                handler: async function (response) {
                    try {
                        // Keep UI in processing state
                        setBuying('processing'); 
                        console.log('Payment successful! Razorpay response:', response);
                        
                        // Poll for credit update — the webhook runs async, so give it time
                        const currentCredits = wallet.credits;
                        let updated = false;
                        
                        for (let attempt = 1; attempt <= 6; attempt++) {
                            await new Promise(r => setTimeout(r, 2500)); // wait 2.5s between polls
                            const freshWallet = await loadWallet(user.uid);
                            console.log(`Poll attempt ${attempt}: balance = ${freshWallet.credits} (was ${currentCredits})`);
                            
                            if (freshWallet.credits > currentCredits) {
                                setWallet(freshWallet);
                                updated = true;
                                break;
                            }
                        }
                        
                        if (!updated) {
                            // Final attempt — force refresh one more time
                            await refreshWallet(user.uid);
                            console.warn('Credits may not have updated yet. If credits are missing, they will be added shortly.');
                            alert('Payment successful! If credits don\'t appear immediately, please refresh the page in a minute. Your payment is safe.');
                        }
                        
                        setBuying(null);
                    } catch(err) {
                        console.error('Failed refreshing post-payment', err)
                        alert('Payment was successful but there was an issue refreshing your balance. Please refresh the page.');
                        setBuying(null)
                    }
                },
                prefill: {
                    name: user.displayName || 'User',
                    email: user.email
                },
                theme: {
                    color: "#111113"
                }
            };
            
            // 3. Open modal
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response){
                console.error("Payment Failed", response.error.description);
                setBuying(null);
            });
            rzp.open();
        } catch(err) {
            console.error('Error starting checkout:', err)
            alert('Could not initiate payment. Please try again.')
            setBuying(null)
        }
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

                {/* Credit Usage Card – Watermelon-inspired */}
                <div className="bg-[#111113] border border-[#1C1C22] rounded-xl mb-12 overflow-hidden hover:border-[#27272F] transition-colors">
                    {/* Top Section */}
                    <div className="p-6 pb-4">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.15em] text-[#63636E] font-mono mb-2">Credits Used</p>
                                <span className="text-4xl font-mono font-semibold text-[#EDEDEF] tracking-tight">
                                    {totalPurchased > 0 ? ((totalUsed / totalPurchased) * 100).toFixed(1) : '0.0'}%
                                </span>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] uppercase tracking-[0.15em] text-[#63636E] font-mono mb-1">Balance</p>
                                <span className="text-2xl font-mono font-semibold text-[#EDEDEF]">{wallet.credits}</span>
                                <span className="text-xs text-[#63636E] ml-1">credits</span>
                            </div>
                        </div>

                        {/* Segmented Progress Bar */}
                        <div className="flex gap-[2px] mb-2" style={{ height: '18px' }}>
                            {Array.from({ length: 40 }, (_, i) => {
                                const usedPercent = totalPurchased > 0 ? (totalUsed / totalPurchased) : 0;
                                const segmentThreshold = (i + 1) / 40;
                                const isFilled = segmentThreshold <= usedPercent;
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            flex: 1,
                                            borderRadius: '2px',
                                            background: isFilled ? '#F97316' : '#1C1C22',
                                            transition: 'background 0.3s ease',
                                        }}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-[#63636E] uppercase tracking-wider">
                            <span>{totalUsed} / {totalPurchased} Credits</span>
                            <span>{wallet.credits} remaining</span>
                        </div>
                    </div>

                    {/* Dashed Divider */}
                    <div className="border-t border-dashed border-[#27272F]" />

                    {/* Usage History (Inline Mini Table) */}
                    <div className="p-6 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-[#EDEDEF]">Usage History</p>
                            <span className="text-[10px] font-mono text-[#63636E] uppercase tracking-wider bg-[#1A1A1F] border border-[#27272F] px-2 py-0.5 rounded">Recent</span>
                        </div>
                        {wallet.transactions.length === 0 ? (
                            <p className="text-xs text-[#63636E] text-center py-4">No transactions yet</p>
                        ) : (
                            <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: '0 2px' }}>
                                <thead>
                                    <tr>
                                        <th className="text-[10px] font-mono uppercase tracking-wider text-[#63636E] pb-2">Date</th>
                                        <th className="text-[10px] font-mono uppercase tracking-wider text-[#63636E] pb-2">Action</th>
                                        <th className="text-[10px] font-mono uppercase tracking-wider text-[#63636E] pb-2 text-right">Credits</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wallet.transactions.slice(0, 5).map((txn, i) => (
                                        <tr key={i} className="group">
                                            <td className="py-1.5 text-xs font-mono text-[#A1A1A9]">
                                                {new Date(txn.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })},&nbsp;
                                                {new Date(txn.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="py-1.5 text-xs text-[#A1A1A9]">{txn.description || txn.tool_name}</td>
                                            <td className={`py-1.5 text-xs font-mono font-medium text-right ${txn.type === 'purchase' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                                                {txn.type === 'purchase' ? '+' : '−'}{txn.amount}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-dashed border-[#27272F] px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-mono text-[#63636E] uppercase tracking-wider">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                            Billing via Razorpay
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-[#63636E]">1 credit = ₹1</span>
                        </div>
                    </div>
                </div>

                {/* Buy Credits */}
                <div className="mb-16">
                    <h2 className="text-lg font-medium text-[#EDEDEF] mb-6 flex items-center gap-2">Recharge Credits</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {CREDIT_PACKS.map(pack => (
                            <button key={pack.id} className={`bg-[#111113] border ${pack.badge ? 'border-[#3B82F6]/30' : 'border-[#1C1C22]'} rounded-lg p-6 text-left hover:border-[#27272F] ${pack.badge ? 'hover:border-[#3B82F6]/50' : ''} transition-colors relative flex flex-col`} onClick={() => handleBuyPack(pack)} disabled={buying !== null}>
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
                                        {buying === pack.id ? 'Adding...' : buying === 'processing' ? 'Processing...' : 'Buy Now'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Custom Credits Input */}
                    <div className="mt-6 bg-[#111113] border border-[#1C1C22] rounded-lg p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-medium text-[#EDEDEF] mb-1">Custom Amount</h3>
                            <p className="text-xs text-[#A1A1A9]">1 Credit = ₹1. Enter exactly how much you need.</p>
                        </div>
                        <div className="flex w-full md:w-auto items-center gap-3">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#63636E] font-medium">₹</span>
                                <input 
                                    type="number" 
                                    min="1"
                                    placeholder="Enter amount" 
                                    className="bg-[#1A1A1F] border border-[#27272F] text-[#EDEDEF] rounded-md py-2 pl-8 pr-4 w-full md:w-40 text-sm focus:outline-none focus:border-[#3B82F6] transition-colors"
                                    value={customAmount}
                                    onChange={(e) => setCustomAmount(e.target.value)}
                                    disabled={buying !== null}
                                />
                            </div>
                            <button 
                                className="bg-[#EDEDEF] text-[#09090B] px-5 py-2 rounded-md text-sm font-medium hover:bg-[#D4D4D8] transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => {
                                    const amt = parseInt(customAmount, 10);
                                    if (amt > 0) handleBuyPack({ id: 'custom', credits: amt, price: amt, label: `${amt} Custom Credits` });
                                }}
                                disabled={!customAmount || parseInt(customAmount, 10) < 1 || buying !== null}
                            >
                                {buying === 'custom' ? 'Processing...' : 'Buy Custom'}
                            </button>
                        </div>
                    </div>

                    <p className="text-xs text-[#63636E] mt-6 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                        Payments are securely processed via Razorpay
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
