import api from "./api";

export type InterviewRunResponse = {
  stdout: string;
  stdoutTruncated: boolean;
  result: string | null;
  error: string | null;
  durationMs: number;
};

export async function runInterviewCode(input: {
  workspaceId: string;
  code: string;
  timeoutMs?: number;
}): Promise<InterviewRunResponse> {
  const res = await api.post("/api/interview/run", input);
  const data = res.data as any;

  const stdout = typeof data?.stdout === "string" ? data.stdout : "";
  const stdoutTruncated = Boolean(data?.stdoutTruncated);

  const rawResult = data?.result;
  const result = rawResult === null || rawResult === undefined ? null : String(rawResult);

  const rawError = data?.error;
  const error = rawError === null || rawError === undefined ? null : String(rawError);

  const durationMs = Number(data?.durationMs);

  return {
    stdout,
    stdoutTruncated,
    result,
    error,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
  };
}
