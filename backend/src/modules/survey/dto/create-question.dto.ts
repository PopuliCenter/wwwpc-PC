import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  IsUUID,
  ValidateNested,
  Min,
  IsIn,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@shared/enums';

export class QuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  value: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class ValidationRulesDto {
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minLength?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @IsOptional()
  @IsBoolean()
  emailFormat?: boolean;

  @IsOptional()
  @IsBoolean()
  phoneFormat?: boolean;

  @IsOptional()
  numericRange?: { min: number; max: number };

  @IsOptional()
  @IsString()
  regex?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCheckbox?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minCheckbox?: number;

  // ─── Matrix ───────────────────────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  matrixRows?: string[];

  @IsOptional()
  @IsArray()
  matrixColumns?: string[];

  // ─── Rating Scale ─────────────────────────────────────────────────────────
  /** Nilai maksimum skala rating (default 5) */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  ratingMax?: number;

  /** Mode tampilan: 'star' atau 'number' */
  @IsOptional()
  @IsIn(['star', 'number'])
  ratingDisplayMode?: 'star' | 'number';

  /** Label ujung kiri (nilai terendah) */
  @IsOptional()
  @IsString()
  ratingMinLabel?: string;

  /** Label ujung kanan (nilai tertinggi) */
  @IsOptional()
  @IsString()
  ratingMaxLabel?: string;

  // ─── Indonesia Region ─────────────────────────────────────────────────────
  /** Kedalaman wilayah yang wajib dipilih */
  @IsOptional()
  @IsIn(['province', 'regency', 'district', 'village'])
  regionDepth?: 'province' | 'regency' | 'district' | 'village';

  /** Kunci provinsi: responden hanya bisa memilih dalam provinsi ini */
  @IsOptional()
  lockedProvince?: { id: string; name: string } | null;

  /** Kunci kabupaten/kota: responden hanya bisa memilih dalam kab/kota ini */
  @IsOptional()
  lockedRegency?: { id: string; name: string } | null;

  // ─── Misc ─────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  scaleMin?: number;

  @IsOptional()
  scaleMax?: number;
}

export class CreateQuestionDto {
  @IsEnum(QuestionType)
  type: QuestionType;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ValidationRulesDto)
  validationRules?: ValidationRulesDto;

  @IsOptional()
  @IsBoolean()
  hasOtherOption?: boolean;
}
