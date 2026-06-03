import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, clearTokens, setTokens, getAccessToken } from './api';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('API Client', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('token management', () => {
    it('should set tokens in localStorage', () => {
      setTokens('access-123', 'refresh-456');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'access-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-456');
    });

    it('should clear tokens from localStorage', () => {
      clearTokens();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    });

    it('should get access token from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('my-token');
      expect(getAccessToken()).toBe('my-token');
    });
  });

  describe('api.get', () => {
    it('should make GET request with correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await api.get('/users');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual({ data: 'test' });
    });

    it('should include Authorization header when token exists', async () => {
      localStorageMock.getItem.mockImplementation((key: string) =>
        key === 'accessToken' ? 'bearer-token' : null,
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await api.get('/users');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer bearer-token',
          }),
        }),
      );
    });
  });

  describe('api.post', () => {
    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 1 }),
      });

      const result = await api.post('/auth/login', { email: 'test@test.com', password: '123' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@test.com', password: '123' }),
        }),
      );
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('error handling', () => {
    it('should throw error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ statusCode: 400, message: 'Invalid input' }),
      });

      await expect(api.post('/auth/login', {})).rejects.toEqual({
        statusCode: 400,
        message: 'Invalid input',
      });
    });

    it('should handle 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('No content')),
      });

      const result = await api.delete('/users/1');
      expect(result).toBeUndefined();
    });
  });
});
