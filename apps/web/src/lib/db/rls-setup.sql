-- ============================================================================
-- Row-Level Security (RLS) policies for tenant isolation.
--
-- These must be applied AFTER the initial schema migration.
-- Run: psql $DATABASE_URL_UNPOOLED -f rls-setup.sql
--
-- Strategy:
-- - Every request sets `app.current_tenant_id` via SET LOCAL
-- - SELECT/INSERT/UPDATE/DELETE are restricted to rows matching that tenant
-- - The `tenants` table itself is NOT restricted by RLS (super admin access)
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lecturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturer_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for directly tenant-scoped tables
-- Pattern: tenant_id = current_setting('app.current_tenant_id')::uuid

CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_rooms ON rooms
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_courses ON courses
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_student_groups ON student_groups
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_time_slots ON time_slots
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_constraints ON scheduling_constraints
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_schedules ON generated_schedules
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policies for join tables and child tables (join via parent's tenant_id)

CREATE POLICY tenant_isolation_course_sessions ON course_sessions
  USING (course_id IN (
    SELECT id FROM courses WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_course_lecturers ON course_lecturers
  USING (course_id IN (
    SELECT id FROM courses WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_course_student_groups ON course_student_groups
  USING (course_id IN (
    SELECT id FROM courses WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_lecturer_availability ON lecturer_availability
  USING (user_id IN (
    SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_lecturer_preferences ON lecturer_preferences
  USING (user_id IN (
    SELECT id FROM users WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

CREATE POLICY tenant_isolation_schedule_entries ON schedule_entries
  USING (schedule_id IN (
    SELECT id FROM generated_schedules WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

-- Force RLS on the table owner too (prevents bypassing)
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
ALTER TABLE course_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE course_lecturers FORCE ROW LEVEL SECURITY;
ALTER TABLE student_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE course_student_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE time_slots FORCE ROW LEVEL SECURITY;
ALTER TABLE lecturer_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE lecturer_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE scheduling_constraints FORCE ROW LEVEL SECURITY;
ALTER TABLE generated_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
