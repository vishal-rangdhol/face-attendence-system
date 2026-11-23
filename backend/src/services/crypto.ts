import crypto from "node:crypto";
import { config } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM

function getDerivedKey(): Buffer {
  return crypto.createHash("sha256").update(config.security.biometricKey).digest();
}

export interface EncryptedBiometricPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Encrypts a biometric float array using AES-256-GCM authenticated encryption.
 */
export function encryptEmbedding(embedding: number[]): EncryptedBiometricPayload {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(embedding);
  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted biometric vector and validates authentication integrity.
 */
export function decryptEmbedding(payload: EncryptedBiometricPayload): number[] {
  const key = getDerivedKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted) as number[];
}
