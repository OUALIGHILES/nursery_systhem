import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('nursery-api'),
  KAFKA_CONSUMER_GROUP: z.string().default('nursery-workers'),
  KAFKA_SSL: bool(false),
  KAFKA_SASL_USERNAME: z.string().optional().default(''),
  KAFKA_SASL_PASSWORD: z.string().optional().default(''),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().default('Little Steps Nursery <no-reply@example.com>'),
  AWS_REGION: z.string().default('eu-west-1'),
  AWS_S3_BUCKET: z.string().optional().default(''),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  CHAT_MESSAGE_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(730),
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  SEED_ADMIN_EMAIL: z.string().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: z.string().default('ChangeMe!123'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
