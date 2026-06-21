import {
  IsOptional,
  IsArray,
  IsString,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';

/**
 * Kriteria penargetan undangan survei (semua opsional). Cocokkan profil
 * responden: provinsi (nama), gender, pendidikan, dan rentang umur. `sampleSize`
 * mengambil acak sejumlah itu dari yang cocok.
 */
export class TargetCriteriaDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinces?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['male', 'female', 'other'], { each: true })
  genders?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  educations?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ageMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSize?: number;
}
