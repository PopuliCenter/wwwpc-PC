import { IsString } from 'class-validator';

export class ConfirmDeletionDto {
  @IsString()
  confirmationToken: string;
}
