import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Edit data pengguna oleh super-admin. Semua field opsional — kirim hanya yang
 * diubah. `password` opsional: jika diisi, password pengguna di-set ulang.
 */
export class UpdateUserDto {
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

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
