


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_access_todo_list"("target_list_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.todo_lists l
    WHERE l.id = target_list_id
      AND (
        (auth.uid() IS NOT NULL AND (
          l.owner_id = auth.uid()
          OR l.visibility = 'shared'
          OR EXISTS (
            SELECT 1 FROM public.todo_list_collaborators c
            WHERE c.list_id = l.id AND c.user_id = auth.uid()
          )
        ))
        OR (l.visibility = 'shared')
        OR (l.color LIKE '%"isPublicShareEnabled":true%' OR l.color LIKE '%"isPublicShareEnabled": true%')
      )
  );
$$;


ALTER FUNCTION "public"."can_access_todo_list"("target_list_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (
    id,
    name,
    work_email,
    company_id,
    role
  )
  values (
    new.id,
    -- Fallback to username from email if name metadata isn't supplied
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    -- Extract company_id from signup metadata
    (new.raw_user_meta_data->>'company_id')::uuid,
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_company_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_id = p_team_id AND user_id = p_user_id
    );
$$;


ALTER FUNCTION "public"."is_team_member"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_todo_list_owner"("target_list_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.todo_lists l
    WHERE l.id = target_list_id AND l.owner_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_todo_list_owner"("target_list_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "user_name" character varying(255),
    "action" "text",
    "task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "details" "text" NOT NULL,
    "amount" "text",
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "approver_id" "uuid",
    "start_date" "date",
    "end_date" "date",
    "attachment" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "approvals_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Rejected'::"text"]))),
    CONSTRAINT "approvals_type_check" CHECK (("type" = ANY (ARRAY['Leave'::"text", 'Reimbursement'::"text", 'Salary'::"text", 'Mediclaim'::"text", 'WFH'::"text", 'Attendance'::"text"])))
);


ALTER TABLE "public"."approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_assignment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "returned_at" timestamp with time zone,
    "condition_on_assign" "text" DEFAULT 'good'::"text",
    "condition_on_return" "text",
    "notes" "text",
    "performed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asset_assignment_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asset_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "asset_type" "text" DEFAULT 'Laptop'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "assigned_asset_id" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asset_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "company_id" "uuid",
    "office_location_id" "uuid",
    "date" "date" NOT NULL,
    "clock_in" timestamp with time zone,
    "clock_out" timestamp with time zone,
    "total_minutes" integer,
    "latitude_in" numeric(10,7),
    "longitude_in" numeric(10,7),
    "latitude_out" numeric(10,7),
    "longitude_out" numeric(10,7),
    "status" "text" DEFAULT 'present'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "regular_minutes" integer DEFAULT 0,
    "overtime_minutes" integer DEFAULT 0,
    "regularization_status" character varying(30) DEFAULT NULL::character varying,
    "regularization_time" timestamp with time zone,
    "regularization_reason" "text",
    "source" "text" DEFAULT 'mobile_gps'::"text" NOT NULL,
    "biometric_device_id" "uuid",
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'late'::"text", 'half_day'::"text"])))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."biometric_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "device_serial" "text" NOT NULL,
    "device_name" "text" DEFAULT 'Biometric Device'::"text" NOT NULL,
    "office_location_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."biometric_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "tenant_domain" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "default_work_start_time" character varying(5) DEFAULT '09:30'::character varying,
    "default_work_end_time" character varying(5) DEFAULT '18:30'::character varying,
    "short_name" "text",
    "logo_url" "text",
    "logo_display" "text",
    "plan" "text" DEFAULT 'Starter'::"text" NOT NULL,
    "seat_limit" integer DEFAULT 50 NOT NULL,
    "storage_quota_gb" integer DEFAULT 5 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "induction_enabled" boolean DEFAULT true NOT NULL,
    "late_mark_policy_id" "uuid",
    "attendance_method" "text" DEFAULT 'gps'::"text" NOT NULL,
    "payslip_logo_url" "text",
    "payslip_stamp_url" "text",
    "payslip_signature_url" "text",
    "payslip_sign_mode" "text" DEFAULT 'digital_notice'::"text",
    "cin" "text",
    "pan_number" "text",
    "address" "text",
    "full_name" "text",
    "brand_color" "text" DEFAULT '#059669'::"text",
    "brand_tagline" "text",
    "login_hero_url" "text",
    "chat_mode" "text" DEFAULT 'anonymous'::"text" NOT NULL,
    "allow_team_lead_polls" boolean DEFAULT false NOT NULL,
    "late_grace_period_minutes" integer DEFAULT 15,
    "favicon_url" "text",
    "late_grace_minutes" integer DEFAULT 10 NOT NULL,
    CONSTRAINT "companies_chat_mode_check" CHECK (("chat_mode" = ANY (ARRAY['anonymous'::"text", 'transparent'::"text"]))),
    CONSTRAINT "companies_late_grace_minutes_check" CHECK (("late_grace_minutes" >= 0)),
    CONSTRAINT "companies_logo_display_check" CHECK (("logo_display" = ANY (ARRAY['logo_and_name'::"text", 'logo_only'::"text"])))
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "asset_name" "text" NOT NULL,
    "asset_type" "text" DEFAULT 'Laptop'::"text" NOT NULL,
    "serial_number" "text",
    "asset_code" "text",
    "brand" "text",
    "model" "text",
    "purchase_date" "date",
    "purchase_cost" numeric(12,2),
    "warranty_expiry" "date",
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "condition" "text" DEFAULT 'good'::"text" NOT NULL,
    "assigned_to" "uuid",
    "assigned_at" timestamp with time zone,
    "assigned_by" "uuid",
    "image_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_discussions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "parent_id" "uuid",
    "mention_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_anonymous" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."company_discussions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_document_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "is_mandatory" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_document_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_holidays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_holidays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "date" "text" NOT NULL,
    "location" "text" DEFAULT ''::"text" NOT NULL,
    "image" "text" NOT NULL,
    "category" "text" NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "attendees" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_memories_category_check" CHECK (("category" = ANY (ARRAY['Team Building'::"text", 'Celebrations'::"text", 'Workshops'::"text", 'Offsite'::"text"])))
);


ALTER TABLE "public"."company_memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "off_days" integer[] DEFAULT '{0,6}'::integer[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_storage" (
    "company_id" "uuid" NOT NULL,
    "allocated_bytes" bigint DEFAULT '5368709120'::bigint NOT NULL,
    "used_bytes" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_storage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requirement_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "r2_object_key" "text" NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "mime_type" "text" DEFAULT 'application/octet-stream'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_off_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "off_days" integer[] NOT NULL,
    "set_by" "text" DEFAULT 'admin'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_off_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exit_clearance_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exit_request_id" "uuid" NOT NULL,
    "department" "text" NOT NULL,
    "task_label" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "exit_clearance_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."exit_clearance_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exit_interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exit_request_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "primary_reason" "text",
    "manager_rating" integer,
    "culture_rating" integer,
    "growth_rating" integer,
    "wlb_rating" integer,
    "would_recommend" boolean,
    "open_feedback" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "exit_interviews_culture_rating_check" CHECK ((("culture_rating" >= 1) AND ("culture_rating" <= 5))),
    CONSTRAINT "exit_interviews_growth_rating_check" CHECK ((("growth_rating" >= 1) AND ("growth_rating" <= 5))),
    CONSTRAINT "exit_interviews_manager_rating_check" CHECK ((("manager_rating" >= 1) AND ("manager_rating" <= 5))),
    CONSTRAINT "exit_interviews_wlb_rating_check" CHECK ((("wlb_rating" >= 1) AND ("wlb_rating" <= 5)))
);


