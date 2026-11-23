import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";

interface FaceGuideOverlayProps {
  status: "idle" | "detecting" | "valid" | "invalid";
  feedbackMessage?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const OVAL_WIDTH = SCREEN_WIDTH * 0.72;
const OVAL_HEIGHT = OVAL_WIDTH * 1.35;

export const FaceGuideOverlay: React.FC<FaceGuideOverlayProps> = ({
  status,
  feedbackMessage,
}) => {
  const getBorderColor = () => {
    switch (status) {
      case "valid":
        return "#22C55E"; // Green
      case "invalid":
        return "#EF4444"; // Red
      case "detecting":
        return "#F59E0B"; // Amber
      case "idle":
      default:
        return "#38BDF8"; // Sky Blue
    }
  };

  const borderColor = getBorderColor();

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Top Banner Message */}
      <View style={styles.topContainer}>
        <View style={[styles.badge, { borderColor }]}>
          <Text style={styles.badgeText}>
            {feedbackMessage || "Align face within the oval guide"}
          </Text>
        </View>
      </View>

      {/* Center Oval Viewport */}
      <View style={styles.centerContainer}>
        <View style={[styles.oval, { borderColor }]}>
          {/* Subtle Crosshairs / Framing cues */}
          <View style={[styles.cornerTL, { borderColor }]} />
          <View style={[styles.cornerTR, { borderColor }]} />
          <View style={[styles.cornerBL, { borderColor }]} />
          <View style={[styles.cornerBR, { borderColor }]} />
        </View>
      </View>

      {/* Bottom Hint */}
      <View style={styles.bottomContainer}>
        <Text style={styles.hintText}>
          Ensure good lighting • Look directly at camera • No sunglasses
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  topContainer: {
    position: "absolute",
    top: 96,
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 10,
  },
  badge: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  badgeText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 2.5,
    borderStyle: "dashed",
    backgroundColor: "transparent",
    position: "relative",
  },
  cornerTL: {
    position: "absolute",
    top: -4,
    left: OVAL_WIDTH * 0.2,
    width: 20,
    height: 4,
    borderTopWidth: 4,
  },
  cornerTR: {
    position: "absolute",
    top: -4,
    right: OVAL_WIDTH * 0.2,
    width: 20,
    height: 4,
    borderTopWidth: 4,
  },
  cornerBL: {
    position: "absolute",
    bottom: -4,
    left: OVAL_WIDTH * 0.2,
    width: 20,
    height: 4,
    borderBottomWidth: 4,
  },
  cornerBR: {
    position: "absolute",
    bottom: -4,
    right: OVAL_WIDTH * 0.2,
    width: 20,
    height: 4,
    borderBottomWidth: 4,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  hintText: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
