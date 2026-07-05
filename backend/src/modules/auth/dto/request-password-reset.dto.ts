import { IsEmail, IsNotEmpty } from 'class-validator';
import { NormalizeEmail } from '@shared/decorators/normalize-email.decorator';

export class RequestPasswordResetDto {
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