ALTER TABLE "public"."exit_interviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exit_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "initiated_by" "uuid" NOT NULL,
    "exit_type" "text" NOT NULL,
    "reason" "text",
    "last_working_day" "date" NOT NULL,
    "notice_period_days" integer DEFAULT 0,
    "notice_shortfall_days" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "manager_remarks" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "exit_requests_exit_type_check" CHECK (("exit_type" = ANY (ARRAY['resignation'::"text", 'termination'::"text", 'retirement'::"text"]))),
    CONSTRAINT "exit_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'in_clearance'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."exit_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "purpose" "text",
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "start_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_lat" double precision NOT NULL,
    "start_lng" double precision NOT NULL,
    "start_address" "text",
    "end_time" timestamp with time zone,
    "end_lat" double precision,
    "end_lng" double precision,
    "end_address" "text",
    "end_photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."field_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."file_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "shared_with_type" "text" NOT NULL,
    "shared_with_id" "uuid",
    "permission" "text" DEFAULT 'view'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "file_shares_permission_check" CHECK (("permission" = ANY (ARRAY['view'::"text", 'download'::"text", 'edit'::"text"]))),
    CONSTRAINT "file_shares_shared_with_type_check" CHECK (("shared_with_type" = ANY (ARRAY['user'::"text", 'company'::"text"])))
);


ALTER TABLE "public"."file_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "folder_id" "uuid",
    "name" "text" NOT NULL,
    "original_name" "text" NOT NULL,
    "r2_object_key" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "files_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'company'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "parent_folder_id" "uuid",
    "name" "text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."forum_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_likes" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."forum_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_poll_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "option_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "description" "text",
    "options" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_pinned" boolean DEFAULT false,
    "poll_id" "uuid",
    "post_type" "text" DEFAULT 'discussion'::"text" NOT NULL,
    CONSTRAINT "forum_posts_category_check" CHECK (("category" = ANY (ARRAY['Announcements'::"text", 'General'::"text", 'Tech'::"text", 'HR'::"text", 'Events'::"text"])))
);


ALTER TABLE "public"."forum_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_policies_category_check" CHECK (("category" = ANY (ARRAY['Leaves'::"text", 'Conduct'::"text", 'Benefits'::"text", 'Security'::"text"])))
);


ALTER TABLE "public"."hr_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."induction_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "content_path" "text",
    "is_mandatory" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."induction_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."late_mark_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "penalty_type" "text" NOT NULL,
    "late_marks_count" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "grace_minutes" integer DEFAULT 10 NOT NULL,
    CONSTRAINT "late_mark_policies_grace_minutes_check" CHECK (("grace_minutes" >= 0)),
    CONSTRAINT "late_mark_policies_late_marks_count_check" CHECK (("late_marks_count" >= 1)),
    CONSTRAINT "late_mark_policies_penalty_type_check" CHECK (("penalty_type" = ANY (ARRAY['half_day_after_marks'::"text", 'marks_to_half_day'::"text"])))
);


ALTER TABLE "public"."late_mark_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "leave_type" "text" NOT NULL,
    "annual_quota" numeric DEFAULT 12 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quota_period" "text" DEFAULT 'annual'::"text" NOT NULL,
    CONSTRAINT "leave_policies_quota_period_check" CHECK (("quota_period" = ANY (ARRAY['annual'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."leave_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mail_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "email" "text" NOT NULL,
    "credential_enc" "text" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_error" "text",
    "last_unread_count" integer DEFAULT 0 NOT NULL,
    "last_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mail_connections_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'hostinger'::"text"]))),
    CONSTRAINT "mail_connections_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'error'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."mail_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "auth_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."master_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memories_managers" (
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."memories_managers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memories_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "color" "text" DEFAULT '#ec4899'::"text",
    "description" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."memories_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_likes" (
    "memory_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memory_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "link" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."office_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "name" "text" NOT NULL,
    "latitude" numeric(10,7) NOT NULL,
    "longitude" numeric(10,7) NOT NULL,
    "radius_meters" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."office_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payslip_columns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payslip_columns_section_check" CHECK (("section" = ANY (ARRAY['metadata'::"text", 'earnings'::"text", 'deductions'::"text"])))
);


ALTER TABLE "public"."payslip_columns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payslips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pay_period" "text" NOT NULL,
    "pay_date" "date",
    "basic" numeric(12,2) DEFAULT 0 NOT NULL,
    "hra" numeric(12,2) DEFAULT 0 NOT NULL,
    "allowance" numeric(12,2) DEFAULT 0 NOT NULL,
    "reimbursements" numeric(12,2) DEFAULT 0 NOT NULL,
    "provident_fund" numeric(12,2) DEFAULT 0 NOT NULL,
    "professional_tax" numeric(12,2) DEFAULT 0 NOT NULL,
    "health_insurance" numeric(12,2) DEFAULT 0 NOT NULL,
    "tds" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_pay" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_pay" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "earnings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "deductions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."payslips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "company_id" "uuid",
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "manager_id" "uuid",
    "employee_code" "text",
    "job_title" "text",
    "department" "text",
    "employment_type" "text",
    "work_location" "text",
    "work_start_time" "text" DEFAULT '09:30'::"text",
    "work_end_time" "text" DEFAULT '18:30'::"text",
    "date_of_joining" "date",
    "date_of_birth" "date",
    "phone" "text",
    "personal_email" "text",
    "work_email" "text",
    "gender" "text",
    "blood_group" "text",
    "linkedin_url" "text",
    "skills" "text",
    "notes" "text",
    "profile_photo" "text",
    "bank_name" "text",
    "account_no" "text",
    "pan" "text",
    "uan" "text",
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "country" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "onboarding_status" character varying(50) DEFAULT 'Completed'::character varying,
    "email" character varying(255),
    "shift_id" "uuid",
    "reporting_to" "uuid",
    "manual_status" "text",
    "manual_status_updated_at" timestamp with time zone,
    "safelock_config" "jsonb"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."safelock_config" IS 'Stores user-configured 4-digit SafeLock PIN hash, recovery question hash, password hint, and protected services configuration';



CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "token" "text" NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shared_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "url" "text",
    "username" "text",
    "password" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "shared_with_ids" "uuid"[] DEFAULT '{}'::"uuid"[]
);


ALTER TABLE "public"."shared_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "late_mark_policy_id" "uuid",
    "late_grace_period_minutes" integer
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_address" "text",
    "purpose" "text" NOT NULL,
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "check_in_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "check_in_lat" double precision NOT NULL,
    "check_in_lng" double precision NOT NULL,
    "check_in_accuracy" double precision,
    "check_in_photo_url" "text",
    "check_in_address" "text",
    "check_out_time" timestamp with time zone,
    "check_out_lat" double precision,
    "check_out_lng" double precision,
    "check_out_accuracy" double precision,
    "check_out_photo_url" "text",
    "check_out_address" "text",
    "odometer_start_km" numeric(10,2),
    "odometer_end_km" numeric(10,2),
    "calculated_distance_km" numeric(10,2) DEFAULT 0,
    "travel_mode" "text" DEFAULT 'two_wheeler'::"text",
    "rate_per_km" numeric(10,2) DEFAULT 8.0,
    "reimbursement_amount" numeric(10,2) DEFAULT 0,
    "reimbursement_status" "text" DEFAULT 'unclaimed'::"text",
    "reimbursement_approval_id" "uuid",
    "notes" "text",
    "outcome_summary" "text",
    "contact_person" "text",
    "contact_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin_type" "text" DEFAULT 'office'::"text",
    "origin_label" "text",
    "origin_lat" double precision,
    "origin_lng" double precision,
    "origin_address" "text"
);


ALTER TABLE "public"."site_visits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assigned_to" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "due_date" "date",
    "status" character varying(50) DEFAULT 'Not Started'::character varying,
    "request_status" character varying(50) DEFAULT 'Accepted'::character varying,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_channel_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_channel_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."team_direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "event_type" character varying(50) DEFAULT 'meeting'::character varying,
    "location" character varying(255),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_events_event_type_check" CHECK ((("event_type")::"text" = ANY ((ARRAY['meeting'::character varying, 'deadline'::character varying, 'review'::character varying, 'sprint'::character varying, 'social'::character varying])::"text"[])))
);


ALTER TABLE "public"."team_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "team_join_requests_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::"text"[])))
);


