-- Migration: Create courier_settlements table
-- Description: Track courier cash settlements and payment collections
-- Created: 2026-02-10

CREATE TABLE IF NOT EXISTS courier_settlements (
    id SERIAL PRIMARY KEY,
    courier_id VARCHAR(255) NOT NULL,
    courier_name VARCHAR(255) NOT NULL,
    division_id VARCHAR(255) NOT NULL,
    settlement_date DATE NOT NULL,
    shift_start TIMESTAMP NOT NULL,
    shift_end TIMESTAMP NOT NULL,
    
    -- Financial data
    total_cash_expected DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_cash_received DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_card_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_online_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    
    -- Order details
    orders_count INTEGER NOT NULL DEFAULT 0,
    order_ids TEXT[], -- array of order IDs
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- pending, settled, verified
    settled_by VARCHAR(255), -- user who accepted the money
    settled_at TIMESTAMP,
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_courier_settlements_courier ON courier_settlements(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_settlements_date ON courier_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_courier_settlements_division ON courier_settlements(division_id);
CREATE INDEX IF NOT EXISTS idx_courier_settlements_status ON courier_settlements(status);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_courier_settlements_courier_date ON courier_settlements(courier_id, settlement_date);

-- Comments for documentation
COMMENT ON TABLE courier_settlements IS 'Tracks courier cash settlements and payment collections';
COMMENT ON COLUMN courier_settlements.total_cash_expected IS 'Expected cash amount from completed cash orders';
COMMENT ON COLUMN courier_settlements.total_cash_received IS 'Actual cash amount received from courier';
COMMENT ON COLUMN courier_settlements.status IS 'Settlement status: pending, settled, verified';
