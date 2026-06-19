import { IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;

  @IsIn(['android', 'ios', 'web'])
  platform: string;
}
