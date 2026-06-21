import { IsOptional, IsArray, IsUUID } from 'class-validator';

export class MarkReadDto {
  /** ID notifikasi yang ditandai dibaca. Kosong = tandai semua. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}
