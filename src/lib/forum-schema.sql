-- 1. Forum Posts Table
CREATE TABLE IF NOT EXISTS public.forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Announcements', 'General', 'Tech', 'HR', 'Events')),
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_pinned BOOLEAN DEFAULT false
);

-- 2. Forum Comments Table
CREATE TABLE IF NOT EXISTS public.forum_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Forum Likes Table
CREATE TABLE IF NOT EXISTS public.forum_likes (
    post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_likes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors on duplicate schema runs
DROP POLICY IF EXISTS "Users can view posts in their company" ON public.forum_posts;
DROP POLICY IF EXISTS "Users can create posts in their company" ON public.forum_posts;
DROP POLICY IF EXISTS "Users can view comments in their company" ON public.forum_comments;
DROP POLICY IF EXISTS "Users can create comments in their company" ON public.forum_comments;
DROP POLICY IF EXISTS "Users can view likes in their company" ON public.forum_likes;
DROP POLICY IF EXISTS "Users can manage likes in their company" ON public.forum_likes;

-- Policies (Scoped to employee's company)
CREATE POLICY "Users can view posts in their company" ON public.forum_posts
    FOR SELECT USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create posts in their company" ON public.forum_posts
    FOR INSERT WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view comments in their company" ON public.forum_comments
    FOR SELECT USING (
        post_id IN (SELECT id FROM public.forum_posts WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

CREATE POLICY "Users can create comments in their company" ON public.forum_comments
    FOR INSERT WITH CHECK (
        post_id IN (SELECT id FROM public.forum_posts WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

CREATE POLICY "Users can view likes in their company" ON public.forum_likes
    FOR SELECT USING (
        post_id IN (SELECT id FROM public.forum_posts WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

CREATE POLICY "Users can manage likes in their company" ON public.forum_likes
    FOR ALL USING (
        post_id IN (SELECT id FROM public.forum_posts WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    );

-- Delete policy: HR and Admin can delete any post in their company; author can delete own post
DROP POLICY IF EXISTS "Users can delete own posts or HR/Admin delete any" ON public.forum_posts;
CREATE POLICY "Users can delete own posts or HR/Admin delete any" ON public.forum_posts
    FOR DELETE USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (
            author_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND (role = 'admin' OR role = 'hr')
            )
        )
    );

