import { z } from "zod";

export const USER_ID_REGEX = /^usr_[a-zA-Z0-9_-]+$/;

export const BiometricSchema = z.object({
  id: z.string().min(1),
  userId: z.string().regex(USER_ID_REGEX, "Invalid user ID format"),
  type: z.literal("biometric").default("biometric"),
  encryptedEmbedding: z.string().optional(),
  iv: z.string().optional(),
  tag: z.string().optional(),
  embedding: z
    .array(z.number())
    .refine((arr) => arr.length === 128 || arr.length === 192, {
      message: "Embedding must contain either 128 or 192 dimensions",
    })
    .optional(),
  embeddingDimension: z.number().default(192),
  modelVersion: z.string().default("MobileFaceNet-v1"),
  consentGranted: z.literal(true, {
    errorMap: () => ({ message: "Explicit biometric consent must be granted" }),
  }),
  consentTimestamp: z.string().datetime(),
  enrolledAt: z.string().datetime(),
});

export type BiometricDocument = z.infer<typeof BiometricSchema>;

export const EnrollBiometricsRequestSchema = z.object({
  userId: z.string().regex(USER_ID_REGEX, "Invalid user ID format"),
  embedding: z
    .array(z.number())
    .refine((arr) => arr.length === 128 || arr.length === 192, {
      message: "Embedding must contain either 128 or 192 float values",
    }),
  modelVersion: z.string().optional().default("MobileFaceNet-v1"),
  consentGranted: z.literal(true, {
    errorMap: () => ({ message: "Explicit biometric consent is mandatory" }),
  }),
});

export type EnrollBiometricsRequest = z.infer<typeof EnrollBiometricsRequestSchema>;
