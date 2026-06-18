// Stateless per-user API keys for the Quantower live indicator.
// Key format: {base64url(userId)}.{hmac_sha256(userId, SECRET).hex[:24]}
// The userId is encoded inside the key so the endpoint can verify without a DB.

import { createHmac } from "crypto";

const SECRET = process.env.QUANTOWER_KEY_SECRET ?? "";

export function generateApiKey(userId: string): string {
  const userPart = Buffer.from(userId).toString("base64url");
  const hmacPart = createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 24);
  return `${userPart}.${hmacPart}`;
}

/** Returns the userId if the key is valid, null otherwise. */
export function verifyApiKey(key: string): string | null {
  try {
    const dot = key.indexOf(".");
    if (dot === -1) return null;
    const userPart = key.slice(0, dot);
    const hmacPart = key.slice(dot + 1);
    const userId = Buffer.from(userPart, "base64url").toString("utf-8");
    const expected = createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 24);
    return hmacPart === expected ? userId : null;
  } catch {
    return null;
  }
}
