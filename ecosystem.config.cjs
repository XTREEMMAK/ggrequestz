/**
 * PM2 ecosystem configuration for G.G Requestz
 * Provides production-ready process management with clustering and monitoring
 */

module.exports = {
  apps: [
    {
      name: "ggrequestz",
      script: "./build/index.js",
      instances: process.env.PM2_INSTANCES || "max",
      exec_mode: "cluster",

      // Environment configuration
      //
      // ORIGIN tells adapter-node the app's public URL. Without it, it assumes
      // https, which breaks CSRF origin checks and OIDC redirect URIs on any
      // http deployment. The entrypoint derives it from PUBLIC_SITE_URL.
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        ORIGIN: process.env.ORIGIN,
      },

      // Production environment overrides
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        ORIGIN: process.env.ORIGIN,
      },

      // Monitoring and health
      min_uptime: "10s",
      max_restarts: 10,
      max_memory_restart: "1G",

      // Logging. Deliberately no out_file/error_file: pm2-runtime already
      // forwards worker output to the container's stdout, so pointing the log
      // files at /dev/stdout wrote every line twice, once directly, once via
      // pm2-runtime's tail. Setting them is what produced duplicate log lines,
      // not cluster mode.
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Performance monitoring
      pmx: true,

      // Auto restart on file changes (disable in production)
      watch: false,
      ignore_watch: ["node_modules", "logs", ".git"],

      // Graceful shutdown
      kill_timeout: 5000,

      // Health check endpoint
      health_check_http: {
        path: "/api/health",
        port: 3000,
        interval: 30000,
        timeout: 5000,
      },

      // Advanced PM2 features
      node_args: "--max-old-space-size=1024",

      // Cron restart (optional - restart daily at 2 AM)
      cron_restart: process.env.PM2_CRON_RESTART || null,

      // Time zone
      time: true,
    },
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: "deploy",
      host: ["your-server.com"],
      ref: "origin/main",
      repo: "git@github.com:your-username/ggrequestz.git",
      path: "/var/www/ggrequestz",
      "pre-deploy-local": "",
      "post-deploy":
        "npm install && npm run build && pm2 reload ecosystem.config.cjs --env production",
      "pre-setup": "",
      ssh_options: "ForwardAgent=yes",
    },
  },
};