ALTER TABLE "public"."team_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" character varying(20) DEFAULT 'member'::character varying NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_members_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['lead'::character varying, 'member'::character varying])::"text"[])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_quick_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "url" "text" NOT NULL,
    "description" "text",
    "icon" character varying(50) DEFAULT 'Link'::character varying,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_quick_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "status" character varying(50) DEFAULT 'todo'::character varying NOT NULL,
    "priority" character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    "due_date" timestamp with time zone,
    "assignee_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "team_tasks_priority_check" CHECK ((("priority")::"text" = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::"text"[]))),
    CONSTRAINT "team_tasks_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['todo'::character varying, 'in_progress'::character varying, 'in_review'::character varying, 'done'::character varying])::"text"[])))
);


ALTER TABLE "public"."team_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "icon" character varying(50) DEFAULT 'Users'::character varying,
    "color" character varying(20) DEFAULT '#3B82F6'::character varying,
    "lead_id" "uuid",
    "is_private" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todo_list_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."todo_list_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todo_list_collaborators" (
    "list_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."todo_list_collaborators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todo_list_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "priority" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "due_date" "date",
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "assignee_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "remind_at" timestamp with time zone,
    "reminder_sent" boolean DEFAULT false NOT NULL,
    CONSTRAINT "todo_list_items_priority_check" CHECK (("priority" = ANY (ARRAY['High'::"text", 'Medium'::"text", 'Low'::"text"])))
);


ALTER TABLE "public"."todo_list_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todo_list_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "list_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "author_name" "text" DEFAULT 'Guest'::"text" NOT NULL,
    "author_avatar" "text",
    "target_collaborator_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."todo_list_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todo_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    CONSTRAINT "todo_lists_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."todo_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "content" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_mandatory" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."training_sections" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_assignment_history"
    ADD CONSTRAINT "asset_assignment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asset_requests"
    ADD CONSTRAINT "asset_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."biometric_devices"
    ADD CONSTRAINT "biometric_devices_company_id_device_serial_key" UNIQUE ("company_id", "device_serial");



