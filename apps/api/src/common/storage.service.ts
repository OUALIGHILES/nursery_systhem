import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createReadStream, promises as fs } from 'fs';
import { join, normalize, extname } from 'path';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import type { Env } from '../config/env';

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.docx',
  ],
]);

export interface StoredFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.bucket = config.get('AWS_S3_BUCKET', { infer: true });
    this.uploadDir = config.get('UPLOAD_DIR', { infer: true });
    if (this.bucket) {
      this.s3 = new S3Client({
        region: config.get('AWS_REGION', { infer: true }),
      });
      this.logger.log(`S3 storage enabled (bucket=${this.bucket})`);
    } else {
      this.logger.warn(
        'AWS_S3_BUCKET not set — uploads stored on local disk (dev only)',
      );
    }
  }

  validateUpload(file: {
    mimetype: string;
    size: number;
    originalname: string;
  }) {
    const maxBytes =
      this.config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File exceeds ${this.config.get('MAX_UPLOAD_MB', { infer: true })} MB limit`,
      );
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF, DOC/DOCX`,
      );
    }
    const ext = extname(file.originalname || '').toLowerCase();
    const expected = ALLOWED_MIME.get(file.mimetype)!;
    if (ext && ext !== expected && !(expected === '.jpg' && ext === '.jpeg')) {
      throw new BadRequestException(
        'File extension does not match its content type',
      );
    }
  }

  async save(
    file: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname: string;
    },
    prefix = 'documents',
  ): Promise<StoredFile> {
    this.validateUpload(file);
    const ext = ALLOWED_MIME.get(file.mimetype)!;
    const storageKey = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          ServerSideEncryption: 'AES256',
        }),
      );
    } else {
      const dest = normalize(join(this.uploadDir, storageKey));
      if (!dest.startsWith(normalize(this.uploadDir)))
        throw new BadRequestException('Invalid storage path');
      await fs.mkdir(join(dest, '..'), { recursive: true });
      await fs.writeFile(dest, file.buffer);
    }
    return {
      storageKey,
      fileName: sanitizeFileName(file.originalname),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  /** Returns a readable stream for private download (auth-guarded controller). */
  async openReadStream(
    storageKey: string,
  ): Promise<{ stream: Readable; mimeType?: string }> {
    if (this.s3 && this.bucket) {
      const out = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      if (!out.Body) throw new NotFoundException('File not found');
      return { stream: out.Body as Readable, mimeType: out.ContentType };
    }
    const dest = normalize(join(this.uploadDir, storageKey));
    if (!dest.startsWith(normalize(this.uploadDir)))
      throw new NotFoundException('File not found');
    try {
      await fs.access(dest);
    } catch {
      throw new NotFoundException('File not found');
    }
    return { stream: createReadStream(dest) };
  }

  async delete(storageKey: string): Promise<void> {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return;
    }
    const dest = normalize(join(this.uploadDir, storageKey));
    if (!dest.startsWith(normalize(this.uploadDir)))
      throw new BadRequestException('Invalid storage path');
    try {
      await fs.unlink(dest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function sanitizeFileName(name: string): string {
  const base = (name || 'file')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\w.\- ]+/g, '_')
    .trim();
  return base.slice(0, 180) || 'file';
}
