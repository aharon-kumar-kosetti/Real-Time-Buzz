module.exports = {
  apps: [
    {
      name: "house-buzz-backend",
      script: "./src/server.js",
      instances: "max", // Utilizes all available CPU cores for clustering
      exec_mode: "cluster",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      time: true,
    }
  ]
};
