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
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@shared/enums';
import { QuestionOptionDto, ValidationRulesDto } from './create-question.dto';

export class UpdateQuestionDto {
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsUUID()
  pageId?: string;

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

  /** Nama blok acak; kosong/null = pertanyaan tidak ikut diacak. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  randomizeGroup?: string | null;

  /** Tetap di posisinya meski bloknya diacak. */
  @IsOptional()
  @IsBoolean()
  pinPosition?: boolean;
}
