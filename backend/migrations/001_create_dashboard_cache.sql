-- Migration: Create dashboard cache table with LISTEN/NOTIFY
-- Purpose: Store dashboard data fetched by background worker
-- Features: JSONB storage, deduplication, automatic cleanup, NOTIFY trigger

-- Create table
CREATE TABLE IF NOT EXISTS api_dashboard_cache (
    id SERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    data_hash TEXT NOT NULL,
    status_code INTEGER DEFAULT 200,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast retrieval of latest data
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_created_at 
ON api_dashboard_cache (created_at DESC);

-- Index for deduplication check
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_hash 
ON api_dashboard_cache (data_hash);

-- Index for cleanup queries (standard index is sufficient)
-- CREATE INDEX IF NOT EXISTS idx_dashboard_cache_cleanup ON api_dashboard_cache (created_at);
-- Note: idx_dashboard_cache_created_at already covers this

-- Trigger function for NOTIFY
CREATE OR REPLACE FUNCTION notify_dashboard_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify on successful data fetch (status 200)
    IF NEW.status_code = 200 THEN
        PERFORM pg_notify('dashboard_update', json_build_object(
            'id', NEW.id,
            'created_at', NEW.created_at,
            'status_code', NEW.status_code,
            'data_hash', NEW.data_hash
        )::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS dashboard_update_trigger ON api_dashboard_cache;
CREATE TRIGGER dashboard_update_trigger
AFTER INSERT ON api_dashboard_cache
FOR EACH ROW
EXECUTE FUNCTION notify_dashboard_update();

-- Create function to get latest dashboard data
CREATE OR REPLACE FUNCTION get_latest_dashboard_data()
RETURNS TABLE (
    id INTEGER,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    status_code INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        api_dashboard_cache.id,
        api_dashboard_cache.payload,
        api_dashboard_cache.created_at,
        api_dashboard_cache.status_code
    FROM api_dashboard_cache
    WHERE api_dashboard_cache.status_code = 200
    ORDER BY api_dashboard_cache.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup old data
CREATE OR REPLACE FUNCTION cleanup_old_dashboard_data(retention_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM api_dashboard_cache
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Vacuum to reclaim space
    EXECUTE 'VACUUM ANALYZE api_dashboard_cache';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust user as needed)
-- GRANT SELECT, INSERT ON api_dashboard_cache TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE api_dashboard_cache_id_seq TO your_app_user;

-- Add comment for documentation
COMMENT ON TABLE api_dashboard_cache IS 'Stores dashboard data fetched by background worker with automatic NOTIFY on insert';
COMMENT ON COLUMN api_dashboard_cache.payload IS 'Full JSON response from external Dashboard API';
COMMENT ON COLUMN api_dashboard_cache.data_hash IS 'MD5 hash of payload for deduplication';
COMMENT ON COLUMN api_dashboard_cache.status_code IS 'HTTP status code from API response';
COMMENT ON COLUMN api_dashboard_cache.error_message IS 'Error message if fetch failed';
