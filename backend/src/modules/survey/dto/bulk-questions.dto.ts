import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionOptionDto)
  options?: BulkQuestionOptionDto[];

  /** Freeform — divalidasi di sisi pengisian survei, bukan saat menyimpan draft. */
  @IsOptional()
  validationRules?: Record<string, any>;
}

export class BulkQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionDto)
  questions: BulkQuestionDto[];
}
