import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from '@shared/decorators/normalize-email.decorator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
