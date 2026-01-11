import api from "./api";

export type SendEmailResponse = {
  message: string;
  delivered: boolean;
};

export async function sendEmail(input: {
  workspaceId: string;
  to: string[];
  subject: string;
  text: string;
}): Promise<SendEmailResponse> {
  const res = await api.post("/api/email/send", input);
  const data = res.data as any;
  return {
    message: typeof data?.message === "string" ? data.message : "Sent",
    delivered: Boolean(data?.delivered),
  };
}
