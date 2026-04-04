import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_FREE_CREDITS = 10

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, uid, amount, packName } = await req.json()

    if (!uid) {
      return new Response(JSON.stringify({ error: 'Missing uid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Service role key BYPASSES all RLS policies
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // ═══════════════════════════════════════
    //  ACTION: load — Load or create wallet + transactions
    // ═══════════════════════════════════════
    if (action === 'load') {
      let { data: wallet, error: walletErr } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('uid', uid)
        .maybeSingle()

      if (walletErr) {
        console.error("Wallet fetch error:", walletErr.message)
      }

      // First-time user — create wallet with free credits
      if (!wallet) {
        const { data: newWallet, error: insertErr } = await supabase
          .from('user_wallets')
          .insert([{ uid, credits: DEFAULT_FREE_CREDITS }])
          .select()
          .single()

        if (insertErr) {
          console.error("Wallet creation error:", insertErr.message)
          return new Response(JSON.stringify({
            credits: DEFAULT_FREE_CREDITS,
            transactions: []
          }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        wallet = newWallet

        // Log welcome bonus
        await supabase.from('wallet_transactions').insert([{
          uid,
          type: 'purchase',
          amount: DEFAULT_FREE_CREDITS,
          tool_name: 'System',
          description: 'Welcome bonus credits'
        }])
      }

      // Fetch transactions
      const { data: txns } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('uid', uid)
        .order('created_at', { ascending: false })
        .limit(50)

      return new Response(JSON.stringify({
        credits: wallet?.credits || 0,
        transactions: txns || []
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ═══════════════════════════════════════
    //  ACTION: add — Add credits to wallet
    // ═══════════════════════════════════════
    if (action === 'add') {
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid amount' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get current balance
      const { data: wallet } = await supabase
        .from('user_wallets')
        .select('credits')
        .eq('uid', uid)
        .maybeSingle()

      const currentCredits = wallet?.credits || 0
      const newBalance = currentCredits + amount

      // Upsert wallet
      const { error: upsertErr } = await supabase
        .from('user_wallets')
        .upsert({
          uid,
          credits: newBalance,
          updated_at: new Date().toISOString()
        })

      if (upsertErr) {
        console.error("Wallet upsert error:", upsertErr.message)
        return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Log transaction
      const { error: txnErr } = await supabase
        .from('wallet_transactions')
        .insert([{
          uid,
          type: 'purchase',
          amount,
          tool_name: 'Wallet',
          description: packName || 'Credits added'
        }])

      if (txnErr) {
        console.error("Transaction log error:", txnErr.message)
      }

      console.log(`✅ Added ${amount} credits for ${uid}. New balance: ${newBalance}`)

      return new Response(JSON.stringify({
        credits: newBalance,
        success: true
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use "load" or "add".' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("Wallet operation error:", error.message, error.stack)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
