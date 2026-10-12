-- Migration: Add SafeLock PIN and security configuration column to profiles table

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS safelock_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.safelock_config IS 'Stores user-configured 4-digit SafeLock PIN hash, recovery question hash, password hint, and protected services configuration';

-- Ensure RLS allows users to read and update their own safelock_config
-- (Standard profile update policy typically covers this, but adding explicit commentary / verification)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can update their own safelock config'
    ) THEN
        CREATE POLICY "Users can update their own safelock config"
        ON public.profiles
        FOR UPDATE
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
