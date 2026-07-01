import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class DateRangeDto {
  @IsDateString()
  start: string;

  @IsDateString()
  end: string;
}

export class RequestDeletionDto {
  @IsOptional()
  @IsString()
  surveyId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange?: DateRangeDto;

  @IsEnum(['exported_only'])
  exportStatus: 'exported_only';

  @IsBoolean()
  requireDoubleConfirmation: boolean;
}
