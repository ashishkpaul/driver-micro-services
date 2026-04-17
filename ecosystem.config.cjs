module.exports = {
  apps: [
    {
      name: "driver-service",
      script: "dist/driver-backend-nest/src/main.js",

      // 🚀 Cluster mode
      exec_mode: "cluster",
      instances: "max", // or a number like 2/4 in prod

      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 3002,
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
    {
      name: "outbox-worker",
      script: "dist/driver-backend-nest/src/worker.js",
      instances: 2, // Fixed number, not "max" for workers
      exec_mode: "cluster",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_memory_restart: "256M",
      // Worker-specific settings
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 5000,
      listen_timeout: 5000,
      // Worker logging
      out_file: "logs/worker-out.log",
      error_file: "logs/worker-error.log",
      merge_logs: true,
    },
  ],
};
