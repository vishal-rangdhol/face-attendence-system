import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Vibration,
} from "react-native";
import { Header } from "../components/Header";
import { CameraCaptureView } from "../components/CameraCaptureView";
import { UserProfile, FaceValidationResult, AttendanceRecord } from "../types";
import { storageService } from "../services/storage";
import { api } from "../services/api";
import { extractFaceEmbedding, computeCosineSimilarity } from "../services/faceRecognition";
import { CONFIG } from "../config";
import * as FileSystem from "expo-file-system";

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
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [similarityScore, setSimilarityScore] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedRecord, setSubmittedRecord] = useState<AttendanceRecord | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const deleteTempImage = (uri?: string | null) => {
    if (uri && (uri.startsWith("file://") || uri.startsWith("/"))) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  };

  const runVerification = async (capture: FaceValidationResult) => {
    if (!user) return;
    if (!capture.imageUri) {
      Alert.alert("Error", "No valid image captured.");
      return;
    }

    setIsMatching(true);
    setSimilarityScore(null);
    setSubmittedRecord(null);
    setDuplicateNotice(null);

    try {
      // 1. Fetch enrolled biometric template
      const enrolled = await storageService.getEnrolledEmbedding();
      if (!enrolled || !enrolled.embedding || enrolled.embedding.length === 0) {
        Alert.alert(
          "Enrollment Missing",
          "No enrolled biometric template found on this device. Please enroll your face first.",
          [{ text: "OK", onPress: onBack }]
        );
        return;
      }

      // 2. Extract 128-D embedding from captured face via MobileFaceNet TFLite
      const liveEmbedding = await extractFaceEmbedding(
        capture.imageUri,
        capture.boundingBox,
        capture.imageWidth,
        capture.imageHeight
      );

      // 3. Compute cosine similarity between live capture and enrolled template
      const score = computeCosineSimilarity(liveEmbedding, enrolled.embedding);
      setSimilarityScore(score);

      // 4. Haptic / tactile feedback
      if (score >= CONFIG.VERIFICATION_THRESHOLD) {
        Vibration.vibrate(120); // Quick single confirmation buzz
      } else {
        Vibration.vibrate([0, 100, 80, 100]); // Double alert buzz
      }
    } catch (err: any) {
      deleteTempImage(capture?.imageUri);
      Alert.alert("Recognition Error", err.message || "Failed to process face embedding");
    } finally {
      setIsMatching(false);
    }
  };

  const handleSubmitAttendance = async () => {
    if (!user || similarityScore === null) return;

    setIsSubmitting(true);
    try {
      const res = await api.submitAttendance({
        userId: user.id,
        similarityScore,
        verifiedOnDevice: true,
        timezone: user.timezone,
      });

      setSubmittedRecord(res.record);
      await storageService.appendCachedAttendance(res.record);
      Vibration.vibrate([0, 80, 60, 120]);

      Alert.alert(
        "Attendance Confirmed",
        `Attendance recorded successfully for ${res.record.date} at ${res.record.serverTimestamp.slice(11, 19)} UTC.`,
        [
          {
            text: "Done",
            onPress: () => {
              deleteTempImage(capturedFace?.imageUri);
              if (onVerificationComplete) onVerificationComplete();
              else onBack();
            },
          },
        ]
      );
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("DUPLICATE") || msg.includes("already")) {
        setDuplicateNotice(msg);
        Alert.alert("Already Recorded", msg, [{ text: "OK" }]);
      } else {
        Alert.alert("Submission Failed", msg || "Could not log attendance to server.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

  // Fullscreen Camera View
  if (showCamera) {
    return (
      <CameraCaptureView
        mode="verification"
        instructionTitle="Attendance: Face Recognition"
        onCancel={() => setShowCamera(false)}
        onValidatedCapture={(result) => {
          setCapturedFace(result);
          setShowCamera(false);
          runVerification(result);
        }}
      />
    );
  }

  const isMatch = similarityScore !== null && similarityScore >= CONFIG.VERIFICATION_THRESHOLD;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Header
        title="Mark Attendance"
        subtitle={`Verifying: ${user.name} (${user.id})`}
      />

      {/* Start Capture Card */}
      {!capturedFace && (
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>On-Device Face Verification</Text>
          <Text style={styles.cardText}>
            Hands-free biometric attendance: Align your face within the guide. The front camera automatically detects face pose and verifies a natural eye blink, matching against your enrolled template.
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowCamera(true)}>
            <Text style={styles.primaryBtnText}>Start Face Verification</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Captured Face & Matching State */}
      {capturedFace && (
        <View style={styles.card}>
          {/* Face Preview */}
          {capturedFace.imageUri && (
            <View style={styles.previewBox}>
              <Image source={{ uri: capturedFace.imageUri }} style={styles.previewImage} />
            </View>
          )}

          {/* Matching In Progress Spinner */}
          {isMatching && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38BDF8" />
              <Text style={styles.loadingText}>Running MobileFaceNet inference...</Text>
            </View>
          )}

          {/* Verification Result Card */}
          {similarityScore !== null && !isMatching && (
            <View style={[styles.resultCard, isMatch ? styles.matchCard : styles.mismatchCard]}>
              <View style={styles.resultHeaderRow}>
                <Text style={[styles.resultBadge, isMatch ? styles.matchBadge : styles.mismatchBadge]}>
                  {isMatch ? "✓ MATCH VERIFIED" : "✗ MISMATCH"}
                </Text>
                <Text style={styles.scoreText}>
                  Score: {(similarityScore * 100).toFixed(1)}%
                </Text>
              </View>

              <Text style={styles.comparisonSubtext}>
                Cosine Similarity: {similarityScore.toFixed(4)} • Required: {CONFIG.VERIFICATION_THRESHOLD.toFixed(2)}
              </Text>

              {!isMatch && (
                <Text style={styles.helpText}>
                  Face score did not reach the {CONFIG.VERIFICATION_THRESHOLD.toFixed(2)} threshold. Ensure good lighting and look directly into the camera without tilting.
                </Text>
              )}
            </View>
          )}

          {/* Duplicate Attendance Warning */}
          {duplicateNotice && (
            <View style={styles.duplicateBox}>
              <Text style={styles.duplicateTitle}>Attendance Already Marked</Text>
              <Text style={styles.duplicateText}>{duplicateNotice}</Text>
            </View>
          )}

          {/* Confirmed Attendance Record */}
          {submittedRecord && (
            <View style={styles.successRecordBox}>
              <Text style={styles.successRecordTitle}>✓ Attendance Logged</Text>
              <Text style={styles.successRecordDetail}>Date: {submittedRecord.date}</Text>
              <Text style={styles.successRecordDetail}>Timestamp: {submittedRecord.serverTimestamp}</Text>
              <Text style={styles.successRecordDetail}>Status: {submittedRecord.status}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                deleteTempImage(capturedFace?.imageUri);
                setCapturedFace(null);
                setSimilarityScore(null);
                setSubmittedRecord(null);
                setDuplicateNotice(null);
                setShowCamera(true);
              }}
              disabled={isMatching || isSubmitting}
            >
              <Text style={styles.secondaryBtnText}>Retake Photo</Text>
            </TouchableOpacity>

            {isMatch && !submittedRecord && (
              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && styles.disabledBtn]}
                onPress={handleSubmitAttendance}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Submit Attendance</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.backLink}
        onPress={() => {
          deleteTempImage(capturedFace?.imageUri);
          onBack();
        }}
      >
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
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  submitBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  previewBox: {
    height: 220,
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
  loadingBox: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  resultCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  matchCard: {
    backgroundColor: "rgba(22, 163, 74, 0.15)",
    borderColor: "#16A34A",
  },
  mismatchCard: {
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    borderColor: "#DC2626",
  },
  resultHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  resultBadge: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  matchBadge: {
    color: "#4ADE80",
  },
  mismatchBadge: {
    color: "#F87171",
  },
  scoreText: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
  },
  comparisonSubtext: {
    color: "#CBD5E1",
    fontSize: 12,
  },
  helpText: {
    color: "#FCA5A5",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  duplicateBox: {
    backgroundColor: "rgba(234, 179, 8, 0.15)",
    borderColor: "#EAB308",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  duplicateTitle: {
    color: "#FDE047",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 4,
  },
  duplicateText: {
    color: "#FEF08A",
    fontSize: 12,
  },
  successRecordBox: {
    backgroundColor: "rgba(22, 163, 74, 0.2)",
    borderColor: "#16A34A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successRecordTitle: {
    color: "#4ADE80",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 6,
  },
  successRecordDetail: {
    color: "#E2E8F0",
    fontSize: 12,
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
    flex: 1,
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
