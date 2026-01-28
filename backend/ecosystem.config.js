module.exports = {
    apps: [
        {
            name: 'kill-metraj-api',
            script: './simple_server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 5001
            },
            error_file: './logs/api-error.log',
            out_file: './logs/api-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },
        {
            name: 'dashboard-fetcher',
            script: './workers/dashboardFetcher.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            restart_delay: 5000,
            max_restarts: 10,
            min_uptime: '10s',
            exp_backoff_restart_delay: 100,
            env: {
                NODE_ENV: 'production',
                DASHBOARD_FETCH_INTERVAL: '5000',
                DASHBOARD_MAX_RETRIES: '5',
                DASHBOARD_BASE_BACKOFF: '5000'
            },
            error_file: './logs/fetcher-error.log',
            out_file: './logs/fetcher-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },
        {
            name: 'cleanup-job',
            script: './workers/cleanupJob.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production',
                DASHBOARD_DATA_RETENTION_DAYS: '7',
                CLEANUP_SCHEDULE: '0 3 * * *'
            },
            error_file: './logs/cleanup-error.log',
            out_file: './logs/cleanup-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },
        {
            name: 'kill-metraj-frontend',
            cwd: '../frontend',
            script: 'npm',
            args: 'run dev -- --port 5173 --host',
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                VITE_API_URL: 'http://localhost:5001'
            }
        }
    ]
};
