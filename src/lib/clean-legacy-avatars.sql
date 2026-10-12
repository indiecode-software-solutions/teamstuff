-- ============================================================
-- Clean up legacy DiceBear / Cartoon avatar URLs from profiles
-- Run this once in the Supabase SQL editor.
-- ============================================================

UPDATE public.profiles
SET profile_photo = NULL
WHERE profile_photo ILIKE '%dicebear%'
   OR profile_photo ILIKE '%api.dicebear.com%';
