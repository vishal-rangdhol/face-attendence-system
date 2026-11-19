import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Header } from "../components/Header";
import { UserProfile } from "../types";

interface ScreenPlaceholderProps {
  user: UserProfile | null;
  onBack: () => void;
}

export const EnrollmentScreen: React.FC<ScreenPlaceholderProps> = ({ user, onBack }) => {
  return (
    <View style={styles.container}>
      <Header title="Face Enrollment" subtitle="Scheduled for MS2 / MS3" />
      <View style={styles.content}>
        <Text style={styles.infoText}>
          Face capture and on-device MobileFaceNet embedding generation pipeline will be activated in Milestone 2 & 3.
        </Text>
        <Text style={styles.subInfo}>
          User: {user?.name || "Unregistered"} ({user?.id})
        </Text>
        <TouchableOpacity style={styles.btn} onPress={onBack}>
          <Text style={styles.btnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const VerificationScreen: React.FC<ScreenPlaceholderProps> = ({ user, onBack }) => {
  return (
    <View style={styles.container}>
      <Header title="Face Verification" subtitle="Scheduled for MS4 / MS5" />
      <View style={styles.content}>
        <Text style={styles.infoText}>
          Real-time cosine similarity matching and attendance submission will be activated in Milestone 4 & 5.
        </Text>
        <Text style={styles.subInfo}>
          Configured Threshold: 0.88 baseline
        </Text>
        <TouchableOpacity style={styles.btn} onPress={onBack}>
          <Text style={styles.btnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const HistoryScreen: React.FC<ScreenPlaceholderProps> = ({ user, onBack }) => {
  return (
    <View style={styles.container}>
      <Header title="Attendance Records" subtitle="Scheduled for MS6" />
      <View style={styles.content}>
        <Text style={styles.infoText}>
          Attendance calendar, logs, and summary metrics will be activated in Milestone 6.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={onBack}>
          <Text style={styles.btnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    alignItems: "center",
  },
  infoText: {
    color: "#E2E8F0",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  subInfo: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 12,
  },
  btn: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
