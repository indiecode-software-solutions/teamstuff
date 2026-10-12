-- ==============================================================================
-- Teamstuff INTRANET: COMPLETE TEAMS & WORKSPACES SCHEMA
-- ==============================================================================

-- 1. TEAMS TABLE
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'Users',
    color VARCHAR(20) DEFAULT '#18181b',
    lead_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_private BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TEAM MEMBERS (Junction)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 3. TEAM CHANNELS
CREATE TABLE IF NOT EXISTS public.team_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, name)
);

-- 4. TEAM CHANNEL MESSAGES
CREATE TABLE IF NOT EXISTS public.team_channel_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TEAM DEDICATED KANBAN TASKS
CREATE TABLE IF NOT EXISTS public.team_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date TIMESTAMPTZ,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TEAM CALENDAR EVENTS & MILESTONES
CREATE TABLE IF NOT EXISTS public.team_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    event_type VARCHAR(50) DEFAULT 'meeting' CHECK (event_type IN ('meeting', 'deadline', 'review', 'sprint', 'social')),
    location VARCHAR(255),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TEAM QUICK LINKS & RESOURCES
CREATE TABLE IF NOT EXISTS public.team_quick_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'Link',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INDEXES FOR HIGH-PERFORMANCE QUERYING
CREATE INDEX IF NOT EXISTS idx_teams_company ON public.teams(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_channels_team ON public.team_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_channel ON public.team_channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_team ON public.team_channel_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_team ON public.team_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assignee ON public.team_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_team_events_team ON public.team_events(team_id);
CREATE INDEX IF NOT EXISTS idx_team_quick_links_team ON public.team_quick_links(team_id);

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_quick_links ENABLE ROW LEVEL SECURITY;

-- Teams Policies
DROP POLICY IF EXISTS "Users can view teams in their company" ON public.teams;
CREATE POLICY "Users can view teams in their company" ON public.teams
    FOR SELECT USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can create teams in their company" ON public.teams;
CREATE POLICY "Users can create teams in their company" ON public.teams
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Team leads or creators can update teams" ON public.teams;
CREATE POLICY "Team leads or creators can update teams" ON public.teams
    FOR UPDATE USING (
        created_by = auth.uid() OR lead_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM public.team_members WHERE team_id = id AND user_id = auth.uid() AND role = 'lead')
    );

DROP POLICY IF EXISTS "Team leads or creators can delete teams" ON public.teams;
CREATE POLICY "Team leads or creators can delete teams" ON public.teams
    FOR DELETE USING (
        created_by = auth.uid() OR lead_id = auth.uid()
    );

-- Team Members Policies
DROP POLICY IF EXISTS "Users can view team members" ON public.team_members;
CREATE POLICY "Users can view team members" ON public.team_members
    FOR SELECT USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can manage team members" ON public.team_members;
CREATE POLICY "Users can manage team members" ON public.team_members
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

-- Team Channels Policies
DROP POLICY IF EXISTS "Users can view team channels" ON public.team_channels;
CREATE POLICY "Users can view team channels" ON public.team_channels
    FOR SELECT USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can create team channels" ON public.team_channels;
CREATE POLICY "Users can create team channels" ON public.team_channels
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

-- Team Messages Policies
DROP POLICY IF EXISTS "Users can view team messages" ON public.team_channel_messages;
CREATE POLICY "Users can view team messages" ON public.team_channel_messages
    FOR SELECT USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can insert team messages" ON public.team_channel_messages;
CREATE POLICY "Users can insert team messages" ON public.team_channel_messages
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete own messages" ON public.team_channel_messages;
CREATE POLICY "Users can delete own messages" ON public.team_channel_messages
    FOR DELETE USING (user_id = auth.uid());

-- Team Tasks Policies
DROP POLICY IF EXISTS "Users can view team tasks" ON public.team_tasks;
CREATE POLICY "Users can view team tasks" ON public.team_tasks
    FOR SELECT USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can manage team tasks" ON public.team_tasks;
CREATE POLICY "Users can manage team tasks" ON public.team_tasks
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

-- Team Events Policies
DROP POLICY IF EXISTS "Users can view team events" ON public.team_events;
CREATE POLICY "Users can view team events" ON public.team_events
    FOR SELECT USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can manage team events" ON public.team_events;
CREATE POLICY "Users can manage team events" ON public.team_events
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

-- Team Quick Links Policies
DROP POLICY IF EXISTS "Users can view team quick links" ON public.team_quick_links;
CREATE POLICY "Users can view team quick links" ON public.team_quick_links
    FOR SELECT USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Users can manage team quick links" ON public.team_quick_links;
CREATE POLICY "Users can manage team quick links" ON public.team_quick_links
    FOR ALL USING (
        team_id IN (SELECT id FROM public.teams WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

-- 10. GRANTS
GRANT ALL ON public.teams TO authenticated, anon;
GRANT ALL ON public.team_members TO authenticated, anon;
GRANT ALL ON public.team_channels TO authenticated, anon;
GRANT ALL ON public.team_channel_messages TO authenticated, anon;
GRANT ALL ON public.team_tasks TO authenticated, anon;
GRANT ALL ON public.team_events TO authenticated, anon;
GRANT ALL ON public.team_quick_links TO authenticated, anon;

-- 11. ENABLE REALTIME BROADCASTING
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_events;
