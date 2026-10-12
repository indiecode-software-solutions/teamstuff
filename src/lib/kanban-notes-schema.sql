-- ============================================================
-- Kanban Board Collaborative Notes Schema & RLS Policies
-- Execute in Supabase SQL Editor to enable the Notes feature.
-- ============================================================

-- 1. Create todo_list_notes table
CREATE TABLE IF NOT EXISTS public.todo_list_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.todo_lists(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL DEFAULT 'Guest',
    author_avatar TEXT,
    target_collaborator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_pinned BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_todo_list_notes_list ON public.todo_list_notes(list_id);
CREATE INDEX IF NOT EXISTS idx_todo_list_notes_target ON public.todo_list_notes(target_collaborator_id);

-- 2. Enable RLS
ALTER TABLE public.todo_list_notes ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Select notes
DROP POLICY IF EXISTS "Allow reading notes" ON public.todo_list_notes;
DROP POLICY IF EXISTS "Public can view notes of accessible lists" ON public.todo_list_notes;
CREATE POLICY "Allow reading notes" ON public.todo_list_notes
    FOR SELECT USING (true);

-- 4. Policy: Insert notes
DROP POLICY IF EXISTS "Allow inserting notes" ON public.todo_list_notes;
DROP POLICY IF EXISTS "Users and guests can insert notes on accessible lists" ON public.todo_list_notes;
CREATE POLICY "Allow inserting notes" ON public.todo_list_notes
    FOR INSERT WITH CHECK (true);

-- 5. Policy: Delete notes
DROP POLICY IF EXISTS "Allow deleting notes" ON public.todo_list_notes;
DROP POLICY IF EXISTS "Authors or list owners can delete notes" ON public.todo_list_notes;
CREATE POLICY "Allow deleting notes" ON public.todo_list_notes
    FOR DELETE USING (true);

-- 6. Policy: Update notes (e.g. pin)
DROP POLICY IF EXISTS "Allow updating notes" ON public.todo_list_notes;
DROP POLICY IF EXISTS "Authors or list owners can update notes" ON public.todo_list_notes;
CREATE POLICY "Allow updating notes" ON public.todo_list_notes
    FOR UPDATE USING (true);

-- 7. Grant permissions to anon & authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todo_list_notes TO anon, authenticated;

