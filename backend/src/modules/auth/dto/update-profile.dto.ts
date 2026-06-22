import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Edit profil sendiri — semua field opsional (kirim hanya yang diubah).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, { message: 'Nomor telepon tidak valid' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email tidak valid' })
  @MaxLength(255)
  email?: string;

  /** URL avatar (foto Google / avatar generated). String kosong = hapus avatar. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
