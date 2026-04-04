-- ══════════════════════════════════════════════════════════════
--  SECURE RLS POLICIES FOR SNAPAI WALLET SYSTEM
--  Run this in Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- First, drop any existing policies to start clean
DO $$
BEGIN
    -- user_wallets
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_wallets') THEN
        EXECUTE (
            SELECT string_agg('DROP POLICY IF EXISTS "' || policyname || '" ON public.user_wallets;', E'\n')
            FROM pg_policies WHERE tablename = 'user_wallets'
        );
    END IF;
    -- wallet_transactions
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_transactions') THEN
        EXECUTE (
            SELECT string_agg('DROP POLICY IF EXISTS "' || policyname || '" ON public.wallet_transactions;', E'\n')
            FROM pg_policies WHERE tablename = 'wallet_transactions'
        );
    END IF;
END $$;

-- ── Ensure RLS is enabled ──
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
--  user_wallets POLICIES
-- ══════════════════════════════════════════════════════════════

-- SELECT: Anon can read any wallet row (credit balances only, no PII)
-- This allows the frontend loadWallet to read balances
CREATE POLICY "anon_select_wallets" ON public.user_wallets
    FOR SELECT TO anon
    USING (true);

-- INSERT/UPDATE/DELETE: Only service_role can write
-- All writes go through Edge Functions (service role key)
CREATE POLICY "service_role_all_wallets" ON public.user_wallets
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  wallet_transactions POLICIES
-- ══════════════════════════════════════════════════════════════

-- SELECT: Anon can read transactions (to show history)
CREATE POLICY "anon_select_transactions" ON public.wallet_transactions
    FOR SELECT TO anon
    USING (true);

-- INSERT/UPDATE/DELETE: Only service_role can write
-- All writes go through Edge Functions (service role key)
CREATE POLICY "service_role_all_transactions" ON public.wallet_transactions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
--  OTHER TABLES — ensure they also work
-- ══════════════════════════════════════════════════════════════

-- settings table (read by frontend for waitlist toggle)
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_settings" ON public.settings
    FOR SELECT TO anon USING (true);
CREATE POLICY "service_role_all_settings" ON public.settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tools table (read by frontend)
ALTER TABLE IF EXISTS public.tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_tools" ON public.tools
    FOR SELECT TO anon USING (true);
CREATE POLICY "service_role_all_tools" ON public.tools
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- requests table (frontend inserts tool requests)
ALTER TABLE IF EXISTS public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_requests" ON public.requests
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_requests" ON public.requests
    FOR SELECT TO anon USING (true);
CREATE POLICY "service_role_all_requests" ON public.requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Verify ──
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('user_wallets', 'wallet_transactions', 'settings', 'tools', 'requests')
ORDER BY tablename, policyname;
