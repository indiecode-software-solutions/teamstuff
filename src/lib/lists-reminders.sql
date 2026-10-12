-- ============================================================
-- To-Do Item Reminders (device push via FCM)
-- Run this in the Supabase SQL Editor.
--
-- Flow: todo_list_items.remind_at  ->  pg_cron (every minute)  ->
--       todo-reminders Edge Function  ->  FCM  ->  mobile app push.
-- ============================================================

-- 1. Reminder columns on todo items
ALTER TABLE public.todo_list_items
    ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_todo_items_reminder
    ON public.todo_list_items(remind_at)
    WHERE reminder_sent = false AND completed = false AND remind_at IS NOT NULL;

-- 2. Required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Store the service role key in the Vault so the cron job can
--    authenticate against the Edge Function.
--    >>> Replace <YOUR_SERVICE_ROLE_KEY> once, then never again. <<<
SELECT vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');

-- 4. Cron job: hit the todo-reminders function every minute.
--    >>> Replace <YOUR_PROJECT_REF> with your Supabase project ref. <<<
SELECT cron.schedule(
    'send-todo-reminders',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/todo-reminders',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'service_role_key'
            )
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ============================================================
-- Teardown helpers (if you ever need to redo the setup):
--
-- SELECT cron.unschedule('send-todo-reminders');
-- ALTER TABLE public.todo_list_items DROP COLUMN IF EXISTS remind_at;
-- ALTER TABLE public.todo_list_items DROP COLUMN IF EXISTS reminder_sent;
-- ============================================================
