import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SkipLogicRuleDto {
  @IsUUID()
  @IsNotEmpty()
  sourceQuestionId: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than'])
  operator: string;

  @IsString()
  @IsNotEmpty()
  conditionValue: string;

  @IsEnum(['skip', 'jump_to'])
  @IsNotEmpty()
  action: 'skip' | 'jump_to';

  @IsUUID()
  @IsOptional()
  targetQuestionId?: string;
}

export class SetSkipLogicDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkipLogicRuleDto)
  rules: SkipLogicRuleDto[];
}
