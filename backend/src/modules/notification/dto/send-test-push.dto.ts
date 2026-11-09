import { IsUUID } from 'class-validator';

export class SendTestPushDto {
  /** User yang perangkatnya dikirimi push uji. */
  @IsUUID()
  userId: string;
}
