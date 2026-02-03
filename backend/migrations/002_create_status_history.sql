-- Migration: Create status history table for dashboard orders
-- Purpose: Track when orders change status (e.g., to "Собран", "доставляется")

CREATE TABLE IF NOT EXISTS api_dashboard_status_history (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup of order history
CREATE INDEX IF NOT EXISTS idx_status_history_order_number 
ON api_dashboard_status_history (order_number);

-- Index for chronological analysis
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at 
ON api_dashboard_status_history (changed_at DESC);

COMMENT ON TABLE api_dashboard_status_history IS 'Tracks chronological status transitions for dashboard orders';
