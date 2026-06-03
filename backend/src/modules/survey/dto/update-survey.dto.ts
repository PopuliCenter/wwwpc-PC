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
  @ValidateNested()
  @Type(() => TimeConfigDto)
  timeConfig?: TimeConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RewardConfigDto)
  rewardConfig?: RewardConfigDto;
}
