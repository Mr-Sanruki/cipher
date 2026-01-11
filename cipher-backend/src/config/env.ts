import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  CORS_ORIGIN: z.string().default("*"),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  EMAIL_PROVIDER: z.enum(["console", "smtp", "brevo"]).default("console"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  BREVO_API_KEY: z.string().optional().default(""),
  BREVO_BASE_URL: z.string().optional().default("https://api.brevo.com"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  GROK_API_KEY: z.string().optional().default(""),
  GROK_BASE_URL: z.string().optional().default(""),
  STREAM_API_KEY: z.string().optional().default(""),
  STREAM_API_SECRET: z.string().optional().default(""),
  STREAM_SECRET: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new Error(`Invalid environment variables: ${JSON.stringify(issues)}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === "production" && env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }

  if (env.EMAIL_PROVIDER === "smtp") {
    const missing: string[] = [];
    if (!env.SMTP_HOST) missing.push("SMTP_HOST");
    if (!env.SMTP_USER) missing.push("SMTP_USER");
    if (!env.SMTP_PASS) missing.push("SMTP_PASS");
    if (!env.SMTP_FROM) missing.push("SMTP_FROM");

    if (missing.length > 0) {
      throw new Error(`Missing SMTP configuration: ${missing.join(", ")}`);
    }
  }

  if (env.EMAIL_PROVIDER === "brevo") {
    const missing: string[] = [];
    if (!env.BREVO_API_KEY) missing.push("BREVO_API_KEY");
    if (!env.SMTP_FROM) missing.push("SMTP_FROM");

    if (missing.length > 0) {
      throw new Error(`Missing Brevo configuration: ${missing.join(", ")}`);
    }
  }

  return env;
}

export const env = parseEnv();
