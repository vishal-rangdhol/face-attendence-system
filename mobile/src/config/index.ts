export const CONFIG = {
  // Configurable face similarity baseline (experimental 0.88)
  DEFAULT_SIMILARITY_THRESHOLD: 0.88,

  // Backend API URL:
  // - Physical Android device over Wi-Fi: use your machine's Wi-Fi LAN IP (e.g. http://192.168.0.7:3000)
  // - Android Emulator: use http://10.0.2.2:3000
  // - With USB and `adb reverse tcp:3000 tcp:3000`: use http://localhost:3000
  API_BASE_URL: "http://192.168.0.7:3000",

  // Face Detection Quality Gates (Google ML Kit)
  FACE_VALIDATION: {
    MAX_PITCH_DEG: 15, // Head tilt up/down limit (degrees)
    MAX_YAW_DEG: 15,   // Head turn left/right limit (degrees)
    MAX_ROLL_DEG: 10,  // Head tilt sideways limit (degrees)
    MIN_FACE_AREA_RATIO: 0.20, // Face must occupy at least 20% of frame area
    MIN_EYE_OPEN_PROBABILITY: 0.5, // Both eyes must be open
  },

  // Model Specs (MobileFaceNet)
  MODEL: {
    INPUT_SIZE: 112,
    EMBEDDING_DIMENSION: 128,
    MODEL_NAME: "mobilefacenet.tflite",
  },
};
