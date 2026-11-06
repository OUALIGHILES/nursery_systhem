import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { Env } from '../../config/env.js';
import { MessagingService } from '../messaging.service.js';

@Injectable()
export class WsJwtGuard {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly messaging: MessagingService,
  ) {}

  async authenticate(client: Socket) {
    const authorization = client.handshake.headers.authorization;
    const headerToken =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;
    const cookieToken = readCookie(
      client.handshake.headers.cookie,
      'access_token',
    );
    const authToken = client.handshake.auth?.accessToken;
    const token =
      headerToken ??
      (typeof authToken === 'string' ? authToken : undefined) ??
      cookieToken;
    if (!token) throw new UnauthorizedException('Authentication required');

    let subject: string;
    let tokenVersion = 0;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; tv?: number }>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      subject = payload.sub;
      tokenVersion = payload.tv ?? 0;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (!subject) throw new UnauthorizedException('Invalid access token');
    return this.messaging.authenticateSocketUser(subject, tokenVersion);
  }
}

function readCookie(cookieHeader: string | undefined, name: string) {
  const match = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
}
