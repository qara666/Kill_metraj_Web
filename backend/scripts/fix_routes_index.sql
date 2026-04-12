-- Fix: Replace unstable time_block unique index with stable one
-- Run this once in psql: \i backend/scripts/fix_routes_index.sql

-- Step 1: Drop the old unstable unique index
DROP INDEX IF EXISTS idx_calculated_routes_upsert;

-- Step 2: Clear all accumulated stale routes (they all have old-format time_block labels)
-- WARNING: This will delete all calculated_routes data. Robot will recalculate fresh.
DELETE FROM calculated_routes;

-- Step 3: Recreate the unique index with the same expression
-- The new stable time_block format is: "YYYY-MM-DD_COURIER_NAME_ROUNDED_TIMESTAMP"
-- This is naturally unique per (division_id, courier_id, day+window)
CREATE UNIQUE INDEX idx_calculated_routes_upsert 
ON calculated_routes (division_id, courier_id, (route_data->>'time_block'));

-- Step 4: Confirm indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'calculated_routes' 
ORDER BY indexname;
