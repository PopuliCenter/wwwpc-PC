import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class InitiateRedemptionDto {
  @IsString()
  @IsNotEmpty()
  rewardId: string;

  // Nomor tujuan dikirim ke gateway PPOB (IAK) → wajib format nomor HP valid,
  // sama seperti validasi nomor di SubmitResponseDto.
  @IsString()
  @Matches(/^[0-9]{8,15}$/, { message: 'Nomor tujuan harus 8-15 digit angka' })
  destinationNumber: string;
}
