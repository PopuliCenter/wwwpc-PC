import {
  IsArray,
  IsIn,
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
