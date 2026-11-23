function getValidatedBiometricKey(): string {
  const key = process.env.BIOMETRIC_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error(
      "FATAL: BIOMETRIC_ENCRYPTION_KEY environment variable is missing. " +
      "It is required to encrypt biometric templates at rest using AES-256-GCM. " +
      "Generate a secure 32-byte (256-bit) secret with: openssl rand -hex 32"
    );
  }
  if (key.length < 32) {
    throw new Error(
      `FATAL: BIOMETRIC_ENCRYPTION_KEY is too short (${key.length} characters). ` +
      "It must be at least 32 characters long to ensure cryptographic security."
    );
  }
  return key;
}

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
    defaultSimilarity: Number(process.env.DEFAULT_SIMILARITY_THRESHOLD || 0.85),
  },
  security: {
    biometricKey: getValidatedBiometricKey(),
  },
};
