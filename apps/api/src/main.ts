import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './messaging/adapters/redis-io.adapter.js';
import { RedisService } from './messaging/redis.service.js';
import type { Env } from './config/env.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);
  const redis = app.get(RedisService);
  await redis.connect();
  app.useWebSocketAdapter(new RedisIoAdapter(app, redis));
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(config.get('API_PORT', { infer: true }));
}
await bootstrap();
