import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from '@shared/decorators/normalize-email.decorator';

/** Cek dini ketersediaan email & telepon saat langkah 1 registrasi. */
export class CheckAvailabilityDto {
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}