ALTER TABLE ONLY "public"."biometric_devices"
    ADD CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_tenant_domain_key" UNIQUE ("tenant_domain");



ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_discussions"
    ADD CONSTRAINT "company_discussions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_document_requirements"
    ADD CONSTRAINT "company_document_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_company_id_date_key" UNIQUE ("company_id", "date");



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_memories"
    ADD CONSTRAINT "company_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_company_id_key" UNIQUE ("company_id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_storage"
    ADD CONSTRAINT "company_storage_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_off_days"
    ADD CONSTRAINT "employee_off_days_company_id_employee_id_key" UNIQUE ("company_id", "employee_id");



ALTER TABLE ONLY "public"."employee_off_days"
    ADD CONSTRAINT "employee_off_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exit_clearance_tasks"
    ADD CONSTRAINT "exit_clearance_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exit_interviews"
    ADD CONSTRAINT "exit_interviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exit_requests"
    ADD CONSTRAINT "exit_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_audit_logs"
    ADD CONSTRAINT "file_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_shares"
    ADD CONSTRAINT "file_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_pkey" PRIMARY KEY ("post_id", "user_id");



ALTER TABLE ONLY "public"."forum_poll_votes"
    ADD CONSTRAINT "forum_poll_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_poll_votes"
    ADD CONSTRAINT "forum_poll_votes_poll_id_user_id_key" UNIQUE ("poll_id", "user_id");



ALTER TABLE ONLY "public"."forum_polls"
    ADD CONSTRAINT "forum_polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_policies"
    ADD CONSTRAINT "hr_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."induction_steps"
    ADD CONSTRAINT "induction_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."late_mark_policies"
    ADD CONSTRAINT "late_mark_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_company_id_leave_type_key" UNIQUE ("company_id", "leave_type");



ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mail_connections"
    ADD CONSTRAINT "mail_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mail_connections"
    ADD CONSTRAINT "mail_connections_user_id_email_key" UNIQUE ("user_id", "email");



ALTER TABLE ONLY "public"."master_admins"
    ADD CONSTRAINT "master_admins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."master_admins"
    ADD CONSTRAINT "master_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memories_managers"
    ADD CONSTRAINT "memories_managers_pkey" PRIMARY KEY ("company_id", "user_id");



ALTER TABLE ONLY "public"."memories_sections"
    ADD CONSTRAINT "memories_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_likes"
    ADD CONSTRAINT "memory_likes_pkey" PRIMARY KEY ("memory_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."office_locations"
    ADD CONSTRAINT "office_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payslip_columns"
    ADD CONSTRAINT "payslip_columns_company_id_key_key" UNIQUE ("company_id", "key");



ALTER TABLE ONLY "public"."payslip_columns"
    ADD CONSTRAINT "payslip_columns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_company_id_user_id_pay_period_key" UNIQUE ("company_id", "user_id", "pay_period");



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."shared_resources"
    ADD CONSTRAINT "shared_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_channel_messages"
    ADD CONSTRAINT "team_channel_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_channels"
    ADD CONSTRAINT "team_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_channels"
    ADD CONSTRAINT "team_channels_team_id_name_key" UNIQUE ("team_id", "name");



ALTER TABLE ONLY "public"."team_direct_messages"
    ADD CONSTRAINT "team_direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_events"
    ADD CONSTRAINT "team_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_join_requests"
    ADD CONSTRAINT "team_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_join_requests"
    ADD CONSTRAINT "team_join_requests_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."team_quick_links"
    ADD CONSTRAINT "team_quick_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_tasks"
    ADD CONSTRAINT "team_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todo_list_activity"
    ADD CONSTRAINT "todo_list_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todo_list_collaborators"
    ADD CONSTRAINT "todo_list_collaborators_pkey" PRIMARY KEY ("list_id", "user_id");



ALTER TABLE ONLY "public"."todo_list_items"
    ADD CONSTRAINT "todo_list_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todo_list_notes"
    ADD CONSTRAINT "todo_list_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todo_lists"
    ADD CONSTRAINT "todo_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_sections"
    ADD CONSTRAINT "training_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "uq_employee_doc_requirement" UNIQUE ("user_id", "requirement_id");



CREATE INDEX "company_discussions_company_created_idx" ON "public"."company_discussions" USING "btree" ("company_id", "created_at");



CREATE INDEX "company_discussions_parent_idx" ON "public"."company_discussions" USING "btree" ("parent_id");



CREATE INDEX "company_holidays_company_idx" ON "public"."company_holidays" USING "btree" ("company_id");



CREATE INDEX "company_settings_company_idx" ON "public"."company_settings" USING "btree" ("company_id");



CREATE INDEX "employee_off_days_company_idx" ON "public"."employee_off_days" USING "btree" ("company_id");



CREATE INDEX "employee_off_days_employee_idx" ON "public"."employee_off_days" USING "btree" ("employee_id");



CREATE INDEX "idx_asset_history_asset_id" ON "public"."asset_assignment_history" USING "btree" ("asset_id");



CREATE INDEX "idx_asset_history_employee_id" ON "public"."asset_assignment_history" USING "btree" ("employee_id");



CREATE INDEX "idx_asset_requests_company_id" ON "public"."asset_requests" USING "btree" ("company_id");



CREATE INDEX "idx_asset_requests_employee_id" ON "public"."asset_requests" USING "btree" ("employee_id");



CREATE INDEX "idx_asset_requests_status" ON "public"."asset_requests" USING "btree" ("status");



CREATE INDEX "idx_attendance_source" ON "public"."attendance" USING "btree" ("source");



CREATE INDEX "idx_biometric_devices_serial" ON "public"."biometric_devices" USING "btree" ("device_serial");



CREATE INDEX "idx_companies_short_name" ON "public"."companies" USING "btree" ("lower"("short_name"));



CREATE INDEX "idx_companies_tenant_domain" ON "public"."companies" USING "btree" ("lower"("tenant_domain")) WHERE ("tenant_domain" IS NOT NULL);



CREATE INDEX "idx_company_assets_assigned_to" ON "public"."company_assets" USING "btree" ("assigned_to");



CREATE INDEX "idx_company_assets_company_id" ON "public"."company_assets" USING "btree" ("company_id");



CREATE INDEX "idx_company_assets_status" ON "public"."company_assets" USING "btree" ("status");



CREATE INDEX "idx_company_discussions_is_anon" ON "public"."company_discussions" USING "btree" ("company_id", "is_anonymous");



CREATE INDEX "idx_doc_req_company" ON "public"."company_document_requirements" USING "btree" ("company_id");



CREATE INDEX "idx_emp_docs_company" ON "public"."employee_documents" USING "btree" ("company_id");



CREATE INDEX "idx_emp_docs_status" ON "public"."employee_documents" USING "btree" ("company_id", "status");



CREATE INDEX "idx_emp_docs_user" ON "public"."employee_documents" USING "btree" ("user_id");



CREATE INDEX "idx_exit_clearance_request" ON "public"."exit_clearance_tasks" USING "btree" ("exit_request_id");



CREATE INDEX "idx_exit_interview_request" ON "public"."exit_interviews" USING "btree" ("exit_request_id");



CREATE INDEX "idx_exit_requests_company" ON "public"."exit_requests" USING "btree" ("company_id");



CREATE INDEX "idx_exit_requests_employee" ON "public"."exit_requests" USING "btree" ("employee_id");



CREATE INDEX "idx_field_visits_company_user" ON "public"."field_visits" USING "btree" ("company_id", "user_id");



CREATE INDEX "idx_field_visits_start_time" ON "public"."field_visits" USING "btree" ("start_time" DESC);



CREATE INDEX "idx_field_visits_status" ON "public"."field_visits" USING "btree" ("status");



CREATE INDEX "idx_file_audit_logs_company" ON "public"."file_audit_logs" USING "btree" ("company_id", "created_at" DESC);



CREATE INDEX "idx_file_shares_file" ON "public"."file_shares" USING "btree" ("file_id");



CREATE INDEX "idx_file_shares_shared_with" ON "public"."file_shares" USING "btree" ("shared_with_id");



CREATE INDEX "idx_files_company_folder" ON "public"."files" USING "btree" ("company_id", "folder_id");



CREATE INDEX "idx_files_owner" ON "public"."files" USING "btree" ("owner_user_id");



CREATE INDEX "idx_folders_company_parent" ON "public"."folders" USING "btree" ("company_id", "parent_folder_id");



CREATE INDEX "idx_forum_poll_votes_poll" ON "public"."forum_poll_votes" USING "btree" ("poll_id");



CREATE INDEX "idx_forum_polls_company" ON "public"."forum_polls" USING "btree" ("company_id", "expires_at");



CREATE INDEX "idx_forum_posts_poll" ON "public"."forum_posts" USING "btree" ("poll_id");



CREATE INDEX "idx_mail_connections_user" ON "public"."mail_connections" USING "btree" ("user_id");



CREATE INDEX "idx_site_visits_check_in_time" ON "public"."site_visits" USING "btree" ("check_in_time" DESC);



CREATE INDEX "idx_site_visits_company_user" ON "public"."site_visits" USING "btree" ("company_id", "user_id");



CREATE INDEX "idx_site_visits_status" ON "public"."site_visits" USING "btree" ("status");



CREATE INDEX "idx_tasks_attachments" ON "public"."tasks" USING "gin" ("attachments");



CREATE INDEX "idx_team_channels_team" ON "public"."team_channels" USING "btree" ("team_id");



CREATE INDEX "idx_team_dms_team_convo" ON "public"."team_direct_messages" USING "btree" ("team_id", "sender_id", "recipient_id", "created_at");



CREATE INDEX "idx_team_events_team" ON "public"."team_events" USING "btree" ("team_id");



CREATE INDEX "idx_team_join_requests_status" ON "public"."team_join_requests" USING "btree" ("status");



CREATE INDEX "idx_team_join_requests_team_id" ON "public"."team_join_requests" USING "btree" ("team_id");



CREATE INDEX "idx_team_join_requests_user_id" ON "public"."team_join_requests" USING "btree" ("user_id");



CREATE INDEX "idx_team_members_team" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_user" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_team_messages_channel" ON "public"."team_channel_messages" USING "btree" ("channel_id");



CREATE INDEX "idx_team_messages_team" ON "public"."team_channel_messages" USING "btree" ("team_id");



CREATE INDEX "idx_team_quick_links_team" ON "public"."team_quick_links" USING "btree" ("team_id");



CREATE INDEX "idx_team_tasks_assignee" ON "public"."team_tasks" USING "btree" ("assignee_id");



CREATE INDEX "idx_team_tasks_team" ON "public"."team_tasks" USING "btree" ("team_id");



CREATE INDEX "idx_teams_company" ON "public"."teams" USING "btree" ("company_id");



CREATE INDEX "idx_todo_activity_list" ON "public"."todo_list_activity" USING "btree" ("list_id");



CREATE INDEX "idx_todo_items_company" ON "public"."todo_list_items" USING "btree" ("company_id");



CREATE INDEX "idx_todo_items_list" ON "public"."todo_list_items" USING "btree" ("list_id");



CREATE INDEX "idx_todo_items_reminder" ON "public"."todo_list_items" USING "btree" ("remind_at") WHERE (("reminder_sent" = false) AND ("completed" = false) AND ("remind_at" IS NOT NULL));



CREATE INDEX "idx_todo_list_notes_list" ON "public"."todo_list_notes" USING "btree" ("list_id");



CREATE INDEX "idx_todo_list_notes_target" ON "public"."todo_list_notes" USING "btree" ("target_collaborator_id");



CREATE INDEX "idx_todo_lists_company" ON "public"."todo_lists" USING "btree" ("company_id");



CREATE INDEX "idx_todo_lists_team" ON "public"."todo_lists" USING "btree" ("team_id");



CREATE INDEX "late_mark_policies_company_idx" ON "public"."late_mark_policies" USING "btree" ("company_id");



CREATE INDEX "leave_policies_company_idx" ON "public"."leave_policies" USING "btree" ("company_id");



CREATE INDEX "notifications_user_id_idx" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "notifications_user_read_idx" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "payslips_company_idx" ON "public"."payslips" USING "btree" ("company_id");



CREATE INDEX "payslips_user_idx" ON "public"."payslips" USING "btree" ("user_id");



CREATE INDEX "profiles_reporting_to_idx" ON "public"."profiles" USING "btree" ("reporting_to");



CREATE INDEX "shifts_company_idx" ON "public"."shifts" USING "btree" ("company_id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "approvals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_assignment_history"
    ADD CONSTRAINT "asset_assignment_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_assignment_history"
    ADD CONSTRAINT "asset_assignment_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_assignment_history"
    ADD CONSTRAINT "asset_assignment_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_assignment_history"
    ADD CONSTRAINT "asset_assignment_history_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_requests"
    ADD CONSTRAINT "asset_requests_assigned_asset_id_fkey" FOREIGN KEY ("assigned_asset_id") REFERENCES "public"."company_assets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asset_requests"
    ADD CONSTRAINT "asset_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_requests"
    ADD CONSTRAINT "asset_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asset_requests"
    ADD CONSTRAINT "asset_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_biometric_device_id_fkey" FOREIGN KEY ("biometric_device_id") REFERENCES "public"."biometric_devices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biometric_devices"
    ADD CONSTRAINT "biometric_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."biometric_devices"
    ADD CONSTRAINT "biometric_devices_office_location_id_fkey" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_late_mark_policy_id_fkey" FOREIGN KEY ("late_mark_policy_id") REFERENCES "public"."late_mark_policies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_assets"
    ADD CONSTRAINT "company_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_discussions"
    ADD CONSTRAINT "company_discussions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_discussions"
    ADD CONSTRAINT "company_discussions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_discussions"
    ADD CONSTRAINT "company_discussions_mention_user_id_fkey" FOREIGN KEY ("mention_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_discussions"
    ADD CONSTRAINT "company_discussions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."company_discussions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_document_requirements"
    ADD CONSTRAINT "company_document_requirements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_memories"
    ADD CONSTRAINT "company_memories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_memories"
    ADD CONSTRAINT "company_memories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_storage"
    ADD CONSTRAINT "company_storage_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "public"."company_document_requirements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_off_days"
    ADD CONSTRAINT "employee_off_days_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_off_days"
    ADD CONSTRAINT "employee_off_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exit_clearance_tasks"
    ADD CONSTRAINT "exit_clearance_tasks_exit_request_id_fkey" FOREIGN KEY ("exit_request_id") REFERENCES "public"."exit_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exit_interviews"
    ADD CONSTRAINT "exit_interviews_exit_request_id_fkey" FOREIGN KEY ("exit_request_id") REFERENCES "public"."exit_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exit_requests"
    ADD CONSTRAINT "exit_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_visits"
    ADD CONSTRAINT "field_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_audit_logs"
    ADD CONSTRAINT "file_audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_audit_logs"
    ADD CONSTRAINT "file_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_shares"
    ADD CONSTRAINT "file_shares_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_shares"
    ADD CONSTRAINT "file_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_shares"
    ADD CONSTRAINT "file_shares_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_shares"
    ADD CONSTRAINT "file_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."files"
    ADD CONSTRAINT "files_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_comments"
    ADD CONSTRAINT "forum_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_poll_votes"
    ADD CONSTRAINT "forum_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."forum_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_poll_votes"
    ADD CONSTRAINT "forum_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_polls"
    ADD CONSTRAINT "forum_polls_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_polls"
    ADD CONSTRAINT "forum_polls_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "public"."forum_polls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_policies"
    ADD CONSTRAINT "hr_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_policies"
    ADD CONSTRAINT "hr_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."induction_steps"
    ADD CONSTRAINT "induction_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."late_mark_policies"
    ADD CONSTRAINT "late_mark_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mail_connections"
    ADD CONSTRAINT "mail_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memories_managers"
    ADD CONSTRAINT "memories_managers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memories_managers"
    ADD CONSTRAINT "memories_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memories_sections"
    ADD CONSTRAINT "memories_sections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_likes"
    ADD CONSTRAINT "memory_likes_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "public"."company_memories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_likes"
    ADD CONSTRAINT "memory_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_locations"
    ADD CONSTRAINT "office_locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payslip_columns"
    ADD CONSTRAINT "payslip_columns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payslips"
    ADD CONSTRAINT "payslips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_reporting_to_fkey" FOREIGN KEY ("reporting_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_resources"
    ADD CONSTRAINT "shared_resources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_resources"
    ADD CONSTRAINT "shared_resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_late_mark_policy_id_fkey" FOREIGN KEY ("late_mark_policy_id") REFERENCES "public"."late_mark_policies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_reimbursement_approval_id_fkey" FOREIGN KEY ("reimbursement_approval_id") REFERENCES "public"."approvals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_visits"
    ADD CONSTRAINT "site_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_channel_messages"
    ADD CONSTRAINT "team_channel_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."team_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_channel_messages"
    ADD CONSTRAINT "team_channel_messages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_channel_messages"
    ADD CONSTRAINT "team_channel_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_channels"
    ADD CONSTRAINT "team_channels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_channels"
    ADD CONSTRAINT "team_channels_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_direct_messages"
    ADD CONSTRAINT "team_direct_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_direct_messages"
    ADD CONSTRAINT "team_direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_direct_messages"
    ADD CONSTRAINT "team_direct_messages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_events"
    ADD CONSTRAINT "team_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_events"
    ADD CONSTRAINT "team_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_join_requests"
    ADD CONSTRAINT "team_join_requests_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_join_requests"
    ADD CONSTRAINT "team_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_quick_links"
    ADD CONSTRAINT "team_quick_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_quick_links"
    ADD CONSTRAINT "team_quick_links_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_tasks"
    ADD CONSTRAINT "team_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_tasks"
    ADD CONSTRAINT "team_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_tasks"
    ADD CONSTRAINT "team_tasks_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."todo_list_activity"
    ADD CONSTRAINT "todo_list_activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_activity"
    ADD CONSTRAINT "todo_list_activity_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_activity"
    ADD CONSTRAINT "todo_list_activity_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."todo_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_collaborators"
    ADD CONSTRAINT "todo_list_collaborators_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."todo_list_collaborators"
    ADD CONSTRAINT "todo_list_collaborators_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."todo_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_collaborators"
    ADD CONSTRAINT "todo_list_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_items"
    ADD CONSTRAINT "todo_list_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."todo_list_items"
    ADD CONSTRAINT "todo_list_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_items"
    ADD CONSTRAINT "todo_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."todo_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_notes"
    ADD CONSTRAINT "todo_list_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."todo_list_notes"
    ADD CONSTRAINT "todo_list_notes_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."todo_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_list_notes"
    ADD CONSTRAINT "todo_list_notes_target_collaborator_id_fkey" FOREIGN KEY ("target_collaborator_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."todo_lists"
    ADD CONSTRAINT "todo_lists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_lists"
    ADD CONSTRAINT "todo_lists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_lists"
    ADD CONSTRAINT "todo_lists_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_sections"
    ADD CONSTRAINT "training_sections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can add biometric devices" ON "public"."biometric_devices" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete biometric devices" ON "public"."biometric_devices" FOR DELETE USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete employee profiles" ON "public"."profiles" FOR DELETE USING ("public"."is_company_admin"());



CREATE POLICY "Admins can insert employee profiles" ON "public"."profiles" FOR INSERT WITH CHECK ("public"."is_company_admin"());



CREATE POLICY "Admins can manage document requirements" ON "public"."company_document_requirements" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("lower"(COALESCE("profiles"."role", ''::"text")) = ANY (ARRAY['admin'::"text", 'master'::"text", 'super_admin'::"text", 'hr'::"text", 'hr_admin'::"text", 'hr_manager'::"text"]))))));



CREATE POLICY "Admins can update biometric devices" ON "public"."biometric_devices" FOR UPDATE USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update employee profiles" ON "public"."profiles" FOR UPDATE USING ("public"."is_company_admin"()) WITH CHECK ("public"."is_company_admin"());



CREATE POLICY "Admins can view their company biometric devices" ON "public"."biometric_devices" FOR SELECT USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Allow deleting notes" ON "public"."todo_list_notes" FOR DELETE USING (true);



CREATE POLICY "Allow inserting notes" ON "public"."todo_list_notes" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow manage asset history" ON "public"."asset_assignment_history" TO "authenticated" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Allow manage asset requests" ON "public"."asset_requests" TO "authenticated" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Allow manage company assets" ON "public"."company_assets" TO "authenticated" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Allow reading notes" ON "public"."todo_list_notes" FOR SELECT USING (true);



CREATE POLICY "Allow reading profiles for board assignees" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Allow updating notes" ON "public"."todo_list_notes" FOR UPDATE USING (true);



CREATE POLICY "Allow view asset history" ON "public"."asset_assignment_history" FOR SELECT TO "authenticated" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Allow view asset requests" ON "public"."asset_requests" FOR SELECT TO "authenticated" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Allow view company assets" ON "public"."company_assets" FOR SELECT TO "authenticated" USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Anyone can view companies" ON "public"."companies" FOR SELECT USING (true);



CREATE POLICY "Anyone can view office locations" ON "public"."office_locations" FOR SELECT USING (true);



CREATE POLICY "Anyone can view profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can delete office locations" ON "public"."office_locations" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert companies" ON "public"."companies" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can insert office locations" ON "public"."office_locations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can submit join requests" ON "public"."team_join_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Company users can read their late mark policies" ON "public"."late_mark_policies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."company_id" = "late_mark_policies"."company_id")))));



CREATE POLICY "Delete own resource" ON "public"."shared_resources" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Employees read their company's memories" ON "public"."company_memories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."company_id" = "company_memories"."company_id")))));



CREATE POLICY "Employees read their company's payslip columns" ON "public"."payslip_columns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."company_id" = "payslip_columns"."company_id")))));



CREATE POLICY "Employees read their company's policies" ON "public"."hr_policies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."company_id" = "hr_policies"."company_id")))));



CREATE POLICY "Employees read their company's training sections" ON "public"."training_sections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."company_id" = "training_sections"."company_id")))));



CREATE POLICY "Employees view own payslips" ON "public"."payslips" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "HR, admin and accountant view company payslips" ON "public"."payslips" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."company_id" = "payslips"."company_id") AND ("p"."role" = ANY (ARRAY['hr'::"text", 'admin'::"text", 'accountant'::"text"]))))));



