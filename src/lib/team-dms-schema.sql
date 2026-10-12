-- ==============================================================================
-- TEAM DIRECT MESSAGING SCHEMA
-- Allows 1-on-1 private messaging between teammates within a Team Workspace
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.team_direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for lightning-fast conversation queries
CREATE INDEX IF NOT EXISTS idx_team_dms_team_pair ON public.team_direct_messages(team_id, sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_team_dms_recipient_unread ON public.team_direct_messages(recipient_id, read_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.team_direct_messages ENABLE ROW LEVEL SECURITY;

-- 1. Users can ONLY select messages where they are the sender or recipient
CREATE POLICY "Users can read their own 1:1 direct messages"
    ON public.team_direct_messages FOR SELECT
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- 2. Users can insert messages where sender_id is themselves
CREATE POLICY "Users can send 1:1 direct messages"
    ON public.team_direct_messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = sender_id);

-- 3. Recipients can update read_at on messages received
CREATE POLICY "Recipients can mark messages as read"
    ON public.team_direct_messages FOR UPDATE
    TO authenticated
    USING (auth.uid() = recipient_id)
    WITH CHECK (auth.uid() = recipient_id);

-- 4. Enable Supabase Realtime for instant messaging
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'team_direct_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.team_direct_messages;
    END IF;
END $$;
