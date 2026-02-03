-- 1. Enable RLS on core tables
ALTER TABLE api_dashboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_states ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any (to avoid duplicates)
DROP POLICY IF EXISTS dashboard_division_isolation ON api_dashboard_cache;
DROP POLICY IF EXISTS user_self_read_isolation ON users;
DROP POLICY IF EXISTS dashboard_state_user_isolation ON dashboard_states;

-- 3. Define Policies

-- Policy for api_dashboard_cache:
-- Admins can see everything.
-- Users/Managers can only see data where payload->'departmentId' matches their divisionId.
CREATE POLICY dashboard_division_isolation ON api_dashboard_cache
    FOR SELECT
    USING (
        current_setting('app.user_role', true) = 'admin'
        OR (payload->>'departmentId') = current_setting('app.division_id', true)
        OR current_setting('app.division_id', true) = 'all'
    );

-- Policy for users:
-- Admins can see/edit everything.
-- Normal users can only see their own profile.
CREATE POLICY user_self_read_isolation ON users
    FOR ALL
    USING (
        current_setting('app.user_role', true) = 'admin'
        OR id = NULLIF(current_setting('app.user_id', true), '')::integer
    );

-- Policy for dashboard_states:
-- Users can only see/edit their own dashboard state.
CREATE POLICY dashboard_state_user_isolation ON dashboard_states
    FOR ALL
    USING (
        current_setting('app.user_role', true) = 'admin'
        OR "userId" = NULLIF(current_setting('app.user_id', true), '')::integer
    );

-- 4. Grant bypass for common roles if necessary (optional, but keep it strict for now)
-- ALTER TABLE ... FORCE ROW LEVEL SECURITY; -- Ensures even table owners are bound by RLS (often needed for testing)
