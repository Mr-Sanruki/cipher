export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

export function passwordStrength(password: string): {
  score: number;
  label: "weak" | "medium" | "strong";
} {
  const value = password ?? "";

  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (score <= 1) return { score, label: "weak" };
  if (score === 2 || score === 3) return { score, label: "medium" };
  return { score, label: "strong" };
}
