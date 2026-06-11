import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** Tandai reward sejumlah respons sebagai sudah didistribusikan (top-up). */
export class MarkDistributedDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  responseIds: string[];
}
