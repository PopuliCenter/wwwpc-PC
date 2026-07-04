import type { UserRole } from '@/types';

export interface Demographics {
  dateOfBirth: string | null;
  age: number | null;
  gender: string | null;
  education: string | null;
  occupation: string | null;
  religion: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
}

export interface ProfileData {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  avatarUrl: string | null;
  passwordSet: boolean;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  profileCompleted: boolean;
  createdAt: string;
  demographics?: Demographics | null;
}

export const GENDER_LABELS: Record<string, string> = {
  male: 'Laki-laki',
  female: 'Perempuan',
  other: 'Lainnya',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  analyst: 'Analis',
  viewer: 'Viewer',
  respondent: 'Responden',
  surveyor: 'Surveyor (TPD)',
};

// Dipindah ke util bersama; alias dipertahankan agar impor lama tetap jalan.
export { errorMessage as errMessage } from '@/utils/errorMessage';
