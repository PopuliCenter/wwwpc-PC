import { IsString } from 'class-validator';

export class GdprDeleteDto {
  @IsString()
  superAdminApproval: string;
}
