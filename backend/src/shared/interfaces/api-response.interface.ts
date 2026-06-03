import { PaginationMeta } from './pagination.interface';

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
}
