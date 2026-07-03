import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Filter exception global: menormalkan SEMUA error ke satu bentuk body
 * `{ statusCode, error, message, timestamp, path }` (backward-compatible dgn
 * bentuk default Nest yang dipakai frontend/mobile), mencatat detail penuh di
 * server, dan MEN-SCRUB pesan error 5xx tak terduga di produksi agar detail
 * internal (mis. pesan DB) tidak bocor ke klien.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const r = res as { message?: string | string[]; error?: string };
        message = r.message ?? exception.message;
        error = r.error ?? error;
      }
    }

    // Error 5xx (termasuk yang tak terduga / non-HttpException): log penuh di
    // server, dan di produksi ganti pesan dgn teks generik supaya tidak bocor.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}: ${
          exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)
        }`,
      );
      if (this.isProduction) {
        message = 'Terjadi kesalahan pada server. Silakan coba lagi.';
        error = 'Internal Server Error';
      } else if (exception instanceof Error) {
        message = exception.message;
      }
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
