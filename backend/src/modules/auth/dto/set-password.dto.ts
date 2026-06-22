import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Buat password untuk akun yang BELUM punya (mis. dibuat via Google). Tanpa
 * password lama. Aturan kekuatan divalidasi penuh di AuthService.
 */
export class SetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
