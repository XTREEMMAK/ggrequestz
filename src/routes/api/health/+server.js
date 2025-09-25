/**
 * Health check endpoint for monitoring and Docker health checks
 * Returns application status, database connectivity, and service health
 */

import { json } from "@sveltejs/kit";
import { query } from "$lib/database.js";
import { getCacheStats } from "$lib/cache.js";

export async function GET() {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.1.4",
    services: {
      database: "unknown",
      cache: "unknown",
      redis: "unknown",
    },
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
  };

  try {
    // Test database connectivity
    try {
      const dbResult = await query("SELECT 1 as test, NOW() as db_time");
      if (dbResult.rows.length > 0) {
        health.services.database = "healthy";
        health.database_time = dbResult.rows[0].db_time;
      } else {
        health.services.database = "unhealthy";
      }
    } catch (dbError) {
      console.error("Health check DB error:", dbError);
      health.services.database = "unhealthy";
      health.database_error = dbError.message;
    }

    // Search functionality now uses direct IGDB API integration
    // No separate search service to check

    // Test cache availability and Redis connectivity
    try {
      const cacheStats = await getCacheStats();
      health.services.cache = "healthy";
      health.services.redis = cacheStats.redis.connected
        ? "healthy"
        : "disconnected";
      health.cache_stats = cacheStats;

      const memUsage = process.memoryUsage();
      health.memory = {
        used: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB",
        total: Math.round(memUsage.heapTotal / 1024 / 1024) + "MB",
        external: Math.round(memUsage.external / 1024 / 1024) + "MB",
        rss: Math.round(memUsage.rss / 1024 / 1024) + "MB",
      };
    } catch (cacheError) {
      health.services.cache = "unhealthy";
      health.services.redis = "error";
      health.cache_error = cacheError.message;
    }

    // Determine overall status
    const servicesHealthy = Object.values(health.services).every(
      (status) => status === "healthy" || status === "not_configured",
    );

    if (!servicesHealthy) {
      health.status = "degraded";
    }

    // Critical service check (database must be healthy)
    if (health.services.database === "unhealthy") {
      health.status = "unhealthy";
      return json(health, { status: 503 });
    }

    // Add additional metadata
    health.nodejs_version = process.version;
    health.platform = process.platform;
    health.arch = process.arch;

    // PM2 process info (if available)
    if (process.env.PM2_USAGE) {
      health.pm2 = {
        instance_id: process.env.pm_id || "unknown",
        instance_name: process.env.name || "unknown",
      };
    }

    return json(health, {
      status: health.status === "ok" ? 200 : 206, // 206 for degraded
    });
  } catch (error) {
    console.error("Health check error:", error);

    return json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error.message,
        uptime: process.uptime(),
      },
      { status: 500 },
    );
  }
}
