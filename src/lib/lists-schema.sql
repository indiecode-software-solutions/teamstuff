-- ============================================================
-- To-Do Lists schema
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Todo Lists Table
CREATE TABLE IF NOT EXISTS public.todo_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Todo List Items Table
CREATE TABLE IF NOT EXISTS public.todo_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.todo_lists(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Todo List Collaborators Table
CREATE TABLE IF NOT EXISTS public.todo_list_collaborators (
    list_id UUID NOT NULL REFERENCES public.todo_lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (list_id, user_id)
);

-- 4. Todo List Activity Table
CREATE TABLE IF NOT EXISTS public.todo_list_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.todo_lists(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_todo_lists_company ON public.todo_lists(company_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_list ON public.todo_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_company ON public.todo_list_items(company_id);
CREATE INDEX IF NOT EXISTS idx_todo_activity_list ON public.todo_list_activity(list_id);

-- Enable RLS
ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_list_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_list_activity ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors on duplicate schema runs
DROP POLICY IF EXISTS "Users can view accessible todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Users can create todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "List members can update todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Owners can delete todo lists" ON public.todo_lists;
DROP POLICY IF EXISTS "Users can view items of accessible lists" ON public.todo_list_items;
DROP POLICY IF EXISTS "Users can manage items of accessible lists" ON public.todo_list_items;
DROP POLICY IF EXISTS "Users can view collaborators of accessible lists" ON public.todo_list_collaborators;
DROP POLICY IF EXISTS "Owners can manage collaborators" ON public.todo_list_collaborators;
DROP POLICY IF EXISTS "Users can view activity of accessible lists" ON public.todo_list_activity;
DROP POLICY IF EXISTS "Users can insert activity on accessible lists" ON public.todo_list_activity;

-- ============================================================
-- SECURITY DEFINER helper functions.
-- These bypass RLS, which breaks the mutual recursion between
-- todo_lists and todo_list_collaborators policies (error 42P17).
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_todo_list(target_list_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.todo_lists l
    WHERE l.id = target_list_id
      AND (
        l.owner_id = auth.uid()
        OR l.visibility = 'shared'
        OR EXISTS (
          SELECT 1 FROM public.todo_list_collaborators c
          WHERE c.list_id = l.id AND c.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_todo_list_owner(target_list_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.todo_lists l
    WHERE l.id = target_list_id AND l.owner_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_todo_list(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_todo_list_owner(UUID) TO authenticated;

-- Policies: Lists
-- Visible to company members who own it, collaborate on it, or it is shared.
-- NOTE: owner/visibility are checked directly on the row columns so that
-- INSERT ... RETURNING passes (a new row is not visible to its own command's
-- snapshot, so can_access_todo_list() alone would reject it).
CREATE POLICY "Users can view accessible todo lists" ON public.todo_lists
    FOR SELECT USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (
            owner_id = auth.uid()
            OR visibility = 'shared'
            OR public.can_access_todo_list(id)
        )
    );

CREATE POLICY "Users can create todo lists" ON public.todo_lists
    FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND owner_id = auth.uid()
    );

CREATE POLICY "List members can update todo lists" ON public.todo_lists
    FOR UPDATE USING (public.can_access_todo_list(id));

CREATE POLICY "Owners can delete todo lists" ON public.todo_lists
    FOR DELETE USING (public.is_todo_list_owner(id));

-- Policies: Items (anyone who can see a list can manage its items)
CREATE POLICY "Users can view items of accessible lists" ON public.todo_list_items
    FOR SELECT USING (public.can_access_todo_list(list_id));

CREATE POLICY "Users can manage items of accessible lists" ON public.todo_list_items
    FOR ALL USING (public.can_access_todo_list(list_id))
    WITH CHECK (public.can_access_todo_list(list_id));

-- Policies: Collaborators
CREATE POLICY "Users can view collaborators of accessible lists" ON public.todo_list_collaborators
    FOR SELECT USING (public.can_access_todo_list(list_id));

CREATE POLICY "Owners can manage collaborators" ON public.todo_list_collaborators
    FOR ALL USING (public.is_todo_list_owner(list_id))
    WITH CHECK (public.is_todo_list_owner(list_id));

-- Policies: Activity
CREATE POLICY "Users can view activity of accessible lists" ON public.todo_list_activity
    FOR SELECT USING (public.can_access_todo_list(list_id));

CREATE POLICY "Users can insert activity on accessible lists" ON public.todo_list_activity
    FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        AND public.can_access_todo_list(list_id)
    );
