import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { NormalizeEmail } from '@shared/decorators/normalize-email.decorator';

export class VerifyOtpDto {
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}
