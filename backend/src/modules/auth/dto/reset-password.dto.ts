import {
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
  IsEmail,
  Length,
} from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must contain at least 1 uppercase letter and at least 1 digit',
  })
  newPassword: string;
}
