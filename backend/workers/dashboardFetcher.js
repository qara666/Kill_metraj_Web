/**
 * Dashboard Background Fetcher Worker
 * 
 * Runs independently 24/7 to fetch dashboard data from external API
 * Features:
 * - Recursive setTimeout (prevents timing drift)
 * - Exponential backoff on errors
 * - Data deduplication via MD5 hash
 * - Graceful shutdown handling
 * - PostgreSQL persistence with NOTIFY trigger
 */

const axios = require('axios');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

class DashboardFetcher {
    constructor() {
        // PostgreSQL connection pool
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'kill_metraj',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Configuration
        this.fetchInterval = parseInt(process.env.DASHBOARD_FETCH_INTERVAL || '5000'); // 5 seconds
        this.maxRetries = parseInt(process.env.DASHBOARD_MAX_RETRIES || '5');
        this.baseBackoff = parseInt(process.env.DASHBOARD_BASE_BACKOFF || '5000');
        this.apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
        this.apiKey = process.env.EXTERNAL_API_KEY || '';

        // State
        this.isRunning = false;
        this.retryCount = 0;
        this.lastHash = null;
        this.consecutiveErrors = 0;
        this.totalFetches = 0;
        this.successfulFetches = 0;

        // Bind methods
        this.fetchAndStore = this.fetchAndStore.bind(this);
        this.scheduleNext = this.scheduleNext.bind(this);
        this.stop = this.stop.bind(this);
    }

