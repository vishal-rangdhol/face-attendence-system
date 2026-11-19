import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { healthRouter } from "./routes/health";
import { usersRouter } from "./routes/users";
import { biometricsRouter } from "./routes/biometrics";
import { attendanceRouter } from "./routes/attendance";
import { config } from "./config";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", cors());

// Error handler
app.onError((err, c) => {
  console.error("[ServerError]", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: err.message,
    },
    500
  );
});

// Mount routes
app.route("/", healthRouter);
app.route("/api/users", usersRouter);
app.route("/api/biometrics", biometricsRouter);
app.route("/api/attendance", attendanceRouter);

// Root greeting
app.get("/", (c) => {
  return c.json({
    service: "Standalone Face Attendance API",
    version: "1.0.0",
    runtime: "Bun",
    framework: "Hono",
    status: "online",
  });
});

console.log(`🚀 Attendance backend starting on http://localhost:${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
