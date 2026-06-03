import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRole } from '@shared/enums';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsEnum(UserRole)
  role: UserRole;
}
