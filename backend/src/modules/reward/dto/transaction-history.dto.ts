import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}
