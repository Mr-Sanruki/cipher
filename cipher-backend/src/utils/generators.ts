export function generateOtpCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
}

export function generateVerificationCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";

  for (let i = 0; i < length; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return out;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;

  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  const maskedPart = "*".repeat(Math.max(name.length - visible.length, 1));
  return `${visible}${maskedPart}@${domain}`;
}
