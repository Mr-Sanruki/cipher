import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error("Invalid base32 input");
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

export function generateTotpSecretBase32(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

export function totpCode(secretBase32: string, timestampMs = Date.now(), stepSeconds = 30, digits = 6): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;

  return String(binCode).padStart(digits, "0");
}

export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const normalized = code.trim();
  if (!/^[0-9]{6}$/.test(normalized)) return false;

  const now = Date.now();
  for (let w = -window; w <= window; w += 1) {
    const ts = now + w * 30_000;
    if (totpCode(secretBase32, ts) === normalized) return true;
  }

  return false;
}

export function generateBackupCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const code = crypto.randomBytes(5).toString("hex");
    out.push(code);
  }
  return out;
}
