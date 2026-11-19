import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { faceDetectionService } from "../services/faceDetection";
import { FaceValidationResult } from "../types";

interface CameraCaptureViewProps {
  onValidatedCapture: (result: FaceValidationResult) => void;
  onCancel: () => void;
  instructionTitle?: string;
}

export const CameraCaptureView: React.FC<CameraCaptureViewProps> = ({
  onValidatedCapture,
  onCancel,
  instructionTitle = "Face Capture & Validation",
}) => {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("front");
  const [permission, requestPermission] = useCameraPermissions();

  const [overlayStatus, setOverlayStatus] = useState<"idle" | "detecting" | "valid" | "invalid">("idle");
  const [feedbackMessage, setFeedbackMessage] = useState<string>("Position face in oval");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<FaceValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // 1. Permission checks
  if (!permission) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={styles.permissionText}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.permissionTitle}>Camera Permission Required</Text>
        <Text style={styles.permissionText}>
          The personal attendance system requires camera access to detect and verify your face on-device.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={onCancel}>
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 2. Handle picture capture and face validation
  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      setOverlayStatus("detecting");
      setFeedbackMessage("Detecting face with ML Kit...");

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        setOverlayStatus("invalid");
        setFeedbackMessage("Failed to capture image. Please retry.");
        setIsProcessing(false);
        return;
      }

      setCapturedPreview(photo.uri);

      // Execute Google ML Kit face detection and quality gates
      const result = await faceDetectionService.detectAndValidateFace(
        photo.uri,
        photo.width,
        photo.height
      );

      setValidationResult(result);

      if (result.isValid) {
        setOverlayStatus("valid");
        setFeedbackMessage("Face validated successfully!");
      } else {
        setOverlayStatus("invalid");
        setFeedbackMessage(result.reason || "Face positioning validation failed.");
      }
    } catch (err) {
      console.error("[CameraCaptureView] Capture error:", err);
      setOverlayStatus("invalid");
      setFeedbackMessage(err instanceof Error ? err.message : "Capture failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetake = () => {
    setCapturedPreview(null);
    setValidationResult(null);
    setOverlayStatus("idle");
    setFeedbackMessage("Position face in oval");
  };

  const handleConfirm = () => {
    if (validationResult && validationResult.isValid) {
      onValidatedCapture(validationResult);
    }
  };

  const toggleFacing = () => {
    setFacing((prev) => (prev === "front" ? "back" : "front"));
  };

  return (
    <View style={styles.container}>
      {/* Camera Live Feed or Captured Still Preview */}
      {capturedPreview ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedPreview }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          {/* Overlay on top of preview */}
          <FaceGuideOverlay status={overlayStatus} feedbackMessage={feedbackMessage} />
        </View>
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing={facing}
          animateShutter={false}
        >
          <FaceGuideOverlay status={overlayStatus} feedbackMessage={feedbackMessage} />
        </CameraView>
      )}

      {/* Top Header / Close Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={onCancel} disabled={isProcessing}>
          <Text style={styles.iconBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{instructionTitle}</Text>
        {!capturedPreview && (
          <TouchableOpacity style={styles.iconBtn} onPress={toggleFacing} disabled={isProcessing}>
            <Text style={styles.iconBtnText}>Flip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        {capturedPreview ? (
          <View style={styles.previewActions}>
            {validationResult?.isValid ? (
              <>
                <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
                  <Text style={styles.retakeBtnText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                  <Text style={styles.confirmBtnText}>Use Face</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.fullRetakeBtn} onPress={handleRetake}>
                <Text style={styles.confirmBtnText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.captureRow}>
            <TouchableOpacity
              style={[styles.captureShutter, isProcessing && styles.disabledShutter]}
              onPress={handleCapture}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#0F172A" size="small" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerBox: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 10,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  grantBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  grantBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelLink: {
    marginTop: 16,
    padding: 8,
  },
  cancelLinkText: {
    color: "#64748B",
    fontSize: 14,
  },
  previewContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    position: "absolute",
    top: 15,
    left: 15,
    right: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 20,
  },
  topBarTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  iconBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  iconBtnText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  bottomControls: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    zIndex: 20,
  },
  captureRow: {
    alignItems: "center",
  },
  captureShutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  disabledShutter: {
    opacity: 0.6,
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#2563EB",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  retakeBtnText: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  fullRetakeBtn: {
    flex: 1,
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
});
