import { IsString, IsNotEmpty } from 'class-validator';

export class GoogleLoginDto {
  /** ID token Google (dari Google Identity Services di frontend). */
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
