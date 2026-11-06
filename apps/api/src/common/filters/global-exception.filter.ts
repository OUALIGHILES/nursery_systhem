import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import type { Request, Response } from "express";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let error = "InternalServerError";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | { message?: string | string[]; error?: string };
      if (typeof body === "string") {
        message = body;
      } else {
        message = body.message ?? exception.message;
        error = body.error ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        const target = (exception.meta?.target as string[] | undefined)?.join(", ");
        message = `A record with this ${target ?? "value"} already exists`;
        error = "Conflict";
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        message = "Record not found";
        error = "NotFound";
      } else {
        this.logger.error(`Prisma ${exception.code}: ${exception.message}`);
        message = "Database operation failed";
      }
    } else if (exception instanceof Error) {
      this.logger.error(`${exception.message}`, exception.stack);
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
