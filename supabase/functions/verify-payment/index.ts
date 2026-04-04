import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, uid, credits, label } = await req.json();

    console.log("verify-payment called:", { razorpay_order_id, razorpay_payment_id, uid, credits, label });

    if (!razorpay_payment_id || !uid || !credits) {
      return new Response(JSON.stringify({ error: 'Missing required fields: razorpay_payment_id, uid, credits' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const numCredits = parseInt(credits, 10);
    if (isNaN(numCredits) || numCredits <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid credits value' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 1. Verify the payment with Razorpay API ──
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
      console.error("Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET");
      return new Response(JSON.stringify({ error: 'Razorpay config missing' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const auth = btoa(`${keyId}:${keySecret}`);
    const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      }
    });

    if (!paymentRes.ok) {
      const errText = await paymentRes.text();
      console.error("Razorpay payment fetch failed:", errText);
      return new Response(JSON.stringify({ error: 'Could not verify payment with Razorpay' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payment = await paymentRes.json();
    console.log("Razorpay payment status:", payment.status, "amount:", payment.amount);

    // Verify payment is in a valid state (authorized or captured)
    if (payment.status !== 'authorized' && payment.status !== 'captured') {
      console.error(`Payment ${razorpay_payment_id} is in status: ${payment.status} — not valid for crediting`);
      return new Response(JSON.stringify({ error: `Payment status is ${payment.status}, not authorized/captured` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify the uid in notes matches (prevent tampering)
    const paymentNotes = payment.notes || {};
    if (paymentNotes.uid && paymentNotes.uid !== uid) {
      console.error(`UID mismatch: payment notes uid=${paymentNotes.uid}, request uid=${uid}`);
      return new Response(JSON.stringify({ error: 'UID mismatch — unauthorized' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 2. Connect to Supabase with service role ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(JSON.stringify({ error: 'Supabase config missing' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // ── 3. Idempotency check — skip if already processed ──
    const txnDescription = `${label || 'Credits top-up via Razorpay'} [${razorpay_payment_id}]`;

    const { data: existingTxn } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('uid', uid)
      .eq('type', 'purchase')
      .eq('description', txnDescription)
      .limit(1);

    if (existingTxn && existingTxn.length > 0) {
      console.log(`Payment ${razorpay_payment_id} already processed. Returning current balance.`);
      const { data: wallet } = await supabase
        .from('user_wallets')
        .select('credits')
        .eq('uid', uid)
        .single();

      return new Response(JSON.stringify({
        success: true,
        credits: wallet?.credits || 0,
        message: 'already_processed'
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 4. Add credits to wallet ──
    const { data: wallet, error: walletFetchErr } = await supabase
      .from('user_wallets')
      .select('credits')
      .eq('uid', uid)
      .maybeSingle();

    if (walletFetchErr) {
      console.log("Wallet fetch error (may not exist yet):", walletFetchErr.message);
    }

    let newBalance = numCredits;
    if (wallet) {
      newBalance += (wallet.credits || 0);
      const { error: updateErr } = await supabase
        .from('user_wallets')
        .update({ credits: newBalance, updated_at: new Date().toISOString() })
        .eq('uid', uid);

      if (updateErr) {
        console.error("CRITICAL: Failed to update wallet:", updateErr.message);
        return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log(`Updated wallet for ${uid}: ${wallet.credits} + ${numCredits} = ${newBalance}`);
    } else {
      const { error: insertErr } = await supabase
        .from('user_wallets')
        .insert([{ uid, credits: newBalance }]);

      if (insertErr) {
        console.error("CRITICAL: Failed to create wallet:", insertErr.message);
        return new Response(JSON.stringify({ error: 'Failed to create wallet' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log(`Created wallet for ${uid} with ${newBalance} credits`);
    }

    // ── 5. Insert transaction record ──
    const { error: txnErr } = await supabase
      .from('wallet_transactions')
      .insert([{
        uid,
        type: 'purchase',
        amount: numCredits,
        tool_name: 'Wallet',
        description: txnDescription
      }]);

    if (txnErr) {
      console.error("Transaction insert error:", txnErr.message);
    } else {
      console.log(`Transaction recorded: ${numCredits} credits for ${uid}`);
    }

    console.log(`✅ verify-payment: Credited ${numCredits} to ${uid}. New balance: ${newBalance}`);

    return new Response(JSON.stringify({
      success: true,
      credits: newBalance,
      message: 'credits_added'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("verify-payment error:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
