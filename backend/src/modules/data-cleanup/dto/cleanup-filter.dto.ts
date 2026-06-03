import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

export class CleanupFilterDto {
  @IsOptional()
  @IsString()
  surveyId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['exported_only', 'all'])
  exportStatus?: 'exported_only' | 'all';

  @IsOptional()
  @IsString()
  surveyStatus?: string;
}
