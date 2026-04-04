import { supabase as _sb } from './supabase'

// ═══════════════════════════════════════
//  WALLET HELPERS (Secure — all writes via Edge Functions)
// ═══════════════════════════════════════
const DEFAULT_FREE_CREDITS = 10
const SUPABASE_FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// Helper to call wallet-operations edge function
async function callWalletEdge(action, uid, extra = {}) {
    const response = await fetch(`${SUPABASE_FUNC_URL}/wallet-operations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ action, uid, ...extra })
    })
    const result = await response.json()
    if (!response.ok) {
        throw new Error(result.error || `Edge function failed (${response.status})`)
    }
    return result
}

export async function loadWallet(uid) {
    if (!uid) return { credits: 0, transactions: [] }
    try {
        // Try reading directly first (fast path — anon SELECT is allowed by RLS)
        let { data: wallet, error: walletErr } = await _sb.from('user_wallets').select('*').eq('uid', uid).maybeSingle()
        
        if (walletErr) {
            console.warn('Direct wallet read failed, using edge function:', walletErr.message)
        }

        if (!wallet) {
            // New user — create wallet via edge function (bypasses RLS for INSERT)
            console.log('No wallet found, creating via edge function...')
            const result = await callWalletEdge('load', uid)
            return { credits: result.credits || 0, transactions: result.transactions || [] }
        }

        // Wallet exists — read transactions directly (anon SELECT allowed)
        const { data: txns, error: txnErr } = await _sb.from('wallet_transactions').select('*').eq('uid', uid).order('created_at', { ascending: false }).limit(50)
        
        if (txnErr) {
            console.warn('Transaction read failed:', txnErr.message)
            // Fallback: get everything via edge function
            const result = await callWalletEdge('load', uid)
            return { credits: result.credits || 0, transactions: result.transactions || [] }
        }

        return { credits: wallet.credits || 0, transactions: txns || [] }
    } catch (err) {
        console.warn('Wallet load error:', err)
        // Last resort: try edge function
        try {
            const result = await callWalletEdge('load', uid)
            return { credits: result.credits || 0, transactions: result.transactions || [] }
        } catch (edgeErr) {
            console.error('Edge function also failed:', edgeErr)
            // Final fallback to localStorage
            try {
                const raw = localStorage.getItem(`snapai_wallet_${uid}`)
                if (raw) return JSON.parse(raw)
            } catch (e) { /* ignore */ }
            return { credits: DEFAULT_FREE_CREDITS, transactions: [] }
        }
    }
}

export async function addCredits(uid, amount, packName) {
    if (!uid) return null
    try {
        // All credit additions go through edge function (secure, bypasses RLS)
        const result = await callWalletEdge('add', uid, { amount, packName })
        if (result.success) {
            return result.credits
        }
        throw new Error(result.error || 'Failed to add credits')
    } catch (err) {
        console.error('addCredits error:', err)
        // Fallback to localStorage only for UI display — real credits tracked server-side
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
        const response = await fetch(`${SUPABASE_FUNC_URL}/deduct-credits`, {
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
        console.error('deductCredits error:', err)
        // Fallback to localStorage
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
