import { createHash, randomBytes } from "crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

/** Parse "15m" / "7d" / "3600s" style TTLs into milliseconds. */
export function parseTtlMs(ttl: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return value * factor;
}
