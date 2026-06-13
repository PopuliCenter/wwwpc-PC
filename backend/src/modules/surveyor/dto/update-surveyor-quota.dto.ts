import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Ubah kuota / nomor kuesioner ter-assign untuk surveyor pada suatu survei. */
export class UpdateSurveyorQuotaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quota?: number;

  /** Ganti seluruh daftar nomor kuesioner ter-assign. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedNumbers?: string[];
}
