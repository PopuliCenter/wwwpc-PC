import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';

// Pesan tetap untuk error body-parser: layar kirim survei menampilkan pesan server apa
// adanya, sedangkan teks aslinya berbahasa Inggris dan bisa memuat detail zlib.
const BODY_ERROR_MESSAGES: Record<number, string> = {
  413: 'Data yang dikirim terlalu besar.',
  415: 'Format data tidak didukung.',
};

/**
 * Status dan pesan 4xx untuk error dari middleware yang bukan HttpException, atau
 * undefined bila error itu bukan kesalahan klien.
 * - multer: Nest 10 memetakannya lewat teks persis, yang tak lagi cocok dgn multer
 *   yang kita override (mis. 'Unexpected file field').
 * - body-parser (http-errors): `expose` wajib dicek agar `status` milik error layanan
 *   luar tidak ikut dianggap kesalahan klien.
 */
function clientError(exception: unknown): { status: number; message: string } | undefined {
  if (!(exception instanceof Error)) return undefined;
  if (exception.name === 'MulterError') {
    return { status: HttpStatus.BAD_REQUEST, message: exception.message };
  }
  const { status, expose } = exception as Error & { status?: unknown; expose?: unknown };
  if (expose === true && typeof status === 'number' && status >= 400 && status < 500) {
    return { status, message: BODY_ERROR_MESSAGES[status] ?? 'Permintaan tidak valid.' };
  }
  return undefined;
}

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

    const client = clientError(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (client?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (client) {
      message = client.message;
      error = STATUS_CODES[client.status] ?? 'Bad Request';
    }
    // Detail validasi per-item (mis. daftar pertanyaan wajib) — diteruskan ke
    // klien HANYA untuk error 4xx agar frontend bisa menampilkan alasan spesifik.
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const r = res as { message?: string | string[]; error?: string; errors?: unknown };
        message = r.message ?? exception.message;
        error = r.error ?? error;
        if (Array.isArray(r.errors)) {
          errors = r.errors.map((e) => String(e));
        }
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
      // Sertakan detail hanya utk 4xx (bukan 5xx yang di-scrub).
      ...(errors && status < HttpStatus.INTERNAL_SERVER_ERROR ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
