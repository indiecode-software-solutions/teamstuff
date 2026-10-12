-- ==============================================================================
-- TEAMS SCHEMA: Cross-Functional Collaborative Workspaces
-- ==============================================================================

-- 1. Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'Users',
    color VARCHAR(20) DEFAULT '#3B82F6',
    lead_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_private BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Team Members Table (Junction)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 3. Link todo_lists / Kanban to Teams (optional team-scoped boards)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'todo_lists' AND column_name = 'team_id'
    ) THEN
        ALTER TABLE public.todo_lists ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_teams_company ON public.teams(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_lists_team ON public.todo_lists(team_id);

-- 5. Enable Row Level Security
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 6. Helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_id = p_team_id AND user_id = p_user_id
    );
$$;

-- 7. Teams RLS Policies
DROP POLICY IF EXISTS "Users can view public company teams or teams they belong to" ON public.teams;
DROP POLICY IF EXISTS "Users can view teams in their company" ON public.teams;
CREATE POLICY "Users can view teams in their company" ON public.teams
    FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
CREATE POLICY "Users can create teams" ON public.teams
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Team leads or creators can update their teams" ON public.teams;
CREATE POLICY "Team leads or creators can update their teams" ON public.teams
    FOR UPDATE
    USING (
        created_by = auth.uid() 
        OR lead_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.team_members 
            WHERE team_id = id AND user_id = auth.uid() AND role = 'lead'
        )
    );

DROP POLICY IF EXISTS "Team creators or leads can delete their teams" ON public.teams;
CREATE POLICY "Team creators or leads can delete their teams" ON public.teams
    FOR DELETE
    USING (
        created_by = auth.uid() 
        OR lead_id = auth.uid()
    );

-- 8. Team Members RLS Policies
DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
CREATE POLICY "Users can view team members" ON public.team_members
    FOR SELECT
    USING (
        team_id IN (
            SELECT id FROM public.teams 
            WHERE company_id IN (
                SELECT company_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Team creators or leads can manage members" ON public.team_members;
CREATE POLICY "Team creators or leads can manage members" ON public.team_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_id AND (
                t.created_by = auth.uid() 
                OR t.lead_id = auth.uid()
                OR public.is_team_member(t.id, auth.uid())
            )
        )
    );

-- 9. Grants
GRANT ALL ON public.teams TO authenticated, anon;
GRANT ALL ON public.team_members TO authenticated, anon;
