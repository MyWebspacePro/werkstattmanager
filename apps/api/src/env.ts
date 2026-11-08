import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3001),
  JWT_SECRET: z.string().min(10).default("dev-secret-change-me-in-production"),
  JWT_REFRESH_SECRET: z.string().min(10).default("dev-refresh-secret-change-me-too"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default("Werkstatt <rechnung@example.ch>"),
});

export const env = schema.parse(process.env);
