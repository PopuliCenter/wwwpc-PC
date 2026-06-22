export type UserRole = 'super_admin' | 'admin' | 'analyst' | 'viewer' | 'respondent' | 'surveyor';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  /** URL avatar (foto Google / avatar pilihan). Kosong/null = pakai inisial. */
  avatarUrl?: string | null;
  isActive: boolean;
  /** Apakah data diri sudah lengkap. Gerbang: false → wajib lengkapi dulu. */
  profileCompleted?: boolean;
}

export interface UserProfile {
  age?: number;
  gender?: string;
  occupation?: string;
  city?: string;
  province?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export interface GeolocationResult {
  latitude: number;
  longitude: number;
  city?: string;
  province?: string;
}
