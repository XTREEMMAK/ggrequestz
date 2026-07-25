#!/usr/bin/env node

/**
 * Simple health check script for Docker
 * Returns exit code 0 if healthy, 1 if unhealthy
 */

const http = require("http");

const options = {
  // 127.0.0.1 rather than "localhost": localhost resolves to ::1 ahead of
  // 127.0.0.1 in this container, and the Node server binds IPv4 only.
  hostname: "127.0.0.1",
  port: Number(process.env.PORT) || 3000,
  path: "/api/health",
  method: "GET",
  timeout: 5000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log("Health check: HEALTHY");
    process.exit(0);
  } else {
    console.log(`Health check: UNHEALTHY (status: ${res.statusCode})`);
    process.exit(1);
  }
});

req.on("error", (err) => {
  console.log(`Health check: ERROR (${err.message})`);
  process.exit(1);
});

req.on("timeout", () => {
  console.log("Health check: TIMEOUT");
  req.destroy();
  process.exit(1);
});

req.end();
