import type { Response, NextFunction } from "express";
import { z } from "zod";
import * as vm from "vm";
import util from "util";
import type { AuthenticatedRequest } from "../middleware/auth";
import { requireWorkspaceMember } from "../utils/access";

export const interviewRunBodySchema = z.object({
  workspaceId: z.string().min(1),
  code: z.string().min(1).max(20000),
  timeoutMs: z.coerce.number().int().positive().max(5000).optional().default(1500),
});

type InterviewRunBody = z.infer<typeof interviewRunBodySchema>;

function formatValue(value: unknown): string {
  let text: string;

  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = util.inspect(value, { depth: 3, maxArrayLength: 50, breakLength: 80 });
    } catch {
      text = String(value);
    }
  }

  const limit = 4000;
  if (text.length <= limit) return text;
  return text.slice(0, limit);
}

function toErrorString(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createCapturingConsole(limit: number): {
  console: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  getStdout: () => string;
  isTruncated: () => boolean;
} {
  let stdout = "";
  let truncated = false;

  const append = (value: string) => {
    if (truncated) return;
    const next = stdout + value;

    if (next.length <= limit) {
      stdout = next;
      return;
    }

    stdout = next.slice(0, limit);
    truncated = true;
  };

  const writeLine = (...args: unknown[]) => {
    append(args.map(formatValue).join(" ") + "\n");
  };

  return {
    console: {
      log: (...args: unknown[]) => writeLine(...args),
      warn: (...args: unknown[]) => writeLine(...args),
      error: (...args: unknown[]) => writeLine(...args),
    },
    getStdout: () => stdout,
    isTruncated: () => truncated,
  };
}

export async function runCode(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body: InterviewRunBody = interviewRunBodySchema.parse(req.body);

    await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });

    const { console: consoleProxy, getStdout, isTruncated } = createCapturingConsole(8000);

    const sandbox: Record<string, unknown> = {
      console: consoleProxy,
      print: (...args: unknown[]) => consoleProxy.log(...args),
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined,
      process: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
    };

    const context = vm.createContext(sandbox, {
      name: "CipherInterview",
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: "afterEvaluate",
    });

    const wrappedCode = `"use strict";\n(async () => {\n${body.code}\n})()`;

    const start = Date.now();

    let error: string | null = null;
    let result: string | null = null;

    try {
      const script = new vm.Script(wrappedCode, { filename: "interview.js" });
      const value = script.runInContext(context, { timeout: body.timeoutMs });

      const resolved = await Promise.race([
        Promise.resolve(value),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Execution timed out")), body.timeoutMs);
        }),
      ]);

      result = formatValue(resolved);
    } catch (e) {
      error = toErrorString(e);
    }

    const durationMs = Date.now() - start;

    res.json({
      stdout: getStdout(),
      stdoutTruncated: isTruncated(),
      result,
      error,
      durationMs,
    });
  } catch (error) {
    next(error);
  }
}
