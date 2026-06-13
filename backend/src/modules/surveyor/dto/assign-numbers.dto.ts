import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/**
 * Tambahkan sekumpulan nomor kuesioner ke seorang surveyor (mode append —
 * nomor yang sudah ada diabaikan, tidak diduplikasi).
 */
export class AssignNumbersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  numbers: string[];
}
