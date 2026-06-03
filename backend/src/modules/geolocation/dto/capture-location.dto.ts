import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class CaptureLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

export class ManualLocationDto {
  @IsString()
  city: string;

  @IsString()
  province: string;
}
