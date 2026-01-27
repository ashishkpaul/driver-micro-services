module.exports = {
  apps: [
    {
      name: "driver-service",
      script: "dist/main.js",

      // 🚀 Cluster mode
      exec_mode: "cluster",
      instances: "max", // or a number like 2/4 in prod

      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },

      // Restart behavior
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 5000,

      // Logging
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,

      // Memory safety
      max_memory_restart: "512M",
    },
  ],
};