    /**
     * Calculate MD5 hash of data for deduplication
     */
    calculateHash(data) {
        return crypto
            .createHash('md5')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    /**
     * Get last stored data hash from database
     */
    async getLastHash() {
        try {
            const result = await this.pool.query(
                'SELECT data_hash FROM api_dashboard_cache ORDER BY created_at DESC LIMIT 1'
            );
            return result.rows.length > 0 ? result.rows[0].data_hash : null;
        } catch (error) {
            console.error('Error fetching last hash:', error.message);
            return null;
        }
    }

    /**
     * Main fetch and store logic
     */
    async fetchAndStore() {
        const startTime = Date.now();
        this.totalFetches++;

        try {
            console.log(`[${new Date().toISOString()}] Fetching dashboard data... (Attempt ${this.totalFetches})`);

            // Fetch data from external API
            const response = await axios.get(this.apiUrl, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Accept': 'application/json'
                },
                params: {
                    top: process.env.DASHBOARD_TOP || '10',
                    dateShift: process.env.DASHBOARD_DATE_SHIFT || '0'
                },
                timeout: 10000 // 10 second timeout
            });

            // Calculate hash for deduplication
            const dataHash = this.calculateHash(response.data);

            // Check if data changed
            if (this.lastHash === dataHash) {
                console.log('  ↳ Data unchanged, skipping insert');
                this.successfulFetches++;
                this.retryCount = 0;
                this.consecutiveErrors = 0;
                return;
            }

            // Insert new data into database
            await this.pool.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code)
         VALUES ($1, $2, $3)`,
                [response.data, dataHash, response.status]
            );

            this.lastHash = dataHash;
            this.successfulFetches++;
            this.retryCount = 0;
            this.consecutiveErrors = 0;

            const elapsed = Date.now() - startTime;
            console.log(`  ✓ Data stored successfully (${elapsed}ms) - Success rate: ${(this.successfulFetches / this.totalFetches * 100).toFixed(1)}%`);

        } catch (error) {
            await this.handleError(error, startTime);
        }
    }

    /**
     * Handle errors with exponential backoff
     */
    async handleError(error, startTime) {
        this.retryCount++;
        this.consecutiveErrors++;

        const elapsed = Date.now() - startTime;
        const statusCode = error.response?.status || 0;
        const errorMessage = error.message || 'Unknown error';

        console.error(`  ✗ Error fetching dashboard data (${elapsed}ms):`);
        console.error(`    Status: ${statusCode}`);
        console.error(`    Message: ${errorMessage}`);
        console.error(`    Retry: ${this.retryCount}/${this.maxRetries}`);
        console.error(`    Consecutive errors: ${this.consecutiveErrors}`);

        // Log error to database
        try {
            await this.pool.query(
                `INSERT INTO api_dashboard_cache (payload, data_hash, status_code, error_message)
         VALUES ($1, $2, $3, $4)`,
                [{}, '', statusCode, errorMessage]
            );
        } catch (dbError) {
            console.error('    Failed to log error to database:', dbError.message);
        }

        // Reset retry count if we've exceeded max retries
        if (this.retryCount >= this.maxRetries) {
            console.warn(`    Max retries reached, resetting counter`);
            this.retryCount = 0;
        }

        // Alert if too many consecutive errors
        if (this.consecutiveErrors >= 10) {
            console.error(`    ⚠️  WARNING: ${this.consecutiveErrors} consecutive errors!`);
        }
    }

    /**
     * Calculate next execution time with exponential backoff
     */
    getNextInterval() {
        if (this.retryCount === 0) {
            return this.fetchInterval;
        }

        // Exponential backoff: baseBackoff * 2^retryCount
        const backoff = Math.min(
            this.baseBackoff * Math.pow(2, this.retryCount - 1),
            60000 // Cap at 1 minute
        );

        return backoff;
    }

    /**
     * Schedule next fetch (recursive setTimeout to prevent drift)
     */
    scheduleNext() {
        if (!this.isRunning) {
            return;
        }

        const interval = this.getNextInterval();

        if (this.retryCount > 0) {
            console.log(`  ⏳ Next attempt in ${(interval / 1000).toFixed(1)}s (backoff)`);
        }

        setTimeout(async () => {
            await this.fetchAndStore();
            this.scheduleNext();
        }, interval);
    }

    /**
     * Start the fetcher
     */
    async start() {
        if (this.isRunning) {
            console.warn('Dashboard fetcher is already running');
            return;
        }

        console.log('='.repeat(60));
        console.log('Dashboard Background Fetcher');
        console.log('='.repeat(60));
        console.log(`API URL: ${this.apiUrl}`);
        console.log(`Fetch interval: ${this.fetchInterval}ms`);
        console.log(`Max retries: ${this.maxRetries}`);
        console.log(`Base backoff: ${this.baseBackoff}ms`);
        console.log('='.repeat(60));

        // Test database connection
        try {
            await this.pool.query('SELECT NOW()');
            console.log('✓ Database connection successful');
        } catch (error) {
            console.error('✗ Database connection failed:', error.message);
            process.exit(1);
        }

        // Get last hash from database
        this.lastHash = await this.getLastHash();
        if (this.lastHash) {
            console.log(`✓ Loaded last data hash: ${this.lastHash.substring(0, 8)}...`);
        }

        this.isRunning = true;
        console.log('✓ Dashboard fetcher started');
        console.log('='.repeat(60));

        // Start fetching
        await this.fetchAndStore();
        this.scheduleNext();
    }

    /**
     * Stop the fetcher gracefully
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('\n' + '='.repeat(60));
        console.log('Dashboard fetcher stopping...');
        console.log(`Total fetches: ${this.totalFetches}`);
        console.log(`Successful: ${this.successfulFetches} (${(this.successfulFetches / this.totalFetches * 100).toFixed(1)}%)`);
        console.log('='.repeat(60));

        this.isRunning = false;

        // Close database connection
        await this.pool.end();
        console.log('✓ Database connection closed');
        console.log('✓ Dashboard fetcher stopped');
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            totalFetches: this.totalFetches,
            successfulFetches: this.successfulFetches,
            successRate: this.totalFetches > 0 ? (this.successfulFetches / this.totalFetches * 100).toFixed(1) : 0,
            consecutiveErrors: this.consecutiveErrors,
            retryCount: this.retryCount,
            lastHash: this.lastHash
        };
    }
}

// Create fetcher instance
const fetcher = new DashboardFetcher();

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM signal');
    await fetcher.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT signal');
    await fetcher.stop();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await fetcher.stop();
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await fetcher.stop();
    process.exit(1);
});

// Start fetcher
fetcher.start().catch(async (error) => {
    console.error('Failed to start fetcher:', error);
    await fetcher.stop();
    process.exit(1);
});

// Export for testing
module.exports = DashboardFetcher;
