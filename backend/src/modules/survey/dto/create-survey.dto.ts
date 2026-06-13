import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsInt,
  IsBoolean,
  IsIn,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TimeConfigDto {
  @IsOptional()
  @IsDateString()
  startDatetime?: string;

  @IsOptional()
  @IsDateString()
  endDatetime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRespondents?: number;
}

export class RewardConfigDto {
  @IsIn(['automatic', 'manual'])
  rewardMode: 'automatic' | 'manual';

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsValue?: number;

  @IsOptional()
  @IsString()
  manualRewardType?: string;

  @IsOptional()
  manualRewardNominal?: number;
}

export class CreateSurveyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['automatic', 'manual'])
  rewardMode: 'automatic' | 'manual';

  @IsOptional()
  @IsBoolean()
  randomizeOptions?: boolean;

  @IsOptional()
  @IsIn(['paginated', 'scroll', 'wizard'])
  formMode?: 'paginated' | 'scroll' | 'wizard';

  @IsOptional()
  @IsIn(['nasional', 'daerah', 'lainnya'])
  surveyType?: 'nasional' | 'daerah' | 'lainnya';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  captureGps?: boolean;

  @IsOptional()
  @IsBoolean()
  requireSignature?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimeConfigDto)
  timeConfig?: TimeConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RewardConfigDto)
  rewardConfig?: RewardConfigDto;
}
