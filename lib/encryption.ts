/**
 * Encryption utilities for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";

/**
 * Get encryption key from environment
 * Key must be 32 bytes (64 hex characters) for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for token encryption"
    );
  }

  if (key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256"
    );
  }

  return Buffer.from(key, "hex");
}

/**
 * Generate a new encryption key (for setup)
 * Run this once and store in environment variables
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns encrypted data with IV and authentication tag
 */
export function encrypt(text: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(16); // 16 bytes for AES

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
    };
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt a string using AES-256-GCM
 * Verifies authentication tag before decrypting
 */
export function decrypt(encrypted: string, iv: string, tag: string): string {
  try {
    const key = getEncryptionKey();

    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));

    decipher.setAuthTag(Buffer.from(tag, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt data. Token may be corrupted.");
  }
}

/**
 * Encrypt Notion token for storage
 */
export function encryptNotionToken(token: string) {
  if (!token || !token.startsWith("secret_")) {
    throw new Error("Invalid Notion token format");
  }

  return encrypt(token);
}

/**
 * Decrypt Notion token from storage
 */
export function decryptNotionToken(
  encrypted: string,
  iv: string,
  tag: string
): string {
  return decrypt(encrypted, iv, tag);
}

/**
 * Safely test if encryption is configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    const key = process.env.ENCRYPTION_KEY || env.ENCRYPTION_KEY;
    return !!(key && key.length === 64);
  } catch {
    return false;
  }
}
