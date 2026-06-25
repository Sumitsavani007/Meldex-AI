// ecosystem.config.js — PM2 production configuration for Meldex AI
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 reload ecosystem.config.js   (zero-downtime reload)
//   pm2 stop meldex-ai
//   pm2 logs meldex-ai

module.exports = {
  apps: [
    {
      name: "meldex-ai",

      // Next.js production server
      script: "node_modules/.bin/next",
      args: "start",

      // Working directory
      cwd: __dirname,

      // Cluster mode — one process per CPU core
      instances: "max",
      exec_mode: "cluster",

      // Environment
      env_file: ".env.production",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Memory limit before auto-restart
      max_memory_restart: "1G",

      // Logs
      error_file: "/var/log/meldex/error.log",
      out_file: "/var/log/meldex/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Behaviour
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,

      // Graceful shutdown — wait up to 10s for in-flight requests
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 15000,
    },
  ],
};