CREATE POLICY "Insert company approvals" ON "public"."approvals" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("employee_id" = "auth"."uid"())));



CREATE POLICY "Insert company resource" ON "public"."shared_resources" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "List members can update todo lists" ON "public"."todo_lists" FOR UPDATE USING ("public"."can_access_todo_list"("id"));



CREATE POLICY "Owners can delete todo lists" ON "public"."todo_lists" FOR DELETE USING ("public"."is_todo_list_owner"("id"));



CREATE POLICY "Owners can manage collaborators" ON "public"."todo_list_collaborators" USING ("public"."is_todo_list_owner"("list_id")) WITH CHECK ("public"."is_todo_list_owner"("list_id"));



CREATE POLICY "Public can view activity of accessible todo lists" ON "public"."todo_list_activity" FOR SELECT USING ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Public can view collaborators of accessible todo lists" ON "public"."todo_list_collaborators" FOR SELECT USING ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Public can view items of accessible todo lists" ON "public"."todo_list_items" FOR SELECT USING ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Public can view shared todo lists" ON "public"."todo_lists" FOR SELECT USING ((("visibility" = 'shared'::"text") OR ("color" ~~ '%"isPublicShareEnabled":true%'::"text") OR ("color" ~~ '%"isPublicShareEnabled": true%'::"text") OR "public"."can_access_todo_list"("id")));



