import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SurveyorAnswerDto {
  @IsUUID()
  questionId: string;

  value: any;
}

/** Pengiriman satu kuesioner lapangan oleh surveyor (TPD). */
export class SubmitSurveyorResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyorAnswerDto)
  answers: SurveyorAnswerDto[];

  /** Nomor kuesioner yang dipakai (harus dari nomor ter-assign & belum dipakai). */
  @IsString()
  @IsNotEmpty()
  questionnaireNumber: string;

  @IsOptional()
  @IsString()
  deviceType?: string;

  /** Kunci idempotensi dari klien (UUID) untuk pengisian offline → sync. */
  @IsOptional()
  @IsUUID()
  clientSubmissionId?: string;

  @IsOptional()
  @IsNumber()
  startLatitude?: number;

  @IsOptional()
  @IsNumber()
  startLongitude?: number;

  @IsOptional()
  @IsNumber()
  endLatitude?: number;

  @IsOptional()
  @IsNumber()
  endLongitude?: number;
}
