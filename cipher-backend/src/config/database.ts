import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

export async function connectDatabase(): Promise<void> {
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(env.MONGODB_URI, {
      autoIndex: env.NODE_ENV !== "production",
    });

    logger.info("MongoDB connected", { uri: redactMongoUri(env.MONGODB_URI) });
  } catch (error) {
    logger.error("MongoDB connection failed", { error: serializeError(error) });
    throw error;
  }
}

function redactMongoUri(uri: string): string {
  try {
    const hasCredentials = uri.includes("@") && uri.includes("://");
    if (!hasCredentials) return uri;

    const [protocol, rest] = uri.split("://");
    const [, hostAndPath] = rest.split("@");
    return `${protocol}://***:***@${hostAndPath}`;
  } catch {
    return "[redacted]";
  }
}

function serializeError(error: unknown): { name?: string; message?: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
