import { CONFIG } from "../config";
import { UserProfile, AttendanceRecord } from "../types";

export interface ApiResponse<T = unknown> {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
  details?: unknown;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = CONFIG.API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  async checkHealth(): Promise<{ status: string; couchbaseOk: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      const data = await res.json();
      return {
        status: data.status || "unknown",
        couchbaseOk: data.services?.couchbase?.ok === true,
      };
    } catch {
      return { status: "offline", couchbaseOk: false };
    }
  }

  async registerUser(name: string, timezone: string): Promise<UserProfile> {
    const res = await fetch(`${this.baseUrl}/api/users/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, timezone }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to register user");
    }
    return data.user as UserProfile;
  }

  async enrollBiometrics(
    userId: string,
    embedding: number[],
    consentGranted: boolean
  ): Promise<{ message: string; enrolledAt: string }> {
    const res = await fetch(`${this.baseUrl}/api/biometrics/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, embedding, consentGranted }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to enroll biometrics");
    }
    return { message: data.message, enrolledAt: data.enrolledAt };
  }

  async deleteBiometrics(userId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/biometrics/${userId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete biometric data");
    }
  }

  async submitAttendance(params: {
    userId: string;
    similarityScore: number;
    verifiedOnDevice: boolean;
    timezone: string;
  }): Promise<{ message: string; record: AttendanceRecord }> {
    const res = await fetch(`${this.baseUrl}/api/attendance/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error(`DUPLICATE: ${data.message || "Attendance already marked for today"}`);
      }
      throw new Error(data.error || "Failed to submit attendance");
    }
    return { message: data.message, record: data.record };
  }

  async getAttendanceHistory(userId: string): Promise<AttendanceRecord[]> {
    const res = await fetch(`${this.baseUrl}/api/attendance/history/${userId}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to fetch attendance history");
    }
    return (data.records || []) as AttendanceRecord[];
  }
}

export const api = new ApiClient();
