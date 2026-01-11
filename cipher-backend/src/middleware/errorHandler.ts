import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    res.status(400).json({ message: "Validation failed", details });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: "Invalid value", details: { path: err.path, value: err.value } });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    res.status(400).json({ message: "Validation failed", details });
    return;
  }

  if ((err as any)?.code === 11000) {
    res.status(409).json({ message: "Duplicate key", details: (err as any)?.keyValue });
    return;
  }

  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const message = err instanceof HttpError ? err.message : "Internal server error";

  logger.error("Request failed", {
    method: req.method,
    path: req.path,
    statusCode,
    error: serializeError(err),
  });

  const payload: Record<string, unknown> = { message };

  if (err instanceof HttpError && err.details !== undefined) {
    payload.details = err.details;
  }

  if (env.NODE_ENV !== "production") {
    payload.debug = serializeError(err);
  }

  res.status(statusCode).json(payload);
};
