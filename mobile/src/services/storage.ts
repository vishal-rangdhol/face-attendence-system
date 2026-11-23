import * as SecureStore from "expo-secure-store";
import { UserProfile, BiometricEnrollment, AttendanceRecord } from "../types";

const KEYS = {
  USER_PROFILE: "lcu_user_profile",
  ENROLLED_EMBEDDING: "lcu_enrolled_embedding",
  ATTENDANCE_CACHE: "lcu_attendance_cache",
  BACKEND_URL: "lcu_backend_url",
};

export const storageService = {
  async saveUserProfile(profile: UserProfile): Promise<void> {
    await SecureStore.setItemAsync(KEYS.USER_PROFILE, JSON.stringify(profile));
  },

  async getUserProfile(): Promise<UserProfile | null> {
    const raw = await SecureStore.getItemAsync(KEYS.USER_PROFILE);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserProfile;
    } catch {
      return null;
    }
  },

  async clearUserProfile(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.USER_PROFILE);
    await SecureStore.deleteItemAsync(KEYS.ENROLLED_EMBEDDING);
  },

  async saveEnrolledEmbedding(enrollment: BiometricEnrollment): Promise<void> {
    await SecureStore.setItemAsync(KEYS.ENROLLED_EMBEDDING, JSON.stringify(enrollment));
  },

  async getEnrolledEmbedding(): Promise<BiometricEnrollment | null> {
    const raw = await SecureStore.getItemAsync(KEYS.ENROLLED_EMBEDDING);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BiometricEnrollment;
    } catch {
      return null;
    }
  },

  async clearBiometrics(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.ENROLLED_EMBEDDING);
  },

  async getCachedAttendance(): Promise<AttendanceRecord[]> {
    const raw = await SecureStore.getItemAsync(KEYS.ATTENDANCE_CACHE);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as AttendanceRecord[];
    } catch {
      return [];
    }
  },

  async saveCachedAttendance(records: AttendanceRecord[]): Promise<void> {
    await SecureStore.setItemAsync(KEYS.ATTENDANCE_CACHE, JSON.stringify(records));
  },

  async appendCachedAttendance(record: AttendanceRecord): Promise<void> {
    const existing = await this.getCachedAttendance();
    const filtered = existing.filter((r) => r.id !== record.id && r.date !== record.date);
    const updated = [record, ...filtered];
    await this.saveCachedAttendance(updated);
  },

  async getBackendUrl(defaultUrl: string): Promise<string> {
    const raw = await SecureStore.getItemAsync(KEYS.BACKEND_URL);
    return raw?.trim() || defaultUrl;
  },

  async saveBackendUrl(url: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.BACKEND_URL, url.trim());
  },
};