CREATE POLICY "Public read company branding by domain" ON "public"."companies" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Recipients can mark DMs as read" ON "public"."team_direct_messages" FOR UPDATE USING (("auth"."uid"() = "recipient_id")) WITH CHECK (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Team creators or leads can delete their teams" ON "public"."teams" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR ("lead_id" = "auth"."uid"())));



CREATE POLICY "Team creators or leads can manage members" ON "public"."team_members" USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_members"."team_id") AND (("t"."created_by" = "auth"."uid"()) OR ("t"."lead_id" = "auth"."uid"()) OR "public"."is_team_member"("t"."id", "auth"."uid"()))))));



CREATE POLICY "Team leads and admins can update join requests" ON "public"."team_join_requests" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_join_requests"."team_id") AND (("t"."lead_id" = "auth"."uid"()) OR ("t"."created_by" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."team_members" "tm"
  WHERE (("tm"."team_id" = "team_join_requests"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND (("tm"."role")::"text" = 'lead'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "Team leads and admins can view join requests for their teams" ON "public"."team_join_requests" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_join_requests"."team_id") AND (("t"."lead_id" = "auth"."uid"()) OR ("t"."created_by" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."team_members" "tm"
  WHERE (("tm"."team_id" = "team_join_requests"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND (("tm"."role")::"text" = 'lead'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "Team leads or creators can delete teams" ON "public"."teams" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR ("lead_id" = "auth"."uid"())));



CREATE POLICY "Team leads or creators can update teams" ON "public"."teams" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR ("lead_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "team_members"."id") AND ("team_members"."user_id" = "auth"."uid"()) AND (("team_members"."role")::"text" = 'lead'::"text"))))));



CREATE POLICY "Team leads or creators can update their teams" ON "public"."teams" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR ("lead_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "team_members"."id") AND ("team_members"."user_id" = "auth"."uid"()) AND (("team_members"."role")::"text" = 'lead'::"text"))))));



CREATE POLICY "Team members can read their own DMs" ON "public"."team_direct_messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Team members can send DMs" ON "public"."team_direct_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Update company approvals" ON "public"."approvals" FOR UPDATE USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Update own resource" ON "public"."shared_resources" FOR UPDATE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users and admins can view field visits" ON "public"."field_visits" FOR SELECT USING ((("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'hr'::"text"))))))));



CREATE POLICY "Users and admins can view site visits" ON "public"."site_visits" FOR SELECT USING ((("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'hr'::"text"))))))));



CREATE POLICY "Users can cast vote in their company" ON "public"."forum_poll_votes" FOR INSERT WITH CHECK ((("poll_id" IN ( SELECT "forum_polls"."id"
   FROM "public"."forum_polls"
  WHERE ("forum_polls"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can create comments in their company" ON "public"."forum_comments" FOR INSERT WITH CHECK (("post_id" IN ( SELECT "forum_posts"."id"
   FROM "public"."forum_posts"
  WHERE ("forum_posts"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can create polls in their company" ON "public"."forum_polls" FOR INSERT WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create posts in their company" ON "public"."forum_posts" FOR INSERT WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create tasks in their company" ON "public"."tasks" FOR INSERT WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can create team channels" ON "public"."team_channels" USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can create teams" ON "public"."teams" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can create teams in their company" ON "public"."teams" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can create their own field visits" ON "public"."field_visits" FOR INSERT WITH CHECK ((("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can create their own site visits" ON "public"."site_visits" FOR INSERT WITH CHECK ((("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can create todo lists" ON "public"."todo_lists" FOR INSERT WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND ("owner_id" = "auth"."uid"())));



CREATE POLICY "Users can delete own messages" ON "public"."team_channel_messages" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own posts or HR/Admin delete any" ON "public"."forum_posts" FOR DELETE USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'hr'::"text"))))))));



CREATE POLICY "Users can insert activity logs" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can insert activity on accessible lists" ON "public"."todo_list_activity" FOR INSERT WITH CHECK ((("actor_id" = "auth"."uid"()) AND "public"."can_access_todo_list"("list_id")));



CREATE POLICY "Users can insert own attendance" ON "public"."attendance" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert team messages" ON "public"."team_channel_messages" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can insert/update their own documents" ON "public"."employee_documents" USING ((("user_id" = "auth"."uid"()) OR ("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("lower"(COALESCE("profiles"."role", ''::"text")) = ANY (ARRAY['admin'::"text", 'master'::"text", 'super_admin'::"text", 'hr'::"text", 'hr_admin'::"text", 'hr_manager'::"text"])))))));



CREATE POLICY "Users can like memories in their company" ON "public"."memory_likes" USING (("memory_id" IN ( SELECT "company_memories"."id"
   FROM "public"."company_memories"
  WHERE ("company_memories"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("memory_id" IN ( SELECT "company_memories"."id"
   FROM "public"."company_memories"
  WHERE ("company_memories"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))))));



CREATE POLICY "Users can manage items of accessible lists" ON "public"."todo_list_items" USING ("public"."can_access_todo_list"("list_id")) WITH CHECK ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Users can manage likes in their company" ON "public"."forum_likes" USING (("post_id" IN ( SELECT "forum_posts"."id"
   FROM "public"."forum_posts"
  WHERE ("forum_posts"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage team events" ON "public"."team_events" USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage team members" ON "public"."team_members" USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage team quick links" ON "public"."team_quick_links" USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage team tasks" ON "public"."team_tasks" USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage their own push tokens" ON "public"."push_tokens" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read activity logs from their company" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update own attendance" ON "public"."attendance" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile status" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update tasks they are assigned to or created" ON "public"."tasks" FOR UPDATE USING ((("assigned_to" = "auth"."uid"()) OR ("assigned_by" = "auth"."uid"())));



CREATE POLICY "Users can update their own field visits" ON "public"."field_visits" FOR UPDATE USING ((("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'hr'::"text"))))))));



CREATE POLICY "Users can update their own safelock config" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own site visits" ON "public"."site_visits" FOR UPDATE USING ((("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'hr'::"text"))))))));



CREATE POLICY "Users can view accessible todo lists" ON "public"."todo_lists" FOR SELECT USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (("owner_id" = "auth"."uid"()) OR ("visibility" = 'shared'::"text") OR "public"."can_access_todo_list"("id"))));



CREATE POLICY "Users can view activity of accessible lists" ON "public"."todo_list_activity" FOR SELECT USING ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Users can view collaborators of accessible lists" ON "public"."todo_list_collaborators" FOR SELECT USING ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Users can view comments in their company" ON "public"."forum_comments" FOR SELECT USING (("post_id" IN ( SELECT "forum_posts"."id"
   FROM "public"."forum_posts"
  WHERE ("forum_posts"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view document requirements for their company" ON "public"."company_document_requirements" FOR SELECT USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view items of accessible lists" ON "public"."todo_list_items" FOR SELECT USING ("public"."can_access_todo_list"("list_id"));



CREATE POLICY "Users can view likes in their company" ON "public"."forum_likes" FOR SELECT USING (("post_id" IN ( SELECT "forum_posts"."id"
   FROM "public"."forum_posts"
  WHERE ("forum_posts"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view memory likes in their company" ON "public"."memory_likes" FOR SELECT USING (("memory_id" IN ( SELECT "company_memories"."id"
   FROM "public"."company_memories"
  WHERE ("company_memories"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view own attendance" ON "public"."attendance" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view poll votes in their company" ON "public"."forum_poll_votes" FOR SELECT USING (("poll_id" IN ( SELECT "forum_polls"."id"
   FROM "public"."forum_polls"
  WHERE ("forum_polls"."company_id" = ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view polls in their company" ON "public"."forum_polls" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view posts in their company" ON "public"."forum_posts" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view tasks in their company" ON "public"."tasks" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view team channels" ON "public"."team_channels" FOR SELECT USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view team events" ON "public"."team_events" FOR SELECT USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view team members" ON "public"."team_members" FOR SELECT USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view team messages" ON "public"."team_channel_messages" FOR SELECT USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view team quick links" ON "public"."team_quick_links" FOR SELECT USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view team tasks" ON "public"."team_tasks" FOR SELECT USING (("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."company_id" IN ( SELECT "profiles"."company_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "Users can view teams in their company" ON "public"."teams" FOR SELECT USING (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own documents or HR can view company docum" ON "public"."employee_documents" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("lower"(COALESCE("profiles"."role", ''::"text")) = ANY (ARRAY['admin'::"text", 'master'::"text", 'super_admin'::"text", 'hr'::"text", 'hr_admin'::"text", 'hr_manager'::"text"])))))));



CREATE POLICY "Users can view their own join requests" ON "public"."team_join_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "View company approvals" ON "public"."approvals" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "View company resources" ON "public"."shared_resources" FOR SELECT USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_assignment_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."biometric_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clearance_tasks_insert" ON "public"."exit_clearance_tasks" FOR INSERT WITH CHECK (true);



CREATE POLICY "clearance_tasks_select" ON "public"."exit_clearance_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."exit_requests" "er"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("er"."id" = "exit_clearance_tasks"."exit_request_id") AND (("er"."employee_id" = "auth"."uid"()) OR (("p"."company_id" = "er"."company_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'hr'::"text"]))))))));



CREATE POLICY "clearance_tasks_update" ON "public"."exit_clearance_tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."exit_requests" "er"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("er"."id" = "exit_clearance_tasks"."exit_request_id") AND ("p"."company_id" = "er"."company_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'hr'::"text"]))))));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company members can post discussions" ON "public"."company_discussions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."company_id" = "company_discussions"."company_id")))));



CREATE POLICY "company members can read discussions" ON "public"."company_discussions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."company_id" = "company_discussions"."company_id")))));



ALTER TABLE "public"."company_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_discussions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_document_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_holidays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_holidays_read_company" ON "public"."company_holidays" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "company_holidays_write_admin" ON "public"."company_holidays" TO "authenticated" USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"])))) WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"]))));



