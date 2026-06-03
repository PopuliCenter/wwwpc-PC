import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './auth.store';
import type { User } from '@/types';

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

const mockUser: User = {
  id: '1',
  email: 'test@example.com',
  fullName: 'Test User',
  role: 'respondent',
  isActive: true,
};

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Reset store state
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it('should have initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
  });

  it('should login and persist tokens', () => {
    const { login } = useAuthStore.getState();
    login(mockUser, 'access-token-123', 'refresh-token-456');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('access-token-123');
    expect(state.refreshToken).toBe('refresh-token-456');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);

    expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'access-token-123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'refresh-token-456');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('user', JSON.stringify(mockUser));
  });

  it('should logout and clear tokens', () => {
    const { login, logout } = useAuthStore.getState();
    login(mockUser, 'access-token', 'refresh-token');
    logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
  });

  it('should set tokens', () => {
    const { setTokens } = useAuthStore.getState();
    setTokens('new-access', 'new-refresh');

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('new-access');
    expect(state.refreshToken).toBe('new-refresh');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'new-access');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshToken', 'new-refresh');
  });

  it('should initialize from localStorage', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      const data: Record<string, string> = {
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
        user: JSON.stringify(mockUser),
      };
      return data[key] || null;
    });

    const { initialize } = useAuthStore.getState();
    initialize();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('stored-access');
    expect(state.refreshToken).toBe('stored-refresh');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('should handle invalid user JSON in localStorage', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      const data: Record<string, string> = {
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
        user: 'invalid-json',
      };
      return data[key] || null;
    });

    const { initialize } = useAuthStore.getState();
    initialize();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
