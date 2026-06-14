import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class FinalizeRedemptionDto {
  /** true = tandai berhasil (COMPLETED); false = gagal (FAILED + refund poin). */
  @IsBoolean()
  success: boolean;

  /** Catatan/alasan (opsional). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Serial number / token bukti pengiriman (opsional, saat success). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sn?: string;
}
