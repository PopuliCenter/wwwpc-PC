import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/** Tugaskan seorang surveyor (TPD) ke sebuah survei. */
export class AssignSurveyorDto {
  @IsUUID()
  surveyorId: string;

  /** Target jumlah pengisian. Kosong/null = tak terbatas. */
  @IsOptional()
  @IsInt()
  @Min(1)
  quota?: number;

  /** Nomor kuesioner awal yang dialokasikan (opsional). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedNumbers?: string[];
}
