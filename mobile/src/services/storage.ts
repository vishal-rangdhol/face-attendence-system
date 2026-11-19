import * as SecureStore from "expo-secure-store";
import { UserProfile, BiometricEnrollment } from "../types";

const KEYS = {
  USER_PROFILE: "lcu_user_profile",
  ENROLLED_EMBEDDING: "lcu_enrolled_embedding",
  CUSTOM_THRESHOLD: "lcu_custom_threshold",
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

  async saveThreshold(threshold: number): Promise<void> {
    await SecureStore.setItemAsync(KEYS.CUSTOM_THRESHOLD, threshold.toString());
  },

  async getThreshold(defaultThreshold: number): Promise<number> {
    const raw = await SecureStore.getItemAsync(KEYS.CUSTOM_THRESHOLD);
    if (!raw) return defaultThreshold;
    const val = parseFloat(raw);
    return isNaN(val) ? defaultThreshold : val;
  },
};
