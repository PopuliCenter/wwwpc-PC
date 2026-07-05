import { IsEmail, IsNotEmpty } from 'class-validator';
import { NormalizeEmail } from '@shared/decorators/normalize-email.decorator';

export class ResendOtpDto {
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
