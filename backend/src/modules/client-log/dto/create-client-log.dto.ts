import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Laporan error dari klien (frontend/aplikasi). Semua dibatasi panjangnya. */
export class CreateClientLogDto {
  @IsOptional()
  @IsIn(['error', 'warn', 'info'])
  level?: 'error' | 'warn' | 'info';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  deviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  userEmail?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

/** Penghapusan log lama (purge). */
export class PurgeClientLogDto {
  @IsOptional()
  olderThanDays?: number;
}
