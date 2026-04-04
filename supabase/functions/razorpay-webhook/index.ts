import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Validate signature using exact Razorpay Node.js logic
function verifySignature(payload: string, signature: string, secret: string) {
  const generatedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  
  console.log("Signature match:", generatedSignature === signature);
  return generatedSignature === signature;
}

const resendApiKey = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      console.error("No x-razorpay-signature header found");
      return new Response('Signature missing', { status: 400, headers: corsHeaders });
    }

    const payloadString = await req.text();
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

    if (!secret) {
      console.error("Missing RAZORPAY_WEBHOOK_SECRET env var");
      return new Response('Webhook secret not configured', { status: 500, headers: corsHeaders });
    }

    const isValid = verifySignature(payloadString, signature, secret);

    if (!isValid) {
      console.error("ERROR: Invalid Razorpay webhook signature!");
      return new Response('Invalid signature', { status: 400, headers: corsHeaders });
    }

    const payload = JSON.parse(payloadString);
    console.log("Webhook event received:", payload.event);

    // Handle BOTH payment.captured AND payment.authorized
    // The idempotency check below prevents double-crediting
    if (payload.event === 'payment.captured' || payload.event === 'payment.authorized') {
      const paymentEntity = payload.payload?.payment?.entity;
      
      if (!paymentEntity) {
        console.error("No payment entity found in webhook payload");
        return new Response(JSON.stringify({ status: 'ok', message: 'no payment entity' }), { 
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const paymentId = paymentEntity.id;
      const orderId = paymentEntity.order_id;
      // Notes can be on the payment or on the order
      const notes = paymentEntity.notes || {};

      const { uid, email, credits, label } = notes;

      console.log("Payment details:", { paymentId, orderId, uid, email, credits, label });

      if (!uid || !credits) {
        console.warn("Webhook notes missing uid or credits. Notes:", JSON.stringify(notes));
        return new Response(JSON.stringify({ status: 'ok', message: 'missing notes' }), { 
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        return new Response('Supabase config missing', { status: 500, headers: corsHeaders });
      }

      // Service role key bypasses RLS
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const numCredits = parseInt(credits, 10);
      if (isNaN(numCredits) || numCredits <= 0) {
        console.error("Invalid credits value:", credits);
        return new Response(JSON.stringify({ status: 'ok', message: 'invalid credits' }), { 
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // ── Idempotency Check ──
      // Check if this payment was already processed to avoid double-crediting
      const { data: existingTxn } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('uid', uid)
        .eq('type', 'purchase')
        .eq('description', `${label || 'Credits top-up via Razorpay'} [${paymentId}]`)
        .limit(1);

      if (existingTxn && existingTxn.length > 0) {
        console.log(`Payment ${paymentId} already processed. Skipping duplicate.`);
        return new Response(JSON.stringify({ status: 'ok', message: 'already processed' }), { 
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // ── 1. Update wallet balance ──
      const { data: wallet, error: walletFetchErr } = await supabase
        .from('user_wallets')
        .select('credits')
        .eq('uid', uid)
        .single();

      if (walletFetchErr) {
        console.log("Wallet fetch result - no existing wallet, will create. Error:", walletFetchErr.message);
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

      // ── 2. Insert transaction record ──
      const txnDescription = `${label || 'Credits top-up via Razorpay'} [${paymentId}]`;
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
        console.error("CRITICAL: Failed to insert transaction:", txnErr.message);
        // Wallet was already updated, so we log but don't revert
      } else {
        console.log(`Transaction recorded: ${numCredits} credits for ${uid}`);
      }

      // ── 3. Send email receipt via Resend ──
      if (email && resendApiKey) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'onboarding@resend.dev',
              to: [email],
              subject: 'SnapAI Payment Receipt',
              html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                  <h2>Payment Successful!</h2>
                  <p>Thank you for your purchase.</p>
                  <p><strong>Item:</strong> ${label || 'Credits top-up'}</p>
                  <p><strong>Credits Added:</strong> ${numCredits}</p>
                  <p>Your new balance is now ${newBalance} credits.</p>
                  <br/>
                  <p>Cheers,<br/>SnapAI Team</p>
                </div>
              `
            })
          });
          
          if (!res.ok) {
            const resendErr = await res.text();
            console.error("Resend Email failed:", resendErr);
          } else {
            console.log("Receipt email sent via Resend!");
          }
        } catch (emailErr: any) {
          console.error("Email send error:", emailErr.message);
        }
      } else {
        console.warn("Skipping email: No email provided or RESEND_API_KEY not set");
      }

      console.log(`✅ Fulfillment complete for ${uid}: +${numCredits} credits, new balance: ${newBalance}`);
    } else {
      console.log(`Ignoring event: ${payload.event}`);
    }

    return new Response(JSON.stringify({ status: 'ok' }), { 
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    console.error("Webhook processing error:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})
