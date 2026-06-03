import { IsArray, IsUUID } from 'class-validator';

export class MarkRewardDistributedDto {
  @IsArray()
  @IsUUID('4', { each: true })
  respondentIds: string[];
}
