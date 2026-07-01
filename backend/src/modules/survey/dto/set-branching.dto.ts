import { IsArray, IsEnum, IsNotEmpty, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BranchingRuleDto {
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

  @IsUUID()
  @IsNotEmpty()
  targetPageId: string;
}

export class SetBranchingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchingRuleDto)
  rules: BranchingRuleDto[];
}
