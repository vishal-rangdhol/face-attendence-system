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

interface EnrollmentScreenProps {
  user: UserProfile | null;
  onBack: () => void;
  onEnrollmentComplete?: () => void;
}

export const EnrollmentScreen: React.FC<EnrollmentScreenProps> = ({
  user,
  onBack,
  onEnrollmentComplete,
}) => {
  const [consentGranted, setConsentGranted] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [validatedFace, setValidatedFace] = useState<FaceValidationResult | null>(null);

  if (!user) {
    return (
      <View style={styles.container}>
        <Header title="Face Enrollment" subtitle="No user registered" />
        <View style={styles.card}>
          <Text style={styles.cardText}>
            You must register a profile first before enrolling face biometrics.
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
        instructionTitle="Enrollment: Face Capture"
        onCancel={() => setShowCamera(false)}
        onValidatedCapture={(result) => {
          setValidatedFace(result);
          setShowCamera(false);
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Header
        title="Face Enrollment"
        subtitle={`Enrolling profile: ${user.name} (${user.id})`}
      />

      {/* Step 1: Explicit Consent Banner */}
      {!validatedFace && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>Biometric Privacy Consent</Text>
          <Text style={styles.consentText}>
            To mark attendance via face recognition, your device will capture a facial image to detect facial landmarks and compute an on-device mathematical feature vector.
          </Text>
          <View style={styles.privacyBullet}>
            <Text style={styles.bulletDot}>✓</Text>
            <Text style={styles.bulletText}>All processing occurs 100% on this mobile device.</Text>
          </View>
          <View style={styles.privacyBullet}>
            <Text style={styles.bulletDot}>✓</Text>
            <Text style={styles.bulletText}>No raw photographs are uploaded to the backend or saved permanently.</Text>
          </View>
          <View style={styles.privacyBullet}>
            <Text style={styles.bulletDot}>✓</Text>
            <Text style={styles.bulletText}>You can delete your enrolled biometric data at any time.</Text>
          </View>

          <TouchableOpacity
            style={[styles.consentCheckRow, consentGranted && styles.consentCheckActive]}
            onPress={() => setConsentGranted((prev) => !prev)}
          >
            <View style={[styles.checkbox, consentGranted && styles.checkboxChecked]}>
              {consentGranted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.consentCheckLabel}>
              I give explicit consent to enroll my face biometrics.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, !consentGranted && styles.disabledBtn]}
            disabled={!consentGranted}
            onPress={() => setShowCamera(true)}
          >
            <Text style={styles.primaryBtnText}>Open Camera for Enrollment</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2: Validated Face Preview & Quality Report */}
      {validatedFace && (
        <View style={styles.card}>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>✓ Face Validated via ML Kit</Text>
          </View>

          {validatedFace.imageUri && (
            <View style={styles.previewBox}>
              <Image source={{ uri: validatedFace.imageUri }} style={styles.previewImage} />
            </View>
          )}

          <Text style={styles.metricsHeader}>Capture Quality Assessment</Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Pose Angles</Text>
              <Text style={styles.metricValue}>
                P: {validatedFace.angles?.pitch}° • Y: {validatedFace.angles?.yaw}° • R: {validatedFace.angles?.roll}°
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Eyes Open</Text>
              <Text style={styles.metricValue}>
                L: {Math.round((validatedFace.eyesOpen?.left || 0) * 100)}% • R: {Math.round((validatedFace.eyesOpen?.right || 0) * 100)}%
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Face Bounding Box</Text>
              <Text style={styles.metricValue}>
                {validatedFace.boundingBox?.width} × {validatedFace.boundingBox?.height} px
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
                  "Face positioning and ML Kit detection validation completed! MobileFaceNet embedding generation will run in Milestone 3.",
                  [{ text: "OK", onPress: onBack }]
                );
              }}
            >
              <Text style={styles.primaryBtnText}>Confirm Capture</Text>
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
    color: "#94A3B8",
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
  consentText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  privacyBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  bulletDot: {
    color: "#38BDF8",
    fontWeight: "700",
    marginRight: 8,
    fontSize: 14,
  },
  bulletText: {
    color: "#94A3B8",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  consentCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  consentCheckActive: {
    borderColor: "#38BDF8",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#64748B",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  consentCheckLabel: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
  },
  disabledBtn: {
    backgroundColor: "#334155",
    opacity: 0.6,
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
