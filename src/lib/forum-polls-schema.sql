-- ==============================================================================
-- Forum Polls Schema Migration
-- ==============================================================================

-- 1. Forum Polls Table
CREATE TABLE IF NOT EXISTS public.forum_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    description TEXT,
    options JSONB NOT NULL, -- Array of { id: string, text: string }
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Forum Poll Votes Table (1 vote per user per poll)
CREATE TABLE IF NOT EXISTS public.forum_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.forum_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (poll_id, user_id)
);

-- 3. Link Poll to Forum Post (for comments, likes, notifications, categories)
ALTER TABLE IF EXISTS public.forum_posts
  ADD COLUMN IF NOT EXISTS poll_id UUID REFERENCES public.forum_polls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'discussion';

-- 4. Company setting: allow team leads / admins to create polls
ALTER TABLE IF EXISTS public.companies
  ADD COLUMN IF NOT EXISTS allow_team_lead_polls BOOLEAN NOT NULL DEFAULT false;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_forum_polls_company ON public.forum_polls(company_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_forum_poll_votes_poll ON public.forum_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_poll ON public.forum_posts(poll_id);

-- Enable RLS
ALTER TABLE public.forum_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_poll_votes ENABLE ROW LEVEL SECURITY;

-- Policies for forum_polls
DROP POLICY IF EXISTS "Users can view polls in their company" ON public.forum_polls;
CREATE POLICY "Users can view polls in their company" ON public.forum_polls
    FOR SELECT USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can create polls in their company" ON public.forum_polls;
CREATE POLICY "Users can create polls in their company" ON public.forum_polls
    FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Policies for forum_poll_votes
DROP POLICY IF EXISTS "Users can view poll votes in their company" ON public.forum_poll_votes;
CREATE POLICY "Users can view poll votes in their company" ON public.forum_poll_votes
    FOR SELECT USING (
        poll_id IN (SELECT id FROM public.forum_polls WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can cast vote in their company" ON public.forum_poll_votes;
CREATE POLICY "Users can cast vote in their company" ON public.forum_poll_votes
    FOR INSERT WITH CHECK (
        poll_id IN (SELECT id FROM public.forum_polls WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
        AND user_id = auth.uid()
    );
