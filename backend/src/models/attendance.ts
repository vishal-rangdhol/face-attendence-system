import { z } from "zod";

export const AttendanceSchema = z.object({
  id: z.string().min(1), // att::<userId>::<YYYY-MM-DD>
  type: z.literal("attendance").default("attendance"),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must follow YYYY-MM-DD"),
  serverTimestamp: z.string().datetime(), // Authoritative UTC timestamp
  status: z.literal("PRESENT").default("PRESENT"),
  similarityScore: z.number().min(0).max(1),
  verifiedOnDevice: z.boolean(), // Client integrity flag (Note: Not cryptographic proof)
});

export type AttendanceDocument = z.infer<typeof AttendanceSchema>;

export const SubmitAttendanceRequestSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  similarityScore: z.number().min(0).max(1),
  verifiedOnDevice: z.boolean(),
  timezone: z.string().optional(), // User's local timezone for date calculation
});

export type SubmitAttendanceRequest = z.infer<typeof SubmitAttendanceRequestSchema>;
