import { describe, it, expect } from 'vitest';
import {
  normalizePaginationQuery,
  calculatePaginationMeta,
  calculateSkipTake,
  createPaginatedResponse,
} from './pagination.helper';

describe('normalizePaginationQuery', () => {
  it('should return defaults when no query provided', () => {
    const result = normalizePaginationQuery({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('should use provided page and pageSize', () => {
    const result = normalizePaginationQuery({ page: 3, pageSize: 10 });
    expect(result).toEqual({ page: 3, pageSize: 10 });
  });

  it('should clamp page to minimum of 1', () => {
    const result = normalizePaginationQuery({ page: -5, pageSize: 10 });
    expect(result.page).toBe(1);
  });

  it('should clamp page to minimum of 1 when zero', () => {
    const result = normalizePaginationQuery({ page: 0, pageSize: 10 });
    expect(result.page).toBe(1);
  });

  it('should cap pageSize at 100', () => {
    const result = normalizePaginationQuery({ page: 1, pageSize: 500 });
    expect(result.pageSize).toBe(100);
  });

  it('should floor decimal page values', () => {
    const result = normalizePaginationQuery({ page: 2.7, pageSize: 10 });
    expect(result.page).toBe(2);
  });

  it('should floor decimal pageSize values', () => {
    const result = normalizePaginationQuery({ page: 1, pageSize: 15.9 });
    expect(result.pageSize).toBe(15);
  });
});

describe('calculatePaginationMeta', () => {
  it('should calculate correct meta for first page', () => {
    const meta = calculatePaginationMeta(100, 1, 20);
    expect(meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 100,
      totalPages: 5,
      hasNext: true,
      hasPrevious: false,
    });
  });

  it('should calculate correct meta for last page', () => {
    const meta = calculatePaginationMeta(100, 5, 20);
    expect(meta).toEqual({
      page: 5,
      pageSize: 20,
      total: 100,
      totalPages: 5,
      hasNext: false,
      hasPrevious: true,
    });
  });

  it('should calculate correct meta for middle page', () => {
    const meta = calculatePaginationMeta(100, 3, 20);
    expect(meta).toEqual({
      page: 3,
      pageSize: 20,
      total: 100,
      totalPages: 5,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('should handle single page result', () => {
    const meta = calculatePaginationMeta(5, 1, 20);
    expect(meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 5,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('should handle zero total', () => {
    const meta = calculatePaginationMeta(0, 1, 20);
    expect(meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('should handle non-even division', () => {
    const meta = calculatePaginationMeta(21, 1, 10);
    expect(meta.totalPages).toBe(3);
  });
});

describe('calculateSkipTake', () => {
  it('should calculate skip 0 for first page', () => {
    const result = calculateSkipTake({ page: 1, pageSize: 20 });
    expect(result).toEqual({ skip: 0, take: 20 });
  });

  it('should calculate correct skip for page 3', () => {
    const result = calculateSkipTake({ page: 3, pageSize: 10 });
    expect(result).toEqual({ skip: 20, take: 10 });
  });

  it('should use defaults when no query provided', () => {
    const result = calculateSkipTake({});
    expect(result).toEqual({ skip: 0, take: 20 });
  });
});

describe('createPaginatedResponse', () => {
  it('should create a paginated response with correct structure', () => {
    const data = [{ id: '1' }, { id: '2' }];
    const result = createPaginatedResponse(data, 50, { page: 1, pageSize: 2 });

    expect(result.data).toEqual(data);
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(2);
    expect(result.meta.total).toBe(50);
    expect(result.meta.totalPages).toBe(25);
    expect(result.meta.hasNext).toBe(true);
    expect(result.meta.hasPrevious).toBe(false);
    expect(result.timestamp).toBeDefined();
  });

  it('should include ISO timestamp', () => {
    const result = createPaginatedResponse([], 0, {});
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
