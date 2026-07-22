import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@shared/enums';

export class BulkQuestionOptionDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsInt() orderIndex?: number;
}

/**
 * Aturan skip/visibilitas dalam payload builder. `sourceQuestionId`/`targetQuestionId`
 * memakai id-builder (clientId) pertanyaan; backend memetakannya ke id DB baru
 * setelah pertanyaan dibuat ulang. Lunak (field opsional) — aturan tak lengkap
 * diabaikan saat simpan, bukan ditolak, agar draft tetap bisa disimpan.
 */
export class BulkSkipRuleDto {
  @IsOptional() @IsString() sourceQuestionId?: string;
  @IsOptional() @IsString() operator?: string;
  @IsOptional() @IsString() conditionValue?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() targetQuestionId?: string | null;
}

export class BulkVisibilityRuleDto {
  @IsOptional() @IsString() sourceQuestionId?: string;
  @IsOptional() @IsString() operator?: string;
  @IsOptional() @IsString() conditionValue?: string;
  @IsOptional() @IsString() visibilityAction?: string;
}

/**
 * Satu pertanyaan dalam payload bulk-replace builder. Bersifat lunak (teks boleh
 * kosong = draft) agar admin bisa menyimpan progres pembuatan kapan saja.
 */
export class BulkQuestionDto {
  @IsEnum(QuestionType)
  type: QuestionType;

  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() hasOtherOption?: boolean;

  /** Nama blok acak; kosong/null = pertanyaan tidak ikut diacak. */
  @IsOptional() @IsString() @MaxLength(50) randomizeGroup?: string | null;

  /** Tetap di posisinya meski bloknya diacak. */
  @IsOptional() @IsBoolean() pinPosition?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionOptionDto)
  options?: BulkQuestionOptionDto[];

  /** Freeform — divalidasi di sisi pengisian survei, bukan saat menyimpan draft. */
  @IsOptional()
  validationRules?: Record<string, any>;

  /** Id-builder pertanyaan ini, untuk memetakan referensi aturan skip/visibilitas. */
  @IsOptional() @IsString() clientId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSkipRuleDto)
  skipLogicRules?: BulkSkipRuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkVisibilityRuleDto)
  visibilityRules?: BulkVisibilityRuleDto[];
}

export class BulkQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionDto)
  questions: BulkQuestionDto[];
}
