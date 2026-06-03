import { describe, it, expect } from 'vitest';
import { createApiResponse, createErrorPayload } from './response.helper';

describe('createApiResponse', () => {
  it('should wrap data with timestamp', () => {
    const data = { id: '1', name: 'Test' };
    const result = createApiResponse(data);

    expect(result.data).toEqual(data);
    expect(result.timestamp).toBeDefined();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result.meta).toBeUndefined();
  });

  it('should include meta when provided', () => {
    const data = [{ id: '1' }];
    const meta = {
      page: 1,
      pageSize: 10,
      total: 100,
      totalPages: 10,
      hasNext: true,
      hasPrevious: false,
    };
    const result = createApiResponse(data, meta);

    expect(result.data).toEqual(data);
    expect(result.meta).toEqual(meta);
    expect(result.timestamp).toBeDefined();
  });

  it('should handle null data', () => {
    const result = createApiResponse(null);
    expect(result.data).toBeNull();
    expect(result.timestamp).toBeDefined();
  });

  it('should handle array data', () => {
    const data = [1, 2, 3];
    const result = createApiResponse(data);
    expect(result.data).toEqual([1, 2, 3]);
  });
});

describe('createErrorPayload', () => {
  it('should create error payload with required fields', () => {
    const result = createErrorPayload(404, 'Not Found', 'NotFoundError');

    expect(result.statusCode).toBe(404);
    expect(result.message).toBe('Not Found');
    expect(result.error).toBe('NotFoundError');
    expect(result.timestamp).toBeDefined();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result).not.toHaveProperty('path');
  });

  it('should include path when provided', () => {
    const result = createErrorPayload(400, 'Bad Request', 'ValidationError', '/api/users');

    expect(result.statusCode).toBe(400);
    expect(result.path).toBe('/api/users');
  });

  it('should handle array messages', () => {
    const messages = ['Field A is required', 'Field B must be a number'];
    const result = createErrorPayload(422, messages, 'ValidationError');

    expect(result.message).toEqual(messages);
  });
});
