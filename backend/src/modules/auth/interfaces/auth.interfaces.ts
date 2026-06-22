import { UserRole } from '@shared/enums';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  /** Apakah data diri (demografi pembobot) sudah lengkap — untuk gerbang survei. */
  profileCompleted?: boolean;
  /** Nomor telepon (null untuk akun Google yang belum mengisi) — gerbang survei. */
  phone?: string | null;
  /** URL avatar (foto Google / avatar pilihan). Null = pakai inisial. */
  avatarUrl?: string | null;
}

export interface SessionInfo {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sessionId: string;
  type: 'access' | 'refresh';
}
