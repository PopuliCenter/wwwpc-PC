import { IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;

  @IsIn(['android', 'ios', 'web'])
  platform: string;
}

/** Body DELETE /notifications/device-token (logout perangkat). */
export class RemoveDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;
}
