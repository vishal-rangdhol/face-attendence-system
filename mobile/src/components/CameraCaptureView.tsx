import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { FaceValidationResult, FaceBoundingBox } from "../types";
import { faceDetectionService } from "../services/faceDetection";
import {
  FaceCameraView,
  FaceCameraRef,
  LiveFaceStatusEvent,
} from "face-camera";

interface CameraCaptureViewProps {
  onValidatedCapture: (result: FaceValidationResult) => void;
  onCancel: () => void;
  instructionTitle?: string;
  mode?: "enrollment" | "verification";
}

export const CameraCaptureView: React.FC<CameraCaptureViewProps> = ({
  onValidatedCapture,
  onCancel,
  instructionTitle = "Face Capture & Validation",
  mode = "enrollment",
}) => {
  const cameraRef = useRef<FaceCameraRef>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [overlayStatus, setOverlayStatus] = useState<"idle" | "detecting" | "valid" | "invalid">("idle");
  const [feedbackMessage, setFeedbackMessage] = useState<string>("Position face in oval guide");
  const [liveFaceEvent, setLiveFaceEvent] = useState<LiveFaceStatusEvent | null>(null);

  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedValidation, setCapturedValidation] = useState<FaceValidationResult | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const alignedStartTimeRef = useRef<number | null>(null);

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
          The personal attendance system requires front camera access to detect and verify your face on-device.
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

  // 2. Continuous real-time frame event handler (NO photos taken)
  const handleFaceStatusChanged = (event: { nativeEvent: LiveFaceStatusEvent }) => {
    if (capturedPreview || isCapturing) return;

    const data = event.nativeEvent;
    setLiveFaceEvent(data);

    if (data.status !== "ALIGNED") {
      alignedStartTimeRef.current = null;

      switch (data.status) {
        case "NO_FACE":
          setOverlayStatus("idle");
          setFeedbackMessage(data.reason || "Position face in oval guide");
          break;
        case "MULTIPLE_FACES":
          setOverlayStatus("invalid");
          setFeedbackMessage(data.reason || "Multiple faces detected. Only one allowed.");
          break;
        case "TOO_FAR":
        case "TOO_CLOSE":
        case "INVALID_ANGLES":
          setOverlayStatus("detecting");
          setFeedbackMessage(data.reason || "Adjust your face position");
          break;
      }
      return;
    }

    // Status is ALIGNED
    setOverlayStatus("valid");

    if (mode === "verification") {
      const now = Date.now();
      if (!alignedStartTimeRef.current) {
        alignedStartTimeRef.current = now;
      }
      const elapsed = now - alignedStartTimeRef.current;
      const remainingSeconds = Math.max(1, Math.ceil((3500 - elapsed) / 1000));
      setFeedbackMessage(`✓ Face aligned! Hold steady • ${remainingSeconds}s...`);

      if (elapsed >= 3500) {
        alignedStartTimeRef.current = null;
        setFeedbackMessage("✓ Scanning face...");
        handleCapture();
      }
    } else {
      setFeedbackMessage("✓ Face properly aligned! Tap shutter to capture");
    }
  };

  // 3. Single-shot capture: triggers exactly ONE photo capture
  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      setFeedbackMessage("Verifying biometric embedding...");

      const photo = await cameraRef.current.takePicture();

      if (!photo || !photo.uri) {
        setOverlayStatus("invalid");
        setFeedbackMessage("Failed to capture image. Please retry.");
        setIsCapturing(false);
        return;
      }

      setCapturedPreview(photo.uri);

      // 1. Calculate face bounding box in photo pixel dimensions for accurate cropping
      let boundingBox: FaceBoundingBox | undefined = undefined;

      // Primary: Detect precise face bounding box on the captured photo using ML Kit
      try {
        const mlResult = await faceDetectionService.detectAndValidateFace(
          photo.uri,
          photo.width,
          photo.height
        );
        if (mlResult.boundingBox) {
          boundingBox = mlResult.boundingBox;
        }
      } catch {}

      // Fallback: Scale normalized bounding box from live event
      if (!boundingBox && liveFaceEvent?.boundingBox && photo.width && photo.height) {
        boundingBox = {
          originX: Math.max(0, Math.round(liveFaceEvent.boundingBox.x * photo.width)),
          originY: Math.max(0, Math.round(liveFaceEvent.boundingBox.y * photo.height)),
          width: Math.round(liveFaceEvent.boundingBox.width * photo.width),
          height: Math.round(liveFaceEvent.boundingBox.height * photo.height),
        };
      }

      // Construct validation result from the single photo and live verified metrics
      const validationResult: FaceValidationResult = {
        isValid: true,
        imageUri: photo.uri,
        imageWidth: photo.width,
        imageHeight: photo.height,
        boundingBox,
        angles: liveFaceEvent?.angles,
        eyesOpen: liveFaceEvent?.eyesOpen,
        metrics: liveFaceEvent?.areaRatio ? { areaRatio: liveFaceEvent.areaRatio } : undefined,
        isLive: true,
        livenessMethod: "passive_gate",
      };

      setCapturedValidation(validationResult);

      if (mode === "verification") {
        // In verification flow, proceed directly
        onValidatedCapture(validationResult);
      } else {
        // In enrollment flow, allow review
        setFeedbackMessage("Face captured! Confirm or retake.");
      }
    } catch (err: any) {
      console.error("[CameraCaptureView] Single capture error:", err);
      setOverlayStatus("invalid");
      setFeedbackMessage(err.message || "Capture failed. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetake = async () => {
    if (capturedPreview) {
      try {
        await FileSystem.deleteAsync(capturedPreview, { idempotent: true });
      } catch {}
    }
    setCapturedPreview(null);
    setCapturedValidation(null);
    setOverlayStatus("idle");
    setFeedbackMessage("Position face in oval guide");
  };

  const handleConfirm = () => {
    if (!capturedValidation) return;
    onValidatedCapture(capturedValidation);
  };

  const isAligned = liveFaceEvent?.status === "ALIGNED";

  return (
    <View style={styles.container}>
      {capturedPreview ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedPreview }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          <FaceGuideOverlay status={overlayStatus} feedbackMessage={feedbackMessage} />
        </View>
      ) : (
        <View style={StyleSheet.absoluteFillObject}>
          <FaceCameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            isActive={!capturedPreview}
            onFaceStatusChanged={handleFaceStatusChanged}
          />
          <FaceGuideOverlay status={overlayStatus} feedbackMessage={feedbackMessage} />
        </View>
      )}

      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            if (capturedPreview) {
              FileSystem.deleteAsync(capturedPreview, { idempotent: true }).catch(() => {});
            }
            onCancel();
          }}
          disabled={isCapturing}
        >
          <Text style={styles.iconBtnText}>✕ Close</Text>
        </TouchableOpacity>

        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>
            {mode === "verification" ? "⚡ Live Attendance Feed" : "Live Enrollment Feed"}
          </Text>
        </View>
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        {capturedPreview ? (
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>Use Face</Text>
            </TouchableOpacity>
          </View>
        ) : mode === "verification" ? (
          <View style={styles.autoCapturePill}>
            {isCapturing ? (
              <ActivityIndicator color="#38BDF8" size="small" />
            ) : (
              <Text style={styles.autoCaptureText}>
                {isAligned ? "✓ Face aligned • Hold still for 3s" : "Align face inside oval guide"}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.captureRow}>
            <TouchableOpacity
              style={[
                styles.captureShutter,
                !isAligned && styles.disabledShutter,
                isCapturing && styles.disabledShutter,
              ]}
              onPress={handleCapture}
              disabled={!isAligned || isCapturing}
            >
              {isCapturing ? (
                <ActivityIndicator color="#0F172A" size="small" />
              ) : (
                <View
                  style={[
                    styles.shutterInner,
                    isAligned ? styles.shutterInnerReady : styles.shutterInnerDisabled,
                  ]}
                />
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
    marginBottom: 24,
  },
  grantBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginBottom: 12,
  },
  grantBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  cancelLink: {
    paddingVertical: 10,
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
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  iconBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  iconBtnText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
  },
  modeBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#38BDF8",
  },
  modeBadgeText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
  bottomControls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
    paddingHorizontal: 20,
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  autoCapturePill: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#38BDF8",
    alignItems: "center",
    justifyContent: "center",
  },
  autoCaptureText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
  captureShutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  disabledShutter: {
    opacity: 0.4,
    borderColor: "#64748B",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  shutterInnerReady: {
    backgroundColor: "#22C55E",
  },
  shutterInnerDisabled: {
    backgroundColor: "#94A3B8",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
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
});
