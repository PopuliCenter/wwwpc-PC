import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TimeConfigDto, RewardConfigDto } from './create-survey.dto';

export class UpdateSurveyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['automatic', 'manual'])
  rewardMode?: 'automatic' | 'manual';

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
