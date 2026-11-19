import { Hono } from "hono";
import { couchbase } from "../db/couchbase";

export const healthRouter = new Hono();

healthRouter.get("/health", async (c) => {
  const dbHealth = await couchbase.ping();

  return c.json({
    status: dbHealth.ok ? "healthy" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      api: "online",
      couchbase: dbHealth,
    },
  }, dbHealth.ok ? 200 : 503);
});
