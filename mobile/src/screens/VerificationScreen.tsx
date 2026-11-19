import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { Header } from "../components/Header";
import { CameraCaptureView } from "../components/CameraCaptureView";
import { UserProfile, FaceValidationResult } from "../types";

interface VerificationScreenProps {
  user: UserProfile | null;
  onBack: () => void;
  onVerificationComplete?: () => void;
}

export const VerificationScreen: React.FC<VerificationScreenProps> = ({
  user,
  onBack,
  onVerificationComplete,
}) => {
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [capturedFace, setCapturedFace] = useState<FaceValidationResult | null>(null);

  if (!user || !user.hasBiometrics) {
    return (
      <View style={styles.container}>
        <Header title="Face Verification" subtitle="Enrollment required" />
        <View style={styles.card}>
          <Text style={styles.cardText}>
            You must enroll your face biometrics first before attempting attendance verification.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onBack}>
            <Text style={styles.primaryBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera Fullscreen Modal/View
  if (showCamera) {
    return (
      <CameraCaptureView
        instructionTitle="Attendance: Face Recognition"
        onCancel={() => setShowCamera(false)}
        onValidatedCapture={(result) => {
          setCapturedFace(result);
          setShowCamera(false);
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Header
        title="Mark Attendance"
        subtitle={`Verifying: ${user.name} (${user.id})`}
      />

      {!capturedFace && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>On-Device Face Verification</Text>
          <Text style={styles.cardText}>
            Position your face inside the camera guide. Google ML Kit will validate your pose and face quality before running MobileFaceNet matching.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowCamera(true)}>
            <Text style={styles.primaryBtnText}>Start Face Verification</Text>
          </TouchableOpacity>
        </View>
      )}

      {capturedFace && (
        <View style={styles.card}>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>✓ Face Captured & Validated</Text>
          </View>

          {capturedFace.imageUri && (
            <View style={styles.previewBox}>
              <Image source={{ uri: capturedFace.imageUri }} style={styles.previewImage} />
            </View>
          )}

          <Text style={styles.metricsHeader}>Detection Summary</Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Pose Angles</Text>
              <Text style={styles.metricValue}>
                P: {capturedFace.angles?.pitch}° • Y: {capturedFace.angles?.yaw}° • R: {capturedFace.angles?.roll}°
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Eyes Open Check</Text>
              <Text style={styles.metricValue}>
                L: {Math.round((capturedFace.eyesOpen?.left || 0) * 100)}% • R: {Math.round((capturedFace.eyesOpen?.right || 0) * 100)}%
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowCamera(true)}>
              <Text style={styles.secondaryBtnText}>Retake Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                Alert.alert(
                  "Milestone 2 Verified",
                  "Face captured and validated with Google ML Kit! On-device cosine similarity matching against enrolled template will run in Milestone 4.",
                  [{ text: "OK", onPress: onBack }]
                );
              }}
            >
              <Text style={styles.primaryBtnText}>Confirm Face</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.backLink} onPress={onBack}>
        <Text style={styles.backLinkText}>← Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  cardText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  successBadge: {
    backgroundColor: "#14532D",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignSelf: "center",
    marginBottom: 16,
  },
  successBadgeText: {
    color: "#86EFAC",
    fontSize: 13,
    fontWeight: "700",
  },
  previewBox: {
    height: 240,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  metricsHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  metricGrid: {
    gap: 8,
    marginBottom: 16,
  },
  metricItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#0F172A",
    padding: 10,
    borderRadius: 8,
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 13,
  },
  metricValue: {
    color: "#E2E8F0",
    fontSize: 13,
    fontFamily: "monospace",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
  backLink: {
    alignItems: "center",
    paddingVertical: 12,
  },
  backLinkText: {
    color: "#64748B",
    fontSize: 14,
  },
});
