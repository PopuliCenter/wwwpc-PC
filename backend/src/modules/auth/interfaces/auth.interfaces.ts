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
