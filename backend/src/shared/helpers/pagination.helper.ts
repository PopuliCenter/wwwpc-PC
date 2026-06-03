import { PaginationMeta, PaginationQuery, PaginatedResponse } from '../interfaces';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function normalizePaginationQuery(query: PaginationQuery): Required<PaginationQuery> {
  const page = Math.max(1, Math.floor(Number(query.page) || DEFAULT_PAGE));
  const rawPageSize = Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE));
  const pageSize = Math.min(rawPageSize, MAX_PAGE_SIZE);

  return { page, pageSize };
}

export function calculatePaginationMeta(
  total: number,
  page: number,
  pageSize: number,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export function calculateSkipTake(query: PaginationQuery): { skip: number; take: number } {
  const { page, pageSize } = normalizePaginationQuery(query);
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  query: PaginationQuery,
): PaginatedResponse<T> {
  const { page, pageSize } = normalizePaginationQuery(query);
  const meta = calculatePaginationMeta(total, page, pageSize);

  return {
    data,
    meta,
    timestamp: new Date().toISOString(),
  };
}