ALTER TABLE "public"."company_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_settings_read_company" ON "public"."company_settings" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "company_settings_write_admin" ON "public"."company_settings" TO "authenticated" USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"])))) WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"]))));



ALTER TABLE "public"."employee_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_off_days" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_off_days_read_company" ON "public"."employee_off_days" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "employee_off_days_write_admin" ON "public"."employee_off_days" TO "authenticated" USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"])))) WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"]))));



ALTER TABLE "public"."exit_clearance_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exit_interviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exit_interviews_insert" ON "public"."exit_interviews" FOR INSERT WITH CHECK (("employee_id" = "auth"."uid"()));



CREATE POLICY "exit_interviews_select" ON "public"."exit_interviews" FOR SELECT USING ((("employee_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."exit_requests" "er"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("er"."id" = "exit_interviews"."exit_request_id") AND ("p"."company_id" = "er"."company_id") AND ("p"."role" = ANY (ARRAY['admin'::"text", 'hr'::"text"])))))));



ALTER TABLE "public"."exit_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exit_requests_insert" ON "public"."exit_requests" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "exit_requests_select" ON "public"."exit_requests" FOR SELECT USING ((("employee_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."company_id" = "exit_requests"."company_id") AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'hr'::"text"])))))));



CREATE POLICY "exit_requests_update" ON "public"."exit_requests" FOR UPDATE USING ((("employee_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."company_id" = "exit_requests"."company_id") AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'hr'::"text"])))))));



ALTER TABLE "public"."field_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_poll_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_polls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hr or admin can delete discussions" ON "public"."company_discussions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."company_id" = "company_discussions"."company_id") AND ("profiles"."role" = ANY (ARRAY['hr'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."hr_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."induction_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."late_mark_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leave_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leave_policies_read_company" ON "public"."leave_policies" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "leave_policies_write_admin" ON "public"."leave_policies" TO "authenticated" USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"])))) WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"text", 'hr'::"text"]))));



ALTER TABLE "public"."mail_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master admin can access own record" ON "public"."master_admins" USING (("auth"."uid"() = "auth_user_id")) WITH CHECK (("auth"."uid"() = "auth_user_id"));



