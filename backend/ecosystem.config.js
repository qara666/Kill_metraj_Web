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
                NODE_ENV: 'production'
            },
            // Удалить error_file и out_file, чтобы видеть логи в консоли Render
            // error_file: './logs/api-error.log',
            // out_file: './logs/api-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        }
    ]
};
