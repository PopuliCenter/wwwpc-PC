import { IsOptional, IsString } from 'class-validator';

/** Filter daftar respons lintas-survei (panel admin). */
export class AllResponsesFilterDto {
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() region?: string;
  /** completed | partial | abandoned (label frontend) */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() deviceType?: string;
  @IsOptional() @IsString() surveyId?: string;
  /** Cari nama atau nomor HP responden */
  @IsOptional() @IsString() search?: string;
}
