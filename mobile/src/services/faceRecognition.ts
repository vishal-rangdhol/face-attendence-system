import * as ImageManipulator from "expo-image-manipulator";
import { Asset } from "expo-asset";
import jpeg from "jpeg-js";
import { loadTensorflowModel, TfliteModel } from "react-native-fast-tflite";
import { FaceBoundingBox } from "../types";

let cachedModel: TfliteModel | null = null;

/**
 * Loads and caches the MobileFaceNet TensorFlow Lite model.
 * Input tensor shape: [1, 112, 112, 3] (float32, normalized [-1, 1])
 * Output tensor shape: [1, 128] (float32, 128-D embedding)
 */
export async function getFaceModel(): Promise<TfliteModel> {
  if (!cachedModel) {
    let source: any = require("../../assets/models/mobilefacenet.tflite");
    try {
      const asset = Asset.fromModule(source);
      await asset.downloadAsync();
      if (asset.localUri) {
        source = { url: asset.localUri };
      }
    } catch (e) {
      console.warn("Asset.downloadAsync fallback to require:", e);
    }
    cachedModel = await loadTensorflowModel(source, []);
  }
  return cachedModel;
}

/**
 * Helper to decode base64 strings into Uint8Array across Hermes, Node, and test environments.
 */
export function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  throw new Error("No base64 decoding implementation available in current runtime.");
}

/**
 * Normalizes an array of raw RGB [0..255] pixels into MobileFaceNet float32 [-1, 1] input tensor.
 * Formula: (pixel - 127.5) / 128.0
 */
export function normalizeRgbPixels(rgbaData: Uint8Array): Float32Array {
  const numPixels = 112 * 112;
  const float32 = new Float32Array(numPixels * 3);
  let outIdx = 0;

  for (let i = 0; i < numPixels * 4; i += 4) {
    float32[outIdx++] = (rgbaData[i] - 127.5) / 128.0;     // R
    float32[outIdx++] = (rgbaData[i + 1] - 127.5) / 128.0; // G
    float32[outIdx++] = (rgbaData[i + 2] - 127.5) / 128.0; // B
  }

  return float32;
}

/**
 * Crops the image around the detected face bounding box with safety padding,
 * resizes to exactly 112x112, and extracts the normalized float32 tensor.
 */
export async function preprocessFaceImage(
  imageUri: string,
  boundingBox?: FaceBoundingBox,
  imageWidth?: number,
  imageHeight?: number
): Promise<Float32Array> {
  const actions: ImageManipulator.Action[] = [];

  if (boundingBox && imageWidth && imageHeight) {
    // 15% bounding box padding to capture full facial contour
    const pad = Math.round(Math.max(boundingBox.width, boundingBox.height) * 0.15);
    const originX = Math.max(0, boundingBox.originX - pad);
    const originY = Math.max(0, boundingBox.originY - pad);
    const width = Math.min(imageWidth - originX, boundingBox.width + pad * 2);
    const height = Math.min(imageHeight - originY, boundingBox.height + pad * 2);

    actions.push({
      crop: { originX, originY, width, height },
    });
  }

  // MobileFaceNet requires exactly 112x112 input
  actions.push({
    resize: { width: 112, height: 112 },
  });

  const manipResult = await ImageManipulator.manipulateAsync(
    imageUri,
    actions,
    { format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!manipResult.base64) {
    throw new Error("Face image preprocessing failed to produce base64 data");
  }

  const jpegBytes = decodeBase64(manipResult.base64);
  const decoded = jpeg.decode(jpegBytes, { useTArray: true });

  return normalizeRgbPixels(decoded.data);
}

/**
 * Normalizes a raw feature vector to unit length (L2 norm = 1.0).
 */
export function l2Normalize(vector: Float32Array | number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  const normalized = new Array<number>(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = Number((vector[i] / norm).toFixed(6));
  }
  return normalized;
}

/**
 * Computes cosine similarity between two vectors in range [-1, 1].
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return Number((dot / denom).toFixed(4));
}

/**
 * End-to-end pipeline: Preprocess image -> Run MobileFaceNet inference -> L2-normalize to 128-D vector.
 */
export async function extractFaceEmbedding(
  imageUri: string,
  boundingBox?: FaceBoundingBox,
  imageWidth?: number,
  imageHeight?: number
): Promise<number[]> {
  const model = await getFaceModel();
  const inputTensor = await preprocessFaceImage(imageUri, boundingBox, imageWidth, imageHeight);

  const outputs = await model.run([inputTensor.buffer as ArrayBuffer]);
  if (!outputs || outputs.length === 0) {
    throw new Error("MobileFaceNet inference returned empty outputs");
  }

  const outputFloat32 = new Float32Array(outputs[0]);
  if (outputFloat32.length !== 192 && outputFloat32.length !== 128) {
    throw new Error(`Invalid embedding length: expected 192 or 128, received ${outputFloat32.length}`);
  }

  return l2Normalize(outputFloat32);
}
