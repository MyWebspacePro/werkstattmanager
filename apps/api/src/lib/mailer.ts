import nodemailer from "nodemailer";
import { env } from "../env.js";

export async function sendMail(to: string, subject: string, body: string, attachments?: { filename: string; content: Buffer }[]) {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text: body,
    attachments,
  });
}

/** Ersetzt {{platzhalter}} in Textvorlagen. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
