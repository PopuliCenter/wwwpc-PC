import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ConfirmRedemptionDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otpCode: string;
}
