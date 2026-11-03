import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { presenceKey } from './messaging.events.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly publisher: Redis;
  readonly subscriber: Redis;
  private connection: Promise<void> | null = null;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('REDIS_URL', { infer: true });
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.publisher = this.client.duplicate();
    this.subscriber = this.client.duplicate();
  }

  async onModuleInit() {
    await this.connect();
  }

  async connect() {
    if (!this.connection) {
      this.connection = Promise.all(
        [this.client, this.publisher, this.subscriber].map((connection) =>
          connection.status === 'wait'
            ? connection.connect()
            : Promise.resolve(),
        ),
      )
        .then(() => {
          this.logger.log(
            'Redis connected for chat presence and Socket.IO adapter',
          );
        })
        .catch((error: Error) => {
          this.connection = null;
          throw error;
        });
    }
    await this.connection;
  }

  async onModuleDestroy() {
    await Promise.all([
      this.client.quit(),
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
  }

  async trackSocket(userId: string, socketId: string) {
    const key = presenceKey(userId);
    await this.client.zadd(key, Date.now() + 90_000, socketId);
    await this.client.expire(key, 120);
  }

  async refreshSocket(userId: string, socketId: string) {
    const key = presenceKey(userId);
    await this.client.zadd(key, 'XX', Date.now() + 90_000, socketId);
    await this.client.expire(key, 120);
  }

  async untrackSocket(userId: string, socketId: string) {
    const key = presenceKey(userId);
    await this.client.zrem(key, socketId);
    await this.client.zremrangebyscore(key, '-inf', Date.now());
    return this.client.zcard(key);
  }

  async isOnline(userId: string) {
    const key = presenceKey(userId);
    await this.client.zremrangebyscore(key, '-inf', Date.now());
    return (await this.client.zcard(key)) > 0;
  }
}
