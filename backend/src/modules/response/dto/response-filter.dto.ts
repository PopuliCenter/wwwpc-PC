import { IsOptional, IsString, IsEnum, IsArray, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ResponseStatus } from '../entities/survey-response.entity';

export class DateRangeDto {
  @IsDateString()
  start: string;

  @IsDateString()
  end: string;
}

export class ResponseFilterDto {
  @IsOptional()
  @Type(() => DateRangeDto)
  dateRange?: DateRangeDto;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  profileAttributes?: Record<string, any>;

  @IsOptional()
  @IsEnum(ResponseStatus)
  completionStatus?: ResponseStatus;

  @IsOptional()
  @IsString()
  deviceType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}
