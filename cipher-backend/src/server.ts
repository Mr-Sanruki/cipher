import http from "http";
import fs from "fs";
import path from "path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { Server as SocketIOServer } from "socket.io";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { registerSocketEvents } from "./events/socketEvents";
import { errorHandler } from "./middleware/errorHandler";
import apiRouter from "./routes";
import { setIo } from "./socket";
import { logger } from "./utils/logger";

async function start(): Promise<void> {
  await connectDatabase();

  const app = express();

  app.disable("x-powered-by");
  app.set("etag", false);

  app.use(helmet());
  app.use((req, res, next) => {
    if (req.headers["access-control-request-private-network"] === "true") {
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    next();
  });
  app.use(
    cors({
      origin: corsOrigin(),
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Access-Control-Request-Private-Network"],
    })
  );
  app.options("*", cors({ origin: corsOrigin(), credentials: false }));
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("combined"));

  const uploadsDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use(
    "/uploads",
    express.static(uploadsDir, {
      fallthrough: false,
      maxAge: env.NODE_ENV === "production" ? "7d" : 0,
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.use("/api", apiRouter);

  app.use(errorHandler);

  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: corsOrigin(),
      credentials: false,
    },
  });

  setIo(io);

  registerSocketEvents(io);

  const host = (process.env.HOST || "0.0.0.0").trim();

  server.listen(env.PORT, host, () => {
    logger.info("Server listening", { host, port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = (signal: string) => {
    logger.warn("Shutting down", { signal });
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function corsOrigin(): string | string[] | boolean {
  const value = env.CORS_ORIGIN.trim();
  if (value === "*") return true;
  const list = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : true;
}

start().catch((error) => {
  logger.error("Fatal startup error", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
