import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

/** Hapus banyak objek storage sekaligus (pilih-banyak di panel admin). */
export class DeleteObjectsDto {
  @IsOptional()
  @IsIn(['uploads', 'exports'])
  bucket?: 'uploads' | 'exports';

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  keys: string[];
}
