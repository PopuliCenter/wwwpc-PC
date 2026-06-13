import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AnswerDto } from './submit-response.dto';

export class SaveProgressDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];

  @IsOptional()
  @IsString()
  deviceType?: string;

  /** Lokasi saat form dibuka — disimpan sekali di awal pengisian. */
  @IsOptional()
  @IsNumber()
  startLatitude?: number;

  @IsOptional()
  @IsNumber()
  startLongitude?: number;
}
