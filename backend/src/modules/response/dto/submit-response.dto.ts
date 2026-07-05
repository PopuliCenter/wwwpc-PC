import {
  Allow,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerDto {
  @IsUUID()
  questionId: string;

  // `value` bisa berupa string | string[] | object (mis. matrix/region/GPS) |
  // null. @Allow() mendaftarkannya ke whitelist ValidationPipe; tanpa ini,
  // forbidNonWhitelisted menolak payload → "property value should not exist".
  @Allow()
  value: any;
}

export class SubmitResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];

  @IsOptional()
  @IsString()
  deviceType?: string;

  /** Nomor tujuan reward (pulsa/e-wallet): hanya angka, 8–15 digit. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{8,15}$/, {
    message: 'Nomor tujuan harus berupa 8–15 digit angka',
  })
  destinationNumber?: string;

  @IsOptional()
  @IsIn(['pulsa', 'gopay', 'ovo', 'dana', 'shopeepay'])
  rewardType?: string;

  /** Kunci idempotensi dari klien (UUID) untuk pengisian offline → sync. */
  @IsOptional()
  @IsUUID()
  clientSubmissionId?: string;

  /**
   * Waktu (ISO 8601) form pertama kali dibuka di klien. Dipakai untuk submit
   * TANPA sesi server (offline→sync / kirim langsung) agar durasi minimum
   * anti-bot & batas waktu maxDuration tetap bisa ditegakkan. Best-effort:
   * waktu klien tak sepenuhnya tepercaya, tapi menaikkan ambang untuk bot naif.
   */
  @IsOptional()
  @IsISO8601()
  clientStartedAt?: string;

  // ── Geolokasi pengisian ──────────────────────────────────────────────────
  /** Lokasi saat form dibuka (dikirim dari klien yang menyimpan sejak awal). */
  @IsOptional()
  @IsNumber()
  startLatitude?: number;

  @IsOptional()
  @IsNumber()
  startLongitude?: number;

  /** Lokasi saat submit. */
  @IsOptional()
  @IsNumber()
  endLatitude?: number;

  @IsOptional()
  @IsNumber()
  endLongitude?: number;
}
