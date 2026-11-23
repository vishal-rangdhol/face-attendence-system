import { test, expect, describe } from "bun:test";
import { encryptEmbedding, decryptEmbedding } from "../src/services/crypto";

describe("Biometric Field-Level Encryption (AES-256-GCM)", () => {
  test("encrypts and decrypts a 192-D embedding with full fidelity", () => {
    const original = new Array(192).fill(0).map((_, i) => Math.sin(i * 0.1));
    const encrypted = encryptEmbedding(original);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    // Verify ciphertext is base64 and not plaintext JSON
    expect(encrypted.ciphertext.includes("[")).toBe(false);
    expect(encrypted.ciphertext.includes("0.1")).toBe(false);

    // Decrypt and compare values
    const decrypted = decryptEmbedding(encrypted);
    expect(decrypted.length).toBe(192);
    for (let i = 0; i < 192; i++) {
      expect(decrypted[i]).toBeCloseTo(original[i], 5);
    }
  });

  test("encrypts and decrypts a 128-D embedding cleanly", () => {
    const original = new Array(128).fill(0).map((_, i) => (i - 64) * 0.01);
    const encrypted = encryptEmbedding(original);
    const decrypted = decryptEmbedding(encrypted);

    expect(decrypted.length).toBe(128);
    for (let i = 0; i < 128; i++) {
      expect(decrypted[i]).toBeCloseTo(original[i], 5);
    }
  });

  test("rejects tampered ciphertext with authentication error", () => {
    const original = [0.1, 0.2, 0.3];
    const encrypted = encryptEmbedding(original);

    // Tamper with the ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: "Z" + encrypted.ciphertext.slice(1),
    };

    expect(() => decryptEmbedding(tampered)).toThrow();
  });

  test("rejects tampered auth tag with authentication error", () => {
    const original = [0.5, -0.2, 0.9];
    const encrypted = encryptEmbedding(original);

    // Corrupt auth tag
    const corruptedTag = {
      ...encrypted,
      tag: "AAAA" + encrypted.tag.slice(4),
    };

    expect(() => decryptEmbedding(corruptedTag)).toThrow();
  });
});
