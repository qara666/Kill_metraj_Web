-- Migration: Create calculated_routes table for background order calculation
-- Purpose: Store routes calculated by the background Order Calculator worker

CREATE TABLE IF NOT EXISTS calculated_routes (
    id SERIAL PRIMARY KEY,
    courier_id TEXT NOT NULL,
    route_data JSONB NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    orders_count INTEGER NOT NULL,
    total_distance DECIMAL(10,2) NOT NULL, -- in kilometers
    total_duration INTEGER NOT NULL, -- in minutes
    engine_used TEXT, -- which routing engine was used
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for quick lookups by courier and date
CREATE INDEX IF NOT EXISTS idx_calculated_routes_courier_date 
ON calculated_routes (courier_id, calculated_at);

-- Create index for active routes
CREATE INDEX IF NOT EXISTS idx_calculated_routes_active 
ON calculated_routes (is_active, calculated_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calculated_routes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_calculated_routes_updated_at
    BEFORE UPDATE ON calculated_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_calculated_routes_updated_at();

-- Add comments
COMMENT ON TABLE calculated_routes IS 'Routes calculated by background Order Calculator worker';
COMMENT ON COLUMN calculated_routes.route_data IS 'Full route data including waypoints, geometry, and order details';
COMMENT ON COLUMN calculated_routes.total_distance IS 'Total route distance in kilometers';
COMMENT ON COLUMN calculated_routes.total_duration IS 'Total estimated duration in minutes';
COMMENT ON COLUMN calculated_routes.engine_used IS 'Routing engine used: yapiko_osrm, valhalla, osrm_public, or straight_line_fallback';