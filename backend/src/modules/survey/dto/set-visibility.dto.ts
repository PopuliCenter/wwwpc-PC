import { IsArray, IsEnum, IsNotEmpty, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class VisibilityRuleDto {
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

  @IsEnum(['show', 'hide'])
  @IsNotEmpty()
  visibilityAction: 'show' | 'hide';
}

export class SetVisibilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisibilityRuleDto)
  rules: VisibilityRuleDto[];
}
