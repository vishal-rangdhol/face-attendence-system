export const config = {
  port: Number(process.env.PORT || 3000),
  couchbase: {
    host: process.env.COUCHBASE_HOST || "localhost",
    queryPort: Number(process.env.COUCHBASE_QUERY_PORT || 8093),
    adminPort: Number(process.env.COUCHBASE_ADMIN_PORT || 8091),
    user: process.env.COUCHBASE_USER || "Administrator",
    pass: process.env.COUCHBASE_PASS || "password",
    bucket: process.env.COUCHBASE_BUCKET || "attendance_system",
    scope: process.env.COUCHBASE_SCOPE || "app",
  },
  thresholds: {
    defaultSimilarity: Number(process.env.DEFAULT_SIMILARITY_THRESHOLD || 0.88),
  },
};
