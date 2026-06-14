import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsBoolean,
  MinLength,
  IsOptional,
  IsInt,
  IsIn,
  Min,
  Max,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsBoolean()
  termsAccepted: boolean;

  // ── Profil demografi (responden mandiri) — opsional di API, wajib di UI ──
  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsIn(['SD', 'SMP', 'SMA/SMK', 'D1/D2/D3', 'D4/S1', 'S2', 'S3', 'Lainnya'])
  education?: string;

  @IsOptional()
  @IsIn(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'])
  religion?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
