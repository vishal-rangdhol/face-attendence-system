import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface BiometricCameraOverlayProps {
  title: string;
  subtitle?: string;
  instruction: string;
  statusBadge?: string;
  countdownSeconds?: number;
  onCancel?: () => void;
  children?: React.ReactNode;
}

export const BiometricCameraOverlay: React.FC<BiometricCameraOverlayProps> = ({
  title,
  subtitle,
  instruction,
  statusBadge,
  countdownSeconds,
  onCancel,
  children,
}) => {
  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* Top Header */}
      <View style={styles.topSection}>
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>{title}</Text>
          {onCancel && (
            <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
        {subtitle && <Text style={styles.subtitleText}>{subtitle}</Text>}

        {statusBadge && (
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{statusBadge}</Text>
          </View>
        )}
      </View>

      {/* Bottom Guidance Area */}
      <View style={styles.bottomSection} pointerEvents="box-none">
        <View style={styles.instructionCard}>
          <Text style={styles.instructionText}>{instruction}</Text>
          {countdownSeconds !== undefined && countdownSeconds > 0 && (
            <Text style={styles.countdownText}>{countdownSeconds}s</Text>
          )}
        </View>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 76,
  },
  topSection: {
    marginTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  subtitleText: {
    fontSize: 13,
    color: '#CBD5E1',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  badgeContainer: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: 'rgba(255, 107, 53, 0.95)', // LCU Brand Orange
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomSection: {
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  instructionCard: {
    backgroundColor: 'rgba(19, 23, 28, 0.92)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    maxWidth: '92%',
    borderWidth: 1,
    borderColor: '#252C35',
  },
  instructionText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  countdownText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
});
