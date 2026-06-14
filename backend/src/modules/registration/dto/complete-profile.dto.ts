import { IsInt, IsNotEmpty, IsString, IsIn, Min, Max } from 'class-validator';

export class CompleteProfileDto {
  @IsInt()
  @Min(13)
  @Max(120)
  age: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['male', 'female', 'other'])
  gender: string;

  @IsString()
  @IsNotEmpty()
  occupation: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['SD', 'SMP', 'SMA/SMK', 'D1/D2/D3', 'D4/S1', 'S2', 'S3', 'Lainnya'])
  education: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'])
  religion: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  province: string;

  @IsString()
  @IsNotEmpty()
  address: string;
}
