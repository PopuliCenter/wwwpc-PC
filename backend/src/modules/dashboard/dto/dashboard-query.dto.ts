import { IsOptional, IsDateString } from 'class-validator';

export class DashboardPeriodDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
