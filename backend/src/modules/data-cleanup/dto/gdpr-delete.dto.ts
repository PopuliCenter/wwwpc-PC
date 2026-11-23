import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class GdprDeleteDto {
  /**
   * Konfirmasi nyata (T-32): email subjek diketik ulang oleh super admin.
   * Harus sama (tanpa membedakan huruf besar/kecil) dengan email akun.
   */
  @IsEmail()
  @MaxLength(255)
  confirmEmail: string;

  /** USANG: dulu UUID super admin sebagai "persetujuan". Diabaikan. */
  @IsOptional()
  @IsString()
  superAdminApproval?: string;
}
