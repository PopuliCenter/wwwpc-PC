import { ApiResponse } from '../interfaces';
import { PaginationMeta } from '../interfaces';

export function createApiResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return {
    data,
    ...(meta && { meta }),
    timestamp: new Date().toISOString(),
  };
}

export function createErrorPayload(
  statusCode: number,
  message: string | string[],
  error: string,
  path?: string,
) {
  return {
    statusCode,
    message,
    error,
    timestamp: new Date().toISOString(),
    ...(path && { path }),
  };
}
