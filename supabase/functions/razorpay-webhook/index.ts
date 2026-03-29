import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

// Validate signature using exact Razorpay Node.js logic
function verifySignature(payload: string, signature: string, secret: string) {
  const generatedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  
  console.log("Expected Signature:", signature);
  console.log("Generated Signature:", generatedSignature);
  console.log("Secret Length used:", secret.length);

  return generatedSignature === signature;
}

const resendApiKey = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const signature = req.headers.get('x-razorpay-signature');
    if (!signature) {
      return new Response('Signature missing', { status: 400 });
    }

    const payloadString = await req.text();
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

    if (!secret) {
      console.error("Missing RAZORPAY_WEBHOOK_SECRET");
      return new Response('Webhook secret not configured', { status: 500 });
    }

    const isValid = verifySignature(payloadString, signature, secret);

    if (!isValid) {
      console.error("ERROR: Invalid Razorpay webhook signature!");
      return new Response('Invalid signature', { status: 400 });
    }

    const payload = JSON.parse(payloadString);

    // We only care about payment.captured or order.paid
    if (payload.event === 'order.paid' || payload.event === 'payment.captured') {
        // Find notes either in order or payment entity
        const entity = payload.payload.payment?.entity || payload.payload.order?.entity || {};
        const notes = entity.notes || {};

        const { uid, email, credits, label } = notes;

        if (uid && credits) {
            console.log(`Fulfilling order for User ${uid}, Credits: ${credits}`);

            const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            
            const numCredits = parseInt(credits, 10);

            // 1. Get current wallet
            let { data: wallet } = await supabase.from('user_wallets').select('credits').eq('uid', uid).single();
            
            let newBalance = numCredits;
            if (wallet) {
                newBalance += (wallet.credits || 0);
                await supabase.from('user_wallets').update({ credits: newBalance, updated_at: new Date().toISOString() }).eq('uid', uid);
            } else {
                await supabase.from('user_wallets').insert([{ uid, credits: newBalance }]);
            }

            // 2. Insert transaction
            await supabase.from('wallet_transactions').insert([{
                uid, type: 'purchase', amount: numCredits, tool_name: 'Wallet', description: label || 'Credits top-up via Razorpay'
            }]);

            // 3. Send email receipt via Resend
            if (email && resendApiKey) {
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
            } else {
                console.warn("Skipping email: No email provided or RESEND_API_KEY not set");
            }
        } else {
            console.warn("Webhook notes missing uid or credits. Unable to fulfill.");
        }
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' }});
  } catch (error: any) {
    console.error("Webhook processing error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' }})
  }
})
