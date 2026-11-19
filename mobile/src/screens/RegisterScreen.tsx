import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Header } from "../components/Header";
import { api } from "../services/api";
import { storageService } from "../services/storage";
import { UserProfile, ActiveScreen } from "../types";

interface RegisterScreenProps {
  onSuccess: (user: UserProfile) => void;
  onCancel: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onSuccess, onCancel }) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-detect device timezone
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const handleRegister = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Validation Error", "Please enter your name.");
      return;
    }

    setLoading(true);
    try {
      const user = await api.registerUser(trimmed, detectedTimezone);
      await storageService.saveUserProfile(user);
      Alert.alert("Registration Complete", `Welcome, ${user.name}! Your user ID is ${user.id}.`);
      onSuccess(user);
    } catch (err) {
      Alert.alert("Registration Failed", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="User Registration" subtitle="Register this device for personal attendance" />

      <View style={styles.form}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Alex Mercer"
          placeholderTextColor="#64748B"
          value={name}
          onChangeText={setName}
          autoFocus
          editable={!loading}
        />

        <Text style={styles.label}>Detected Timezone</Text>
        <View style={styles.tzBox}>
          <Text style={styles.tzText}>{detectedTimezone}</Text>
        </View>
        <Text style={styles.helpText}>
          Attendance date boundaries (YYYY-MM-DD) will be calculated in this timezone.
        </Text>

        <TouchableOpacity
          style={[styles.submitBtn, (!name.trim() || loading) && styles.disabledBtn]}
          onPress={handleRegister}
          disabled={!name.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>Register Profile</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
          <Text style={styles.cancelBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    marginTop: 20,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E2E8F0",
  },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#F8FAFC",
  },
  tzBox: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tzText: {
    color: "#94A3B8",
    fontSize: 14,
    fontFamily: "monospace",
  },
  helpText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: -4,
  },
  submitBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 16,
  },
  disabledBtn: {
    backgroundColor: "#334155",
    opacity: 0.6,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
