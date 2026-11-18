import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

export type OvalBorderState = 'neutral' | 'warning' | 'active' | 'success' | 'error';

interface AlignmentOvalGuideProps {
  state?: OvalBorderState;
}

const { width } = Dimensions.get('window');
const ovalWidth = Math.min(width * 0.68, 255);
const ovalHeight = ovalWidth * 1.32;

export const AlignmentOvalGuide: React.FC<AlignmentOvalGuideProps> = ({
  state = 'neutral',
}) => {
  const getBorderColor = () => {
    switch (state) {
      case 'warning':
        return '#F59E0B'; // Amber
      case 'active':
        return '#3B82F6'; // Blue
      case 'success':
        return '#10B981'; // Emerald
      case 'error':
        return '#EF4444'; // Red
      case 'neutral':
      default:
        return 'rgba(255, 255, 255, 0.8)';
    }
  };

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={[styles.oval, { borderColor: getBorderColor() }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oval: {
    width: ovalWidth,
    height: ovalHeight,
    borderRadius: ovalWidth / 2,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
});
