import nodemailer from "nodemailer";
import { createAgentLog, createEmailLog, getEmailConfig, updateAgentLog, updateEmailLog } from "../db";

export interface SendEmailParams {
  userId: number;
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface EmailResult {
  success: boolean;
  emailLogId?: number;
  error?: string;
}

/**
 * Sends an email via the user's configured SMTP server.
 * Logs the action in agent_logs and email_logs tables.
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const { userId, to, subject, body, html } = params;
  const logId = await createAgentLog({
    userId,
    agentType: "tool",
    action: "send_email",
    toolName: "email",
    input: { to, subject, bodyLength: body.length },
    status: "started",
  });

  const emailLogId = await createEmailLog({
    userId,
    toAddress: to,
    subject,
    body,
    status: "pending_confirmation",
  });

  try {
    const config = await getEmailConfig(userId);
    if (!config || !config.smtpHost) {
      throw new Error("No SMTP configuration found. Please configure email settings first.");
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort ?? 587,
      secure: config.secure ?? false,
      auth: {
        user: config.smtpUser ?? "",
        pass: config.smtpPass ?? "",
      },
    });

    await transporter.sendMail({
      from: config.fromEmail
        ? `"${config.fromName ?? config.fromEmail}" <${config.fromEmail}>`
        : (config.smtpUser ?? undefined),
      to,
      subject,
      text: body,
      html: html ?? body,
    });

    await updateEmailLog(emailLogId, { status: "sent", sentAt: new Date() });
    await updateAgentLog(logId, { status: "success", output: { emailLogId } });

    return { success: true, emailLogId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateEmailLog(emailLogId, { status: "failed", errorMessage: msg });
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, emailLogId, error: msg };
  }
}
