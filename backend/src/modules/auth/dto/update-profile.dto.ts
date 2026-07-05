import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from '@shared/decorators/normalize-email.decorator';

/**
 * Edit profil sendiri — semua field opsional (kirim hanya yang diubah).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  // Format Indonesia ketat — SAMA dengan registrasi (dulu edit profil jauh lebih
  // longgar, mengizinkan mis. "+1-202-555-0100"/"00000000" yang tak konsisten).
  @IsOptional()
  @IsString()
  @Matches(/^(\+628\d{8,11}|08\d{8,11})$/, {
    message: 'Nomor telepon harus format Indonesia (08xx / +628xx)',
  })
  phone?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email tidak valid' })
  @MaxLength(255)
  email?: string;

  /** URL avatar (foto Google / avatar generated). String kosong = hapus avatar. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
