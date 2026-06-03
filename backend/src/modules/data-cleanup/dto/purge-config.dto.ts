import { IsInt, IsBoolean, IsString, Min } from 'class-validator';

export class PurgeConfigDto {
  @IsInt()
  @Min(1)
  retentionDays: number;

  @IsBoolean()
  enabled: boolean;

  @IsString()
  cronExpression: string;
}
