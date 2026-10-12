-- ==============================================================================
-- TEAM JOIN REQUESTS SCHEMA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.team_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_team_join_requests_team ON public.team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_user ON public.team_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_status ON public.team_join_requests(status);

-- Enable Row Level Security
ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own join requests, or team leads/creators/admins can view requests for their teams
DROP POLICY IF EXISTS "Users and team leads can view team join requests" ON public.team_join_requests;
CREATE POLICY "Users and team leads can view team join requests" ON public.team_join_requests
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_id AND (
                t.created_by = auth.uid()
                OR t.lead_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.team_members tm
                    WHERE tm.team_id = t.id AND tm.user_id = auth.uid() AND tm.role = 'lead'
                )
                OR EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'hr', 'hr_manager')
                )
            )
        )
    );

-- 2. Authenticated users can insert join requests for themselves
DROP POLICY IF EXISTS "Users can insert join requests" ON public.team_join_requests;
CREATE POLICY "Users can insert join requests" ON public.team_join_requests
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 3. Team leads, creators, or admins can update request status
DROP POLICY IF EXISTS "Team leads and admins can update join requests" ON public.team_join_requests;
CREATE POLICY "Team leads and admins can update join requests" ON public.team_join_requests
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_id AND (
                t.created_by = auth.uid()
                OR t.lead_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.team_members tm
                    WHERE tm.team_id = t.id AND tm.user_id = auth.uid() AND tm.role = 'lead'
                )
                OR EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'hr', 'hr_manager')
                )
            )
        )
    );

-- Grants
GRANT ALL ON public.team_join_requests TO authenticated, anon;
