import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { INestApplication } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../redis.service.js';

export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.redis.publisher, this.redis.subscriber));
    return server;
  }
}
