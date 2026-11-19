# TensorFlow Lite Models

This directory holds the on-device biometric neural network models.

## Expected Models:
- `mobilefacenet.tflite`
  - Input: `[1, 112, 112, 3]` (RGB float32 normalized to [-1, 1])
  - Output: `[1, 128]` (128-dimensional L2-normalized face embedding vector)
  - Integration: Milestone 3 via `react-native-fast-tflite`