ALTER TABLE "public"."master_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memories_managers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memories_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."office_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payslip_columns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payslips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform owner full access" ON "public"."companies" USING ((EXISTS ( SELECT 1
   FROM "public"."master_admins" "ma"
  WHERE ("ma"."auth_user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_admins" "ma"
  WHERE ("ma"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "platform owner read profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."master_admins" "ma"
  WHERE ("ma"."auth_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shared_resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shift_read_own_company" ON "public"."shifts" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_visits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_channel_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_direct_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_join_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_quick_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todo_list_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todo_list_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todo_list_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todo_list_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todo_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_sections" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."company_discussions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."team_channel_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."team_direct_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."team_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."team_tasks";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."can_access_todo_list"("target_list_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_todo_list"("target_list_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_todo_list"("target_list_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_company_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_todo_list_owner"("target_list_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_todo_list_owner"("target_list_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_todo_list_owner"("target_list_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
























GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."approvals" TO "anon";
GRANT ALL ON TABLE "public"."approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."approvals" TO "service_role";



GRANT ALL ON TABLE "public"."asset_assignment_history" TO "anon";
GRANT ALL ON TABLE "public"."asset_assignment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_assignment_history" TO "service_role";



GRANT ALL ON TABLE "public"."asset_requests" TO "anon";
GRANT ALL ON TABLE "public"."asset_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_requests" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."biometric_devices" TO "anon";
GRANT ALL ON TABLE "public"."biometric_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."biometric_devices" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_assets" TO "anon";
GRANT ALL ON TABLE "public"."company_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."company_assets" TO "service_role";



GRANT ALL ON TABLE "public"."company_discussions" TO "anon";
GRANT ALL ON TABLE "public"."company_discussions" TO "authenticated";
GRANT ALL ON TABLE "public"."company_discussions" TO "service_role";



GRANT ALL ON TABLE "public"."company_document_requirements" TO "anon";
GRANT ALL ON TABLE "public"."company_document_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."company_document_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."company_holidays" TO "anon";
GRANT ALL ON TABLE "public"."company_holidays" TO "authenticated";
GRANT ALL ON TABLE "public"."company_holidays" TO "service_role";



GRANT ALL ON TABLE "public"."company_memories" TO "anon";
GRANT ALL ON TABLE "public"."company_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."company_memories" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."company_storage" TO "anon";
GRANT ALL ON TABLE "public"."company_storage" TO "authenticated";
GRANT ALL ON TABLE "public"."company_storage" TO "service_role";



GRANT ALL ON TABLE "public"."employee_documents" TO "anon";
GRANT ALL ON TABLE "public"."employee_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_documents" TO "service_role";



GRANT ALL ON TABLE "public"."employee_off_days" TO "anon";
GRANT ALL ON TABLE "public"."employee_off_days" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_off_days" TO "service_role";



GRANT ALL ON TABLE "public"."exit_clearance_tasks" TO "anon";
GRANT ALL ON TABLE "public"."exit_clearance_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."exit_clearance_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."exit_interviews" TO "anon";
GRANT ALL ON TABLE "public"."exit_interviews" TO "authenticated";
GRANT ALL ON TABLE "public"."exit_interviews" TO "service_role";



GRANT ALL ON TABLE "public"."exit_requests" TO "anon";
GRANT ALL ON TABLE "public"."exit_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."exit_requests" TO "service_role";



GRANT ALL ON TABLE "public"."field_visits" TO "anon";
GRANT ALL ON TABLE "public"."field_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."field_visits" TO "service_role";



GRANT ALL ON TABLE "public"."file_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."file_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."file_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."file_shares" TO "anon";
GRANT ALL ON TABLE "public"."file_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."file_shares" TO "service_role";



GRANT ALL ON TABLE "public"."files" TO "anon";
GRANT ALL ON TABLE "public"."files" TO "authenticated";
GRANT ALL ON TABLE "public"."files" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."forum_comments" TO "anon";
GRANT ALL ON TABLE "public"."forum_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_comments" TO "service_role";



GRANT ALL ON TABLE "public"."forum_likes" TO "anon";
GRANT ALL ON TABLE "public"."forum_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_likes" TO "service_role";



GRANT ALL ON TABLE "public"."forum_poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."forum_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."forum_polls" TO "anon";
GRANT ALL ON TABLE "public"."forum_polls" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_polls" TO "service_role";



GRANT ALL ON TABLE "public"."forum_posts" TO "anon";
GRANT ALL ON TABLE "public"."forum_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_posts" TO "service_role";



GRANT ALL ON TABLE "public"."hr_policies" TO "anon";
GRANT ALL ON TABLE "public"."hr_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_policies" TO "service_role";



GRANT ALL ON TABLE "public"."induction_steps" TO "anon";
GRANT ALL ON TABLE "public"."induction_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."induction_steps" TO "service_role";



GRANT ALL ON TABLE "public"."late_mark_policies" TO "anon";
GRANT ALL ON TABLE "public"."late_mark_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."late_mark_policies" TO "service_role";



GRANT ALL ON TABLE "public"."leave_policies" TO "anon";
GRANT ALL ON TABLE "public"."leave_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_policies" TO "service_role";



GRANT ALL ON TABLE "public"."mail_connections" TO "service_role";



GRANT ALL ON TABLE "public"."master_admins" TO "anon";
GRANT ALL ON TABLE "public"."master_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."master_admins" TO "service_role";



GRANT ALL ON TABLE "public"."memories_managers" TO "anon";
GRANT ALL ON TABLE "public"."memories_managers" TO "authenticated";
GRANT ALL ON TABLE "public"."memories_managers" TO "service_role";



GRANT ALL ON TABLE "public"."memories_sections" TO "anon";
GRANT ALL ON TABLE "public"."memories_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."memories_sections" TO "service_role";



GRANT ALL ON TABLE "public"."memory_likes" TO "anon";
GRANT ALL ON TABLE "public"."memory_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_likes" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."office_locations" TO "anon";
GRANT ALL ON TABLE "public"."office_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."office_locations" TO "service_role";



GRANT ALL ON TABLE "public"."payslip_columns" TO "anon";
GRANT ALL ON TABLE "public"."payslip_columns" TO "authenticated";
GRANT ALL ON TABLE "public"."payslip_columns" TO "service_role";



GRANT ALL ON TABLE "public"."payslips" TO "anon";
GRANT ALL ON TABLE "public"."payslips" TO "authenticated";
GRANT ALL ON TABLE "public"."payslips" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."shared_resources" TO "anon";
GRANT ALL ON TABLE "public"."shared_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_resources" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."site_visits" TO "anon";
GRANT ALL ON TABLE "public"."site_visits" TO "authenticated";
GRANT ALL ON TABLE "public"."site_visits" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."team_channel_messages" TO "anon";
GRANT ALL ON TABLE "public"."team_channel_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."team_channel_messages" TO "service_role";



GRANT ALL ON TABLE "public"."team_channels" TO "anon";
GRANT ALL ON TABLE "public"."team_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."team_channels" TO "service_role";



GRANT ALL ON TABLE "public"."team_direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."team_direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."team_direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."team_events" TO "anon";
GRANT ALL ON TABLE "public"."team_events" TO "authenticated";
GRANT ALL ON TABLE "public"."team_events" TO "service_role";



GRANT ALL ON TABLE "public"."team_join_requests" TO "anon";
GRANT ALL ON TABLE "public"."team_join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."team_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."team_quick_links" TO "anon";
GRANT ALL ON TABLE "public"."team_quick_links" TO "authenticated";
GRANT ALL ON TABLE "public"."team_quick_links" TO "service_role";



GRANT ALL ON TABLE "public"."team_tasks" TO "anon";
GRANT ALL ON TABLE "public"."team_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."team_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."todo_list_activity" TO "anon";
GRANT ALL ON TABLE "public"."todo_list_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_list_activity" TO "service_role";



GRANT ALL ON TABLE "public"."todo_list_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."todo_list_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_list_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."todo_list_items" TO "anon";
GRANT ALL ON TABLE "public"."todo_list_items" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_list_items" TO "service_role";



GRANT ALL ON TABLE "public"."todo_list_notes" TO "anon";
GRANT ALL ON TABLE "public"."todo_list_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_list_notes" TO "service_role";



GRANT ALL ON TABLE "public"."todo_lists" TO "anon";
GRANT ALL ON TABLE "public"."todo_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_lists" TO "service_role";



GRANT ALL ON TABLE "public"."training_sections" TO "anon";
GRANT ALL ON TABLE "public"."training_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."training_sections" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";