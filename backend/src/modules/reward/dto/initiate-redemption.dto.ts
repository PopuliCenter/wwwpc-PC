import { IsNotEmpty, IsString } from 'class-validator';

export class InitiateRedemptionDto {
  @IsString()
  @IsNotEmpty()
  rewardId: string;

  @IsString()
  @IsNotEmpty()
  destinationNumber: string;
}
