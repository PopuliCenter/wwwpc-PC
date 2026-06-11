import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Ganti password sendiri — wajib verifikasi password lama.
 * Aturan kekuatan password divalidasi penuh di AuthService (isValidPassword).
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
