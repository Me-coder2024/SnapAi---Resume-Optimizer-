import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { uid, amount, tool } = await req.json()

    if (!uid || !amount) {
      return new Response(JSON.stringify({ error: 'Missing uid or amount' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // Initialize Supabase client with the Service Role key
    // This BYPASSES all Row Level Security (RLS) policies
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const numCredits = parseInt(amount, 10)

    // 1. Get current wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from('user_wallets')
      .select('credits')
      .eq('uid', uid)
      .single()

    if (walletError || !wallet) {
      console.error("Wallet lookup error:", walletError)
      return new Response(JSON.stringify({ error: 'Wallet not found' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    if (wallet.credits < numCredits) {
      return new Response(JSON.stringify({ error: 'Insufficient credits' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const newBalance = wallet.credits - numCredits

    // 2. Deduct credits
    const { error: updateError } = await supabase
      .from('user_wallets')
      .update({ credits: newBalance, updated_at: new Date().toISOString() })
      .eq('uid', uid)

    if (updateError) {
      console.error("Wallet update error:", updateError)
      throw new Error('Failed to update wallet')
    }

    // 3. Log the transaction
    await supabase.from('wallet_transactions').insert([{
      uid, 
      type: 'debit', 
      amount: numCredits, 
      tool_name: tool || 'Unknown', 
      description: `Used ${numCredits} credits for ${tool || 'a tool'}`
    }])

    return new Response(
      JSON.stringify({ credits: newBalance, success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Deduct error:", error)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
