import { IsArray, IsInt, IsString, Min } from 'class-validator';

/** Purge manual: hapus log lebih lama dari N hari. */
export class PurgeAuditDto {
  @IsInt()
  @Min(0)
  olderThanDays: number;
}

/** Hapus audit log terpilih berdasarkan id. */
export class DeleteAuditDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
