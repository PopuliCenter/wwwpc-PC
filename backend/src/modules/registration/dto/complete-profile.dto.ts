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
  city: string;

  @IsString()
  @IsNotEmpty()
  province: string;
}
