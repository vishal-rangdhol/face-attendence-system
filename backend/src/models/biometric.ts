import { z } from "zod";

export const BiometricSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: z.literal("biometric").default("biometric"),
  embedding: z.array(z.number()).length(128, "Embedding must contain exactly 128 dimensions"),
  embeddingDimension: z.literal(128).default(128),
  modelVersion: z.string().default("MobileFaceNet-v1"),
  consentGranted: z.literal(true, {
    errorMap: () => ({ message: "Explicit biometric consent must be granted" }),
  }),
  consentTimestamp: z.string().datetime(),
  enrolledAt: z.string().datetime(),
});

export type BiometricDocument = z.infer<typeof BiometricSchema>;

export const EnrollBiometricsRequestSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  embedding: z.array(z.number()).length(128, "Embedding must be exactly 128 float values"),
  modelVersion: z.string().optional().default("MobileFaceNet-v1"),
  consentGranted: z.literal(true, {
    errorMap: () => ({ message: "Explicit biometric consent is mandatory" }),
  }),
});

export type EnrollBiometricsRequest = z.infer<typeof EnrollBiometricsRequestSchema>;
