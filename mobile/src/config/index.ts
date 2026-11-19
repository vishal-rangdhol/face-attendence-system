import { Platform } from "react-native";

export const CONFIG = {
  // Configurable face similarity baseline (experimental 0.88)
  DEFAULT_SIMILARITY_THRESHOLD: 0.88,

  // Backend API URL
  // On Android physical device, replace with your workstation LAN IP (e.g., http://192.168.1.100:3000)
  // On Android emulator, 10.0.2.2 maps to the host's localhost:3000
  API_BASE_URL: Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000",

  // Face Detection Quality Gates
  FACE_VALIDATION: {
    MAX_PITCH_DEG: 15, // Head tilt up/down
    MAX_YAW_DEG: 15,   // Head turn left/right
    MAX_ROLL_DEG: 10,  // Head tilt side-to-side
    MIN_FACE_AREA_RATIO: 0.20, // Face must occupy >= 20% of frame area
    MIN_EYE_OPEN_PROBABILITY: 0.5,
  },

  // Model Specs
  MODEL: {
    INPUT_SIZE: 112,
    EMBEDDING_DIMENSION: 128,
    MODEL_NAME: "mobilefacenet.tflite",
  },
};
