-- ============================================================
-- Kanban Public Sharing RLS Policies
-- Execute in Supabase SQL Editor to allow unauthenticated guest
-- and public access to Kanban boards with public sharing enabled.
-- ============================================================

-- 1. Helper function: check if a list is accessible to the caller (user or guest)
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
        -- Authenticated user is owner, collaborator, or in company
        (auth.uid() IS NOT NULL AND (
          l.owner_id = auth.uid()
          OR l.visibility = 'shared'
          OR EXISTS (
            SELECT 1 FROM public.todo_list_collaborators c
            WHERE c.list_id = l.id AND c.user_id = auth.uid()
          )
        ))
        -- Publicly shared board or shared visibility (accessible to anon / guests)
        OR (l.visibility = 'shared')
        OR (l.color LIKE '%"isPublicShareEnabled":true%' OR l.color LIKE '%"isPublicShareEnabled": true%')
      )
  );
$$;

-- 2. Grant execution of helper function to anon & authenticated
GRANT EXECUTE ON FUNCTION public.can_access_todo_list(UUID) TO anon, authenticated;

-- 3. Policy: Public / guest access to view shared todo lists
DROP POLICY IF EXISTS "Public can view shared todo lists" ON public.todo_lists;
CREATE POLICY "Public can view shared todo lists" ON public.todo_lists
    FOR SELECT USING (
        visibility = 'shared'
        OR color LIKE '%"isPublicShareEnabled":true%'
        OR color LIKE '%"isPublicShareEnabled": true%'
        OR public.can_access_todo_list(id)
    );

-- 4. Policy: Public / guest access to view items of accessible lists
DROP POLICY IF EXISTS "Public can view items of accessible todo lists" ON public.todo_list_items;
CREATE POLICY "Public can view items of accessible todo lists" ON public.todo_list_items
    FOR SELECT USING (
        public.can_access_todo_list(list_id)
    );

-- 5. Policy: Public / guest access to view collaborators of accessible lists
DROP POLICY IF EXISTS "Public can view collaborators of accessible todo lists" ON public.todo_list_collaborators;
CREATE POLICY "Public can view collaborators of accessible todo lists" ON public.todo_list_collaborators
    FOR SELECT USING (
        public.can_access_todo_list(list_id)
    );

-- 6. Policy: Public / guest access to view activity of accessible lists
DROP POLICY IF EXISTS "Public can view activity of accessible todo lists" ON public.todo_list_activity;
CREATE POLICY "Public can view activity of accessible todo lists" ON public.todo_list_activity
    FOR SELECT USING (
        public.can_access_todo_list(list_id)
    );

-- 7. Policy: Allow anon & authenticated users to read profile info for card assignees / owners
DROP POLICY IF EXISTS "Allow reading profiles for board assignees" ON public.profiles;
CREATE POLICY "Allow reading profiles for board assignees" ON public.profiles
    FOR SELECT USING (true);

-- 8. Grant SELECT permissions on all relevant tables to anon & authenticated
GRANT SELECT ON public.todo_lists TO anon, authenticated;
GRANT SELECT ON public.todo_list_items TO anon, authenticated;
GRANT SELECT ON public.todo_list_collaborators TO anon, authenticated;
GRANT SELECT ON public.todo_list_activity TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
