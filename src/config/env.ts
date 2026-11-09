import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  TERMII_API_KEY: z.string().default(''),
  TERMII_SENDER_ID: z.string().default('9Care'),
  TERMII_BASE_URL: z.string().default('https://api.ng.termii.com/api'),
  BREVO_API_KEY: z.string().default(''),
  BREVO_SENDER_EMAIL: z.string().default('noreply@9care.ng'),
  SENTRY_DSN: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
  GROQ_API_KEY: z.string().default(''),
  /// Groq model for all AI features. Groq retires models over time (llama-3.1-8b-instant is gone), so it's a setting.
  AI_MODEL: z.string().default('openai/gpt-oss-120b'),
  CRON_SECRET: z.string().default('my-super-secret-cron-key'),
  /// Clinic WhatsApp number for patient support (digits with country code, no +).
  /// Live number: +234 803 402 7044
  SUPPORT_WHATSAPP_NUMBER: z.string().default('2348034027044'),
  /// Temporary: lets patients regain access by matching their biodata. Set to 'false' to switch off.
  PATIENT_RECOVERY_ENABLED: z.string().default('true'),
  /// 'true': patients see each other's lesson comments (first name only) and the doctors' replies.
  /// 'false': each patient sees only her own comments and the replies to them.
  EDUCATION_COMMENTS_PUBLIC: z.string().default('true'),
  /// Auto-reply menu bot for messages sent to the clinic WhatsApp number. Set to 'false' to switch off.
  WHATSAPP_BOT_ENABLED: z.string().default('true'),
  /// Folder for the linked WhatsApp session (scanning the QR code once saves it here)
  WHATSAPP_AUTH_PATH: z.string().default('./.wwebjs_auth'),
  /// Chrome/Chromium for WhatsApp. Empty: Chrome in its usual Windows place if present, otherwise Puppeteer's own
  WHATSAPP_CHROME_PATH: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

// Automatically construct REDIS_URL if Upstash REST parameters are provided
if (data.UPSTASH_REDIS_REST_URL && data.UPSTASH_REDIS_REST_TOKEN) {
  const host = data.UPSTASH_REDIS_REST_URL.replace(/^https?:\/\//, '');
  data.REDIS_URL = `rediss://default:${data.UPSTASH_REDIS_REST_TOKEN}@${host}:6379`;
}

export const env = data;
