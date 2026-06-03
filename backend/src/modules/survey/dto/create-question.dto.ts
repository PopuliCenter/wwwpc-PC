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
